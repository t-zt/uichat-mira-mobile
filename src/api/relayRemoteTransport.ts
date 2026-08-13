import { RELAY_PROTOCOL_VERSION, type RelayFrame, type RelayOutboundFrame } from '../protocol/relayFrames';
import { TextEncoder, TextDecoder, btoa, atob } from './webPolyfills';

export interface RelayTransportConfig {
  relayUrl: string;
  relayId: string;
  clientToken: string;
}

export interface RelayRequestOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
  signal?: AbortSignal;
}

export interface RelayStreamOptions extends RelayRequestOptions {}

export type RelayTransportState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RelayStreamEvent {
  type: string;
  data: any;
}

class AsyncPushQueue<T> implements AsyncIterableIterator<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void;
    reject: (error: unknown) => void;
  }> = [];
  private closed = false;
  private failure: unknown = null;

  push(value: T) {
    if (this.closed || this.failure) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter.resolve({ value, done: false });
      return;
    }
    this.values.push(value);
  }

  close() {
    if (this.closed || this.failure) return;
    this.closed = true;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.resolve({ value: undefined, done: true });
    }
  }

  fail(error: unknown) {
    if (this.closed || this.failure) return;
    this.failure = error;
    this.values.length = 0;
    while (this.waiters.length > 0) {
      this.waiters.shift()?.reject(error);
    }
  }

  next(): Promise<IteratorResult<T>> {
    if (this.failure) {
      return Promise.reject(this.failure);
    }
    const value = this.values.shift();
    if (value !== undefined) {
      return Promise.resolve({ value, done: false });
    }
    if (this.closed) {
      return Promise.resolve({ value: undefined, done: true });
    }
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<T> {
    return this;
  }
}

type PendingRequest = {
  resolve: (value: { status: number; headers: Record<string, string>; body: Uint8Array }) => void;
  reject: (reason: Error) => void;
  chunks: Uint8Array[];
  headers: Record<string, string>;
  status: number;
  completed: boolean;
};

type PendingStreamRequest = {
  resolve: () => void;
  reject: (reason: Error) => void;
  status: number;
  headers: Record<string, string>;
  completed: boolean;
  queue: AsyncPushQueue<RelayStreamEvent>;
};

export class RelayRemoteTransport {
  private ws: any = null;
  private state: RelayTransportState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly pendingStreamRequests = new Map<string, PendingStreamRequest>();
  private requestIdCounter = 0;
  private reconnecting = false;
  private readonly stateListeners = new Set<(state: RelayTransportState, info?: { attempt: number }) => void>();
  private readonly messageListeners = new Set<(event: string) => void>();

  constructor(private readonly config: RelayTransportConfig) {}

  getState(): RelayTransportState {
    return this.state;
  }

