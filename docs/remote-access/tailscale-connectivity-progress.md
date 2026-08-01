# Mira Mobile · Tailscale 联通工程进度

> 最后更新：2026-08-01 19:11（UTC+8）  
> 仓库：`dangjingtao/uichat-mira-mobile`  
> 工作分支：`feature/tomz-tailscale`  
> 对比分支：`dev`  
> 当前阶段：**联通主链已完成代码施工，尚未完成构建与真机验收。**

## 1. 当前目标

本分支优先解决 Mira Mobile 与 Mira Desktop Host 之间的 Tailscale 联通，不以扩充聊天 UI 为当前主任务。

主链为：

```text
Mira Mobile
  -> 手机系统中的 Tailscale VPN
  -> Tailnet / ACL
  -> MagicDNS
  -> Tailscale Serve HTTPS
  -> Mira Desktop Host
  -> Mira pairing / device credential
  -> Thread / Message / Agent
```

边界：

- Mobile 不内嵌或复制 Tailscale 客户端。
- Mobile 不读取 Tailscale App 的私有内部状态。
- 联通真相以实际 DNS、TLS、Serve 和 Mira Host 探针为准。
- `Tailscale ready` 与 `Mira 已授权` 是两个独立状态。
- 临时网络故障不得清除仍可能有效的设备凭证。

稳定合同见：[Tailscale Connectivity V1](tailscale-connectivity-v1.md)。

## 2. 已完成施工

### 2.1 Transport Probe

已建立独立的 Tailscale 联通状态机：

```text
idle
probing
ready
invalid_host
dns_unreachable
tls_failed
timeout
host_unreachable
not_mira_host
host_unhealthy
```

探测顺序：

```text
Host URL 校验
  -> DNS / MagicDNS
  -> 系统 TLS 证书校验
  -> GET /health
  -> GET /app/meta
  -> 确认目标为 Mira Host
```

Android 已增加原生分层探针，避免 React Native `fetch` 将 DNS、TLS 和连接错误全部压缩成 `Network request failed`。iOS 当前使用跨平台 HTTPS 探针回退。

主要代码：

- `src/connectivity/tailscaleConnectivity.ts`
- `src/connectivity/nativeTailscaleProbe.ts`
- `android/app/src/main/java/com/myapp/MiraTailscaleProbeModule.kt`
- `android/app/src/main/java/com/myapp/MiraHostIdentityParser.kt`

### 2.2 生命周期与网络恢复

已接入以下重新探测时机：

- App 冷启动且已有 Host 地址。
- App 从后台回到前台。
- 用户手动重新检查。
- Android VPN、Wi-Fi、蜂窝网络发生变化。

Android 原生网络监听会合并短时间内连续回调，再触发一次实际 Host 探测。

主要代码：

- `src/connectivity/TailscaleConnectivityLifecycle.tsx`
- `src/connectivity/systemNetworkMonitor.ts`
- `android/app/src/main/java/com/myapp/MiraNetworkMonitorModule.kt`

### 2.3 `mira://pair` 深链

Android 与 iOS 已注册 `mira://pair`。

已处理：

- App 冷启动收到配对链接。
- App 运行中再次收到配对链接。
- 从链接解析 Tailscale Serve Host、challenge 和 code。
- 先保存待处理配对信息，再验证 Tailscale 联通。
- 未进入 `ready` 时禁止 claim，避免提前消耗一次性配对码。

主要代码与配置：

- `App.tsx`
- `android/app/src/main/AndroidManifest.xml`
- `ios/MyApp/Info.plist`
- `ios/MyApp/AppDelegate.swift`

### 2.4 HostConfig 状态拆分

原有页面的模拟 1.5 秒“连接成功”已移除。

页面现在区分：

```text
Tailscale 联通：未检查 / 检查中 / 已联通 / 具体故障
Mira 授权：未配对 / 等待桌面批准 / 已配对 / 已撤销
```

未进入 `Tailscale ready` 时，设备申请按钮不可用。页面不再要求用户输入普通登录 Token，也不把 Magic IP 当成默认生产入口；优先使用桌面生成的配对链接与 Serve HTTPS URL。

主要代码：

- `src/screens/HostConfigScreen.tsx`
- `src/store/tailscaleConnectivityStore.ts`

### 2.5 受控配对闭环

已实现：

```text
Tailscale ready
  + 安全存储可用
  + 用户主动提交
  -> claim
  -> 等待桌面批准
  -> poll
  -> 领取一次性 credential
  -> GET /remote/v1/manifest 验证
  -> 安全保存
```

已覆盖的配对终态：

- waiting approval
- approved / connected
- rejected
- expired
- credential delivered but not safely retained

一次性凭证不会在安全存储不可用时被领取。

主要代码：

- `src/pairing/useRemotePairing.ts`
- `src/api/remoteMiraHost.ts`
- `src/security/deviceCredentialStore.ts`

### 2.6 Android 安全存储

Android 已实现：

- Android Keystore 管理 AES 密钥。
- AES-GCM 加密设备凭证。
- SharedPreferences 仅保存密文与 IV。
- service 名作为附加认证数据。

主要代码：

- `android/app/src/main/java/com/myapp/MiraSecureCredentialStoreModule.kt`
- `android/app/src/main/java/com/myapp/MiraSecureCredentialStorePackage.kt`

