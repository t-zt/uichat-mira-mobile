import type { ChatMessage, Session } from '../types';

export const mockSessions: Session[] = [
  {
    id: 'session-1',
    title: '通用助手',
    updatedAt: new Date(Date.now() - 1000 * 60 * 5),
  },
  {
    id: 'session-2',
    title: '代码审查',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
  },
  {
    id: 'session-3',
    title: '前端架构讨论',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
  },
];

export const mockMessages: Record<string, ChatMessage[]> = {
  'session-1': [
    {
      id: 'msg-1',
      role: 'user',
      content: '你好，帮我写一段 React Native 的 FlatList 示例',
      timestamp: new Date(Date.now() - 1000 * 60 * 10),
    },
    {
      id: 'msg-2',
      role: 'assistant',
      content:
        '好的，这是一个简单的 FlatList 示例：\n\n```tsx\n<FlatList\n  data={items}\n  keyExtractor={(item) => item.id}\n  renderItem={({ item }) => (\n    <View>\n      <Text>{item.title}</Text>\n    </View>\n  )}\n/>\n```\n\n需要更复杂的功能比如下拉刷新、上拉加载吗？',
      timestamp: new Date(Date.now() - 1000 * 60 * 9),
    },
    {
      id: 'msg-3',
      role: 'user',
      content: '够了，谢谢！',
      timestamp: new Date(Date.now() - 1000 * 60 * 5),
    },
  ],
  'session-2': [
    {
      id: 'msg-4',
      role: 'user',
      content: '帮我看一下这段代码有没有内存泄漏',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    },
    {
      id: 'msg-5',
      role: 'assistant',
      content:
        '从代码结构来看，主要关注以下几点：\n\n1. useEffect 中没有正确清理订阅\n2. 闭包中捕获了过大的对象\n3. 定时器未清除\n\n建议添加 cleanup 函数并检查依赖数组。',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2 + 1000 * 30),
    },
  ],
  'session-3': [
    {
      id: 'msg-6',
      role: 'user',
      content: '我们在讨论新的状态管理方案',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24),
    },
    {
      id: 'msg-7',
      role: 'assistant',
      content:
        '## 状态管理建议\n\n可以先按状态职责拆分：\n\n- **业务状态**：会话、消息与用户配置\n- **网络状态**：连接、重试与流式响应\n- **界面状态**：输入框、弹窗与当前选中项\n\n组件只订阅自己需要的最小状态，并使用 `zustand` selector 避免无关刷新。',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 23),
    },
    {
      id: 'msg-8',
      role: 'user',
      content: '用公式说明一下重试等待时间',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 22),
    },
    {
      id: 'msg-9',
      role: 'assistant',
      content:
        '指数退避可以写成 $t_n = \\min(t_{max}, t_0 \\cdot 2^n)$。\n\n加入随机抖动后：\n\n$$\nt_n = \\min(t_{max}, t_0 \\cdot 2^n) + U(0, j)\n$$\n\n这样能减少多个客户端同时重连造成的瞬时压力。',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 21),
    },
    {
      id: 'msg-10',
      role: 'user',
      content: '再给我连接流程图和 TypeScript 示例',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 20),
    },
    {
      id: 'msg-11',
      role: 'assistant',
      content:
        '### 连接流程\n\n```mermaid\ngraph TD\n  A[读取 Host 配置] --> B{凭据有效?}\n  B -->|是| C[建立连接]\n  B -->|否| D[重新配对]\n  D --> C\n  C --> E[恢复会话]\n```\n\n```typescript\nasync function reconnect(attempt: number): Promise<void> {\n  const delay = Math.min(30_000, 1_000 * 2 ** attempt);\n  await wait(delay);\n  await hostClient.connect();\n}\n```',
      timestamp: new Date(Date.now() - 1000 * 60 * 60 * 19),
    },
  ],
};
