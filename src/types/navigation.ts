export type RootStackParamList = {
  SessionList: undefined;
  Chat: { sessionId: string; title: string };
  HostConfig:
    | {
        version?: string;
        host?: string;
        challenge?: string;
        code?: string;
      }
    | undefined;
  Settings: undefined;
};

export type DrawerParamList = {
  Main: undefined;
  Settings: undefined;
};
