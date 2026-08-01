import { probeTailscaleMiraHost } from '../connectivity/tailscaleConnectivity';
import { useTailscaleConnectivityStore } from './tailscaleConnectivityStore';

jest.mock('../connectivity/tailscaleConnectivity', () => {
  const actual = jest.requireActual('../connectivity/tailscaleConnectivity');
  return {
    ...actual,
    probeTailscaleMiraHost: jest.fn(),
  };
});

const mockedProbe = jest.mocked(probeTailscaleMiraHost);

const readyResult = (hostUrl: string) => ({
  state: 'ready' as const,
  hostUrl,
  latencyMs: 32,
  identity: {
    name: 'uichat-mira',
    displayName: 'Mira',
    version: '1.0.0',
  },
  checkedAt: '2026-08-01T00:00:00.000Z',
});

describe('useTailscaleConnectivityStore', () => {
  beforeEach(() => {
    mockedProbe.mockReset();
    useTailscaleConnectivityStore.getState().reset();
  });

  it('stores a verified Mira Host transport result', async () => {
    mockedProbe.mockResolvedValueOnce(
      readyResult('https://mira.example.ts.net'),
    );

    const result = await useTailscaleConnectivityStore
      .getState()
      .probe('https://mira.example.ts.net/', 'manual');

    expect(result?.state).toBe('ready');
    expect(useTailscaleConnectivityStore.getState()).toMatchObject({
      state: 'ready',
      hostUrl: 'https://mira.example.ts.net',
      probeReason: 'manual',
    });
  });

  it('does not let an older probe overwrite a newer host selection', async () => {
    let resolveFirst:
      | ((value: ReturnType<typeof readyResult>) => void)
      | undefined;
    mockedProbe
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce(readyResult('https://new.example.ts.net'));

    const first = useTailscaleConnectivityStore
      .getState()
      .probe('https://old.example.ts.net', 'manual');
    const second = useTailscaleConnectivityStore
      .getState()
      .probe('https://new.example.ts.net', 'manual');

    await second;
    resolveFirst?.(readyResult('https://old.example.ts.net'));
    await first;

    expect(useTailscaleConnectivityStore.getState()).toMatchObject({
      state: 'ready',
      hostUrl: 'https://new.example.ts.net',
    });
  });

  it('treats an empty host as invalid without issuing a network request', async () => {
    const result = await useTailscaleConnectivityStore
      .getState()
      .probe('   ', 'manual');

    expect(result?.state).toBe('invalid_host');
    expect(mockedProbe).not.toHaveBeenCalled();
  });
});
