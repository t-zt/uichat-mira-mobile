import { normalizeHostUrl } from '../protocol/remoteHostV1';
import { runNativeTailscaleProbe } from './nativeTailscaleProbe';

export type TailscaleConnectivityState =
  | 'idle'
  | 'probing'
  | 'ready'
  | 'invalid_host'
  | 'dns_unreachable'
  | 'tls_failed'
  | 'timeout'
  | 'host_unreachable'
  | 'not_mira_host'
  | 'host_unhealthy';

export interface MiraHostIdentity {
  name: string;
  displayName: string;
  version: string;
}

export interface TailscaleConnectivityResult {
  state: Exclude<TailscaleConnectivityState, 'idle' | 'probing'>;
  hostUrl: string | null;
  latencyMs: number | null;
  identity: MiraHostIdentity | null;
  checkedAt: string;
  detail?: string;
}

export interface TailscaleConnectivityProbeOptions {
  timeoutMs?: number;
  allowInsecureDevelopment?: boolean;
  fetchImpl?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;

const unwrapData = (value: unknown): unknown => {
  const record = asRecord(value);
  return record && 'data' in record ? record.data : value;
};

const parseIdentity = (value: unknown): MiraHostIdentity | null => {
  const record = asRecord(unwrapData(value));
  if (!record) return null;

  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const displayName =
    typeof record.displayName === 'string' ? record.displayName.trim() : '';
  const version =
    typeof record.version === 'string' ? record.version.trim() : '';

  if (!name || !displayName || !version) return null;

  const marker = `${name} ${displayName}`.toLowerCase();
  if (!marker.includes('mira') && !marker.includes('uichat')) return null;

  return { name, displayName, version };
};

const classifyNetworkError = (
  error: unknown,
): Pick<TailscaleConnectivityResult, 'state' | 'detail'> => {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes('abort') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out')
  ) {
    return { state: 'timeout', detail: message };
  }
  if (
    normalized.includes('certificate') ||
    normalized.includes('ssl') ||
    normalized.includes('tls') ||
    normalized.includes('trust anchor')
  ) {
    return { state: 'tls_failed', detail: message };
  }
  if (
    normalized.includes('name not resolved') ||
    normalized.includes('dns') ||
    normalized.includes('unknown host') ||
    normalized.includes('could not resolve')
  ) {
    return { state: 'dns_unreachable', detail: message };
  }
  return { state: 'host_unreachable', detail: message };
};

const requestWithTimeout = async (
  fetchImpl: typeof fetch,
  url: string,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeProbeHost = (
  hostInput: string,
  allowInsecureDevelopment: boolean,
) => {
  const normalized = normalizeHostUrl(hostInput, {
    allowInsecureDevelopment,
  });
  const parsed = new URL(normalized);
  if (parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error('Mira Host address must not contain a path, query, or fragment');
  }
  return `${parsed.protocol}//${parsed.host}`;
};

/**
 * Verify the complete mobile-to-desktop Direct transport path before pairing:
 * network routing -> DNS -> TLS -> Mira Host.
 *
 * Android prefers a native probe so DNS and TLS failures are not collapsed into
 * React Native's generic "Network request failed" error. Other platforms and
 * tests use the fetch implementation with the same result contract.
 */
export const probeTailscaleMiraHost = async (
  hostInput: string,
  options: TailscaleConnectivityProbeOptions = {},
): Promise<TailscaleConnectivityResult> => {
  const checkedAt = new Date().toISOString();
  let hostUrl: string;

  try {
    hostUrl = normalizeProbeHost(
      hostInput,
      options.allowInsecureDevelopment === true,
    );
  } catch (error) {
    return {
      state: 'invalid_host',
      hostUrl: null,
      latencyMs: null,
      identity: null,
      checkedAt,
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const timeoutMs = options.timeoutMs ?? 8_000;

  if (!options.fetchImpl) {
    try {
      const nativeResult = await runNativeTailscaleProbe(hostUrl, timeoutMs);
      if (nativeResult) return nativeResult;
    } catch {
      // Native diagnostics are an optimization for accurate classification.
      // Fall back to the cross-platform probe rather than losing reachability.
    }
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const startedAt = Date.now();

  try {
    const health = await requestWithTimeout(
      fetchImpl,
      `${hostUrl}/health`,
      timeoutMs,
    );
    if (!health.ok) {
      return {
        state: 'host_unhealthy',
        hostUrl,
        latencyMs: Date.now() - startedAt,
        identity: null,
        checkedAt,
        detail: `Mira Host health probe returned HTTP ${health.status}`,
      };
    }

    const meta = await requestWithTimeout(
      fetchImpl,
      `${hostUrl}/app/meta`,
      timeoutMs,
    );
    if (!meta.ok) {
      return {
        state: 'not_mira_host',
        hostUrl,
        latencyMs: Date.now() - startedAt,
        identity: null,
        checkedAt,
        detail: `Host identity probe returned HTTP ${meta.status}`,
      };
    }

    const identity = parseIdentity(await meta.json());
    if (!identity) {
      return {
        state: 'not_mira_host',
        hostUrl,
        latencyMs: Date.now() - startedAt,
        identity: null,
        checkedAt,
        detail: 'The reachable HTTPS service is not a recognized Mira Host',
      };
    }

    return {
      state: 'ready',
      hostUrl,
      latencyMs: Date.now() - startedAt,
      identity,
      checkedAt,
    };
  } catch (error) {
    const classified = classifyNetworkError(error);
    return {
      ...classified,
      hostUrl,
      latencyMs: Date.now() - startedAt,
      identity: null,
      checkedAt,
    };
  }
};

export const tailscaleConnectivityMessage = (
  state: TailscaleConnectivityResult['state'],
): string => {
  switch (state) {
    case 'ready':
      return '已通过 Direct 传输连接到 Mira Host';
    case 'invalid_host':
      return '主机地址无效';
    case 'dns_unreachable':
      return 'DNS 无法解析，请确认主机地址正确且网络可达';
    case 'tls_failed':
      return 'HTTPS 证书校验失败';
    case 'timeout':
      return '连接超时，请检查网络和桌面在线状态';
    case 'host_unreachable':
      return '无法通过网络访问桌面主机';
    case 'not_mira_host':
      return '地址可达，但目标不是 Mira Host';
    case 'host_unhealthy':
      return 'Mira Host 已找到，但服务尚未就绪';
  }
};
