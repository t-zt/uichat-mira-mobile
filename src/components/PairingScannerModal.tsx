import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, CameraType } from 'react-native-camera-kit';
import {
  check,
  openSettings,
  PERMISSIONS,
  request,
  RESULTS,
  type Permission,
} from 'react-native-permissions';
import { ScanLine, Settings, X } from 'lucide-react-native';
import { parsePairingUri } from '../protocol/remoteHostV1';

type CameraState =
  | 'checking'
  | 'granted'
  | 'denied'
  | 'blocked'
  | 'unavailable';

const cameraPermission: Permission =
  Platform.OS === 'ios' ? PERMISSIONS.IOS.CAMERA : PERMISSIONS.ANDROID.CAMERA;

interface ManualCodeEntryProps {
  error?: string | null;
  onSubmit: (code: string) => void;
}

function ManualCodeEntry({ error, onSubmit }: ManualCodeEntryProps) {
  const [code, setCode] = useState('');

  const handleSubmit = () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <View style={styles.manualPanel}>
      {error ? <Text style={styles.manualError}>{error}</Text> : null}
      <Text style={styles.manualTitle}>手动输入配对链接</Text>
      <Text style={styles.manualHint}>
        请从 Mira Desktop 复制完整的二维码配对链接并粘贴到下方。
      </Text>
      <TextInput
        style={styles.manualInput}
        value={code}
        onChangeText={setCode}
        placeholder="mira://pair?version=1&relayId=…&code=…"
        placeholderTextColor="#8a8a90"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="off"
        multiline
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="使用此配对链接"
        onPress={handleSubmit}
        style={({ pressed }) => [
          styles.manualSubmit,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.manualSubmitText}>使用此配对链接</Text>
      </Pressable>
    </View>
  );
}

interface PairingScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanned: (pairingUri: string) => void;
}

export function PairingScannerModal({
  visible,
  onClose,
  onScanned,
}: PairingScannerModalProps) {
  const [cameraState, setCameraState] = useState<CameraState>('checking');
  const [scanError, setScanError] = useState<string | null>(null);
  const scanLocked = useRef(false);

  const ensureCameraPermission = useCallback(async () => {
    setCameraState('checking');
    try {
      const current = await check(cameraPermission);
      const next =
        current === RESULTS.DENIED ? await request(cameraPermission) : current;
      if (next === RESULTS.GRANTED || next === RESULTS.LIMITED) {
        setCameraState('granted');
      } else if (next === RESULTS.BLOCKED) {
        setCameraState('blocked');
      } else if (next === RESULTS.UNAVAILABLE) {
        setCameraState('unavailable');
      } else {
        setCameraState('denied');
      }
    } catch {
      setCameraState('unavailable');
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      scanLocked.current = false;
      setScanError(null);
      return;
    }
    ensureCameraPermission().catch(() => setCameraState('unavailable'));
  }, [ensureCameraPermission, visible]);

  const handleReadCode = useCallback(
    (value: string) => {
      if (scanLocked.current) return;
      scanLocked.current = true;
      try {
        parsePairingUri(value);
        onScanned(value.trim());
      } catch {
        setScanError('这不是有效的 Mira 配对二维码');
        setTimeout(() => {
          scanLocked.current = false;
        }, 1200);
      }
    },
    [onScanned],
  );

  const permissionMessage =
    cameraState === 'blocked'
      ? '相机权限已被关闭，请在系统设置中允许 Mira 使用相机。'
      : cameraState === 'unavailable'
      ? '当前设备无法使用相机扫码，请粘贴完整配对链接。'
      : '需要相机权限才能扫描配对二维码。';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="关闭扫码"
            onPress={onClose}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <X size={24} color="#ffffff" />
          </Pressable>
          <Text style={styles.title}>扫描配对二维码</Text>
          <View style={styles.headerSpacer} />
        </View>

        {cameraState === 'granted' ? (
          <View style={styles.cameraContainer}>
            <Camera
              style={StyleSheet.absoluteFill}
              cameraType={CameraType.Back}
              scanBarcode
              allowedBarcodeTypes={['qr']}
              showFrame
              frameColor="#ffffff"
              laserColor="#22c55e"
              scanThrottleDelay={800}
              onReadCode={event =>
                handleReadCode(event.nativeEvent.codeStringValue)
              }
              onError={() => setCameraState('unavailable')}
            />
            {scanError ? (
              <ManualCodeEntry error={scanError} onSubmit={handleReadCode} />
            ) : null}
          </View>
        ) : cameraState === 'checking' ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#ffffff" />
          </View>
        ) : (
          <View style={styles.centered}>
            <ScanLine size={42} color="#ffffff" />
            <Text style={styles.permissionText}>{permissionMessage}</Text>
            {cameraState === 'blocked' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  openSettings('application').catch(() =>
                    setCameraState('unavailable'),
                  )
                }
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && styles.pressed,
                ]}
              >
                <Settings size={18} color="#111111" />
                <Text style={styles.actionText}>打开系统设置</Text>
              </Pressable>
            ) : cameraState === 'denied' ? (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  ensureCameraPermission().catch(() =>
                    setCameraState('unavailable'),
                  )
                }
                style={({ pressed }) => [
                  styles.actionButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.actionText}>重新授权</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        {!cameraState || (cameraState !== 'granted' && cameraState !== 'checking') ? (
          <ManualCodeEntry onSubmit={handleReadCode} />
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090909' },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  headerSpacer: { width: 44 },
  cameraContainer: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 18,
  },
  permissionText: {
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 23,
    textAlign: 'center',
  },
  actionButton: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionText: { color: '#111111', fontSize: 15, fontWeight: '700' },
  manualPanel: {
    alignSelf: 'stretch',
    backgroundColor: 'rgba(20, 20, 24, 0.96)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 34,
  },
  manualError: {
    color: '#fca5a5',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 10,
  },
  manualTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  manualHint: {
    color: '#c9c9ce',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 12,
  },
  manualInput: {
    minHeight: 92,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    color: '#ffffff',
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    textAlignVertical: 'top',
  },
  manualSubmit: {
    minHeight: 48,
    borderRadius: 24,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualSubmitText: { color: '#111111', fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.72 },
});
