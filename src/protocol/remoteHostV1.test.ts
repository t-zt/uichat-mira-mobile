import {
  normalizeHostUrl,
  parsePairingUri,
  parseRemoteManifest,
  parseRemoteThread,
  unwrapApiEnvelope,
} from './remoteHostV1';

describe('remoteHostV1 protocol', () => {
  it('parses the desktop pairing URI without inventing fields', () => {
    const uri =
      'mira://pair?host=https%3A%2F%2Fmira-host.example.ts.net&challenge=challenge-1&code=ab23cd45&version=1';

    expect(parsePairingUri(uri)).toEqual({
      version: 1,
      hostUrl: 'https://mira-host.example.ts.net',
      challengeId: 'challenge-1',
      code: 'AB23CD45',
    });
  });

  it('rejects insecure production host addresses', () => {
    expect(() => normalizeHostUrl('http://100.64.0.1:8787')).toThrow(
      'Mira Host must use HTTPS',
    );
    expect(
      normalizeHostUrl('http://127.0.0.1:8787/', {
        allowInsecureDevelopment: true,
      }),
    ).toBe('http://127.0.0.1:8787');
  });

  it('validates the manifest reconnect and scope contract', () => {
    expect(
      parseRemoteManifest({
        protocolVersion: 1,
        device: {
          id: 'device-1',
          name: 'K70',
          platform: 'android',
          scopes: ['threads:read', 'messages:read'],
        },
        routes: {
          threads: ['GET /threads'],
          messages: ['GET /threads/:id/messages'],
          agent: [],
          artifacts: [],
        },
        reconnect: {
          mode: 'canonical-state-replay',
          eventCursor: false,
        },
        serverTime: '2026-08-01T10:00:00.000Z',
      }),
    ).toMatchObject({
      protocolVersion: 1,
      device: { id: 'device-1' },
      reconnect: { eventCursor: false },
    });
  });

  it('normalizes canonical thread timestamps as strings', () => {
    expect(
      parseRemoteThread({
        id: 'thread-1',
        title: 'Mira',
        modelName: null,
        workspaceId: null,
        status: 'active',
        createdAt: '2026-08-01T09:00:00.000Z',
        updatedAt: '2026-08-01T10:00:00.000Z',
        messageCount: 2,
        lastMessage: 'hello',
      }),
    ).toEqual(
      expect.objectContaining({
        id: 'thread-1',
        updatedAt: '2026-08-01T10:00:00.000Z',
        messageCount: 2,
      }),
    );
  });

  it('unwraps only successful Mira API envelopes', () => {
    expect(
      unwrapApiEnvelope({ success: true, data: { value: 1 } }, (data) => data),
    ).toEqual({ value: 1 });
    expect(() =>
      unwrapApiEnvelope(
        { success: false, message: 'denied', code: 'FORBIDDEN' },
        (data) => data,
      ),
    ).toThrow('denied');
  });
});
