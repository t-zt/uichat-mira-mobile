import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  KeyRound,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Wifi,
} from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import { useHostStore } from '../store/hostStore';
import { useTailscaleConnectivityStore } from '../store/tailscaleConnectivityStore';
import {
  tailscaleConnectivityMessage,
  type TailscaleConnectivityState,
} from '../connectivity/tailscaleConnectivity';
import {
  parsePairingUriV1,
  type PairingDescriptorV1,
} from '../protocol/remotePairingV1';
import { remoteMiraHostClient } from '../api/remoteMiraHost';
import { useRemotePairing, type TransportMode } from '../pairing/useRemotePairing';
import { useTheme } from '../theme/ThemeContext';
import { PairingScannerModal } from '../components/PairingScannerModal';

const connectivityTitle = (state: TailscaleConnectivityState) => {
  switch (state) {
    case 'idle':
      return '尚未检查';
    case 'probing':
      return '正在检查连接';
    case 'ready':
      return 'Tailscale Direct 已联通';
    default:
      return 'Direct 联通失败';
  }
};

const buildPairingUriFromRoute = (
  params: RootStackParamList['HostConfig'],
): string | null => {
  if (!params) return null;
  const { version, host, relay, relayId, relayToken, challenge, code } = params;
  if (!version && !host && !relay && !relayId && !relayToken && !challenge && !code) {
    return null;
  }
  if (!version || !challenge || !code) {
    throw new Error('配对链接缺少 version、challenge 或 code');
  }

  const query = new URLSearchParams({ version, challenge, code });
  if (host) query.set('host', host);
  if (relay) query.set('relay', relay);
  if (relayId) query.set('relayId', relayId);
  if (relayToken) query.set('relayToken', relayToken);
  return `mira://pair?${query.toString()}`;
};