### 2.7 Host V1 应用层准备

虽然不是当前第一优先级，联通后的应用层基础已经准备：

- manifest
- Thread / Message 读取
- POST SSE Chat
- Agent Run 读取、批准、拒绝、取消
- canonical state replay
- 401 / 403 凭证失效处理

这些能力必须服从依赖方向：

```text
Tailscale Connectivity ready
  -> Mira device authorization valid
  -> business API
```

## 3. 当前验证真相

以下内容已经写入分支，但**尚未声称通过**：

- TypeScript typecheck
- ESLint
- Jest
- Android Debug 构建
- iOS 构建
- Android 真机 Tailscale 联通
- iOS 真机 Tailscale 联通
- Mobile 与 Desktop Host 的完整配对闭环
- Wi-Fi / 蜂窝 / VPN 切换恢复
- 设备撤销后的重新配对

原因：当前施工通过 GitHub 远程写入完成，没有本地仓库、Android SDK、Xcode 或真机执行环境。代码存在不等于构建通过。

## 4. 平台状态矩阵

| 能力 | Android | iOS | 验证状态 |
|---|---|---|---|
| `mira://pair` 注册 | 已施工 | 已施工 | 未构建验证 |
| 运行中深链转发 | RN Linking | AppDelegate 已转发 | 未真机验证 |
| `/health` + `/app/meta` | 已施工 | 已施工 | 未真机验证 |
| DNS 独立分类 | 原生实现 | 暂无原生实现 | 未验证 |
| TLS 独立分类 | 原生实现 | 依赖系统 fetch 错误 | 未验证 |
| VPN / Wi-Fi / 蜂窝监听 | 原生实现 | 待实现 | 未验证 |
| 回前台重新探测 | 已施工 | 已施工 | 未验证 |
| claim 前联通门禁 | 已施工 | 已施工 | 未验证 |
| 设备凭证安全存储 | Keystore 已施工 | Keychain 待实现 | 未验证 |
| claim / poll / manifest | 已施工 | Keychain 完成前主动阻断 | 未验证 |
| Session / Chat 切真实 Host | 尚未进入主施工 | 尚未进入主施工 | 未开始 |

## 5. 当前缺口

### P0：必须先完成

1. 拉取 `feature/tomz-tailscale` 到本地执行 typecheck、lint 和 Jest。
2. 完成 Android Debug 构建，修复 Kotlin / React Native 0.86 原生桥编译问题。
3. 使用 Android 真机连接同一 Tailnet，验证：
   - MagicDNS
   - Serve HTTPS
   - `/health`
   - `/app/meta`
   - `mira://pair`
   - claim / desktop approve / poll / manifest
4. 验证 VPN 关闭、重新开启，以及 Wi-Fi / 蜂窝切换后的自动恢复。
5. 验证桌面撤销设备后：Transport 仍可 `ready`，但授权回到未配对。

### P1：iOS 补齐

1. 实现并注册 Keychain 原生桥。
2. 增加 iOS 网络变化监听，至少覆盖前台路径变化。
3. 视系统错误可观测性决定是否增加 iOS 原生 DNS / TLS 探针。
4. 完成 iOS 构建与真机联调。

### P2：联通验收后

1. 将 SessionList 从 Mock 切换到真实 Thread 列表。
2. 将 ChatScreen 切换到 POST SSE。
3. 接 Agent 审批与取消。
4. 保持 Mock 仅用于测试与 Story，不再作为生产数据源。

## 6. 风险与审查重点

### 原生桥构建风险

Android Kotlin 模块尚未经过 RN 0.86 实际编译，需重点检查：

- NativeEventEmitter 必需方法。
- ReactPackage 注册。
- 网络回调注销。
- `HttpsURLConnection` 超时与资源关闭。
- Android API Level 对 Keystore / GCM 的兼容性。

### 错误分类边界

- timeout 可能来自 ACL、节点离线、VPN 未连接或受限网络，UI 不应武断宣称唯一原因。
- `.ts.net` 只表示地址形态，不代表实际可达。
- `/health` 成功不代表设备已获得 Mira 权限。
- 401 / 403 只应影响授权状态，不应否定 Tailscale Transport 可达。

### 一次性凭证风险

桌面端凭证只交付一次。Mobile 必须继续遵守：

- 安全存储不可用时不得 claim。
- manifest 验证成功后再标记 connected。
- 若凭证已交付但本地保存失败，必须要求生成新配对链接，不得假装可恢复。

## 7. 验收证据要求

本工程只有在提交以下证据后才能称为完成：

- typecheck、lint、Jest 命令与结果。
- Android 构建命令与结果。
- iOS 构建命令与结果。
- Android 真机的 Host URL、探针状态序列和配对状态序列。
- iOS 真机的对应记录。
- VPN 断开 / 恢复、网络切换、桌面离线 / 上线测试。
- 设备撤销、过期配对码、错误 Tailnet、错误 Host、TLS 错误测试。

## 8. 当前结论

当前不是“Mobile Tailscale 已完成”，而是：

> Tailscale 联通、生命周期恢复、深链入口和受控配对的主链代码已经落入 `feature/tomz-tailscale`；下一阶段必须转入本地构建与 Android 真机验收，再补齐 iOS Keychain 与网络诊断。
