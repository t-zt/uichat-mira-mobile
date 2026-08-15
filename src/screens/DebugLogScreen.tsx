import React, { useCallback, useMemo, useState } from 'react';
import {
  Clipboard,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Clipboard as ClipboardIcon, Trash2 } from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import { useTheme } from '../theme/ThemeContext';
import { useDebugLogStore, type DebugLogEntry, type DebugLogLevel } from '../store/debugLogStore';

const levelColors: Record<DebugLogLevel, string> = {
  debug: '#6b7280',
  info: '#3b82f6',
  warn: '#f59e0b',
  error: '#ef4444',
};

const levelLabel: Record<DebugLogLevel, string> = {
  debug: 'DBG',
  info: 'INF',
  warn: 'WRN',
  error: 'ERR',
};

export function DebugLogScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors } = useTheme();
  const entries = useDebugLogStore(state => state.entries);
  const clear = useDebugLogStore(state => state.clear);
  const getText = useDebugLogStore(state => state.getText);

  const [copied, setCopied] = useState(false);

  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('HostConfig');
    }
  };

  const handleCopy = useCallback(() => {
    try {
      const text = getText();
      if (!text) return;
      Clipboard.setString(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may not be available
    }
  }, [getText]);

  const handleClear = useCallback(() => {
    clear();
  }, [clear]);

  const renderEntry = useCallback(({ item }: { item: DebugLogEntry }) => {
    const timeStr = new Date(item.timestamp).toLocaleTimeString('en-GB', {
      hour12: false,
    });
    const ms = String(item.timestamp % 1000).padStart(3, '0');

    return (
      <View style={[styles.entry, { borderBottomColor: colors.border.soft }]}>
        <View style={styles.entryHeader}>
          <Text style={[styles.timeText, { color: colors.text.soft }]}>
            {timeStr}.{ms}
          </Text>
          <View style={[
            styles.levelBadge,
            { backgroundColor: levelColors[item.level] },
          ]}>
            <Text style={styles.levelText}>{levelLabel[item.level]}</Text>
          </View>
          <Text style={[styles.tagText, { color: colors.text.muted }]}>
            {item.tag}
          </Text>
        </View>
        <Text style={[styles.messageText, { color: colors.text.ink }]}>
          {item.message}
        </Text>
        {item.details ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text style={[styles.detailsText, { color: colors.text.muted }]}>
              {item.details}
            </Text>
          </ScrollView>
        ) : null}
      </View>
    );
  }, [colors]);

  const keyExtractor = useCallback((item: DebugLogEntry) => String(item.id), []);

  const headerComponent = useMemo(() => (
    <View style={[styles.summaryCard, { backgroundColor: colors.bg.soft, borderColor: colors.border.default }]}>
      <Text style={[styles.summaryText, { color: colors.text.muted }]}>
        共 {entries.length} 条日志
      </Text>
      {entries.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.text.muted }]}>
          暂无日志。请先在配对页面操作，日志将在此自动收集。
        </Text>
      ) : null}
    </View>
  ), [entries.length, colors]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View style={[styles.header, { borderBottomColor: colors.border.soft }]}>
        <Pressable onPress={handleBack} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.ink }]}>
          调试日志
        </Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={handleCopy}
            style={styles.actionBtn}
            disabled={entries.length === 0}
          >
            <ClipboardIcon
              size={18}
              color={entries.length === 0 ? colors.text.soft : colors.primary}
            />
          </Pressable>
          <Pressable
            onPress={handleClear}
            style={styles.actionBtn}
            disabled={entries.length === 0}
          >
            <Trash2
              size={18}
              color={entries.length === 0 ? colors.text.soft : colors.status.error}
            />
          </Pressable>
        </View>
      </View>

      {copied ? (
        <View style={[styles.copiedBanner, { backgroundColor: colors.status.success }]}>
          <Text style={styles.copiedText}>已复制到剪贴板</Text>
        </View>
      ) : null}

      {entries.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon, { color: colors.text.soft }]}>📋</Text>
          <Text style={[styles.emptyTitle, { color: colors.text.muted }]}>
            还没有日志
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.text.soft }]}>
            在配对页面操作后，相关的 Relay 传输和配对流程日志
            将自动收集到这里，方便你截图反馈。
          </Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          renderItem={renderEntry}
          keyExtractor={keyExtractor}
          ListHeaderComponent={headerComponent}
          scrollEnabled
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      )}
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
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copiedBanner: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  copiedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  summaryCard: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  summaryText: {
    fontSize: 13,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '600', marginBottom: 8 },
  emptyDesc: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
  },
  entry: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  timeText: {
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  levelBadge: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  levelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  messageText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  detailsText: {
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    fontFamily: 'monospace',
  },
});
