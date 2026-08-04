# GitHub Actions 构建与发布

本文说明 `uichat-mira-mobile` 的 GitHub Actions 构建、签名、版本 Tag、GitHub Release 和 Cloudflare R2 发布流程。实际执行定义以 [`.github/workflows/mobile-ci.yml`](../.github/workflows/mobile-ci.yml) 为准。

## 触发条件

`Mobile CI` 在以下情况执行：

- Pull Request。
- 推送到 `main`、`dev`、`test`、`prod`、`feature/**` 或 `fix/**`。
- 维护者手动触发 `workflow_dispatch`。

同一分支只保留最新运行；新提交会取消该分支仍在执行的旧运行。

## 构建任务

| Job | 平台 | 主要检查 | 产物 |
| --- | --- | --- | --- |
| Typecheck, lint and test | Ubuntu | TypeScript、ESLint、Jest | 无 |
| Android debug build | Ubuntu | 未签名 Release 必须被拒绝、Debug APK 构建 | `uichat-mira-mobile-dev.apk` |
| Android signed release APK | Ubuntu | 正式签名、内置 JS Bundle、SVG 原生库、APK 完整性和签名 | `uichat-mira-mobile-release.apk`、SHA-256 |
| iOS simulator and unsigned device builds | macOS | CocoaPods、无签名 Simulator Debug、无签名 `iphoneos` Release、`arm64`、JS Bundle、IPA 结构与无 provisioning profile | Simulator ZIP、unsigned device IPA、SHA-256 |

iOS 两类构建复用同一个 macOS Job，避免重复安装 Node、Ruby、CocoaPods 和依赖。签名 Android Release 只在 `dev`、`prod` 推送或对应分支手动运行时执行。发布 Job 必须等待质量检查及各平台构建全部成功。

## iOS unsigned device 验证状态

截至 2026-08-03，GitHub macOS Runner 已完成以下验证：

- `iphoneos` / Release 编译成功。
- 可执行文件包含 `arm64`。
- `main.jsbundle` 已内置。
- IPA 使用标准 `Payload/*.app` 结构。
- IPA 不包含 `embedded.mobileprovision`。
- SHA-256 生成及 Artifact 上传成功。

尚未完成的验证是：在真实 iPhone 上通过 Sideloadly 等工具完成免费签名、安装、启动及核心功能回归。因此该产物当前定义为“已验证可构建，待真机验证”，不能写成已经完成 iOS 真机交付。

## 版本与 Tag

`package.json.version` 是语义版本的唯一来源。

- Android `versionName` 直接读取 `package.json.version`。
- `dev` 预发布 Tag 为 `v<version>-dev`，例如 `v0.1.2-dev`。
- `prod` 正式 Tag 为 `v<version>`，例如 `v0.1.2`。
- 正式 Tag 已指向其他提交时，发布必须失败并要求先升级 `package.json.version`。
- Android `versionCode` 和 iOS build number 是独立递增的构建编号，不作为语义版本来源。

## 发布目标

| 环境 | GitHub Release | R2 固定目录 |
| --- | --- | --- |
| dev | `v<version>-dev` 预发布 | `mira/mobile/dev/latest/` |
| prod | `v<version>` 正式发布 | `mira/mobile/prod/latest/` |

GitHub Tag 表示具体版本，R2 的 `latest` 路径表示环境渠道。两者用途不同：Tag 可追溯，R2 地址供客户端或测试人员始终下载该环境最新成功产物。

当前 dev 固定地址：

```text
https://assets.tomz.io/mira/mobile/dev/latest/uichat-mira-mobile-release.apk
https://assets.tomz.io/mira/mobile/dev/latest/uichat-mira-mobile-ios-unsigned-device.ipa
https://assets.tomz.io/mira/mobile/dev/latest/uichat-mira-mobile-ios-unsigned-device.ipa.sha256
https://assets.tomz.io/mira/mobile/dev/latest/SHA256SUMS.txt
```

unsigned device IPA 不能直接安装。Windows 侧载流程见 [iOS 免费真机侧载](ios-free-sideload-windows.md)。

## dev 发布完整性与 R2 容错

`publish-dev-release` 下载全部依赖 Job 的 Artifact 后，先验证以下固定产物存在且非空：

- Android Debug APK。
- Android signed Release APK 及 SHA-256。
- iOS Simulator ZIP。
- iOS unsigned device IPA 及 SHA-256。

发布前还会执行：

- Android Release SHA-256 校验。
- iOS unsigned device IPA SHA-256 校验。
- Simulator ZIP 完整性检查。
- unsigned device IPA ZIP 结构检查。
- 重新生成覆盖全部文件的 `SHA256SUMS.txt`。

R2 dev 上传采用以下容错规则：

1. 最多尝试 3 次，失败间隔逐次增加。
2. 不使用 `--delete`，单次异常不会删除 R2 上最后一次成功发布的文件。
3. 每次上传后逐文件调用 `head-object`，比较远端与本地字节数。
4. 只有全部文件上传且尺寸验证成功，发布步骤才视为成功。
5. 3 次仍失败时，工作流明确失败；GitHub Release 不会继续更新。

