import { type RemoteJsonRequest } from './remoteHttp';
import { openPostSse, type PostSseSession } from './postSse';
import { type RelayRemoteTransport, type RelayStreamEvent } from './relayRemoteTransport';
import { TextDecoder } from './webPolyfills';

export interface RemoteTransport {
  type: 'direct' | 'relay';
  request<T>(input: RemoteTransportRequest<T>): Promise<T>;
  stream<T>(input: RemoteTransportStreamRequest<T>): Promise<PostSseSession<T>>;
  probe(): Promise<RemoteTransportState>;
}

export interface RemoteTransportRequest<T> {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  credential?: string;
  body?: unknown;
  signal?: AbortSignal;
  parse: (value: unknown) => T;
}

export interface RemoteTransportStreamRequest<T> extends RemoteTransportRequest<T> {
  parse: (value: unknown) => T;
}

export type RemoteTransportState = 'ready' | 'unavailable' | 'unknown';

export class DirectRemoteTransport implements RemoteTransport {
  readonly type = 'direct';

  constructor(
    private readonly hostUrl: string,
    private readonly jsonTransport: <T>(request: RemoteJsonRequest<T>) => Promise<T>,
    private readonly sseTransport: typeof openPostSse,
  ) {}

  async request<T>(input: RemoteTransportRequest<T>): Promise<T> {
    return this.jsonTransport({
      hostUrl: this.hostUrl,
      path: input.path,
      method: input.method,
      credential: input.credential,
      body: input.body,
      signal: input.signal,
      parse: input.parse,
      allowInsecureDevelopment: __DEV__,
    });
  }

  async stream<T>(input: RemoteTransportStreamRequest<T>): Promise<PostSseSession<T>> {
    return this.sseTransport({
      hostUrl: this.hostUrl,
      path: input.path,
      credential: input.credential ?? '',
      body: input.body,
      allowInsecureDevelopment: __DEV__,
      parse: input.parse,
    });
  }

  async probe(): Promise<RemoteTransportState> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      await fetch(`${this.hostUrl}/remote/v1/manifest?probe=true`, {
        method: 'GET',
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      return 'ready';
    } catch {
      return 'unavailable';
    }
  }
}

export class RelayAdaptedTransport implements RemoteTransport {
  readonly type = 'relay';

  constructor(private readonly relayTransport: RelayRemoteTransport) {}

  async request<T>(input: RemoteTransportRequest<T>): Promise<T> {
    const headers: Record<string, string> = {};
    if (input.credential) {
      headers['authorization'] = `Bearer ${input.credential}`;
    }

    const result = await this.relayTransport.request({
      method: input.method ?? 'GET',
      path: input.path,
      headers,
      body: input.body,
      signal: input.signal,
    });

    if (result.status >= 400) {
      const bodyText = new TextDecoder().decode(result.body);
      throw new Error(`Relay request failed with status ${result.status}: ${bodyText}`);
    }

    const bodyText = new TextDecoder().decode(result.body);
    const parsed = JSON.parse(bodyText);

    if (!parsed.success) {
      throw new Error(parsed.message || 'Relay request failed');
    }

    return input.parse(parsed.data);
  }

  async stream<T>(input: RemoteTransportStreamRequest<T>): Promise<PostSseSession<T>> {
    const headers: Record<string, string> = {};
    if (input.credential) {
      headers['authorization'] = `Bearer ${input.credential}`;
    }

    const result = await this.relayTransport.stream({
      method: input.method ?? 'POST',
      path: input.path,
      headers,
      body: input.body,
      signal: input.signal,
    });

    const session: PostSseSession<T> = {
      events: this.adaptEvents(result.events, input.parse),
      abort: result.cancel,
    };

    return session;
  }

  async probe(): Promise<RemoteTransportState> {
    const state = this.relayTransport.getState();
    return state === 'connected' ? 'ready' : 'unavailable';
  }

  private async *adaptEvents<T>(
    events: AsyncIterable<RelayStreamEvent>,
    parse: (value: unknown) => T,
  ): AsyncGenerator<T> {
    for await (const event of events) {
      try {
        yield parse(event.data);
      } catch {
        // Skip invalid events
      }
    }
  }
}
