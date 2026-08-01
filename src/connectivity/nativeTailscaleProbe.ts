import { NativeModules } from 'react-native';
import type {
  MiraHostIdentity,
  TailscaleConnectivityResult,
} from './tailscaleConnectivity';

interface NativeTailscaleProbeModule {
  probe(hostUrl: string, timeoutMs: number): Promise<unknown>;
}

const nativeProbe = NativeModules.MiraTailscaleProbe as
  | NativeTailscaleProbeModule
  | undefined;

const allowedStates = new Set<TailscaleConnectivityResult['state']>([
  'ready',
  'invalid_host',
  'dns_unreachable',
  'tls_failed',
  'timeout',
  'host_unreachable',
  'not_mira_host',
  'host_unhealthy',
]);

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const parseIdentity = (value: unknown): MiraHostIdentity | null => {
  const record = asRecord(value);
  if (!record) return null;
  if (
    typeof record.name !== 'string' ||
    typeof record.displayName !== 'string' ||
    typeof record.version !== 'string'
  ) {
    return null;
  }
  return {
    name: record.name,
    displayName: record.displayName,
    version: record.version,
  };
};

const parseNativeResult = (value: unknown): TailscaleConnectivityResult => {
  const record = asRecord(value);
  if (!record || typeof record.state !== 'string') {
    throw new Error('Native Tailscale probe returned an invalid result');
  }

  const state = record.state as TailscaleConnectivityResult['state'];
  if (!allowedStates.has(state)) {
    throw new Error(`Native Tailscale probe returned unsupported state: ${state}`);
  }

  return {
    state,
    hostUrl: typeof record.hostUrl === 'string' ? record.hostUrl : null,
    latencyMs:
      typeof record.latencyMs === 'number' ? record.latencyMs : null,
    identity: parseIdentity(record.identity),
    checkedAt:
      typeof record.checkedAt === 'string'
        ? record.checkedAt
        : new Date().toISOString(),
    ...(typeof record.detail === 'string' ? { detail: record.detail } : {}),
  };
};

export const isNativeTailscaleProbeAvailable = () =>
  nativeProbe != null && typeof nativeProbe.probe === 'function';

export const runNativeTailscaleProbe = async (
  hostUrl: string,
  timeoutMs: number,
): Promise<TailscaleConnectivityResult | null> => {
  if (!nativeProbe || typeof nativeProbe.probe !== 'function') return null;
  return parseNativeResult(await nativeProbe.probe(hostUrl, timeoutMs));
};
