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

  constructor(
    private readonly credentialStore: DeviceCredentialStore = deviceCredentialStore,
    private readonly jsonTransport: RemoteJsonTransport = requestRemoteJson,
    private readonly sseTransport: RemoteSseTransport = openPostSse,
  ) {}

  isSecureStorageAvailable() {
    return this.credentialStore.isAvailable();
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
    return this.jsonTransport({
      hostUrl: descriptor.hostUrl,
      path: '/remote/pairing/claim',
      method: 'POST',
      allowInsecureDevelopment: __DEV__,
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

  async pollPairing(pending: PendingPairing): Promise<PairingPollResponse> {
    const result = await this.jsonTransport({
      hostUrl: pending.descriptor.hostUrl,
      path: `/remote/pairing/claims/${encodeURIComponent(pending.claimId)}/poll`,
      method: 'POST',
      allowInsecureDevelopment: __DEV__,
      body: { pollToken: pending.pollToken },
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

    const manifest = await this.getManifestWithCredential(
      pending.descriptor.hostUrl,
      result.credential,
    );
    if (manifest.device.id !== result.deviceId) {
      throw new RemoteHostError(
        'DEVICE_ID_MISMATCH',
        'Paired device identity does not match the Host manifest',
      );
    }

    const stored: StoredDeviceCredential = {
      hostUrl: pending.descriptor.hostUrl,
      credential: result.credential,
      deviceId: result.deviceId,
      scopes: manifest.device.scopes,
      savedAt: new Date().toISOString(),
    };
    await this.credentialStore.save(stored);
    this.activeCredential = stored;
    return result;
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
    return this.withCredential((credential) =>
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path: '/threads?status=active&sortBy=updatedAt&sortOrder=desc',
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        parse: (value) => parseArray(value, parseRemoteThread, 'threads'),
      }),
    );
  }

  async getThread(threadId: string): Promise<RemoteThread> {
    return this.withCredential((credential) =>
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path: `/threads/${encodeURIComponent(threadId)}`,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        parse: parseRemoteThread,
      }),
    );
  }

  async getMessages(threadId: string): Promise<RemoteMessage[]> {
    return this.withCredential((credential) =>
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path: `/threads/${encodeURIComponent(threadId)}/messages`,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        parse: (value) => parseArray(value, parseRemoteMessage, 'messages'),
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
    return this.sseTransport({
      hostUrl: credential.hostUrl,
      path: '/proxy/chat/default',
      credential: credential.credential,
      allowInsecureDevelopment: __DEV__,
      body: {
        id: input.threadId,
        messageId: input.messageId,
        messages: [{ role: 'user', content }],
        ...(typeof input.agentEnabled === 'boolean'
          ? { agentEnabled: input.agentEnabled }
          : {}),
        ...(input.requestedToolGroupIds
          ? { requestedToolGroupIds: input.requestedToolGroupIds }
          : {}),
      },
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
    return this.jsonTransport({
      hostUrl,
      path: '/remote/v1/manifest',
      credential,
      allowInsecureDevelopment: __DEV__,
      parse: parseRemoteManifest,
    });
  }

  private async agentRequest(
    runId: string,
    method: 'GET' | 'POST',
    suffix: string,
  ): Promise<RemoteAgentRun> {
    return this.withCredential((credential) =>
      this.jsonTransport({
        hostUrl: credential.hostUrl,
        path: `/agent/runs/${encodeURIComponent(runId)}${suffix}`,
        method,
        credential: credential.credential,
        allowInsecureDevelopment: __DEV__,
        parse: parseRemoteAgentRun,
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
