import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChevronLeft, Send, Square } from 'lucide-react-native';
import type { RootStackParamList } from '../types/navigation';
import type { ChatMessage } from '../types';
import { miraHostClient } from '../api/miraHostClient';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, radius, shadows, sizing, spacing } from '../theme/tokens';
import { AssistantMarkdown } from '../components/AssistantMarkdown';

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

const createLocalMessageId = () =>
  `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export function ChatScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, 'Chat'>>();
  const { sessionId, title } = route.params;
  const { colors } = useTheme();
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
  const [failedMessages, setFailedMessages] = useState<Map<string, string>>(
    new Map(),
  );
  const flatListRef = useRef<FlatList<ChatMessage>>(null);
  const abortRef = useRef(false);

  const loadMessages = useCallback(async () => {
    try {
      setMessages(await miraHostClient.getMessages(sessionId));
    } catch {
    }
  }, [sessionId]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages]);

  const scrollToBottom = useCallback(() => {
    flatListRef.current?.scrollToEnd({ animated: true });
  }, []);

  const sendMessage = useCallback(
    async (text?: string, existingMessage?: ChatMessage) => {
      const content = (text ?? existingMessage?.content ?? inputText).trim();
      if (!content || isLoading) return;

      const userMsg: ChatMessage =
        existingMessage ?? {
          id: createLocalMessageId(),
          role: 'user',
          content,
          timestamp: new Date(),
        };

      if (!existingMessage) {
        setMessages((prev) => [...prev, userMsg]);
      }
      setFailedMessages((prev) => {
        if (!prev.has(userMsg.id)) return prev;
        const next = new Map(prev);
        next.delete(userMsg.id);
        return next;
      });
      setInputText('');
      setIsLoading(true);
      setStreamingText('');
      abortRef.current = false;

      try {
        const stream = await miraHostClient.sendMessage(
          sessionId,
          content,
          userMsg.id,
        );
        let fullReply = '';
        for await (const chunk of stream) {
          if (abortRef.current) break;
          fullReply += chunk;
          setStreamingText(fullReply);
          scrollToBottom();
        }

        if (!abortRef.current && fullReply) {
          const assistantMsg: ChatMessage = {
            id: `local-assistant-${Date.now()}`,
            role: 'assistant',
            content: fullReply,
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        setStreamingText('');
      } catch (error) {
        if (!abortRef.current) {
          const message =
            error instanceof Error && error.message
              ? error.message
              : '发送失败，请重试';
          setFailedMessages((prev) =>
            new Map(prev).set(userMsg.id, message),
          );
        }
      } finally {
        setIsLoading(false);
      }
    },
    [inputText, isLoading, scrollToBottom, sessionId],
  );

  const handleStop = useCallback(() => {
    abortRef.current = true;
    miraHostClient.cancelCurrentSend();
  }, []);

  const handleRetry = useCallback(
    (msg: ChatMessage) => {
      void sendMessage(undefined, msg);
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
            {isFailed ? (
              <>
                <Text style={[styles.failureText, { color: colors.status.error }]}>
                  {failureMessage}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.retryBtn,
                    pressed && { opacity: 0.6 },
                  ]}
                  onPress={() => handleRetry(item)}
                >
                  <Text style={[styles.retryText, { color: colors.status.error }]}>
                    点击重试
                  </Text>
                </Pressable>
              </>
            ) : null}
          </View>
        </View>
      );
    },
    [colors, failedMessages, handleRetry, themedStyles],
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
  }, [colors.text.soft, isLoading, streamingText]);

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: colors.bg.canvas }]}
      edges={['top', 'bottom']}
    >
      <View
        style={[
          styles.header,
          {
            borderBottomColor: colors.border.soft,
            backgroundColor: colors.bg.canvas,
          },
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
        <Text
          style={[styles.headerTitle, { color: colors.text.ink }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.iconButton} />
      </View>

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
            {
              borderTopColor: colors.border.soft,
              backgroundColor: colors.bg.canvas,
            },
          ]}
        >
          <View
            style={[
              styles.inputWrapper,
              {
                backgroundColor: colors.bg.input,
                borderColor: colors.border.default,
              },
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
              onSubmitEditing={() => void sendMessage()}
            />
            {isLoading ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="停止生成"
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: pressed
                      ? colors.primaryActive
                      : colors.text.ink,
                  },
                ]}
                onPress={handleStop}
              >
                <Square
                  size={16}
                  color={colors.bg.elevated}
                  fill={colors.bg.elevated}
                />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="发送消息"
                style={({ pressed }) => [
                  styles.sendBtn,
                  {
                    backgroundColor: pressed
                      ? colors.primaryActive
                      : colors.primary,
                  },
                  !inputText.trim() && {
                    backgroundColor: colors.primaryDisabled,
                  },
                ]}
                onPress={() => void sendMessage()}
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
  retryBtn: {
    marginTop: 4,
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
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
