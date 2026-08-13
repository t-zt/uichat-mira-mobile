import { Platform } from 'react-native';
import {
  parsePairingClaimResponse,
  parsePairingPollResponse,
  parsePairingUri,
  parseRemoteAgentRun,
  parseRemoteChatStreamEvent,
  parseRemoteManifest,
  parseRemoteMessage,
  parseRemoteThread,
  type PairingClaimResponse,
  type PairingDescriptor,
  type PairingPollResponse,
  type RemoteAgentRun,
  type RemoteChatStreamEvent,
  type RemoteDeviceScope,
  type RemoteManifest,
  type RemoteMessage,
  type RemoteThread,
} from '../protocol/remoteHostV1';
import {
  deviceCredentialStore,
  type DeviceCredentialStore,
  type StoredDeviceCredential,
} from '../security/deviceCredentialStore';
import { openPostSse, type PostSseSession } from './postSse';
import {
  RemoteHostError,
  requestRemoteJson,
  type RemoteJsonRequest,
} from './remoteHttp';
import { RemoteTransport } from './remoteTransport';

export interface MobileDeviceIdentity {
  name: string;
  platform?: string;
  publicKey?: string;
  requestedScopes?: RemoteDeviceScope[];
}

export interface PendingPairing {
  descriptor: PairingDescriptor;
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

export class RemoteMiraHostClient {
  private activeCredential: StoredDeviceCredential | null = null;
  private transport: RemoteTransport | null = null;

  constructor(
    private readonly credentialStore: DeviceCredentialStore = deviceCredentialStore,
    private readonly jsonTransport: RemoteJsonTransport = requestRemoteJson,
    private readonly sseTransport: RemoteSseTransport = openPostSse,
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
    const descriptor = parsePairingUri(pairingUri);
    const claim = await this.claimPairing(descriptor, identity);
    return {
      descriptor,
      claimId: claim.claimId,
      pollToken: claim.pollToken,
      expiresAt: claim.expiresAt,
    };
  }

  async claimPairing(
    descriptor: PairingDescriptor,
    identity: MobileDeviceIdentity,
  ): Promise<PairingClaimResponse> {
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

    if (this.transport) {
      return this.transport.request({
        path: '/remote/pairing/claim',
        method: 'POST',
        body,
        parse: parsePairingClaimResponse,
      });
    }

    return this.jsonTransport({
      hostUrl: descriptor.hostUrl,
      path: '/remote/pairing/claim',
      method: 'POST',
      allowInsecureDevelopment: __DEV__,
      body,
      parse: parsePairingClaimResponse,
    });
  }

  async pollPairing(pending: PendingPairing): Promise<PairingPollResponse> {
    const path = `/remote/pairing/claims/${encodeURIComponent(pending.claimId)}/poll`;
    const body = { pollToken: pending.pollToken };

    const result = this.transport
      ? await this.transport.request({
          path,
          method: 'POST',
          body,
          parse: parsePairingPollResponse,
        })
      : await this.jsonTransport({
          hostUrl: pending.descriptor.hostUrl,
          path,
          method: 'POST',
          allowInsecureDevelopment: __DEV__,
          body,
          parse: parsePairingPollResponse,
        });

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
      credential: result.credential,
      deviceId: result.deviceId,
      scopes: result.scopes,
      savedAt: new Date().toISOString(),
    };
    await this.credentialStore.save(stored);
    this.activeCredential = stored;

    try {
      const manifest = await this.getManifestWithCredential(
        pending.descriptor.hostUrl,
        result.credential,
      );
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
      const manifest = await this.getManifestWithCredential(
        stored.hostUrl,
        stored.credential,
      );
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
    await this.credentialStore.clear();
  }

  async getManifest(): Promise<RemoteManifest> {
    const credential = await this.requireCredential();
    return this.getManifestWithCredential(
      credential.hostUrl,
      credential.credential,
    );
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
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
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
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
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
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
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
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        method: 'POST',
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        body,
        parse,
      }),
    );
  }

  async updateThread(threadId: string, input: { title?: string; status?: string }): Promise<RemoteThread> {
    const path = `/threads/${encodeURIComponent(threadId)}`;
    const parse = parseRemoteThread;
    const body = {};
    if (input.title !== undefined) {
      (body as Record<string, string>).title = input.title;
    }
    if (input.status !== undefined) {
      (body as Record<string, string>).status = input.status;
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
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        method: 'PATCH',
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
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

    await this.withCredential((credential) =>
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        method: 'DELETE',
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        parse: (value: unknown) => value as void,
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

    if (this.transport) {
      return this.transport.stream({
        path: '/proxy/chat/default',
        method: 'POST',
        credential: credential.credential,
        body,
        parse: parseRemoteChatStreamEvent,
      });
    }

    return this.sseTransport({
      hostUrl: credential.hostUrl,
      path: '/proxy/chat/default',
      credential: credential.credential,
      allowInsecureDevelopment: __DEV__,
      body,
      parse: parseRemoteChatStreamEvent,
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
    return this.requireCredential().then((credential) => ({
      url: `${credential.hostUrl}/threads/${encodeURIComponent(threadId)}/media/${encodeURIComponent(mediaId)}/content`,
      headers: { Authorization: `Bearer ${credential.credential}` },
    }));
  }

  private async getManifestWithCredential(
    hostUrl: string,
    credential: string,
  ): Promise<RemoteManifest> {
    const path = '/remote/v1/manifest';
    const parse = parseRemoteManifest;
    
    if (this.transport) {
      return this.transport.request({
        path,
        method: 'GET',
        credential,
        parse,
      });
    }
    
    return this.jsonTransport({
      hostUrl,
      path,
      credential,
      allowInsecureDevelopment: __DEV__,
      parse,
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
    
    return this.withCredential((credential) =>
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path,
        method,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        parse,
      }),
    );
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
