import {
  parseRemoteAppMeta,
  type RemoteAppMeta,
} from '../protocol/remoteHostV1';

export const parseAppMeta = parseRemoteAppMeta;
export type { RemoteAppMeta };