  onStateChange(listener: (state: RelayTransportState, info?: { attempt: number }) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMessage(listener: (event: string) => void): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  private notifyStateChange(newState: RelayTransportState, info?: { attempt: number }): void {
    this.state = newState;
    this.stateListeners.forEach(listener => listener(newState, info));
  }

  private notifyMessage(message: string): void {
    this.messageListeners.forEach(listener => listener(message));
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.notifyStateChange('connecting');
    const wsUrl = `${this.config.relayUrl.replace(/\/$/, '')}/v1/relay/${encodeURIComponent(this.config.relayId)}/socket`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => this.handleOpen();
      this.ws.onmessage = (event: WebSocketMessageEvent) => this.handleMessage(event);
      this.ws.onerror = () => this.handleError();
      this.ws.onclose = () => this.handleClose();

      await this.waitForConnection();
    } catch (error) {
      this.notifyStateChange('error');
      throw new Error(`Failed to connect to relay: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.rejectAllPendingRequests('Relay disconnected');
    this.rejectAllPendingStreamRequests('Relay disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyStateChange('disconnected');
  }

  async request(options: RelayRequestOptions): Promise<{ status: number; headers: Record<string, string>; body: Uint8Array }> {
    if (this.state !== 'connected') {
      await this.connect();
    }

    const requestId = this.generateRequestId();
    const bodyBytes = options.body ? new TextEncoder().encode(JSON.stringify(options.body)) : undefined;
    const bodyBase64 = bodyBytes ? btoa(this.bytesToBinary(bodyBytes)) : undefined;

    const frame: RelayOutboundFrame = {
      version: RELAY_PROTOCOL_VERSION,
      type: 'request',
      requestId,
      method: options.method.toUpperCase(),
      path: options.path,
      headers: options.headers,
      ...(bodyBase64 ? { bodyBase64 } : {}),
    };

    return new Promise((resolve, reject) => {
      const pending: PendingRequest = {
        resolve,
        reject,
        chunks: [],
        headers: {},
        status: 0,
        completed: false,
      };
      this.pendingRequests.set(requestId, pending);
      this.sendFrame(frame);

      if (options.signal) {
        options.signal.onabort = () => {
          this.cancelRequest(requestId);
        };
      }
    });
  }

  async stream(options: RelayStreamOptions): Promise<{
    status: number;
    headers: Record<string, string>;
    events: AsyncIterable<RelayStreamEvent>;
    cancel: () => void;
  }> {
    if (this.state !== 'connected') {
      await this.connect();
    }

    const requestId = this.generateRequestId();
    const bodyBytes = options.body ? new TextEncoder().encode(JSON.stringify(options.body)) : undefined;
    const bodyBase64 = bodyBytes ? btoa(this.bytesToBinary(bodyBytes)) : undefined;

    const frame: RelayOutboundFrame = {
      version: RELAY_PROTOCOL_VERSION,
      type: 'request',
      requestId,
      method: options.method.toUpperCase(),
      path: options.path,
      headers: options.headers,
      ...(bodyBase64 ? { bodyBase64 } : {}),
    };

    const queue = new AsyncPushQueue<RelayStreamEvent>();
    
    return new Promise<{
      status: number;
      headers: Record<string, string>;
      events: AsyncIterable<RelayStreamEvent>;
      cancel: () => void;
    }>((resolve, reject) => {
      const pending: PendingStreamRequest = {
        resolve: () => {},
        reject,
        status: 0,
        headers: {},
        completed: false,
        queue,
      };
      
      pending.resolve = () => {
        if (!pending.completed) {
          pending.completed = true;
          resolve({
            status: pending.status,
            headers: pending.headers,
            events: queue,
            cancel: () => this.cancelStreamRequest(requestId),
          });
        }
      };
      
      this.pendingStreamRequests.set(requestId, pending);
      this.sendFrame(frame);

      if (options.signal) {
        options.signal.onabort = () => {
          this.cancelStreamRequest(requestId);
        };
      }
    });
  }

  private cancelRequest(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending && !pending.completed) {
      this.sendFrame({
        version: RELAY_PROTOCOL_VERSION,
        type: 'cancel',
        requestId,
      });
      pending.completed = true;
      pending.reject(new Error('Request cancelled'));
      this.pendingRequests.delete(requestId);
    }
  }

  private cancelStreamRequest(requestId: string): void {
    const pending = this.pendingStreamRequests.get(requestId);
    if (pending && !pending.completed) {
      this.sendFrame({
        version: RELAY_PROTOCOL_VERSION,
        type: 'cancel',
        requestId,
      });
      pending.completed = true;
      pending.queue.close();
      pending.reject(new Error('Stream cancelled'));
      this.pendingStreamRequests.delete(requestId);
    }
  }

  private async waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (this.state === 'connected') {
          clearInterval(checkInterval);
          resolve();
        } else if (this.state === 'error') {
          clearInterval(checkInterval);
          reject(new Error('Connection failed'));
        }
      }, 50);

      setTimeout(() => {
        clearInterval(checkInterval);
        if (this.state !== 'connected') {
          reject(new Error('Connection timeout'));
        }
      }, 10000);
    });
  }

  private handleOpen(): void {
    const helloFrame: RelayOutboundFrame = {
      version: RELAY_PROTOCOL_VERSION,
      type: 'hello',
      role: 'client',
      relayId: this.config.relayId,
      token: this.config.clientToken,
    };
    this.sendFrame(helloFrame);
  }

  private handleMessage(event: any): void {
    try {
      const data = JSON.parse(event.data) as RelayFrame;
      this.processFrame(data);
    } catch {
      console.error('Failed to parse relay frame');
    }
  }

  private handleError(): void {
    this.notifyStateChange('error');
  }

  private handleClose(): void {
    this.notifyStateChange('disconnected');
    this.ws = null;
    this.scheduleReconnect();
  }

  private processFrame(frame: RelayFrame): void {
    switch (frame.type) {
      case 'hello_ack':
        this.notifyStateChange('connected');
        this.reconnectAttempts = 0;
        this.reconnecting = false;
        this.notifyMessage('Connected to relay');
        break;

      case 'response':
        this.handleResponse(frame.requestId, frame.status, frame.headers);
        break;

      case 'chunk':
        this.handleChunk(frame.requestId, frame.data);
        break;

      case 'complete':
        this.handleComplete(frame.requestId);
        break;

      case 'error':
        this.handleErrorFrame(frame);
        break;
    }
  }

  private handleResponse(requestId: string, status: number, headers: Record<string, string>): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.status = status;
      pending.headers = headers;
      return;
    }

    const streamPending = this.pendingStreamRequests.get(requestId);
    if (streamPending) {
      streamPending.status = status;
      streamPending.headers = headers;
    }
  }

  private handleChunk(requestId: string, base64Data: string): void {
    const data = this.fromBase64(base64Data);
    
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      pending.chunks.push(data);
      return;
    }

    const streamPending = this.pendingStreamRequests.get(requestId);
    if (streamPending) {
      this.parseAndPushSseEvents(streamPending.queue, data);
    }
  }

  private parseAndPushSseEvents(queue: AsyncPushQueue<RelayStreamEvent>, chunk: Uint8Array): void {
    const text = new TextDecoder().decode(chunk);
    const lines = text.split('\n');
    let eventBuffer = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        eventBuffer = line.slice(6);
      } else if (line === '' && eventBuffer) {
        try {
          const parsed = JSON.parse(eventBuffer);
          queue.push({
            type: parsed.type || 'unknown',
            data: parsed,
          });
        } catch {
          queue.push({
            type: 'error',
            data: eventBuffer,
          });
        }
        eventBuffer = '';
      }
    }
  }

  private handleComplete(requestId: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending && !pending.completed) {
      pending.completed = true;
      const body = this.concatChunks(pending.chunks);
      pending.resolve({
        status: pending.status,
        headers: pending.headers,
        body,
      });
      this.pendingRequests.delete(requestId);
      return;
    }

    const streamPending = this.pendingStreamRequests.get(requestId);
    if (streamPending && !streamPending.completed) {
      streamPending.completed = true;
      streamPending.queue.close();
      streamPending.resolve();
      this.pendingStreamRequests.delete(requestId);
    }
  }

  private handleErrorFrame(frame: { requestId?: string; code: string; message: string; retryable: boolean }): void {
    if (frame.requestId) {
      const pending = this.pendingRequests.get(frame.requestId);
      if (pending && !pending.completed) {
        pending.completed = true;
        pending.reject(new Error(`Relay error: ${frame.code} - ${frame.message}`));
        this.pendingRequests.delete(frame.requestId);
        return;
      }

      const streamPending = this.pendingStreamRequests.get(frame.requestId);
      if (streamPending && !streamPending.completed) {
        streamPending.completed = true;
        streamPending.queue.fail(new Error(`Relay error: ${frame.code} - ${frame.message}`));
        streamPending.reject(new Error(`Relay error: ${frame.code} - ${frame.message}`));
        this.pendingStreamRequests.delete(frame.requestId);
      }
    } else {
      this.notifyStateChange('error');
      this.notifyMessage(`Relay error: ${frame.code} - ${frame.message}`);
    }
  }

  private sendFrame(frame: RelayOutboundFrame): void {
    if (this.ws && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnecting) return;
    this.reconnecting = true;

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.notifyStateChange('error');
      this.notifyMessage('Max reconnection attempts reached');
      this.reconnecting = false;
      return;
    }

    this.reconnectAttempts++;
    this.notifyMessage(`Reconnecting... attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        this.reconnecting = false;
        this.scheduleReconnect();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private rejectAllPendingRequests(message: string): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (!pending.completed) {
        pending.completed = true;
        pending.reject(new Error(message));
      }
      this.pendingRequests.delete(requestId);
    }
  }

  private rejectAllPendingStreamRequests(message: string): void {
    for (const [requestId, pending] of this.pendingStreamRequests) {
      if (!pending.completed) {
        pending.completed = true;
        pending.queue.fail(new Error(message));
        pending.reject(new Error(message));
      }
      this.pendingStreamRequests.delete(requestId);
    }
  }

  private generateRequestId(): string {
    this.requestIdCounter++;
    return `req_${Date.now()}_${this.requestIdCounter}`;
  }

  private bytesToBinary(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return binary;
  }

  private fromBinary(binary: string): Uint8Array {
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  private fromBase64(base64: string): Uint8Array {
    return this.fromBinary(atob(base64));
  }

  private concatChunks(chunks: Uint8Array[]): Uint8Array {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
