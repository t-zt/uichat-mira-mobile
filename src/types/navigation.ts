export type RootStackParamList = {
  SessionList: undefined;
  Chat: { sessionId: string; title: string };
  HostConfig:
    | {
        version?: string;
        host?: string;
        relay?: string;
        relayId?: string;
        relayToken?: string;
        challenge?: string;
        code?: string;
      }
    | undefined;
  Settings: undefined;
  Search: undefined;
  Personalization: undefined;
  ReportError: undefined;
  About: undefined;
  License: undefined;
};

export type DrawerParamList = {
  Main: undefined;
  Settings: undefined;
};
