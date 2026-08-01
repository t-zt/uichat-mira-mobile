import {
  probeTailscaleMiraHost,
  tailscaleConnectivityMessage,
} from './tailscaleConnectivity';

const response = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }) as Response;

describe('probeTailscaleMiraHost', () => {
  it('verifies health and Mira identity over the supplied tailnet URL', async () => {
    const fetchImpl = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response(200, { ok: true }))
      .mockResolvedValueOnce(
        response(200, {
          success: true,
          data: {
            name: 'uichat-mira',
            displayName: 'Mira',
            version: '1.0.0',
          },
        }),
      );

    const result = await probeTailscaleMiraHost(
      'https://mira-host.example.ts.net/',
      { fetchImpl },
    );

    expect(result.state).toBe('ready');
    expect(result.hostUrl).toBe('https://mira-host.example.ts.net');
    expect(result.identity).toEqual({
      name: 'uichat-mira',
      displayName: 'Mira',
      version: '1.0.0',
    });
    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://mira-host.example.ts.net/health',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://mira-host.example.ts.net/app/meta',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('does not treat an arbitrary reachable service as Mira Host', async () => {
    const fetchImpl = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockResolvedValueOnce(response(200, { ok: true }))
      .mockResolvedValueOnce(
        response(200, {
          data: {
            name: 'other-service',
            displayName: 'Other Service',
            version: '1.0.0',
          },
        }),
      );

    const result = await probeTailscaleMiraHost(
      'https://other.example.ts.net',
      { fetchImpl },
    );

    expect(result.state).toBe('not_mira_host');
  });

  it('classifies timeout separately from invalid host input', async () => {
    const timeoutFetch = jest
      .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
      .mockRejectedValue(
        Object.assign(new Error('Aborted'), { name: 'AbortError' }),
      );

    const timeout = await probeTailscaleMiraHost(
      'https://mira-host.example.ts.net',
      { fetchImpl: timeoutFetch },
    );
    const invalid = await probeTailscaleMiraHost('ftp://invalid-host');

    expect(timeout.state).toBe('timeout');
    expect(invalid.state).toBe('invalid_host');
    expect(tailscaleConnectivityMessage(timeout.state)).toContain('连接超时');
  });

  it('rejects host urls that smuggle an application path or query', async () => {
    const fetchImpl = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();

    const withPath = await probeTailscaleMiraHost(
      'https://mira-host.example.ts.net/not-the-host-root',
      { fetchImpl },
    );
    const withQuery = await probeTailscaleMiraHost(
      'https://mira-host.example.ts.net?redirect=other',
      { fetchImpl },
    );

    expect(withPath.state).toBe('invalid_host');
    expect(withQuery.state).toBe('invalid_host');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
