import type { RemoteJsonRequest } from './remoteHttp';
import { RemoteHostError } from './remoteHttp';
import { RemoteMiraHostClient, type PendingPairing } from './remoteMiraHost';
import { MemoryDeviceCredentialStore } from '../security/deviceCredentialStore';

const pending: PendingPairing = {
  descriptor: {
    version: 1,
    hostUrl: 'https://mira.example.ts.net',
    challengeId: 'challenge-1',
    code: 'ABCD2345',
  },
  claimId: 'claim-1',
  pollToken: 'poll-token',
  expiresAt: '2026-08-02T00:05:00.000Z',
};

const pollPayload = {
  status: 'approved',
  expiresAt: pending.expiresAt,
  deviceId: 'device-1',
  scopes: ['threads:read'],
  credential: 'mira_device_device-1.secret',
};

const manifestPayload = {
  protocolVersion: 1,
  device: {
    id: 'device-1',
    name: 'Android phone',
    platform: 'android',
    scopes: ['threads:read'],
  },
  routes: {
    threads: ['GET /threads'],
    messages: [],
    agent: [],
    artifacts: [],
  },
  reconnect: {
    mode: 'canonical-state-replay',
    eventCursor: false,
  },
  serverTime: '2026-08-02T00:00:00.000Z',
};

describe('RemoteMiraHostClient pairing credential retention', () => {
  it('persists the one-time credential before manifest verification', async () => {
    const store = new MemoryDeviceCredentialStore();
    const transport = async <T>(request: RemoteJsonRequest<T>): Promise<T> => {
      if (request.path.endsWith('/poll')) {
        return request.parse(pollPayload);
      }
      expect((await store.load())?.credential).toBe(pollPayload.credential);
      return request.parse(manifestPayload);
    };
    const client = new RemoteMiraHostClient(store, transport);

    await client.pollPairing(pending);

    expect(await store.load()).toMatchObject({
      hostUrl: pending.descriptor.hostUrl,
      credential: pollPayload.credential,
      deviceId: 'device-1',
      scopes: ['threads:read'],
    });
    await expect(client.getStoredHostUrl()).resolves.toBe(
      pending.descriptor.hostUrl,
    );
  });

  it('keeps the credential when manifest verification has a network failure', async () => {
    const store = new MemoryDeviceCredentialStore();
    const transport = async <T>(request: RemoteJsonRequest<T>): Promise<T> => {
      if (request.path.endsWith('/poll')) {
        return request.parse(pollPayload);
      }
      throw new RemoteHostError('NETWORK_ERROR', 'offline');
    };
    const client = new RemoteMiraHostClient(store, transport);

    await expect(client.pollPairing(pending)).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
    expect(await store.load()).toMatchObject({
      credential: pollPayload.credential,
      deviceId: 'device-1',
    });
  });

  it('clears a credential explicitly rejected by the Host', async () => {
    const store = new MemoryDeviceCredentialStore();
    const transport = async <T>(request: RemoteJsonRequest<T>): Promise<T> => {
      if (request.path.endsWith('/poll')) {
        return request.parse(pollPayload);
      }
      throw new RemoteHostError('HTTP_403', 'revoked', 403);
    };
    const client = new RemoteMiraHostClient(store, transport);

    await expect(client.pollPairing(pending)).rejects.toMatchObject({
      status: 403,
    });
    await expect(store.load()).resolves.toBeNull();
  });
});