不使用 `--delete` 的代价是废弃文件可能暂时留在 `latest` 目录。当前产物文件名固定，这比网络抖动时误删最后一份可下载产物更安全。清理废弃文件应由显式维护任务完成，不和日常发布耦合。

生产 R2 仍沿用原有 Android-only 发布逻辑；本次 unsigned device IPA 只进入 `dev` 渠道。

## 必需 Secrets

Android Release 签名：

- `MIRA_RELEASE_KEYSTORE_BASE64`
- `MIRA_RELEASE_STORE_PASSWORD`
- `MIRA_RELEASE_KEY_ALIAS`
- `MIRA_RELEASE_KEY_PASSWORD`

Cloudflare R2：

- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_ACCOUNT_ID`
- `R2_BUCKET`
- `R2_PUBLIC_BASE_URL`

工作流只在 Runner 临时目录恢复 keystore，不得将签名文件或真实密码提交到仓库。iOS unsigned device 构建不需要 Apple Account、证书或 provisioning profile；这些凭据也不得进入 GitHub Secrets。

## Release JVM 配置

项目级 Gradle 配置为本机稳定性限制 worker 数、并行度和常驻 daemon。GitHub 的签名 Release 还需要执行 Android Lint；`v0.1.2-dev` 首次构建曾在 `react-native-svg:lintVitalAnalyzeRelease` 因 384 MB Metaspace 上限触发 `OutOfMemoryError: Metaspace`。

因此 CI 的签名 Release Job 单独使用：

- Heap 上限 2 GB。
- Metaspace 上限 1 GB。
- 单 worker。
- 禁止 Gradle 并行和 daemon。

该覆盖只作用于 GitHub Runner，不提高本机构建负载。

## 技术债：通用 APK 体积过大

状态：**OPEN**

### 当前事实

`v0.1.2-dev` 的签名 Release APK 为 105,835,811 字节。当前 `reactNativeArchitectures` 同时包含：

- `arm64-v8a`
- `armeabi-v7a`
- `x86`
- `x86_64`

APK 内容分析结果：

| 内容 | 压缩后大小 |
| --- | ---: |
| 四套 ABI 原生库 | 82.1 MB |
| JS Bundle | 12.3 MB |
| Dex | 约 7.7 MB |
| 其他资源与元数据 | 约 3.7 MB |

其中 x86 和 x86_64 原生库合计约 46.3 MB，只用于模拟器和极少数设备。`react-native-camera-kit` 还固定引入 ML Kit 条码识别与人脸识别；四套 ABI 的 `libbarhopper_v3.so` 合计约 20.2 MB，另有识别模型和 Java 代码。

Android 设备安装通用 APK 时只会使用与本机 CPU 匹配的一套原生库，其余架构只增加下载、存储和发布成本。

### 影响

- dev 直链下载从此前约 34 MB 增长到约 105.8 MB。
- R2、GitHub Release 和用户下载流量增加。
- 安装包体积容易被误认为业务代码异常增长。
- 当前产物无法反映单台真实手机的实际必要体积。

### 计划处理

1. GitHub 和 R2 的手机直装 Release APK 只构建 `arm64-v8a`；Debug CI 保留模拟器需要的架构。
2. 如需兼容 32 位 ARM，单独发布带架构后缀的 APK，不重新制作四架构通用包。
3. 评估 Android App Bundle 或按 ABI 拆分 APK，由分发渠道选择设备所需架构。
4. 在扫码、配对、相机权限和安全存储回归通过后，评估启用 R8 `minifyEnabled` 与 `shrinkResources`。
5. 检查扫码场景是否需要 camera-kit 的人脸识别依赖；若不需要，评估可配置依赖、维护补丁或更轻量的扫码实现。
6. 在 CI 中增加 Release APK 体积报告和上限，防止体积无提示回升。

### 第一阶段验收标准

- R2 的 `uichat-mira-mobile-release.apk` 为 `arm64-v8a` 手机直装包。
- APK 仍包含 JS Bundle、Hermes、扫码和必要原生模块，并通过签名验证。
- 真机完成启动、扫码配对、Host 连接和安全凭据读写验证。
- Release APK 不超过 50 MB；进一步以接近此前约 34 MB 为优化目标。
- 若保留其他 ABI，文件名必须明确包含架构，不能冒充同一个通用 Release。

## 发版检查

发布前至少确认：

1. `package.json.version` 是本次目标版本。
2. Typecheck、Lint 和 Jest 成功。
3. Android Debug、签名 Release、iOS Simulator 和 iOS unsigned device 构建成功。
4. APK 中存在 `assets/index.android.bundle` 和预期原生库。
5. `apksigner verify`、Android SHA-256 与 iOS IPA SHA-256 校验成功。
6. unsigned device IPA 包含 `arm64` 和 `main.jsbundle`，且不包含 provisioning profile。
7. GitHub Release Tag、目标提交和版本一致。
8. R2 固定地址可下载，远端文件大小与本次产物一致。
9. 在宣称真机可用前，必须完成真实 iPhone 的签名、安装、启动和核心功能回归。
