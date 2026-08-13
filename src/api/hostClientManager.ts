import type { MiraHostApi } from './miraHost';
import { MockMiraHostClient } from './mockMiraHost';
import { RemoteHostAdapter } from './remoteHostAdapter';
import { remoteMiraHostClient } from './remoteMiraHost';
import { useHostStore } from '../store/hostStore';
import type { Session, ChatMessage, MiraHostConfig, ConnectionStatus } from '../types';

class HostClientManager implements MiraHostApi {
  private mockClient: MockMiraHostClient;
  private remoteAdapter: RemoteHostAdapter;

  constructor() {
    this.mockClient = new MockMiraHostClient();
    this.remoteAdapter = new RemoteHostAdapter(remoteMiraHostClient);
  }

  private get activeClient(): MiraHostApi {
    const status = useHostStore.getState().connectionStatus;
    const hasCredential = !!useHostStore.getState().config;
    
    if (status === 'connected' && hasCredential) {
      return this.remoteAdapter;
    }
    
    return this.mockClient;
  }

  configure(config: MiraHostConfig): void {
    this.mockClient.configure(config);
    this.remoteAdapter.configure(config);
  }

  getConnectionStatus(): ConnectionStatus {
    return this.activeClient.getConnectionStatus();
  }

  async connect(): Promise<void> {
    try {
      await this.remoteAdapter.connect();
    } catch {
      await this.mockClient.connect();
    }
  }

  async disconnect(): Promise<void> {
    await this.remoteAdapter.disconnect();
    await this.mockClient.disconnect();
  }

  async listSessions(): Promise<Session[]> {
    return this.activeClient.listSessions();
  }

  async getSession(sessionId: string): Promise<Session> {
    return this.activeClient.getSession(sessionId);
  }

  async createSession(title?: string): Promise<Session> {
    return this.activeClient.createSession(title);
  }

  async deleteSession(sessionId: string): Promise<void> {
    return this.activeClient.deleteSession(sessionId);
  }

  async renameSession(sessionId: string, title: string): Promise<Session> {
    return this.activeClient.renameSession(sessionId, title);
  }

  async getMessages(sessionId: string): Promise<ChatMessage[]> {
    return this.activeClient.getMessages(sessionId);
  }

  async sendMessage(
    sessionId: string,
    content: string,
  ): Promise<AsyncIterable<string>> {
    return this.activeClient.sendMessage(sessionId, content);
  }
}

export const hostClient = new HostClientManager();
