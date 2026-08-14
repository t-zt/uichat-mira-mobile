import { StoredDeviceCredential } from '../security/deviceCredentialStore';
import { DirectRemoteTransport, RelayAdaptedTransport, RemoteTransport, RemoteTransportState } from './remoteTransport';
import { RelayRemoteTransport, RelayTransportConfig } from './relayRemoteTransport';
import { requestRemoteJson } from './remoteHttp';
import { openPostSse } from './postSse';

export interface TransportPreference {
  mode: 'auto' | 'direct' | 'relay';
  relayConfig?: RelayTransportConfig;
}

export class RemoteTransportFactory {
  private static instance: RemoteTransportFactory | null = null;
  private relayTransport: RelayRemoteTransport | null = null;
  private directTransport: DirectRemoteTransport | null = null;
  private relayAdaptedTransport: RelayAdaptedTransport | null = null;
  private preference: TransportPreference = { mode: 'auto' };

  constructor() {}

  static getInstance(): RemoteTransportFactory {
    if (!RemoteTransportFactory.instance) {
      RemoteTransportFactory.instance = new RemoteTransportFactory();
    }
    return RemoteTransportFactory.instance;
  }

  setPreference(preference: TransportPreference): void {
    this.preference = preference;
  }

  getPreference(): TransportPreference {
    return this.preference;
  }

  async createTransport(credential: StoredDeviceCredential): Promise<RemoteTransport> {
    const { mode, relayConfig } = this.preference;

    if (mode === 'relay' && relayConfig) {
      return this.createRelayTransport(relayConfig);
    }

    if (mode === 'direct') {
      return this.createDirectTransport(credential);
    }

    return this.autoSelectTransport(credential, relayConfig);
  }

  private async autoSelectTransport(
    credential: StoredDeviceCredential,
    relayConfig?: RelayTransportConfig,
  ): Promise<RemoteTransport> {
    if (relayConfig) {
      try {
        const relayTransport = await this.createRelayTransport(relayConfig);
        const state = await relayTransport.probe();
        if (state === 'ready') {
          return relayTransport;
        }
      } catch {
        // Relay failed, fallback to direct
      }
    }

    return this.createDirectTransport(credential);
  }

  private async createDirectTransport(credential: StoredDeviceCredential): Promise<DirectRemoteTransport> {
    if (!this.directTransport) {
      if (!credential.hostUrl) {
        throw new Error('No direct host URL available for direct transport');
      }
      this.directTransport = new DirectRemoteTransport(
        credential.hostUrl,
        requestRemoteJson,
        openPostSse,
      );
    }
    return this.directTransport;
  }

  private async createRelayTransport(config: RelayTransportConfig): Promise<RelayAdaptedTransport> {
    if (!this.relayTransport) {
      this.relayTransport = new RelayRemoteTransport(config);
      this.relayAdaptedTransport = new RelayAdaptedTransport(this.relayTransport);
    } else {
      // Update config if changed
      this.relayTransport = new RelayRemoteTransport(config);
      this.relayAdaptedTransport = new RelayAdaptedTransport(this.relayTransport);
    }

    await this.relayTransport.connect();
    return this.relayAdaptedTransport;
  }

  async probeTransport(
    credential: StoredDeviceCredential,
    relayConfig?: RelayTransportConfig,
  ): Promise<{ direct: RemoteTransportState; relay: RemoteTransportState }> {
    const directTransport = await this.createDirectTransport(credential);
    const directState = await directTransport.probe();

    let relayState: RemoteTransportState = 'unavailable';
    if (relayConfig) {
      try {
        const relayTransport = await this.createRelayTransport(relayConfig);
        relayState = await relayTransport.probe();
      } catch {
        relayState = 'unavailable';
      }
    }

    return { direct: directState, relay: relayState };
  }

  dispose(): void {
    this.relayTransport?.disconnect();
    this.relayTransport = null;
    this.relayAdaptedTransport = null;
    this.directTransport = null;
  }
}
