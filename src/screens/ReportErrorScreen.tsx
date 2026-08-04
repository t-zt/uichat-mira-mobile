import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, sizing, spacing } from '../theme/tokens';
import { SettingsPageHeader } from '../components/settings/SettingsPageHeader';

const MAX_LENGTH = 2000;

export function ReportErrorScreen() {
  const { colors } = useTheme();
  const [description, setDescription] = useState('');
  const [shakeToReport, setShakeToReport] = useState(false);

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: colors.bg.canvas }]} edges={['top', 'bottom']}>
      <SettingsPageHeader title="报告错误" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.content}>
          <Text style={[styles.label, { color: colors.text.ink }]}>发生了什么？</Text>
          <View style={[styles.inputWrap, { borderColor: colors.border.default, backgroundColor: colors.bg.input }]}>
            <TextInput
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={MAX_LENGTH}
              placeholder="请描述你遇到的问题"
              placeholderTextColor={colors.text.placeholder}
              style={[styles.input, { color: colors.text.ink }]}
              textAlignVertical="top"
            />
            <Text style={[styles.counter, { color: colors.text.soft }]}>{description.length} / {MAX_LENGTH}</Text>
          </View>
          <Text style={[styles.hint, { color: colors.text.muted }]}>反馈内容不会自动包含完整会话或认证信息。</Text>

          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
          <View style={styles.switchRow}>
            <View style={styles.flex}>
              <Text style={[styles.label, { color: colors.text.ink }]}>晃动手机以报告错误</Text>
              <Text style={[styles.hint, { color: colors.text.muted }]}>{shakeToReport ? '已启用' : '已关闭'}</Text>
            </View>
            <Switch
              value={shakeToReport}
              onValueChange={setShakeToReport}
              trackColor={{ false: colors.border.default, true: colors.primary }}
              thumbColor={colors.bg.elevated}
            />
          </View>

          <Pressable disabled style={[styles.sendButton, { backgroundColor: colors.primaryDisabled }]}>
            <Text style={[styles.sendText, { color: colors.text.soft }]}>发送</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, padding: spacing.lg, gap: spacing.md },
  label: { fontSize: fontSize.bodyMd, fontWeight: '600' },
  inputWrap: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.sm, overflow: 'hidden' },
  input: { minHeight: 150, padding: spacing.md, fontSize: fontSize.bodyMd },
  counter: { textAlign: 'right', paddingHorizontal: spacing.md, paddingBottom: spacing.sm, fontSize: fontSize.caption },
  hint: { fontSize: fontSize.caption, lineHeight: 18 },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sendButton: {
    minHeight: sizing.buttonHeight,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
  },
  sendText: { fontSize: fontSize.button, fontWeight: '600' },
});
