import { Platform } from 'react-native';
import {
  parsePairingClaimResponse,
  parsePairingPollResponse,
  parseRemoteAgentRun,
  parseRemoteChatStreamEvent,
  parseRemoteManifest,
  parseRemoteMessage,
  parseRemoteThread,
  type PairingClaimResponse,
  type PairingPollResponse,
  type RemoteAgentRun,
  type RemoteChatStreamEvent,
  type RemoteDeviceScope,
  type RemoteManifest,
  type RemoteMessage,
  type RemoteThread,
} from '../protocol/remoteHostV1';
import {
  parsePairingUriV1,
  type PairingDescriptorV1,
  type RemoteRelayEndpoint,
} from '../protocol/remotePairingV1';
import {
  deviceCredentialStore,
  type DeviceCredentialStore,
  type StoredDeviceCredential,
} from '../security/deviceCredentialStore';
import { openPostSse, type PostSseRequest, type PostSseSession } from './postSse';
import {
  RemoteHostError,
  requestRemoteJson,
  type RemoteJsonRequest,
} from './remoteHttp';
import { RemoteTransport } from './remoteTransport';
import {
  closeRelayConnections,
  isRelayTransportError,
  openRelayPostSse,
  requestRelayJson,
} from './remoteRelay';

export interface MobileDeviceIdentity {
  name: string;
  platform?: string;
  publicKey?: string;
  requestedScopes?: RemoteDeviceScope[];
}

export type RemoteTransportKind = 'direct' | 'relay';

export interface PendingPairing {
  descriptor: PairingDescriptorV1;
  transport: RemoteTransportKind;
  claimId: string;
  pollToken: string;
  expiresAt: string;
}

export interface RestoredRemoteConnection {
  credential: StoredDeviceCredential;
  manifest: RemoteManifest;
}

export interface SendRemoteMessageInput {
  threadId: string;
  messageId: string;
  content: string;
  agentEnabled?: boolean;
  requestedToolGroupIds?: string[];
}

type RemoteJsonTransport = <T>(request: RemoteJsonRequest<T>) => Promise<T>;
type RemoteSseTransport = typeof openPostSse;
type RemoteRelayJsonTransport = typeof requestRelayJson;
type RemoteRelaySseTransport = typeof openRelayPostSse;
type JsonOperation<T> = Omit<
  RemoteJsonRequest<T>,
  'hostUrl' | 'allowInsecureDevelopment'
>;
type SseOperation<T> = Omit<
  PostSseRequest<T>,
  'hostUrl' | 'allowInsecureDevelopment'
>;
type RemoteEndpoints = {
  hostUrl: string | null;
  relay: RemoteRelayEndpoint | null;
};

type PairingClaimWithTransport = PairingClaimResponse & {
  transport: RemoteTransportKind;
};

const DIRECT_RETRY_COOLDOWN_MS = 30_000;

