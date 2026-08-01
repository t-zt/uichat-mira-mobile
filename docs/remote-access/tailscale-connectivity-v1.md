# Mira Mobile Tailscale Connectivity V1

## 1. 任务定位

`feature/tomz-tailscale` 的首要任务不是扩充聊天页面，也不是复制 Tailscale 客户端，而是建立并验证：

```text
Mira Mobile
  -> 手机系统中的 Tailscale VPN 路由
  -> Tailnet / ACL
  -> MagicDNS
  -> Tailscale Serve HTTPS
  -> Mira Desktop Host
```

只有这条链路进入 `ready`，才允许继续执行 Mira 设备配对、凭证恢复和业务 API。

Mira Host V1 是联通后的应用层协议；Tailscale Connectivity V1 是其前置传输层合同。两者不得混成一个“连接失败”。

## 2. 真相来源

Mobile 不根据按钮状态猜测 Tailscale 是否可用，也不依赖读取另一个 App 的内部状态。

联通真相由实际探针确定：

1. Host URL 合法并满足生产 HTTPS 要求。
2. `GET /health` 成功，证明 Tailnet 路由、DNS、TLS、Serve 和 Host 进程链路可达。
3. `GET /app/meta` 成功且返回 Mira 标识，证明目标不是其他 HTTPS 服务。
4. 以上通过后，状态才为 `ready`。

桌面端 `/health` 与 `/app/meta` 均为免 Mira 用户凭证的只读系统探针。它们不签发设备权限，也不替代后续 pairing。

## 3. 状态机

```text
idle
  -> probing
     -> ready
     -> invalid_host
     -> dns_unreachable
     -> tls_failed
     -> timeout
     -> host_unreachable
     -> not_mira_host
     -> host_unhealthy
```

### `ready`

- Host URL 已规范化。
- `/health` 返回成功。
- `/app/meta` 可确认目标为 Mira Host。
- 可以进入 pairing 或使用已保存设备凭证恢复连接。

### `invalid_host`

- URL 语法错误。
- 生产模式使用非 HTTPS。
- URL 包含不允许的协议或凭据。

### `dns_unreachable`

- MagicDNS 名称无法解析。
- 手机未进入正确 Tailnet，或 Tailnet DNS 未生效。

### `tls_failed`

- Tailscale Serve HTTPS 证书校验失败。
- 使用了与证书不匹配的主机名。

### `timeout`

可能包括：

- 手机 Tailscale 未连接。
- ACL 丢弃访问。
- 桌面节点离线。
- 网络切换或受限网络导致连接未建立。

Mobile 不得在缺乏证据时把 timeout 武断显示为某一种原因，而应给出对应检查动作。

### `host_unreachable`

- 连接被拒绝、网络栈错误或其他无法归类的可达性失败。

### `not_mira_host`

- 地址可达，但 `/app/meta` 不存在或不是 Mira。
- 防止用户把其他 Tailnet 服务误当作 Mira Host。

### `host_unhealthy`

- 已经找到目标地址，但 `/health` 未成功。
- 常见于 Mira Host 尚未启动完成或 Serve 后端目标不可用。

## 4. Host 地址来源

优先来源：桌面端生成的 `mira://pair` URI 中的 `host` 字段。

Mobile 不应要求普通用户手工拼接：

- `100.x` IP
- MagicDNS 短名称
- tailnet FQDN
- Serve 端口

手工地址只保留为开发和诊断入口。生产配对以桌面给出的 HTTPS Host URL 为准。

## 5. 联通顺序

```text
解析 pairing URI
  -> probeTailscaleMiraHost(host)
  -> ready ? claim pairing : 展示联通诊断
  -> desktop approve
  -> mobile poll credential
  -> secure storage
  -> GET /remote/v1/manifest
```

禁止行为：

- 未通过 Transport Probe 就 claim。
- 把 DNS、TLS、ACL、Host 未启动全部显示成“配对码错误”。
- 仅因为 Host URL 是 `.ts.net` 就判断已联通。
- 仅因为手机有互联网就判断 Tailnet 可达。
- 在生产模式回退到明文 HTTP。

## 6. 生命周期与恢复

以下时机重新探测：

- App 冷启动，存在已保存 Host 时。
- App 从后台回到前台。
- Wi-Fi 与蜂窝网络切换后。
- 业务请求出现网络错误或连续 timeout 后。
- 用户主动点击“重新检查连接”。

恢复规则：

1. 先重新执行 Transport Probe。
2. `ready` 后再调用 manifest 验证设备凭证。
3. manifest 返回 401/403 时清除本地设备凭证并进入重新配对。
4. Transport 未 ready 时保留设备凭证，不把临时断网误判为撤销。

## 7. UI 最小要求

Host 配置页需要展示两个独立状态：

```text
Tailscale 联通：未检查 / 检查中 / 已联通 / 具体故障
Mira 授权：未配对 / 等待桌面确认 / 已配对 / 已撤销
```

错误必须提供动作，而不是只显示错误码：

- 打开 Tailscale，确认已连接正确 Tailnet。
- 检查桌面 Mira 与 Tailscale 节点是否在线。
- 确认桌面 Remote Access 状态为 ready。
- 检查 ACL 是否允许手机访问桌面 Serve HTTPS。
- 重新复制桌面端配对链接。

## 8. 代码位置

```text
src/connectivity/tailscaleConnectivity.ts
src/connectivity/tailscaleConnectivity.test.ts
```

Host V1 应用协议继续位于：

```text
src/protocol/remoteHostV1.ts
src/api/remoteMiraHost.ts
src/api/postSse.ts
```

依赖方向必须保持：

```text
Tailscale Connectivity ready
  -> Remote Host pairing/auth
  -> Thread/Message/Agent business calls
```

不得反向由业务页面自行猜测网络状态。

## 9. V1 验收

- 正确的 Serve HTTPS URL 能通过 `/health` 与 `/app/meta` 进入 `ready`。
- 其他 Tailnet HTTPS 服务不会被识别为 Mira Host。
- MagicDNS、TLS、timeout、Host unhealthy 至少能被分开呈现。
- 未进入 `ready` 时不能发起 pairing claim。
- 临时网络切换不会删除仍有效的设备凭证。
- 设备被桌面撤销后，Transport 仍可能为 `ready`，但 Mira 授权必须变为未配对。
- Android 与 iOS 均使用同一状态合同；平台差异只放在系统引导和安全存储层。
