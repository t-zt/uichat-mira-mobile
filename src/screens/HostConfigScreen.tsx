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
  ClipboardPaste,
  KeyRound,
  Laptop,
  ScanLine,
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
  parsePairingUri,
  type PairingDescriptor,
} from '../protocol/remoteHostV1';
import { remoteMiraHostClient } from '../api/remoteMiraHost';
import { useRemotePairing } from '../pairing/useRemotePairing';
import { useTheme } from '../theme/ThemeContext';
import { PairingScannerModal } from '../components/PairingScannerModal';

const connectivityTitle = (state: TailscaleConnectivityState) => {
  switch (state) {
    case 'idle':
      return '未检查';
    case 'probing':
      return '检查中';
    case 'ready':
      return '已连接';
    default:
      return '连接失败';
  }
};

const buildPairingUriFromRoute = (
  params: RootStackParamList['HostConfig'],
): string | null => {
  if (!params) return null;
  const { version, host, challenge, code } = params;
  if (!version && !host && !challenge && !code) return null;
  if (!version || !host || !challenge || !code) {
    throw new Error('配对链接缺少 version、host、challenge 或 code');
  }

  const query = new URLSearchParams({ version, host, challenge, code });
  return `mira://pair?${query.toString()}`;
};

export function HostConfigScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'HostConfig'>>();
  const { colors } = useTheme();
  const { config, setConfig, clearConfig, setConnectionStatus } =
    useHostStore();
  const connectivityState = useTailscaleConnectivityStore(state => state.state);
  const connectivityResult = useTailscaleConnectivityStore(
    state => state.result,
  );
  const setConnectivityHostUrl = useTailscaleConnectivityStore(
    state => state.setHostUrl,
  );
  const resetConnectivity = useTailscaleConnectivityStore(state => state.reset);

  const [pairingDescriptor, setPairingDescriptor] =
    useState<PairingDescriptor | null>(null);
  const [pairingLinkError, setPairingLinkError] = useState<string | null>(null);
  const [pairingLinkInput, setPairingLinkInput] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);

  const routeVersion = route.params?.version;
  const routeHost = route.params?.host;
  const routeChallenge = route.params?.challenge;
  const routeCode = route.params?.code;

  const isProbing = connectivityState === 'probing';
  const isReady =
    connectivityState === 'ready' && connectivityResult?.hostUrl != null;
  const {
    state: pairingState,
    start: startPairing,
    reset: resetPairing,
    secureStorageAvailable,
  } = useRemotePairing(pairingDescriptor, isReady);

  const loadPairingUri = useCallback(
    (uri: string) => {
      try {
        const descriptor = parsePairingUri(uri);
        setPairingDescriptor(descriptor);
        setPairingLinkError(null);
        setPairingLinkInput(uri.trim());
        setConnectivityHostUrl(descriptor.hostUrl);

        const current = useTailscaleConnectivityStore.getState();
        if (
          current.hostUrl !== descriptor.hostUrl ||
          (current.state !== 'probing' && current.state !== 'ready')
        ) {
          current
            .probe(descriptor.hostUrl, 'manual')
            .catch((error: unknown) => {
              setPairingLinkError(
                error instanceof Error
                  ? error.message
                  : '无法检查 Mira Host 连接',
              );
            });
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
    if (config?.hostUrl) {
      setConnectivityHostUrl(config.hostUrl);
    }
  }, [config?.hostUrl, setConnectivityHostUrl]);

  useEffect(() => {
    try {
      const uri = buildPairingUriFromRoute(route.params);
      if (!uri) return;

      loadPairingUri(uri);
    } catch (error) {
      setPairingDescriptor(null);
      setPairingLinkError(
        error instanceof Error ? error.message : '无法读取桌面配对链接',
      );
    }
  }, [
    route.params,
    routeVersion,
    routeHost,
    routeChallenge,
    routeCode,
    loadPairingUri,
  ]);

  useEffect(() => {
    if (pairingState.phase !== 'paired' || !connectivityResult?.hostUrl) return;
    setConfig({
      hostUrl: connectivityResult.hostUrl,
      token: '',
    });
    setConnectionStatus('connected');
  }, [
    connectivityResult?.hostUrl,
    pairingState.phase,
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
      return '等待检查连接。';
    }
    if (connectivityState === 'probing') {
      return '正在检查网络与 Mira Host。';
    }
    return tailscaleConnectivityMessage(connectivityState);
  }, [connectivityState]);

  const pairingBusy =
    pairingState.phase === 'claiming' ||
    pairingState.phase === 'waiting_approval';
  const pairingCompleted = pairingState.phase === 'paired';
  const pairingActionDisabled =
    !pairingDescriptor ||
    !isReady ||
    !secureStorageAvailable ||
    pairingBusy ||
    pairingCompleted;

  const pairingTitle = (() => {
    switch (pairingState.phase) {
      case 'claiming':
        return '正在提交设备申请';
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
        return isReady
          ? pairingDescriptor
            ? '可以申请桌面批准'
            : '等待配对信息'
          : '等待连接';
    }
  })();

  const pairingMessage =
    pairingState.message ??
    (!secureStorageAvailable
      ? '当前设备不支持安全存储，无法完成配对。'
      : '连接成功后，还需要桌面端批准设备。');

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate('SessionList');
  };

  const handleContinue = () => {
    navigation.reset({ index: 0, routes: [{ name: 'SessionList' }] });
  };

  const handleDisconnect = async () => {
    if (secureStorageAvailable) {
      await remoteMiraHostClient.disconnect();
    }
    clearConfig();
    resetConnectivity();
    resetPairing();
    setPairingDescriptor(null);
    setPairingLinkError(null);
    setPairingLinkInput('');
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border.soft }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          onPress={handleBack}
          style={({ pressed }) => [
            styles.backBtn,
            {
              backgroundColor: colors.bg.soft,
              borderColor: colors.border.default,
            },
            pressed && { opacity: 0.7 },
          ]}
        >
          <ChevronLeft size={24} color={colors.text.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.ink }]}>
          Remote
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.form}>
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
              <Laptop size={38} color={colors.primary} strokeWidth={1.6} />
            </View>
            <Text style={[styles.heroTitle, { color: colors.text.ink }]}>
              连接 Mira Host
            </Text>
            <Text style={[styles.heroSubtitle, { color: colors.text.muted }]}>
              访问桌面端会话
            </Text>
          </View>

          <View style={styles.section}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="扫码配对"
              onPress={() => setScannerOpen(true)}
              style={({ pressed }) => [
                styles.scanBtn,
                { backgroundColor: colors.primary },
                pressed && { backgroundColor: colors.primaryActive },
              ]}
            >
              <ScanLine size={18} color={colors.onPrimary} />
              <Text style={[styles.scanBtnText, { color: colors.onPrimary }]}>
                扫码配对
              </Text>
            </Pressable>

            <Text style={[styles.pasteLabel, { color: colors.text.muted }]}>
              粘贴完整配对链接
            </Text>
            <View style={styles.pasteRow}>
              <TextInput
                accessibilityLabel="完整配对链接"
                style={[
                  styles.pairingInput,
                  {
                    borderColor: pairingLinkError
                      ? colors.status.error
                      : colors.border.default,
                    backgroundColor: colors.bg.input,
                    color: colors.text.ink,
                  },
                ]}
                value={pairingLinkInput}
                onChangeText={value => {
                  setPairingLinkInput(value);
                  setPairingLinkError(null);
                }}
                placeholder="mira://pair?..."
                placeholderTextColor={colors.text.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="载入配对链接"
                disabled={!pairingLinkInput.trim()}
                onPress={() => loadPairingUri(pairingLinkInput)}
                style={({ pressed }) => [
                  styles.pasteBtn,
                  { borderColor: colors.text.ink },
                  (!pairingLinkInput.trim() || pressed) && { opacity: 0.45 },
                ]}
              >
                <ClipboardPaste size={20} color={colors.text.ink} />
              </Pressable>
            </View>

            {pairingLinkError ? (
              <Text
                style={[
                  styles.authorizationText,
                  { color: colors.status.error },
                ]}
              >
                {pairingLinkError}
              </Text>
            ) : null}
          </View>

          {pairingDescriptor ? (
            <View style={styles.section}>
              <View
                style={[
                  styles.statusBox,
                  {
                    backgroundColor:
                      connectivityState === 'ready' ||
                      connectivityState === 'probing' ||
                      connectivityState === 'idle'
                        ? colors.bg.soft
                        : colors.status.errorBg,
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
                  <Text
                    style={[styles.statusTitle, { color: colors.text.ink }]}
                  >
                    {connectivityTitle(connectivityState)}
                  </Text>
                </View>
                {connectivityState !== 'ready' ? (
                  <Text
                    style={[styles.statusText, { color: colors.text.muted }]}
                  >
                    {statusMessage}
                  </Text>
                ) : null}
                {connectivityResult?.identity ? (
                  <Text
                    style={[styles.detailText, { color: colors.text.soft }]}
                  >
                    {connectivityResult.identity.displayName} · v
                    {connectivityResult.identity.version} ·{' '}
                    {connectivityResult.latencyMs ?? 0} ms
                  </Text>
                ) : null}
                {connectivityResult?.detail && connectivityState !== 'ready' ? (
                  <Text
                    style={[styles.detailText, { color: colors.text.soft }]}
                    numberOfLines={3}
                  >
                    {connectivityResult.detail}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {pairingDescriptor ? (
            <View style={styles.section}>
              {pairingState.phase !== 'idle' ? (
                <View style={styles.pairingState}>
                  <Text
                    style={[
                      styles.authorizationTitle,
                      { color: colors.text.ink },
                    ]}
                  >
                    {pairingTitle}
                  </Text>
                  <Text
                    style={[
                      styles.authorizationText,
                      { color: colors.text.muted },
                    ]}
                  >
                    {pairingMessage}
                  </Text>
                </View>
              ) : !secureStorageAvailable ? (
                <Text
                  style={[
                    styles.authorizationText,
                    { color: colors.status.error },
                  ]}
                >
                  当前设备不支持安全存储，无法完成配对。
                </Text>
              ) : null}
              {pairingState.scopes.length > 0 ? (
                <Text style={[styles.detailText, { color: colors.text.soft }]}>
                  已批准权限：{pairingState.scopes.join(' · ')}
                </Text>
              ) : null}

              <Pressable
                style={({ pressed }) => [
                  styles.pairBtn,
                  { backgroundColor: colors.primary },
                  (pairingActionDisabled || pressed) && {
                    backgroundColor: pressed && !pairingActionDisabled ? colors.primaryActive : colors.primaryDisabled,
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
                <Text style={[styles.pairBtnText, { color: colors.onPrimary }]}>
                  {pairingState.phase === 'waiting_approval'
                    ? '等待桌面确认'
                    : pairingCompleted
                    ? '设备已配对'
                    : '提交配对申请'}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {pairingCompleted ? (
            <Pressable
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: colors.primary },
                pressed && { backgroundColor: colors.primaryActive },
              ]}
              onPress={handleContinue}
            >
              <Text style={[styles.saveBtnText, { color: colors.onPrimary }]}>
                进入会话
              </Text>
            </Pressable>
          ) : null}

          {config ? (
            <Pressable
              style={[
                styles.disconnectBtn,
                { borderColor: colors.status.errorBg },
              ]}
              onPress={handleDisconnect}
            >
              <Text
                style={[
                  styles.disconnectBtnText,
                  { color: colors.status.error },
                ]}
              >
                断开并清除授权
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
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
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
  form: { paddingHorizontal: 24, paddingTop: 24, paddingBottom: 40 },
  hero: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 36,
  },
  heroIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  heroTitle: { fontSize: 26, fontWeight: '600', textAlign: 'center' },
  heroSubtitle: {
    fontSize: 16,
    lineHeight: 24,
    marginTop: 8,
    textAlign: 'center',
  },
  section: {
    marginBottom: 28,
  },
  scanBtn: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  scanBtnText: { fontSize: 15, fontWeight: '500' },
  pasteLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
  },
  pasteRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 10,
    marginBottom: 14,
  },
  pairingInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  pasteBtn: {
    width: 48,
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  detailText: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  pairingState: { marginTop: 16 },
  authorizationTitle: { fontSize: 16, fontWeight: '700', marginBottom: 8 },
  authorizationText: { fontSize: 13, lineHeight: 20 },
  pairBtn: {
    minHeight: 52,
    marginTop: 16,
    borderRadius: 26,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  pairBtnText: { fontSize: 14, fontWeight: '600' },
  saveBtn: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 17, fontWeight: '600' },
  disconnectBtn: {
    marginTop: 16,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disconnectBtnText: { fontSize: 15, fontWeight: '600' },
});
