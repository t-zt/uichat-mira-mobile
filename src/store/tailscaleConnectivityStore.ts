import { create } from 'zustand';
import {
  probeTailscaleMiraHost,
  type TailscaleConnectivityResult,
  type TailscaleConnectivityState,
} from '../connectivity/tailscaleConnectivity';

export type TailscaleProbeReason =
  | 'startup'
  | 'foreground'
  | 'manual'
  | 'network-recovery';

interface TailscaleConnectivityStore {
  hostUrl: string;
  state: TailscaleConnectivityState;
  result: TailscaleConnectivityResult | null;
  probeReason: TailscaleProbeReason | null;
  setHostUrl: (hostUrl: string) => void;
  probe: (
    hostUrl?: string,
    reason?: TailscaleProbeReason,
  ) => Promise<TailscaleConnectivityResult | null>;
  reset: () => void;
}

let probeGeneration = 0;

export const useTailscaleConnectivityStore =
  create<TailscaleConnectivityStore>((set, get) => ({
    hostUrl: '',
    state: 'idle',
    result: null,
    probeReason: null,

    setHostUrl: (hostUrl) => {
      const normalizedInput = hostUrl.trim();
      if (normalizedInput === get().hostUrl) return;

      probeGeneration += 1;
      set({
        hostUrl: normalizedInput,
        state: 'idle',
        result: null,
        probeReason: null,
      });
    },

    probe: async (hostUrl, reason = 'manual') => {
      const target = (hostUrl ?? get().hostUrl).trim();
      if (!target) {
        probeGeneration += 1;
        set({
          hostUrl: '',
          state: 'invalid_host',
          result: {
            state: 'invalid_host',
            hostUrl: null,
            latencyMs: null,
            identity: null,
            checkedAt: new Date().toISOString(),
            detail: 'Mira Host address is required',
          },
          probeReason: reason,
        });
        return get().result;
      }

      const generation = ++probeGeneration;
      set({
        hostUrl: target,
        state: 'probing',
        result: null,
        probeReason: reason,
      });

      const result = await probeTailscaleMiraHost(target, {
        allowInsecureDevelopment: __DEV__,
      });

      if (generation !== probeGeneration) {
        return null;
      }

      set({
        hostUrl: result.hostUrl ?? target,
        state: result.state,
        result,
        probeReason: reason,
      });
      return result;
    },

    reset: () => {
      probeGeneration += 1;
      set({
        hostUrl: '',
        state: 'idle',
        result: null,
        probeReason: null,
      });
    },
  }));
