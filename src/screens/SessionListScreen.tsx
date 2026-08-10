import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Menu, MessageSquare, Pin, Settings as SettingsIcon, Trash2 } from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import type { Session } from '../types';
import { useHostStore } from '../store/hostStore';
import { miraHostClient } from '../api/miraHostClient';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, sizing, spacing } from '../theme/tokens';
import { CustomDrawer } from '../components/CustomDrawer';

const DRAWER_WIDTH = Math.floor(Dimensions.get('window').width * 0.82);
const SWIPE_ACTION_WIDTH = 80;

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  return `${days}天前`;
}

function getStatusColor(status: string, colors: ReturnType<typeof useTheme>['colors']): string {
  switch (status) {
    case 'connected':
      return colors.status.success;
    case 'connecting':
    case 'reconnecting':
      return colors.status.warning;
    default:
      return colors.text.soft;
  }
}

interface SessionRowProps {
  item: Session;
  connectionStatus: string;
  showUnreadIndicator: boolean;
  showPinnedIndicator: boolean;
  canMutate: boolean;
  colors: ReturnType<typeof useTheme>['colors'];
  onOpen: () => void;
  onLongPress: () => void;
  onDelete: () => void;
}

function SessionRow({ item, connectionStatus, showUnreadIndicator, showPinnedIndicator, canMutate, colors, onOpen, onLongPress, onDelete }: SessionRowProps) {
  const translateX = useRef(new Animated.Value(0)).current;
  const isOpen = useRef(false);
  const dragStart = useRef(0);
  const [isSwipeOpen, setIsSwipeOpen] = useState(false);

  const animateTo = useCallback((open: boolean) => {
    isOpen.current = open;
    setIsSwipeOpen(open);
    Animated.timing(translateX, {
      toValue: open ? -SWIPE_ACTION_WIDTH : 0,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [translateX]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) => {
          if (!canMutate) return false;
          const isHorizontalSwipe = Math.abs(gesture.dx) > spacing.sm && Math.abs(gesture.dx) > Math.abs(gesture.dy);
          return isHorizontalSwipe && (gesture.dx < 0 || isOpen.current);
        },
        onPanResponderGrant: () => {
          dragStart.current = isOpen.current ? -SWIPE_ACTION_WIDTH : 0;
          translateX.stopAnimation();
        },
        onPanResponderMove: (_, gesture) => {
          const next = dragStart.current + gesture.dx;
          translateX.setValue(Math.max(-SWIPE_ACTION_WIDTH, Math.min(0, next)));
        },
        onPanResponderRelease: (_, gesture) => {
          const position = dragStart.current + gesture.dx;
          animateTo(position < -SWIPE_ACTION_WIDTH / 2 || gesture.vx < -0.5);
        },
        onPanResponderTerminate: () => animateTo(false),
      }),
    [animateTo, canMutate, translateX],
  );
  const animatedStyle = useMemo(() => ({ transform: [{ translateX }] }), [translateX]);

  const handlePress = () => {
    if (isOpen.current) {
      animateTo(false);
      return;
    }
    onOpen();
  };

  const handleDelete = () => {
    animateTo(false);
    onDelete();
  };

  return (
    <View style={styles.swipeRow}>
      {canMutate && (
        <View style={[styles.deleteAction, { backgroundColor: colors.status.error }]}>
          <Trash2 size={20} color={colors.onPrimary} />
          <Text style={[styles.deleteActionText, { color: colors.onPrimary }]}>删除</Text>
        </View>
      )}
      <Animated.View style={animatedStyle} {...panResponder.panHandlers}>
        <Pressable
          style={({ pressed }) => [
            styles.sessionItem,
            { backgroundColor: colors.bg.canvas, borderColor: colors.border.soft },
            pressed && { backgroundColor: colors.bg.soft },
          ]}
          onPress={handlePress}
          onLongPress={canMutate ? onLongPress : undefined}
        >
          <View style={[styles.avatar, { backgroundColor: colors.bg.card, borderColor: colors.border.default }]}>
            <MessageSquare size={22} strokeWidth={1.7} color={colors.primary} />
          </View>
          <View style={styles.sessionContent}>
            <View style={styles.sessionTopRow}>
              <View style={styles.sessionTitleGroup}>
                {showUnreadIndicator && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
                <Text style={[styles.sessionTitle, { color: colors.text.ink }]} numberOfLines={1}>
                  {item.title}
                </Text>
                {showPinnedIndicator && <Pin size={14} strokeWidth={1.7} color={colors.text.soft} />}
              </View>
              <Text style={[styles.sessionTime, { color: colors.text.soft }]}>{formatTime(item.updatedAt)}</Text>
            </View>
            <Text style={[styles.sessionPreview, { color: colors.text.muted }]} numberOfLines={1}>
              {connectionStatus === 'connected' ? '继续与 Mira 对话' : '连接 Mira Host 后继续对话'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
      {canMutate && isSwipeOpen && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除会话 ${item.title}`}
          style={[styles.deleteAction, styles.deleteActionForeground, { backgroundColor: colors.status.error }]}
          onPress={handleDelete}
        >
          <Trash2 size={20} color={colors.onPrimary} />
          <Text style={[styles.deleteActionText, { color: colors.onPrimary }]}>删除</Text>
        </Pressable>
      )}
    </View>
  );
}

export function SessionListScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const { connectionStatus } = useHostStore();
  const insets = useSafeAreaInsets();
  const canMutateSessions = miraHostClient.supportsSessionMutations();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerAnim = useState(new Animated.Value(-DRAWER_WIDTH))[0];
  const backdropAnim = useState(new Animated.Value(0))[0];

  const [menuSession, setMenuSession] = useState<Session | null>(null);
  const [renameTarget, setRenameTarget] = useState<Session | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);

  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: 0,
        useNativeDriver: true,
        duration: 250,
      }),
      Animated.timing(backdropAnim, {
        toValue: 1,
        useNativeDriver: true,
        duration: 250,
      }),
    ]).start();
  }, [drawerAnim, backdropAnim]);

  const closeDrawer = useCallback(() => {
    Animated.parallel([
      Animated.timing(drawerAnim, {
        toValue: -DRAWER_WIDTH,
        useNativeDriver: true,
        duration: 220,
      }),
      Animated.timing(backdropAnim, {
        toValue: 0,
        useNativeDriver: true,
        duration: 220,
      }),
    ]).start(() => setDrawerOpen(false));
  }, [drawerAnim, backdropAnim]);

  const loadSessions = useCallback(async () => {
    try {
      const list = await miraHostClient.listSessions();
      setSessions(list);
    } catch {}
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSessions();
    }, [loadSessions]),
  );

  const handleStartRename = () => {
    if (!canMutateSessions || !menuSession) return;
    setRenameTarget(menuSession);
    setRenameText(menuSession.title);
    setMenuSession(null);
  };

  const handleConfirmRename = async () => {
    if (!canMutateSessions) return;
    const title = renameText.trim();
    if (!title || !renameTarget) return;
    const target = renameTarget;
    setRenameTarget(null);
    try {
      const updated = await miraHostClient.renameSession(target.id, title);
      setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    } catch {}
  };

  const handleConfirmDelete = async () => {
    if (!canMutateSessions) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    try {
      await miraHostClient.deleteSession(target.id);
      setSessions((prev) => prev.filter((s) => s.id !== target.id));
    } catch {}
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]} edges={['top']}>
      <View style={styles.header}>
        <Pressable
          onPress={openDrawer}
          style={({ pressed }) => [
            styles.drawerBtn,
            pressed && { backgroundColor: colors.bg.soft },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Menu size={20} color={colors.text.ink} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerTitle, { color: colors.text.ink }]}>Mira</Text>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(connectionStatus, colors) }]} />
        </View>
        <Pressable
          onPress={() => navigation.navigate('Settings')}
          style={({ pressed }) => [
            styles.settingsBtn,
            pressed && { backgroundColor: colors.bg.soft },
          ]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <SettingsIcon size={20} color={colors.text.ink} />
        </Pressable>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[
          styles.listContent,
          sessions.length === 0 && { flexGrow: 1 },
          { paddingBottom: insets.bottom + 100 },
        ]}
        ListHeaderComponent={
          sessions.length > 0 ? (
            <Text style={[styles.sectionLabel, { color: colors.text.soft }]}>置顶</Text>
          ) : null
        }
        renderItem={({ item, index }) => (
          <>
            {index === 1 && <Text style={[styles.recentSectionLabel, { color: colors.text.soft }]}>最近对话</Text>}
            <SessionRow
              item={item}
              connectionStatus={connectionStatus}
              showUnreadIndicator={index === 0}
              showPinnedIndicator={index === 0}
              canMutate={canMutateSessions}
              colors={colors}
              onOpen={() => navigation.navigate('Chat', { sessionId: item.id, title: item.title })}
              onLongPress={() => setMenuSession(item)}
              onDelete={() => setDeleteTarget(item)}
            />
          </>
        )}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            <View style={[styles.emptyIllustration, { backgroundColor: colors.bg.card, borderColor: colors.border.default }]}>
              <MessageSquare size={48} strokeWidth={1.25} color={colors.border.default} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text.ink }]}>暂无会话</Text>
            <Text style={[styles.emptySubtitle, { color: colors.text.soft }]}>
              点击下方按钮开始新对话
            </Text>
          </View>
        )}
      />

      {/* ── Drawer Overlay ──────────────────── */}
      {drawerOpen && (
        <Modal transparent animationType="none" onRequestClose={closeDrawer}>
          <View style={StyleSheet.absoluteFill}>
            <Animated.View
              style={[
                styles.drawerBackdrop,
                { opacity: backdropAnim, backgroundColor: colors.overlay },
              ]}
              onTouchStart={closeDrawer}
            />
            <Animated.View
              style={[
                styles.drawerPanel,
                { width: DRAWER_WIDTH, transform: [{ translateX: drawerAnim }] },
              ]}
            >
              <CustomDrawer onClose={closeDrawer} />
            </Animated.View>
          </View>
        </Modal>
      )}

      {/* ── Long-press menu ─────────────────── */}
      <Modal visible={canMutateSessions && menuSession !== null} transparent animationType="fade" onRequestClose={() => setMenuSession(null)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setMenuSession(null)}>
          <View style={[styles.actionSheet, { backgroundColor: colors.bg.canvas, paddingBottom: insets.bottom + 8 }]}>
            <Text style={[styles.menuTitle, { color: colors.text.soft, borderBottomColor: colors.border.soft }]} numberOfLines={1}>
              {menuSession?.title}
            </Text>
            <Pressable style={({ pressed }) => pressed && { backgroundColor: colors.bg.soft }} onPress={handleStartRename}>
              <Text style={[styles.menuItem, { color: colors.text.ink }]}>重命名</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => pressed && { backgroundColor: colors.bg.soft }}
              onPress={() => { setDeleteTarget(menuSession); setMenuSession(null); }}
            >
              <Text style={[styles.menuItem, { color: colors.status.error }]}>删除会话</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => pressed && { backgroundColor: colors.bg.soft }}
              onPress={() => setMenuSession(null)}
            >
              <Text style={[styles.menuCancel, { color: colors.text.muted, borderTopColor: colors.border.soft }]}>取消</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      {/* ── Rename dialog ───────────────────── */}
      <Modal visible={canMutateSessions && renameTarget !== null} transparent animationType="fade" onRequestClose={() => setRenameTarget(null)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setRenameTarget(null)}>
          <View style={[styles.dialog, { backgroundColor: colors.bg.card }]}>
            <Text style={[styles.dialogTitle, { color: colors.text.ink }]}>重命名会话</Text>
            <TextInput
              style={[styles.renameInput, { borderColor: colors.border.default, backgroundColor: colors.bg.input, color: colors.text.ink }]}
              value={renameText}
              onChangeText={setRenameText}
              placeholder="输入新名称"
              placeholderTextColor={colors.text.placeholder}
              autoFocus
              selectTextOnFocus
              onSubmitEditing={handleConfirmRename}
            />
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogBtn} onPress={() => setRenameTarget(null)}>
                <Text style={[styles.dialogBtnText, { color: colors.text.muted }]}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogBtn,
                  styles.dialogBtnPrimary,
                  { backgroundColor: colors.primary },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleConfirmRename}
                disabled={!renameText.trim()}
              >
                <Text style={[styles.dialogBtnPrimaryText, { color: colors.onPrimary }]}>保存</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>

      {/* ── Delete confirm dialog ───────────── */}
      <Modal visible={canMutateSessions && deleteTarget !== null} transparent animationType="fade" onRequestClose={() => setDeleteTarget(null)}>
        <Pressable style={[styles.modalBackdrop, { backgroundColor: colors.overlay }]} onPress={() => setDeleteTarget(null)}>
          <View style={[styles.dialog, { backgroundColor: colors.bg.card }]}>
            <Text style={[styles.dialogTitle, { color: colors.text.ink }]}>删除会话</Text>
            <Text style={[styles.deleteConfirmText, { color: colors.text.base }]}>
              确定删除「{deleteTarget?.title}」吗？此操作不可撤销。
            </Text>
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogBtn} onPress={() => setDeleteTarget(null)}>
                <Text style={[styles.dialogBtnText, { color: colors.text.muted }]}>取消</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.dialogBtn,
                  { backgroundColor: colors.status.error },
                  pressed && { opacity: 0.85 },
                ]}
                onPress={handleConfirmDelete}
              >
                <Text style={[styles.dialogBtnPrimaryText, { color: colors.onPrimary }]}>删除</Text>
              </Pressable>
            </View>
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  drawerBtn: {
    width: sizing.buttonHeight,
    height: sizing.buttonHeight,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.full, marginLeft: spacing.sm },
  headerTitle: { fontSize: fontSize.titleLg, fontWeight: '600' },
  settingsBtn: {
    width: sizing.buttonHeight,
    height: sizing.buttonHeight,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: { paddingHorizontal: spacing.lg },
  sectionLabel: { paddingTop: spacing.lg, paddingBottom: spacing.sm, paddingHorizontal: spacing.xs, fontSize: fontSize.captionUppercase },
  recentSectionLabel: { paddingTop: spacing.xl, paddingBottom: spacing.sm, paddingHorizontal: spacing.xs, fontSize: fontSize.captionUppercase },
  swipeRow: { position: 'relative', overflow: 'hidden' },
  deleteAction: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: SWIPE_ACTION_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  deleteActionForeground: { zIndex: 2, elevation: 1 },
  deleteActionText: { fontSize: fontSize.xs, fontWeight: '600' },
  sessionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 72,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sessionContent: { flex: 1, minWidth: 0 },
  sessionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  sessionTitleGroup: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', marginRight: spacing.sm },
  unreadDot: { width: spacing.sm, height: spacing.sm, borderRadius: radius.full, marginRight: spacing.sm },
  sessionTitle: { fontSize: fontSize.bodyMd, fontWeight: '600', flex: 1 },
  sessionTime: { fontSize: fontSize.xs },
  sessionPreview: { fontSize: fontSize.button },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.section, paddingBottom: 80 },
  emptyIllustration: {
    width: 112,
    height: 112,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { fontSize: fontSize.titleLg, fontWeight: '600', marginBottom: spacing.sm },
  emptySubtitle: { fontSize: fontSize.button, textAlign: 'center' },
  // ── Drawer ────────────────────────────
  drawerBackdrop: { ...StyleSheet.absoluteFill },
  drawerPanel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
  },
  // ── Modals ────────────────────────────
  modalBackdrop: { flex: 1, justifyContent: 'flex-end' },
  actionSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  menuTitle: {
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  menuItem: { fontSize: 17, textAlign: 'center', paddingVertical: 16 },
  menuCancel: {
    fontSize: 17,
    textAlign: 'center',
    paddingVertical: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  dialog: {
    borderRadius: 14,
    marginHorizontal: 40,
    padding: 20,
    alignSelf: 'center',
    width: '88%',
  },
  dialogTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, textAlign: 'center' },
  deleteConfirmText: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginBottom: 8 },
  renameInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  dialogBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  dialogBtnPrimary: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  dialogBtnText: { fontSize: 15, fontWeight: '600' },
  dialogBtnPrimaryText: { fontSize: 15, fontWeight: '600' },
});
