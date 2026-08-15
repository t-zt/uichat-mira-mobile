import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Pencil, Plus, Trash2 } from 'lucide-react-native';
import { remoteMiraHostClient } from '../api/remoteMiraHost';
import type { RemoteMemoryItem, RemoteMemorySettings } from '../api/remoteMemory';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, spacing } from '../theme/tokens';
import { SettingsPageHeader } from '../components/settings/SettingsPageHeader';

type MemoryMode = 'idle' | 'editing' | 'adding';

export function MemoryScreen() {
  const { colors } = useTheme();
  const [settings, setSettings] = useState<RemoteMemorySettings | null>(null);
  const [memories, setMemories] = useState<RemoteMemoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MemoryMode>('idle');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, m] = await Promise.all([
        remoteMiraHostClient.getMemorySettings(),
        remoteMiraHostClient.listMemories(),
      ]);
      setSettings(s);
      setMemories(m);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleEnabled = async (value: boolean) => {
    try {
      const updated = await remoteMiraHostClient.updateMemorySettings({
        enabled: value,
      });
      setSettings(updated);
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : String(e));
    }
  };

  const handleToggleAutoCapture = async (value: boolean) => {
    try {
      const updated = await remoteMiraHostClient.updateMemorySettings({
        autoCapture: value,
      });
      setSettings(updated);
    } catch (e) {
      Alert.alert('操作失败', e instanceof Error ? e.message : String(e));
    }
  };

  const handleStartAdd = () => {
    setMode('adding');
    setEditingId(null);
    setDraftContent('');
  };

  const handleStartEdit = (item: RemoteMemoryItem) => {
    setMode('editing');
    setEditingId(item.id);
    setDraftContent(item.content);
  };

  const handleCancel = () => {
    setMode('idle');
    setEditingId(null);
    setDraftContent('');
  };

  const handleSave = async () => {
    const content = draftContent.trim();
    if (!content) return;

    setSaving(true);
    try {
      if (mode === 'adding') {
        const item = await remoteMiraHostClient.createMemory(content);
        setMemories(prev => [item, ...prev]);
      } else if (mode === 'editing' && editingId) {
        const item = await remoteMiraHostClient.updateMemory(editingId, content);
        setMemories(prev => prev.map(m => (m.id === editingId ? item : m)));
      }
      handleCancel();
    } catch (e) {
      Alert.alert('保存失败', e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: RemoteMemoryItem) => {
    Alert.alert(
      '删除记忆',
      `确定删除「${item.content.slice(0, 30)}${item.content.length > 30 ? '…' : ''}」？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await remoteMiraHostClient.deleteMemory(item.id);
              setMemories(prev => prev.filter(m => m.id !== item.id));
            } catch (e) {
              Alert.alert('删除失败', e instanceof Error ? e.message : String(e));
            }
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <SettingsPageHeader title="记忆" />

      {loading ? (
        <View style={styles.centerState}>
          <Text style={[styles.stateText, { color: colors.text.soft }]}>加载中…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={[styles.stateText, { color: colors.status.error }]}>{error}</Text>
          <Pressable style={[styles.retryBtn, { backgroundColor: colors.primary }]} onPress={loadData}>
            <Text style={[styles.retryText, { color: colors.onPrimary }]}>重试</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {/* Settings card */}
          <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
            <View style={styles.settingRow}>
              <Text style={[styles.settingLabel, { color: colors.text.ink }]}>
                记忆
              </Text>
              <Switch
                value={settings?.enabled ?? false}
                onValueChange={handleToggleEnabled}
                trackColor={{ false: colors.border.default, true: colors.primary }}
                thumbColor={colors.bg.elevated}
              />
            </View>
            <View style={[styles.separator, { backgroundColor: colors.bg.canvas }]} />
            <View style={styles.settingRow}>
              <View style={styles.settingTextWrap}>
                <Text style={[styles.settingLabel, { color: colors.text.ink }]}>
                  自动捕获
                </Text>
                <Text style={[styles.settingSub, { color: colors.text.muted }]}>
                  在对话中自动提取重要信息作为记忆
                </Text>
              </View>
              <Switch
                value={settings?.autoCapture ?? false}
                onValueChange={handleToggleAutoCapture}
                trackColor={{ false: colors.border.default, true: colors.primary }}
                thumbColor={colors.bg.elevated}
                disabled={!settings?.enabled}
              />
            </View>
          </View>

          {/* Add / Edit editor */}
          {mode !== 'idle' && (
            <View style={[styles.card, { backgroundColor: colors.bg.card }]}>
              <Text style={[styles.editorTitle, { color: colors.text.ink }]}>
                {mode === 'adding' ? '添加记忆' : '编辑记忆'}
              </Text>
              <TextInput
                value={draftContent}
                onChangeText={setDraftContent}
                multiline
                maxLength={500}
                placeholder="输入你希望 Mira 记住的内容…"
                placeholderTextColor={colors.text.placeholder}
                style={[
                  styles.editorInput,
                  {
                    color: colors.text.ink,
                    backgroundColor: colors.bg.input,
                    borderColor: colors.border.default,
                  },
                ]}
                textAlignVertical="top"
              />
              <View style={styles.editorActions}>
                <Pressable
                  style={[styles.cancelBtn, { borderColor: colors.border.default }]}
                  onPress={handleCancel}
                >
                  <Text style={[styles.cancelText, { color: colors.text.muted }]}>
                    取消
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.saveBtn,
                    {
                      backgroundColor: draftContent.trim() ? colors.primary : colors.primaryDisabled,
                    },
                  ]}
                  onPress={handleSave}
                  disabled={!draftContent.trim() || saving}
                >
                  <Text style={[styles.saveText, { color: colors.onPrimary }]}>
                    {saving ? '保存中…' : '保存'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Memory list */}
          {mode === 'idle' && (
            <>
              <View style={styles.listHeader}>
                <Text style={[styles.listHeaderTitle, { color: colors.text.soft }]}>
                  我的记忆
                </Text>
                <Pressable onPress={handleStartAdd}>
                  <Plus size={22} color={colors.primary} />
                </Pressable>
              </View>

              {memories.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={[styles.emptyText, { color: colors.text.soft }]}>
                    还没有记忆
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.text.muted }]}>
                    添加重要的信息，让 Mira 在对话中记住你
                  </Text>
                </View>
              ) : (
                <View style={styles.list}>
                  {memories.map((item, index) => (
                    <View
                      key={item.id}
                      style={[
                        styles.memoryItem,
                        { backgroundColor: colors.bg.card },
                        index === 0 && styles.firstItem,
                        index === memories.length - 1 && styles.lastItem,
                      ]}
                    >
                      <View style={styles.memoryContentWrap}>
                        <Text style={[styles.memoryContent, { color: colors.text.ink }]}>
                          {item.content}
                        </Text>
                        <Text style={[styles.memoryMeta, { color: colors.text.soft }]}>
                          {item.type === 'manual' ? '手动' : '自动'} · {new Date(item.updatedAt).toLocaleDateString('zh-CN')}
                        </Text>
                      </View>
                      <View style={styles.memoryActions}>
                        <Pressable onPress={() => handleStartEdit(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Pencil size={18} color={colors.text.soft} />
                        </Pressable>
                        <Pressable onPress={() => handleDelete(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Trash2 size={18} color={colors.status.error} />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}

          <View style={styles.bottomSpacer} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.section,
    gap: spacing.md,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
  stateText: { fontSize: fontSize.bodyMd },
  retryBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  retryText: { fontSize: fontSize.button, fontWeight: '600' },

  // Settings card
  card: {
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  settingTextWrap: { flex: 1, gap: spacing.xs },
  settingLabel: { fontSize: fontSize.bodyMd, fontWeight: '500' },
  settingSub: { fontSize: fontSize.button },
  separator: { height: StyleSheet.hairlineWidth },

  // Editor
  editorTitle: { fontSize: fontSize.titleMd, fontWeight: '600', marginBottom: spacing.sm },
  editorInput: {
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: fontSize.bodyMd,
    minHeight: 100,
  },
  editorActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cancelText: { fontSize: fontSize.button, fontWeight: '500' },
  saveBtn: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  saveText: { fontSize: fontSize.button, fontWeight: '600' },

  // List
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.md,
  },
  listHeaderTitle: { fontSize: fontSize.button, fontWeight: '500' },
  list: {
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  firstItem: { borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg },
  lastItem: { borderBottomLeftRadius: radius.lg, borderBottomRightRadius: radius.lg },
  memoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  memoryContentWrap: { flex: 1, gap: spacing.xs },
  memoryContent: { fontSize: fontSize.bodyMd },
  memoryMeta: { fontSize: fontSize.caption },
  memoryActions: { flexDirection: 'row', gap: spacing.md },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.section,
    gap: spacing.sm,
  },
  emptyText: { fontSize: fontSize.bodyMd, fontWeight: '500' },
  emptySub: { fontSize: fontSize.button, textAlign: 'center', paddingHorizontal: spacing.lg },

  bottomSpacer: { height: spacing.section },
});