export function HostConfigScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'HostConfig'>>();
  const { colors } = useTheme();
  const { config, setConfig, clearConfig, setConnectionStatus } = useHostStore();
  const connectivityState = useTailscaleConnectivityStore(state => state.state);
  const connectivityResult = useTailscaleConnectivityStore(state => state.result);
  const setConnectivityHostUrl = useTailscaleConnectivityStore(
    state => state.setHostUrl,
  );
  const probe = useTailscaleConnectivityStore(state => state.probe);
  const resetConnectivity = useTailscaleConnectivityStore(state => state.reset);

  const [hostUrl, setHostUrl] = useState(config?.hostUrl ?? '');
  const [pairingDescriptor, setPairingDescriptor] =
    useState<PairingDescriptorV1 | null>(null);
  const [pairingLinkError, setPairingLinkError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);

  const routeVersion = route.params?.version;
  const routeHost = route.params?.host;
  const routeChallenge = route.params?.challenge;
  const routeCode = route.params?.code;

  const [transportMode, setTransportMode] = useState<TransportMode>('auto');

  const isProbing = connectivityState === 'probing';
  const isDirectReady =
    connectivityState === 'ready' && connectivityResult?.hostUrl != null;
  const hasDirectEndpoint = Boolean(pairingDescriptor?.hostUrl);
  const hasRelayEndpoint = Boolean(pairingDescriptor?.relay);
  const isPairingTransportReady = isDirectReady || hasRelayEndpoint;
  const hasTransportError =
    connectivityState !== 'idle' &&
    connectivityState !== 'probing' &&
    connectivityState !== 'ready';

  const {
    state: pairingState,
    start: startPairing,
    reset: resetPairing,
    secureStorageAvailable,
    isRelayMode,
  } = useRemotePairing({
    descriptor: pairingDescriptor,
    connectivityReady: isDirectReady,
    transportMode,
  });

  const loadPairingUri = useCallback(
    (uri: string) => {
      try {
        const descriptor = parsePairingUriV1(uri);
        setPairingDescriptor(descriptor);
        setPairingLinkError(null);

        if (descriptor.hostUrl) {
          setHostUrl(descriptor.hostUrl);
          setConnectivityHostUrl(descriptor.hostUrl);
          const current = useTailscaleConnectivityStore.getState();
          if (
            current.hostUrl !== descriptor.hostUrl ||
            (current.state !== 'probing' && current.state !== 'ready')
          ) {
            void current.probe(descriptor.hostUrl, 'manual').catch(() => {
            });
          }
        } else {
          setHostUrl('');
        }
        return true;
      } catch (error) {
        setPairingDescriptor(null);
        setPairingLinkError(
          error instanceof Error ? error.message : '无法读取桌面配对链接',
        );
        return false;
      }
    },
    [setConnectivityHostUrl],
  );

  useEffect(() => {
    try {
      const uri = buildPairingUriFromRoute(route.params);
      if (uri) loadPairingUri(uri);
    } catch (error) {
      setPairingDescriptor(null);
      setPairingLinkError(
        error instanceof Error ? error.message : '无法读取桌面配对链接',
      );
    }
  }, [route.params, loadPairingUri]);

  useEffect(() => {
    if (pairingState.phase !== 'paired' || !pairingDescriptor) return;

    if (pairingDescriptor.hostUrl) {
      setConfig({ hostUrl: pairingDescriptor.hostUrl, token: '' });
    } else {
      clearConfig();
      resetConnectivity();
    }
    setConnectionStatus('connected');
    navigation.reset({ index: 0, routes: [{ name: 'SessionList' }] });
  }, [
    clearConfig,
    navigation,
    pairingDescriptor,
    pairingState.phase,
    resetConnectivity,
    setConfig,
    setConnectionStatus,
  ]);

  const statusColor =
    connectivityState === 'ready'
      ? colors.status.success
      : connectivityState === 'idle' || connectivityState === 'probing'
        ? colors.status.warning
        : colors.status.error;

  const statusMessage = useMemo(() => {
    if (connectivityState === 'idle') {
      return hasDirectEndpoint
        ? '已获得 Direct endpoint，等待检查 Tailscale 传输。'
        : '当前配对请求没有 Direct endpoint；如果包含 Mira Relay，可直接通过 Relay 配对。';
    }
    if (connectivityState === 'probing') {
      return '正在检查 Tailscale / HTTPS / Mira Host 是否可达。';
    }
    return tailscaleConnectivityMessage(connectivityState);
  }, [connectivityState, hasDirectEndpoint]);

  const pairingBusy =
    pairingState.phase === 'claiming' ||
    pairingState.phase === 'waiting_approval';
  const pairingCompleted = pairingState.phase === 'paired';
  const networkReady = isRelayMode ? true : isDirectReady;
  const pairingActionDisabled =
    !pairingDescriptor ||
    !networkReady ||
    !secureStorageAvailable ||
    pairingBusy ||
    pairingCompleted;

  const pairingTitle = (() => {
    switch (pairingState.phase) {
      case 'claiming':
        return isRelayMode ? '正在通过 Relay 提交设备申请' : '正在提交设备申请';
      case 'waiting_approval':
        return '等待桌面确认';
      case 'paired':
        return '设备已配对';
      case 'rejected':
        return '桌面已拒绝';
      case 'expired':
        return '配对请求已过期';
      case 'error':
      case 'blocked':
        return '设备配对未完成';
      default:
        if (!pairingDescriptor) return '等待桌面配对请求';
        if (hasRelayEndpoint && !isDirectReady) return '可以通过 Mira Relay 配对';
        if (isDirectReady) return '可以申请设备授权';
        return '正在等待可用传输';
    }
  })();

  const pairingMessage =
    pairingState.message ??
    (!secureStorageAvailable
      ? '当前设备不支持安全存储，无法完成配对。'
      : isRelayMode
      ? 'Relay 模式下无需 Tailscale，提交申请后等待桌面批准即可。'
      : pairingDescriptor
        ? `可用连接：${[
            hasDirectEndpoint ? 'Tailscale Direct' : null,
            hasRelayEndpoint ? 'Mira Relay' : null,
          ]
            .filter(Boolean)
            .join(' + ')}。业务身份仍由同一个 mira_device_* 设备凭证负责。`
        : '请在 Mira Desktop 的"远程连接"中生成一次性配对二维码，再用手机扫描。');

  const handleCheck = async () => {
    const target = hostUrl.trim();
    if (!target || isProbing) return;
    setConnectivityHostUrl(target);
    setConnectionStatus('connecting');
    try {
      await probe(target, 'manual');
    } finally {
      if (pairingState.phase !== 'paired') {
        setConnectionStatus('disconnected');
      }
    }
  };

  const handleDisconnect = async () => {
    if (secureStorageAvailable) await remoteMiraHostClient.disconnect();
    clearConfig();
    resetConnectivity();
    resetPairing();
    setHostUrl('');
    setPairingDescriptor(null);
    setPairingLinkError(null);
    setConnectionStatus('disconnected');
  };

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('SessionList');
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border.soft }]}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.ink }]}>连接桌面端</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.form}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hero}>
            <View
              style={[
                styles.heroIcon,
                {
                  backgroundColor: colors.bg.card,
                  borderColor: colors.border.default,
                },
              ]}
            >
              <ShieldCheck size={38} color={colors.primary} strokeWidth={1.6} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text.ink }]}>设备配对</Text>
            <Text style={[styles.heroSubtitle, { color: colors.text.muted }]}> 
              同一个设备身份，可通过 Tailscale Direct 或 Mira Relay 连接桌面端。
            </Text>
          </View>

          <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
            <View style={styles.sectionHeading}>
              <KeyRound
                size={20}
                color={pairingLinkError ? colors.status.error : colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>配对请求</Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="扫码配对"
              onPress={() => setScannerOpen(true)}
              style={({ pressed }) => [
                styles.scanBtn,
                { backgroundColor: colors.primary },
                pressed && { opacity: 0.82 },
              ]}
            >
              <ScanLine size={18} color={colors.onPrimary} />
              <Text style={[styles.scanBtnText, { color: colors.onPrimary }]}>扫码配对</Text>
            </Pressable>

            {pairingLinkError ? (
              <Text style={[styles.bodyText, { color: colors.status.error }]}> 
                {pairingLinkError}
              </Text>
            ) : pairingDescriptor ? (
              <>
                <Text style={[styles.cardTitle, { color: colors.text.ink }]}> 
                  已载入一次性请求
                </Text>
                <Text style={[styles.bodyText, { color: colors.text.muted }]}> 
                  请求 {pairingDescriptor.challengeId.slice(0, 8)}… · {hasDirectEndpoint ? 'Direct' : ''}
                  {hasDirectEndpoint && hasRelayEndpoint ? ' + ' : ''}
                  {hasRelayEndpoint ? 'Relay' : ''} · 有效后仍需在桌面明确批准。
                </Text>
              </>
            ) : (
              <Text style={[styles.bodyText, { color: colors.text.muted }]}> 
                还没有配对请求。请从 Mira Desktop 生成配对二维码。
              </Text>
            )}
          </View>

          <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
            <View style={styles.sectionHeading}>
              <Wifi size={20} color={colors.text.ink} />
              <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>Tailscale Direct</Text>
            </View>

            <Text style={[styles.label, { color: colors.text.muted }]}>Mira Host 地址</Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.border.default,
                  backgroundColor: colors.bg.input,
                  color: colors.text.ink,
                },
              ]}
              value={hostUrl}
              onChangeText={value => {
                setHostUrl(value);
                setConnectivityHostUrl(value);
              }}
              placeholder="https://mira-desktop.tailnet-name.ts.net"
              placeholderTextColor={colors.text.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              editable={!isProbing && !pairingDescriptor}
            />

            {pairingState.phase === 'idle' || pairingState.phase === 'blocked' ? (
              <View style={styles.transportSelector}>
                <Text style={[styles.transportLabel, { color: colors.text.muted }]}>
                  传输方式
                </Text>
                <View style={styles.transportOptions}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.transportOption,
                      {
                        borderColor: transportMode === 'auto' ? colors.primary : colors.border.default,
                        backgroundColor: transportMode === 'auto' ? colors.bg.card : 'transparent',
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setTransportMode('auto')}
                  >
                    <Text style={[
                      styles.transportOptionText,
                      { color: transportMode === 'auto' ? colors.primary : colors.text.muted },
                    ]}>
                      自动
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.transportOption,
                      {
                        borderColor: transportMode === 'direct' ? colors.primary : colors.border.default,
                        backgroundColor: transportMode === 'direct' ? colors.bg.card : 'transparent',
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setTransportMode('direct')}
                  >
                    <Text style={[
                      styles.transportOptionText,
                      { color: transportMode === 'direct' ? colors.primary : colors.text.muted },
                    ]}>
                      Direct
                    </Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [
                      styles.transportOption,
                      {
                        borderColor: transportMode === 'relay' ? colors.primary : colors.border.default,
                        backgroundColor: transportMode === 'relay' ? colors.bg.card : 'transparent',
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    onPress={() => setTransportMode('relay')}
                  >
                    <Text style={[
                      styles.transportOptionText,
                      { color: transportMode === 'relay' ? colors.primary : colors.text.muted },
                    ]}>
                      Relay
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            <View
              style={[
                styles.statusBox,
                {
                  backgroundColor: hasTransportError
                    ? colors.status.errorBg
                    : colors.bg.soft,
                  borderColor: statusColor,
                },
              ]}
            >
              <View style={styles.statusHeader}>
                {isProbing ? (
                  <ActivityIndicator size="small" color={statusColor} />
                ) : connectivityState === 'ready' ? (
                  <CheckCircle2 size={18} color={statusColor} />
                ) : connectivityState === 'idle' ? (
                  <Wifi size={18} color={statusColor} />
                ) : (
                  <AlertTriangle size={18} color={statusColor} />
                )}
                <Text style={[styles.statusTitle, { color: colors.text.ink }]}> 
                  {connectivityTitle(connectivityState)}
                </Text>
              </View>
              <Text style={[styles.bodyText, { color: colors.text.muted }]}> 
                {statusMessage}
              </Text>
              {connectivityResult?.identity ? (
                <Text style={[styles.detailText, { color: colors.text.soft }]}> 
                  {connectivityResult.identity.displayName} · v{connectivityResult.identity.version} ·{' '}
                  {connectivityResult.latencyMs ?? 0} ms
                </Text>
              ) : null}
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.secondaryBtn,
                { borderColor: colors.primary },
                pressed && { backgroundColor: colors.bg.soft },
              ]}
              onPress={handleCheck}
              disabled={isProbing || !hostUrl.trim()}
            >
              {isProbing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <RefreshCw size={18} color={colors.primary} />
              )}
              <Text style={[styles.secondaryBtnText, { color: colors.primary }]}> 
                {isProbing ? '正在检查' : '重新检查 Direct'}
              </Text>
            </Pressable>
          </View>

          {hasRelayEndpoint ? (
            <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
              <View style={styles.sectionHeading}>
                <Wifi size={20} color={colors.primary} />
                <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>Mira Relay</Text>
              </View>
              <Text style={[styles.cardTitle, { color: colors.text.ink }]}>Relay endpoint 已包含在配对请求中</Text>
              <Text style={[styles.bodyText, { color: colors.text.muted }]}> 
                {pairingDescriptor?.relay?.endpoint} · {pairingDescriptor?.relay?.relayId.slice(0, 8)}…
              </Text>
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
            <View style={styles.sectionHeading}>
              <ShieldCheck size={20} color={colors.text.ink} />
              <Text style={[styles.sectionTitle, { color: colors.text.ink }]}>Mira 授权</Text>
            </View>
            <Text style={[styles.cardTitle, { color: colors.text.ink }]}>{pairingTitle}</Text>
            <Text style={[styles.bodyText, { color: colors.text.muted }]}>{pairingMessage}</Text>

            {pairingState.scopes.length > 0 ? (
              <Text style={[styles.detailText, { color: colors.text.soft }]}> 
                已批准：{pairingState.scopes.join(' · ')}
              </Text>
            ) : null}

            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.primary },
                (pairingActionDisabled || pressed) && {
                  backgroundColor: colors.primaryDisabled,
                },
              ]}
              onPress={startPairing}
              disabled={pairingActionDisabled}
            >
              {pairingBusy ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : pairingCompleted ? (
                <CheckCircle2 size={18} color={colors.onPrimary} />
              ) : (
                <KeyRound size={18} color={colors.onPrimary} />
              )}
              <Text style={[styles.primaryBtnText, { color: colors.onPrimary }]}> 
                {pairingState.phase === 'waiting_approval'
                  ? '等待桌面确认'
                  : pairingCompleted
                    ? '设备已配对'
                    : '提交设备配对申请'}
              </Text>
            </Pressable>
          </View>

          {config ? (
            <Pressable
              style={[styles.disconnectBtn, { borderColor: colors.status.errorBg }]}
              onPress={handleDisconnect}
            >
              <Text style={[styles.disconnectBtnText, { color: colors.status.error }]}> 
                断开并清除设备授权
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <PairingScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScanned={uri => {
          setScannerOpen(false);
          loadPairingUri(uri);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
  container: { flex: 1 },
  form: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', paddingTop: 4, paddingBottom: 24 },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  heroTitle: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    textAlign: 'center',
  },
  card: { borderRadius: 16, padding: 18, marginBottom: 16 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  cardTitle: { fontSize: 15, fontWeight: '700', marginBottom: 6 },
  bodyText: { fontSize: 13, lineHeight: 20 },
  detailText: { fontSize: 12, lineHeight: 18, marginTop: 8 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    marginBottom: 14,
  },
  scanBtn: {
    minHeight: 48,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  scanBtnText: { fontSize: 15, fontWeight: '700' },
  statusBox: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  statusTitle: { fontSize: 15, fontWeight: '700' },
  statusText: { fontSize: 13, lineHeight: 20 },
  pairingState: { marginTop: 16 },
  authorizationTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  authorizationText: { fontSize: 13, lineHeight: 20 },
  transportSelector: {
    marginTop: 16,
    marginBottom: 8,
  },
  transportLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  transportOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  transportOption: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  transportOptionText: {
    fontSize: 13,
    fontWeight: '500',
  },
  pairBtn: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: 26,
  },
  secondaryBtn: {
    minHeight: 46,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700' },
  primaryBtn: {
    minHeight: 48,
    marginTop: 16,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  disconnectBtn: {
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectBtnText: { fontSize: 15, fontWeight: '600' },
});