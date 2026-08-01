import { NativeEventEmitter, NativeModules } from 'react-native';

export type SystemNetworkTransport =
  | 'none'
  | 'vpn'
  | 'wifi'
  | 'cellular'
  | 'ethernet'
  | 'other';

export interface SystemNetworkState {
  connected: boolean;
  transport: SystemNetworkTransport;
  validated: boolean;
  metered: boolean;
  observedAt: number;
}

interface NativeMiraNetworkMonitor {
  getCurrentState(): Promise<SystemNetworkState>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

const nativeMonitor = NativeModules.MiraNetworkMonitor as
  | NativeMiraNetworkMonitor
  | undefined;

const emitter = nativeMonitor ? new NativeEventEmitter(nativeMonitor) : null;

export const isSystemNetworkMonitorAvailable = () => nativeMonitor != null;

export const getCurrentSystemNetworkState = async () => {
  if (!nativeMonitor) return null;
  return nativeMonitor.getCurrentState();
};

export const subscribeToSystemNetworkChanges = (
  listener: (state: SystemNetworkState) => void,
) => {
  if (!emitter) return () => undefined;

  const subscription = emitter.addListener('MiraNetworkChanged', listener);
  return () => subscription.remove();
};
