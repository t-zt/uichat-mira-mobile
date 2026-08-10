import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, MoreVertical, Send, Square } from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import type { ChatMessage } from '../types';
import { miraHostClient } from '../api/miraHostClient';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, shadows, sizing, spacing } from '../theme/tokens';
import { AssistantMarkdown } from '../components/AssistantMarkdown';
import { ConversationMenu } from '../components/ConversationMenu';

function ThinkingIndicator({ color }: { color: string }) {
  const dots = useRef([
    new Animated.Value(0.35),
    new Animated.Value(0.35),
    new Animated.Value(0.35),
  ]).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        140,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 280,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(dot, {
              toValue: 0.35,
              duration: 420,
              easing: Easing.in(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ),
      ),
    );
    animation.start();
    return () => animation.stop();
  }, [dots]);

  return (
    <View style={styles.thinkingIndicator} accessibilityLabel="Mira 正在回复">
      {dots.map((opacity, index) => (
        <Animated.View
          key={index}
          style={[styles.thinkingDot, { backgroundColor: color, opacity }]}
        />
      ))}
    </View>
  );
}

export function ChatScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { sessionId, title } = route.params;
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const themedStyles = useMemo(
    () =>
      StyleSheet.create({
        userBubble: { backgroundColor: colors.text.ink },
        failedBubble: { backgroundColor: colors.status.errorBg },
      }),
    [colors],
  );

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  // 发送失败：消息 id -> 具体错误信息（用于展示失败原因）
  const [failedMessages, setFailedMessages] = useState<Map<string, string>>(new Map());
  const [isMenuVisible, setIsMenuVisible] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ top: number; right: number }>({
    top: 0,
    right: spacing.sm,
  });
  const flatListRef = useRef<FlatList>(null);
  const menuButtonRef = useRef<View>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    miraHostClient.getMessages(sessionId).then((msgs) => setMessages(msgs)).catch(() => {});
  }, [sessionId]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const sendMessage = useCallback(
    async (text?: string) => {
      const content = (text ?? inputText).trim();
      if (!content || isLoading) return;
      setInputText('');
      setIsLoading(true);
      setStreamingText('');
      abortRef.current = false;

      const userMsg: ChatMessage = {
        id: `local-${Date.now()}`,
        role: 'user',
        content,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const stream = await miraHostClient.sendMessage(sessionId, content);
        let fullReply = '';
        for await (const chunk of stream) {
          if (abortRef.current) break;
          fullReply += chunk;
          setStreamingText(fullReply);
          scrollToBottom();
        }
        const assistantMsg: ChatMessage = {
          id: `local-assistant-${Date.now()}`,
          role: 'assistant',
          content: fullReply,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText('');
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : '发送失败，请重试';
        setFailedMessages((prev) => new Map(prev).set(userMsg.id, message));
      } finally {
        setIsLoading(false);
      }
    },
    [inputText, isLoading, sessionId, scrollToBottom],
  );

  const handleStop = useCallback(() => {
    abortRef.current = true;
    // 中断当前实际使用的 Direct 或 Relay 流。
    miraHostClient.cancelCurrentSend();
  }, []);

  const openMenu = useCallback(() => {
    menuButtonRef.current?.measureInWindow((x, y, width, height) => {
      setMenuAnchor({
        top: y + height + spacing.xs,
        right: Math.max(spacing.sm, windowWidth - x - width),
      });
      setIsMenuVisible(true);
    });
  }, [windowWidth]);

  const handleRetry = useCallback(
    (msg: ChatMessage) => {
      setFailedMessages((prev) => {
        const next = new Map(prev);
        next.delete(msg.id);
        return next;
      });
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      sendMessage(msg.content);
    },
    [sendMessage],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isUser = item.role === 'user';
      const failureMessage = isUser ? failedMessages.get(item.id) : undefined;
      const isFailed = failureMessage !== undefined;
      return (
        <View
          style={[
            styles.messageRow,
            isUser ? styles.messageRowRight : styles.messageRowLeft,
          ]}
        >
          <View>
            <View
              style={[
                styles.bubble,
                isUser ? styles.userBubble : styles.assistantBubble,
                isUser && themedStyles.userBubble,
                isFailed && themedStyles.failedBubble,
              ]}
            >
              {isUser ? (
                <Text style={[styles.bubbleText, { color: colors.bg.elevated }]}>
                  {item.content}
                </Text>
              ) : (
                <AssistantMarkdown content={item.content} />
              )}
            </View>
            {isFailed && (
              <>
                <Text
                  style={[styles.failureText, { color: colors.status.error }]}
                >
                  {failureMessage}
                </Text>
                <Pressable
                  style={({ pressed }) => [styles.retryBtn, pressed && { opacity: 0.6 }]}
                  onPress={() => handleRetry(item)}
                >
                  <Text style={[styles.retryText, { color: colors.status.error }]}>
                    点击重试
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      );
    },
    [failedMessages, handleRetry, colors, themedStyles],
  );

  const renderFooter = useCallback(() => {
    if (!streamingText && !isLoading) return null;
    return (
      <View style={[styles.messageRow, styles.messageRowLeft]}>
        <View style={[styles.bubble, styles.assistantBubble]}>
          {streamingText ? (
            <AssistantMarkdown content={streamingText} />
          ) : (
            <ThinkingIndicator color={colors.text.soft} />
          )}
        </View>
      </View>
    );
  }, [streamingText, isLoading, colors]);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]} edges={['top', 'bottom']}>
      <View
        style={[
          styles.header,
          { borderBottomColor: colors.border.soft, backgroundColor: colors.bg.canvas },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回"
          hitSlop={8}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: colors.bg.soft },
          ]}
        >
          <ChevronLeft size={24} color={colors.text.ink} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.text.ink }]} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          ref={menuButtonRef}
          collapsable={false}
          accessibilityRole="button"
          accessibilityLabel="打开会话菜单"
          hitSlop={8}
          onPress={openMenu}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: colors.bg.soft },
          ]}
        >
          <MoreVertical size={22} color={colors.text.ink} />
        </Pressable>
      </View>

      <ConversationMenu
        visible={isMenuVisible}
        title={title}
        anchor={menuAnchor}
        onClose={() => setIsMenuVisible(false)}
      />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.messageList}
          onContentSizeChange={scrollToBottom}
          ListFooterComponent={renderFooter}
        />

        <View
          style={[
            styles.inputBar,
            { borderTopColor: colors.border.soft, backgroundColor: colors.bg.canvas },
          ]}
        >
          <View
            style={[
              styles.inputWrapper,
              { backgroundColor: colors.bg.input, borderColor: colors.border.default },
            ]}
          >
            <TextInput
              style={[styles.input, { color: colors.text.ink }]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="给 Mira 发消息..."
              placeholderTextColor={colors.text.placeholder}
              multiline
              maxLength={500}
              editable={!isLoading}
              blurOnSubmit={false}
              onSubmitEditing={() => sendMessage()}
            />
            {isLoading ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="停止生成"
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: pressed ? colors.primaryActive : colors.text.ink },
                ]}
                onPress={handleStop}
              >
                <Square size={16} color={colors.bg.elevated} fill={colors.bg.elevated} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="发送消息"
                style={({ pressed }) => [
                  styles.sendBtn,
                  { backgroundColor: pressed ? colors.primaryActive : colors.primary },
                  !inputText.trim() && { backgroundColor: colors.primaryDisabled },
                ]}
                onPress={() => sendMessage()}
                disabled={!inputText.trim()}
              >
                <Send size={18} color={colors.onPrimary} strokeWidth={2.5} />
              </Pressable>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconButton: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: Platform.select({ ios: 'Georgia', android: 'serif' }),
    fontSize: fontSize.xl,
    fontWeight: '600',
    textAlign: 'center',
  },
  container: { flex: 1 },
  messageList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  messageRow: { marginBottom: spacing.lg, flexDirection: 'row' },
  messageRowLeft: { justifyContent: 'flex-start' },
  messageRowRight: { justifyContent: 'flex-end' },
  bubble: { flexShrink: 1 },
  userBubble: {
    maxWidth: 272,
    paddingHorizontal: 14,
    paddingVertical: spacing.md,
    borderRadius: 18,
    borderBottomRightRadius: 6,
  },
  assistantBubble: {
    maxWidth: '100%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  bubbleText: { fontSize: fontSize.md, lineHeight: 24 },
  thinkingIndicator: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  thinkingDot: { width: 6, height: 6, borderRadius: 3 },
  retryBtn: { marginTop: 4, alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8 },
  retryText: { fontSize: fontSize.sm },
  failureText: { fontSize: fontSize.sm, lineHeight: 18, marginTop: 6 },
  inputBar: {
    paddingHorizontal: 14,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  inputWrapper: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    paddingLeft: 14,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 24,
    ...shadows.composer,
  },
  input: {
    flex: 1,
    minHeight: sizing.touchTarget,
    maxHeight: 100,
    paddingHorizontal: 0,
    paddingVertical: 10,
    fontSize: fontSize.md,
    lineHeight: 22,
  },
  sendBtn: {
    width: sizing.touchTarget,
    height: sizing.touchTarget,
    borderRadius: sizing.touchTarget / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