const parseArray = <T>(
  value: unknown,
  itemParser: (item: unknown) => T,
  context: string,
): T[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${context} must be an array`);
  }
  return value.map(itemParser);
};

const normalizeDeviceName = (value: string) => {
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 80);
  return normalized || 'Mira Mobile';
};

const isDirectNetworkError = (error: unknown) =>
  error instanceof RemoteHostError && error.code === 'NETWORK_ERROR';

export class RemoteMiraHostClient {
  private activeCredential: StoredDeviceCredential | null = null;
  private transport: RemoteTransport | null = null;
  private directRetryAfter = 0;

  constructor(
    private readonly credentialStore: DeviceCredentialStore = deviceCredentialStore,
    private readonly jsonTransport: RemoteJsonTransport = requestRemoteJson,
    private readonly sseTransport: RemoteSseTransport = openPostSse,
    private readonly relayJsonTransport: RemoteRelayJsonTransport = requestRelayJson,
    private readonly relaySseTransport: RemoteRelaySseTransport = openRelayPostSse,
  ) {}

  setTransport(transport: RemoteTransport | null): void {
    this.transport = transport;
  }

  getTransport(): RemoteTransport | null {
    return this.transport;
  }

  isSecureStorageAvailable() {
    return this.credentialStore.isAvailable();
  }

  async getStoredHostUrl(): Promise<string | null> {
    const stored = await this.credentialStore.load();
    return stored?.hostUrl ?? null;
  }

  async claimPairingUri(
    pairingUri: string,
    identity: MobileDeviceIdentity,
  ): Promise<PendingPairing> {
    const descriptor = parsePairingUriV1(pairingUri);
    const claim = await this.claimPairing(descriptor, identity);
    return {
      descriptor,
      transport: claim.transport,
      claimId: claim.claimId,
      pollToken: claim.pollToken,
      expiresAt: claim.expiresAt,
    };
  }

  async claimPairing(
    descriptor: PairingDescriptorV1,
    identity: MobileDeviceIdentity,
  ): Promise<PairingClaimWithTransport> {
    if (this.transport) {
      const body = {
        challengeId: descriptor.challengeId,
        code: descriptor.code,
        deviceName: normalizeDeviceName(identity.name),
        platform: identity.platform ?? Platform.OS,
        ...(identity.publicKey ? { publicKey: identity.publicKey } : {}),
        ...(identity.requestedScopes
          ? { requestedScopes: identity.requestedScopes }
          : {}),
      };
      const claim = await this.transport.request({
        path: '/remote/pairing/claim',
        method: 'POST',
        body,
        parse: parsePairingClaimResponse,
      });
      return { ...claim, transport: this.transport.type };
    }
    const transport = await this.selectPairingTransport(descriptor);
    const claim = await this.claimPairingOnTransport(
      descriptor,
      identity,
      transport,
    );
    return { ...claim, transport };
  }

  async pollPairing(pending: PendingPairing): Promise<PairingPollResponse> {
    const path = `/remote/pairing/claims/${encodeURIComponent(pending.claimId)}/poll`;
    const body = { pollToken: pending.pollToken };

    let result: PairingPollResponse;
    if (this.transport) {
      result = await this.transport.request({
        path,
        method: 'POST',
        body,
        parse: parsePairingPollResponse,
      });
    } else {
      result = await this.requestJsonOnTransport(
        pending.descriptor,
        pending.transport,
        {
          path,
          method: 'POST',
          body,
          parse: parsePairingPollResponse,
        },
      );
    }

    if (!result.credential) {
      return result;
    }
    if (!result.deviceId) {
      throw new RemoteHostError(
        'INVALID_PAIRING_RESPONSE',
        'Mira Host returned a credential without a device id',
      );
    }

    const stored: StoredDeviceCredential = {
      hostUrl: pending.descriptor.hostUrl,
      relay: pending.descriptor.relay,
      endpoints: [
        {
          hostUrl: pending.descriptor.hostUrl,
          relay: pending.descriptor.relay,
        },
      ].filter(ep => ep.hostUrl || ep.relay),
      credential: result.credential,
      deviceId: result.deviceId,
      scopes: result.scopes,
      savedAt: new Date().toISOString(),
    };
    await this.credentialStore.save(stored);
    this.activeCredential = stored;

    try {
      const manifest = await this.getManifestWithCredential(stored);
      if (manifest.device.id !== result.deviceId) {
        await this.credentialStore.clear();
        this.activeCredential = null;
        throw new RemoteHostError(
          'DEVICE_ID_MISMATCH',
          'Paired device identity does not match the Host manifest',
        );
      }

      const verified: StoredDeviceCredential = {
        ...stored,
        scopes: manifest.device.scopes,
      };
      await this.credentialStore.save(verified);
      this.activeCredential = verified;
      return result;
    } catch (error) {
      if (
        error instanceof RemoteHostError &&
        (error.status === 401 || error.status === 403)
      ) {
        await this.credentialStore.clear();
        this.activeCredential = null;
      }
      throw error;
    }
  }

  async restoreConnection(): Promise<RestoredRemoteConnection | null> {
    const stored = await this.credentialStore.load();
    if (!stored) {
      this.activeCredential = null;
      return null;
    }

    try {
      const manifest = await this.getManifestWithCredential(stored);
      const refreshed: StoredDeviceCredential = {
        ...stored,
        deviceId: manifest.device.id,
        scopes: manifest.device.scopes,
      };
      this.activeCredential = refreshed;
      return { credential: refreshed, manifest };
    } catch (error) {
      if (
        error instanceof RemoteHostError &&
        (error.status === 401 || error.status === 403)
      ) {
        await this.credentialStore.clear();
        this.activeCredential = null;
      }
      throw error;
    }
  }

  async disconnect() {
    this.activeCredential = null;
    this.directRetryAfter = 0;
    closeRelayConnections();
    await this.credentialStore.clear();
  }

  async getManifest(): Promise<RemoteManifest> {
    const credential = await this.requireCredential();
    return this.getManifestWithCredential(credential);
  }

  async listThreads(): Promise<RemoteThread[]> {
    const path = '/threads?status=active&sortBy=updatedAt&sortOrder=desc';
    const parse = (value: unknown) => parseArray(value, parseRemoteThread, 'threads');

    if (this.transport) {
      return this.withCredential((credential) =>
        this.transport!.request({
          path,
          method: 'GET',
          credential: credential.credential,
          parse,
        }),
      );
    }

    return this.withCredential((credential) =>
      this.requestCredentialJson(credential, {
        path,
        credential: credential.credential,
        parse,
      }),
    );
  }

  async getThread(threadId: string): Promise<RemoteThread> {
    const path = `/threads/${encodeURIComponent(threadId)}`;
    const parse = parseRemoteThread;

    if (this.transport) {
      return this.withCredential((credential) =>
        this.transport!.request({
          path,
          method: 'GET',
          credential: credential.credential,
          parse,
        }),
      );
    }

    return this.withCredential((credential) =>
      this.requestCredentialJson(credential, {
        path,
        credential: credential.credential,
        parse,
      }),
    );
  }

  async getMessages(threadId: string): Promise<RemoteMessage[]> {
    const path = `/threads/${encodeURIComponent(threadId)}/messages`;
    const parse = (value: unknown) => parseArray(value, parseRemoteMessage, 'messages');

    if (this.transport) {
      return this.withCredential((credential) =>
        this.transport!.request({
          path,
          method: 'GET',
          credential: credential.credential,
          parse,
        }),
      );
    }

    return this.withCredential((credential) =>
      this.requestCredentialJson(credential, {
        path,
        credential: credential.credential,
        parse,
      }),
    );
  }

  async createThread(input: { title?: string; status?: string }): Promise<RemoteThread> {
    const path = '/threads';
    const parse = parseRemoteThread;
    const body = {
      title: input.title ?? 'New Thread',
      status: input.status ?? 'active',
    };

    if (this.transport) {
      return this.withCredential((credential) =>
        this.transport!.request({
          path,
          method: 'POST',
          credential: credential.credential,
          body,
          parse,
        }),
      );
    }

    return this.withCredential((credential) =>
      this.requestCredentialJson(credential, {
        path,
        method: 'POST',
        credential: credential.credential,
        body,
        parse,
      }),
    );
  }

  async updateThread(threadId: string, input: { title?: string; status?: string }): Promise<RemoteThread> {
    const path = `/threads/${encodeURIComponent(threadId)}`;
    const parse = parseRemoteThread;
    const body: Record<string, string> = {};
    if (input.title !== undefined) {
      body.title = input.title;
    }
    if (input.status !== undefined) {
      body.status = input.status;
    }

    if (this.transport) {
      return this.withCredential((credential) =>
        this.transport!.request({
          path,
          method: 'PATCH',
          credential: credential.credential,
          body,
          parse,
        }),
      );
    }

    return this.withCredential((credential) =>
      this.requestCredentialJson(credential, {
        path,
        method: 'PATCH',
        credential: credential.credential,
        body,
        parse,
      }),
    );
  }

  async deleteThread(threadId: string): Promise<void> {
    const path = `/threads/${encodeURIComponent(threadId)}`;

    if (this.transport) {
      await this.withCredential((credential) =>
        this.transport!.request({
          path,
          method: 'DELETE',
          credential: credential.credential,
          parse: (value: unknown) => value as void,
        }),
      );
      return;
    }

    return this.withCredential((credential) =>
      this.requestCredentialJson(credential, {
        path,
        method: 'DELETE',
        credential: credential.credential,
        parse: () => undefined,
      }),
    );
  }

  async sendMessage(
    input: SendRemoteMessageInput,
  ): Promise<PostSseSession<RemoteChatStreamEvent>> {
    const content = input.content.trim();
    if (!content) {
      throw new RemoteHostError('EMPTY_MESSAGE', 'Message content cannot be empty');
    }
    if (!input.messageId.trim()) {
      throw new RemoteHostError(
        'MESSAGE_ID_REQUIRED',
        'A stable message id is required for reconnect-safe sending',
      );
    }

    if (this.transport) {
      const credential = await this.requireCredential();
      const body = {
        id: input.threadId,
        messageId: input.messageId,
        messages: [{ role: 'user', content }],
        ...(typeof input.agentEnabled === 'boolean'
          ? { agentEnabled: input.agentEnabled }
          : {}),
        ...(input.requestedToolGroupIds
          ? { requestedToolGroupIds: input.requestedToolGroupIds }
          : {}),
      };

      return this.transport.stream({
        path: '/proxy/chat/default',
        method: 'POST',
        credential: credential.credential,
        body,
        parse: parseRemoteChatStreamEvent,
      });
    }

    return this.withCredential(async credential => {
      const sseOperation: SseOperation<RemoteChatStreamEvent> = {
        path: '/proxy/chat/default',
        credential: credential.credential,
        body: {
          id: input.threadId,
          messageId: input.messageId,
          messages: [
            {
              role: 'user',
              parts: [{ type: 'text', text: content }],
            },
          ],
          ...(typeof input.agentEnabled === 'boolean'
            ? { agentEnabled: input.agentEnabled }
            : {}),
          ...(input.requestedToolGroupIds
            ? { requestedToolGroupIds: input.requestedToolGroupIds }
            : {}),
        },
        parse: parseRemoteChatStreamEvent,
      };

      const order = this.transportOrder(credential);
      let lastError: unknown = new RemoteHostError(
        'REMOTE_ENDPOINT_UNAVAILABLE',
        'No Mira remote endpoint is available for sending a message',
      );

      for (let index = 0; index < order.length; index += 1) {
        const transport = order[index];
        try {
          await this.requestJsonOnTransport(credential, transport, {
            path: '/remote/v1/manifest',
            credential: credential.credential,
            parse: parseRemoteManifest,
          });
          if (transport === 'direct') this.directRetryAfter = 0;
          return this.openSseOnTransport(credential, transport, sseOperation);
        } catch (error) {
          lastError = error;
          const hasNext = index + 1 < order.length;
          if (!hasNext) throw error;

          if (transport === 'direct' && isDirectNetworkError(error)) {
            this.directRetryAfter = Date.now() + DIRECT_RETRY_COOLDOWN_MS;
            continue;
          }
          if (transport === 'relay' && isRelayTransportError(error)) {
            continue;
          }
          throw error;
        }
      }

      throw lastError;
    });
  }

  async getAgentRun(runId: string): Promise<RemoteAgentRun> {
    return this.agentRequest(runId, 'GET', '');
  }

  async approveAgentRun(runId: string): Promise<RemoteAgentRun> {
    return this.agentRequest(runId, 'POST', '/approve');
  }

  async rejectAgentRun(runId: string): Promise<RemoteAgentRun> {
    return this.agentRequest(runId, 'POST', '/reject');
  }

  async cancelAgentRun(runId: string): Promise<RemoteAgentRun> {
    return this.agentRequest(runId, 'POST', '/cancel');
  }

  getThreadMediaRequest(threadId: string, mediaId: string) {
    return this.requireCredential().then(credential => {
      if (!credential.hostUrl) {
        throw new RemoteHostError(
          'DIRECT_MEDIA_ENDPOINT_REQUIRED',
          'This media request currently requires a Direct Mira Host endpoint',
        );
      }
      return {
        url: `${credential.hostUrl}/threads/${encodeURIComponent(threadId)}/media/${encodeURIComponent(mediaId)}/content`,
        headers: { Authorization: `Bearer ${credential.credential}` },
      };
    });
  }

  private async selectPairingTransport(
    descriptor: PairingDescriptorV1,
  ): Promise<RemoteTransportKind> {
    if (!descriptor.hostUrl) return 'relay';
    if (!descriptor.relay) return 'direct';

    try {
      await this.jsonTransport({
        hostUrl: descriptor.hostUrl,
        path: '/health',
        allowInsecureDevelopment: __DEV__,
        raw: true,
        parse: value => value,
      });
      this.directRetryAfter = 0;
      return 'direct';
    } catch (error) {
      if (!isDirectNetworkError(error)) throw error;
      this.directRetryAfter = Date.now() + DIRECT_RETRY_COOLDOWN_MS;
      return 'relay';
    }
  }

  private async claimPairingOnTransport(
    descriptor: PairingDescriptorV1,
    identity: MobileDeviceIdentity,
    transport: RemoteTransportKind,
  ): Promise<PairingClaimResponse> {
    return this.requestJsonOnTransport(descriptor, transport, {
      path: '/remote/pairing/claim',
      method: 'POST',
      body: {
        challengeId: descriptor.challengeId,
        code: descriptor.code,
        deviceName: normalizeDeviceName(identity.name),
        platform: identity.platform ?? Platform.OS,
        ...(identity.publicKey ? { publicKey: identity.publicKey } : {}),
        ...(identity.requestedScopes
          ? { requestedScopes: identity.requestedScopes }
          : {}),
      },
      parse: parsePairingClaimResponse,
    });
  }

  private async getManifestWithCredential(
    credential: StoredDeviceCredential,
  ): Promise<RemoteManifest> {
    if (this.transport) {
      return this.transport.request({
        path: '/remote/v1/manifest',
        method: 'GET',
        credential: credential.credential,
        parse: parseRemoteManifest,
      });
    }

    return this.requestCredentialJson(credential, {
      path: '/remote/v1/manifest',
      credential: credential.credential,
      parse: parseRemoteManifest,
    });
  }

  private async agentRequest(
    runId: string,
    method: 'GET' | 'POST',
    suffix: string,
  ): Promise<RemoteAgentRun> {
    const path = `/agent/runs/${encodeURIComponent(runId)}${suffix}`;
    const parse = parseRemoteAgentRun;

    if (this.transport) {
      return this.withCredential((credential) =>
        this.transport!.request({
          path,
          method,
          credential: credential.credential,
          parse,
        }),
      );
    }

    return this.withCredential(credential =>
      this.requestCredentialJson(credential, {
        path,
        method,
        credential: credential.credential,
        parse: parseRemoteAgentRun,
      }),
    );
  }

  private async requestCredentialJson<T>(
    credential: StoredDeviceCredential,
    operation: JsonOperation<T>,
  ): Promise<T> {
    const result = await this.requestAcrossEndpoints(credential, operation);
    return result.value;
  }

  private async requestAcrossEndpoints<T>(
    endpoints: RemoteEndpoints,
    operation: JsonOperation<T>,
  ): Promise<{ value: T; transport: RemoteTransportKind }> {
    const order = this.transportOrder(endpoints);
    let lastError: unknown = new RemoteHostError(
      'REMOTE_ENDPOINT_UNAVAILABLE',
      'No Mira remote endpoint is available',
    );

    for (let index = 0; index < order.length; index += 1) {
      const transport = order[index];
      try {
        const value = await this.requestJsonOnTransport(
          endpoints,
          transport,
          operation,
        );
        if (transport === 'direct') this.directRetryAfter = 0;
        return { value, transport };
      } catch (error) {
        lastError = error;
        const hasNext = index + 1 < order.length;
        if (!hasNext) throw error;

        if (transport === 'direct' && isDirectNetworkError(error)) {
          this.directRetryAfter = Date.now() + DIRECT_RETRY_COOLDOWN_MS;
          continue;
        }
        if (transport === 'relay' && isRelayTransportError(error)) {
          continue;
        }
        throw error;
      }
    }

    throw lastError;
  }

  private transportOrder(endpoints: RemoteEndpoints): RemoteTransportKind[] {
    const hasDirect = Boolean(endpoints.hostUrl);
    const hasRelay = Boolean(endpoints.relay);
    if (hasDirect && hasRelay) {
      return Date.now() >= this.directRetryAfter
        ? ['direct', 'relay']
        : ['relay', 'direct'];
    }
    if (hasDirect) return ['direct'];
    if (hasRelay) return ['relay'];
    return [];
  }

  private requestJsonOnTransport<T>(
    endpoints: RemoteEndpoints,
    transport: RemoteTransportKind,
    operation: JsonOperation<T>,
  ): Promise<T> {
    if (transport === 'direct') {
      if (!endpoints.hostUrl) {
        return Promise.reject(
          new RemoteHostError(
            'DIRECT_ENDPOINT_UNAVAILABLE',
            'Direct Mira Host endpoint is unavailable',
          ),
        );
      }
      return this.jsonTransport({
        ...operation,
        hostUrl: endpoints.hostUrl,
        allowInsecureDevelopment: __DEV__,
      });
    }

    if (!endpoints.relay) {
      return Promise.reject(
        new RemoteHostError(
          'RELAY_ENDPOINT_UNAVAILABLE',
          'Mira Relay endpoint is unavailable',
        ),
      );
    }
    return this.relayJsonTransport(endpoints.relay, {
      ...operation,
      hostUrl: endpoints.relay.endpoint,
      allowInsecureDevelopment: false,
    });
  }

  private openSseOnTransport<T>(
    endpoints: RemoteEndpoints,
    transport: RemoteTransportKind,
    operation: SseOperation<T>,
  ): PostSseSession<T> {
    if (transport === 'direct') {
      if (!endpoints.hostUrl) {
        throw new RemoteHostError(
          'DIRECT_ENDPOINT_UNAVAILABLE',
          'Direct Mira Host endpoint is unavailable',
        );
      }
      return this.sseTransport({
        ...operation,
        hostUrl: endpoints.hostUrl,
        allowInsecureDevelopment: __DEV__,
      });
    }

    if (!endpoints.relay) {
      throw new RemoteHostError(
        'RELAY_ENDPOINT_UNAVAILABLE',
        'Mira Relay endpoint is unavailable',
      );
    }
    return this.relaySseTransport(endpoints.relay, {
      ...operation,
      hostUrl: endpoints.relay.endpoint,
      allowInsecureDevelopment: false,
    });
  }

  private async withCredential<T>(
    operation: (credential: StoredDeviceCredential) => Promise<T>,
  ): Promise<T> {
    const credential = await this.requireCredential();
    try {
      return await operation(credential);
    } catch (error) {
      if (
        error instanceof RemoteHostError &&
        (error.status === 401 || error.status === 403)
      ) {
        this.activeCredential = null;
        await this.credentialStore.clear();
      }
      throw error;
    }
  }

  private async requireCredential(): Promise<StoredDeviceCredential> {
    if (this.activeCredential) {
      return this.activeCredential;
    }

    const stored = await this.credentialStore.load();
    if (!stored) {
      throw new RemoteHostError(
        'PAIRING_REQUIRED',
        'This mobile device is not paired with a Mira Host',
      );
    }
    this.activeCredential = stored;
    return stored;
  }
}

export const remoteMiraHostClient = new RemoteMiraHostClient();