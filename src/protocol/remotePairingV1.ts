import { normalizeHostUrl } from './remoteHostV1';

const RELAY_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const RELAY_TOKEN_MIN_LENGTH = 32;
const RELAY_TOKEN_MAX_LENGTH = 512;

export interface RemoteRelayEndpoint {
  endpoint: string;
  relayId: string;
  token: string;
}

export interface PairingDescriptorV1 {
  version: 1;
  hostUrl: string | null;
  relay: RemoteRelayEndpoint | null;
  challengeId: string;
  code: string;
}

export const normalizeRelayEndpoint = (value: string): string => {
  const trimmed = value.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Mira Relay address is not a valid URL');
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error('Mira Relay URL must not contain credentials, query, or hash');
  }
  if (parsed.pathname !== '/' && parsed.pathname !== '') {
    throw new Error('Mira Relay URL must be a base URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Mira Relay must use HTTPS');
  }
  if (!parsed.hostname) {
    throw new Error('Mira Relay URL must include a hostname');
  }

  return `${parsed.protocol}//${parsed.host}`;
};

const parseRelay = (parsed: URL): RemoteRelayEndpoint | null => {
  const endpointValue = parsed.searchParams.get('relay')?.trim() ?? '';
  const relayId = parsed.searchParams.get('relayId')?.trim() ?? '';
  const token = parsed.searchParams.get('relayToken')?.trim() ?? '';

  if (!endpointValue && !relayId && !token) return null;
  if (!endpointValue || !RELAY_ID_PATTERN.test(relayId)) {
    throw new Error('Pairing link contains an invalid Mira Relay endpoint');
  }
  if (
    token.length < RELAY_TOKEN_MIN_LENGTH ||
    token.length > RELAY_TOKEN_MAX_LENGTH
  ) {
    throw new Error('Pairing link contains an invalid Mira Relay token');
  }

  return {
    endpoint: normalizeRelayEndpoint(endpointValue),
    relayId,
    token,
  };
};

export const parsePairingUriV1 = (value: string): PairingDescriptorV1 => {
  const trimmed = value.trim();
  if (!/^mira:\/\/pair(?:\?|$)/u.test(trimmed)) {
    throw new Error('Pairing link must start with mira://pair');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Pairing link is not a valid URI');
  }

  const version = Number(parsed.searchParams.get('version'));
  if (version !== 1) {
    throw new Error(`Unsupported Mira pairing protocol version: ${String(version)}`);
  }

  const hostValue = parsed.searchParams.get('host')?.trim() ?? '';
  const hostUrl = hostValue
    ? normalizeHostUrl(hostValue, { allowInsecureDevelopment: __DEV__ })
    : null;
  const relay = parseRelay(parsed);
  const challengeId = parsed.searchParams.get('challenge')?.trim() ?? '';
  const code = parsed.searchParams.get('code')?.trim().toUpperCase() ?? '';

  if (!challengeId || !code) {
    throw new Error('Pairing link is missing challenge or code');
  }
  if (!hostUrl && !relay) {
    throw new Error('Pairing link does not contain a reachable Mira endpoint');
  }

  return {
    version: 1,
    hostUrl,
    relay,
    challengeId,
    code,
  };
};
