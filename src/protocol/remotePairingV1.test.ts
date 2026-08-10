import { parsePairingUriV1 } from './remotePairingV1';

describe('parsePairingUriV1', () => {
  it('keeps Direct and Relay endpoints from one pairing link', () => {
    const token = 't'.repeat(43);
    const parsed = parsePairingUriV1(
      `mira://pair?version=1&challenge=challenge-1&code=abcd2345&host=${encodeURIComponent(
        'https://desktop.example.ts.net',
      )}&relay=${encodeURIComponent('https://relay.tomz.io')}&relayId=relay_1234567890abcdef&relayToken=${token}`,
    );

    expect(parsed).toEqual({
      version: 1,
      hostUrl: 'https://desktop.example.ts.net',
      relay: {
        endpoint: 'https://relay.tomz.io',
        relayId: 'relay_1234567890abcdef',
        token,
      },
      challengeId: 'challenge-1',
      code: 'ABCD2345',
    });
  });

  it('accepts Relay-only pairing links', () => {
    const token = 't'.repeat(43);
    const parsed = parsePairingUriV1(
      `mira://pair?version=1&challenge=challenge-1&code=ABCD2345&relay=https%3A%2F%2Frelay.tomz.io&relayId=relay_1234567890abcdef&relayToken=${token}`,
    );

    expect(parsed.hostUrl).toBeNull();
    expect(parsed.relay?.endpoint).toBe('https://relay.tomz.io');
  });

  it('rejects incomplete Relay credentials', () => {
    expect(() =>
      parsePairingUriV1(
        'mira://pair?version=1&challenge=challenge-1&code=ABCD2345&relay=https%3A%2F%2Frelay.tomz.io&relayId=relay_1234567890abcdef',
      ),
    ).toThrow('invalid Mira Relay token');
  });
});
