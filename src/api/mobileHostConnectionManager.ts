import { RemoteMiraHostClient } from './remoteMiraHost';
import { RemoteTransportFactory } from './remoteTransportFactory';
import { RelayTransportConfig } from './relayRemoteTransport';

export class MobileHostConnectionManager {
  private client: RemoteMiraHostClient;
  private transportFactory: RemoteTransportFactory;

  constructor() {
    this.client = new RemoteMiraHostClient();
    this.transportFactory = RemoteTransportFactory.getInstance();
  }

  async configureDirectTransport(_hostUrl: string): Promise<void> {
    this.transportFactory.setPreference({ mode: 'direct' });
    // Direct transport is the default, no additional setup needed
    // The client will use jsonTransport/sseTransport directly
    this.client.setTransport(null);
  }

  async configureRelayTransport(config: RelayTransportConfig): Promise<void> {
    this.transportFactory.setPreference({
      mode: 'relay',
      relayConfig: config,
    });

    const storedCredential = await this.getStoredCredential();
    if (storedCredential) {
      const transport = await this.transportFactory.createTransport(storedCredential);
      this.client.setTransport(transport);
    }
  }

  async configureAutoTransport(relayConfig?: RelayTransportConfig): Promise<void> {
    this.transportFactory.setPreference({
      mode: 'auto',
      relayConfig,
    });

    const storedCredential = await this.getStoredCredential();
    if (storedCredential) {
      const transport = await this.transportFactory.createTransport(storedCredential);
      this.client.setTransport(transport);
    }
  }

  async probeConnectivity(): Promise<{ direct: string; relay: string }> {
    const storedCredential = await this.getStoredCredential();
    if (!storedCredential) {
      throw new Error('No stored credential found');
    }

    const preference = this.transportFactory.getPreference();
    return this.transportFactory.probeTransport(
      storedCredential,
      preference.relayConfig,
    );
  }

  getClient(): RemoteMiraHostClient {
    return this.client;
  }

  private async getStoredCredential() {
    const connection = await this.client.restoreConnection();
    return connection?.credential ?? null;
  }
}
