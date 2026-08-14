import { StoredDeviceCredential, RemoteEndpoints, deviceCredentialStore } from '../security/deviceCredentialStore';
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

  private async loadPersistedEndpoints(): Promise<RemoteEndpoints[]> {
    try {
      const stored = await deviceCredentialStore.load();
      if (!stored) return [];
      const endpoints: RemoteEndpoints[] = [];
      if (stored.hostUrl || stored.relay) {
        endpoints.push({ hostUrl: stored.hostUrl, relay: stored.relay });
      }
      for (const ep of stored.endpoints) {
        if (ep.hostUrl || ep.relay) {
          const isDuplicate = endpoints.some(
            e => e.hostUrl === ep.hostUrl && 
                 e.relay?.endpoint === ep.relay?.endpoint
          );
          if (!isDuplicate) {
            endpoints.push(ep);
          }
        }
      }
      return endpoints;
    } catch {
      return [];
    }
  }

  private async autoSelectTransport(
    credential: StoredDeviceCredential,
    relayConfig?: RelayTransportConfig,
  ): Promise<RemoteTransport> {
    const persistedEndpoints = await this.loadPersistedEndpoints();
    
    const tryDirect = async (hostUrl: string): Promise<DirectRemoteTransport | null> => {
      try {
        const transport = new DirectRemoteTransport(
          hostUrl,
          requestRemoteJson,
          openPostSse,
        );
        const state = await transport.probe();
        if (state === 'ready') {
          this.directTransport = transport;
          return transport;
        }
      } catch {
        // Direct failed
      }
      return null;
    };

    const tryRelay = async (config: RelayTransportConfig): Promise<RelayAdaptedTransport | null> => {
      try {
        const transport = new RelayRemoteTransport(config);
        const adapted = new RelayAdaptedTransport(transport);
        await transport.connect();
        if (transport.getState() === 'connected') {
          this.relayTransport = transport;
          this.relayAdaptedTransport = adapted;
          return adapted;
        }
      } catch {
        // Relay failed
      }
      return null;
    };

    // 1. Try primary Direct endpoint first
    if (credential.hostUrl) {
      const direct = await tryDirect(credential.hostUrl);
      if (direct) return direct;
    }

    // 2. Try primary Relay endpoint
    if (relayConfig) {
      const relay = await tryRelay(relayConfig);
      if (relay) return relay;
    }

    // 3. Try persisted endpoints in order
    for (const ep of persistedEndpoints) {
      if (ep.hostUrl && ep.hostUrl !== credential.hostUrl) {
        const direct = await tryDirect(ep.hostUrl);
        if (direct) return direct;
      }

      if (ep.relay) {
        const relay = await tryRelay({
          relayUrl: ep.relay.endpoint,
          relayId: ep.relay.relayId,
          clientToken: ep.relay.token,
        });
        if (relay) return relay;
      }
    }

    // 4. Fall back to primary Direct even if probe failed (best effort)
    if (credential.hostUrl) {
      return this.createDirectTransport(credential);
    }

    // 5. Last resort: try Relay without probe
    if (relayConfig) {
      return this.createRelayTransport(relayConfig);
    }

    throw new Error('No available transport found. Please configure a Direct or Relay endpoint.');
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
