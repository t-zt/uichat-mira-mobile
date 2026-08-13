export const RELAY_PROTOCOL_VERSION = 1 as const;

export type RelayHelloFrame = {
  version: 1;
  type: 'hello';
  role: 'client';
  relayId: string;
  clientToken: string;
};

export type RelayHelloAckFrame = {
  version: 1;
  type: 'hello_ack';
  role: 'host' | 'client';
  relayId: string;
  protocolVersion: number;
  hostConnected?: boolean;
};

export type RelayRequestFrame = {
  version: 1;
  type: 'request';
  requestId: string;
  method: string;
  path: string;
  headers?: Record<string, string>;
  bodyBase64?: string;
};

export type RelayResponseFrame = {
  version: 1;
  type: 'response';
  requestId: string;
  status: number;
  headers: Record<string, string>;
};

export type RelayChunkFrame = {
  version: 1;
  type: 'chunk';
  requestId: string;
  encoding: 'base64';
  data: string;
};

export type RelayCompleteFrame = {
  version: 1;
  type: 'complete';
  requestId: string;
};

export type RelayCancelFrame = {
  version: 1;
  type: 'cancel';
  requestId: string;
};

export type RelayErrorFrame = {
  version: 1;
  type: 'error';
  requestId?: string;
  code: string;
  message: string;
  retryable: boolean;
};

export type RelayFrame =
  | RelayHelloFrame
  | RelayHelloAckFrame
  | RelayRequestFrame
  | RelayResponseFrame
  | RelayChunkFrame
  | RelayCompleteFrame
  | RelayCancelFrame
  | RelayErrorFrame;

export type RelayOutboundFrame =
  | RelayHelloFrame
  | RelayRequestFrame
  | RelayCancelFrame;

export type RelayInboundFrame =
  | RelayHelloAckFrame
  | RelayResponseFrame
  | RelayChunkFrame
  | RelayCompleteFrame
  | RelayErrorFrame;
