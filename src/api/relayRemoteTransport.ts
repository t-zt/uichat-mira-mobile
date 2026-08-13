import { RELAY_PROTOCOL_VERSION, type RelayFrame, type RelayOutboundFrame } from '../protocol/relayFrames';

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

export interface RelayStreamOptions extends RelayRequestOptions {
  onChunk?: (data: Uint8Array) => void;
  onEvent?: (event: any) => void;
}

export type RelayTransportState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RelayStreamEvent {
  type: string;
  data: any;
}

type PendingRequest = {
  resolve: (value: { status: number; headers: Record<string, string>; body: Uint8Array }) => void;
  reject: (reason: Error) => void;
  chunks: Uint8Array[];
  headers: Record<string, string>;
  status: number;
  completed: boolean;
  onChunk?: (data: Uint8Array) => void;
};

export class RelayRemoteTransport {
  private ws: WebSocket | null = null;
  private state: RelayTransportState = 'disconnected';
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 1000;
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private requestIdCounter = 0;

  constructor(private readonly config: RelayTransportConfig) {}

  getState(): RelayTransportState {
    return this.state;
  }

  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.state = 'connecting';
    const wsUrl = `${this.config.relayUrl.replace(/\/$/, '')}/v1/relay/${encodeURIComponent(this.config.relayId)}/socket`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      this.ws.onclose = this.handleClose.bind(this);

      await this.waitForConnection();
    } catch (error) {
      this.state = 'error';
      throw new Error(`Failed to connect to relay: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.rejectAllPendingRequests('Relay disconnected');
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.state = 'disconnected';
  }

  async request(options: RelayRequestOptions): Promise<{ status: number; headers: Record<string, string>; body: Uint8Array }> {
    if (this.state !== 'connected') {
      await this.connect();
    }

    const requestId = this.generateRequestId();
    const bodyBytes = options.body ? new TextEncoder().encode(JSON.stringify(options.body)) : undefined;
    const bodyBase64 = bodyBytes ? this.toBase64(bodyBytes) : undefined;

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
          if (!pending.completed) {
            this.sendFrame({
              version: RELAY_PROTOCOL_VERSION,
              type: 'cancel',
              requestId,
            });
            pending.reject(new Error('Request cancelled'));
            this.pendingRequests.delete(requestId);
          }
        };
      }
    });
  }

  async stream(options: RelayStreamOptions): Promise<{ status: number; headers: Record<string, string>; body: Uint8Array; events: AsyncIterable<RelayStreamEvent> }> {
    const result = await this.request(options);
    const events = this.parseSseEvents(result.body);
    return {
      ...result,
      events,
    };
  }

  private *parseSseEvents(body: Uint8Array): Generator<RelayStreamEvent, void, unknown> {
    const text = new TextDecoder().decode(body);
    const lines = text.split('\n');
    let eventBuffer = '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        eventBuffer = line.slice(6);
      } else if (line === '' && eventBuffer) {
        try {
          const parsed = JSON.parse(eventBuffer);
          yield {
            type: parsed.type || 'unknown',
            data: parsed,
          };
        } catch {
          yield {
            type: 'error',
            data: eventBuffer,
          };
        }
        eventBuffer = '';
      }
    }

    if (eventBuffer) {
      try {
        const parsed = JSON.parse(eventBuffer);
        yield {
          type: parsed.type || 'unknown',
          data: parsed,
        };
      } catch {
        yield {
          type: 'error',
          data: eventBuffer,
        };
      }
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
      clientToken: this.config.clientToken,
    };
    this.sendFrame(helloFrame);
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const data = JSON.parse(event.data) as RelayFrame;
      this.processFrame(data);
    } catch {
      console.error('Failed to parse relay frame');
    }
  }

  private handleError(): void {
    this.state = 'error';
  }

  private handleClose(): void {
    this.state = 'disconnected';
    this.ws = null;
    this.scheduleReconnect();
  }

  private processFrame(frame: RelayFrame): void {
    switch (frame.type) {
      case 'hello_ack':
        this.state = 'connected';
        this.reconnectAttempts = 0;
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
    }
  }

  private handleChunk(requestId: string, base64Data: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      const data = this.fromBase64(base64Data);
      pending.chunks.push(data);
      pending.onChunk?.(data);
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
    }
  }

  private handleErrorFrame(frame: { requestId?: string; code: string; message: string; retryable: boolean }): void {
    if (frame.requestId) {
      const pending = this.pendingRequests.get(frame.requestId);
      if (pending && !pending.completed) {
        pending.completed = true;
        pending.reject(new Error(`Relay error: ${frame.code} - ${frame.message}`));
        this.pendingRequests.delete(frame.requestId);
      }
    } else {
      this.state = 'error';
    }
  }

  private sendFrame(frame: RelayOutboundFrame): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(frame));
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.state = 'error';
      return;
    }

    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        this.scheduleReconnect();
      }
    }, this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1));
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

  private generateRequestId(): string {
    this.requestIdCounter++;
    return `req_${Date.now()}_${this.requestIdCounter}`;
  }

  private toBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private fromBase64(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
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
