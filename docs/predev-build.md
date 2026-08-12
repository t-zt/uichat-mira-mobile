# Predev 构建通道

`predev` 用于进入 `dev` 前的多人集成与移动端构建验证。

工作方式：

```text
feature/* / fix/* -> predev -> dev
```

推送或合并到 `predev` 后，`Predev CI` 自动执行质量检查、Android Debug、Android 签名 Release、iOS Simulator 与 iOS unsigned device 构建。全部成功后，产物上传到 Cloudflare R2：

```text
https://assets.tomz.io/mira/mobile/predev/latest/uichat-mira-mobile-release.apk
https://assets.tomz.io/mira/mobile/predev/latest/uichat-mira-mobile-ios-unsigned-device.ipa
https://assets.tomz.io/mira/mobile/predev/latest/SHA256SUMS.txt
```

`predev` 不创建或修改 `dev` Tag / GitHub prerelease，也不会覆盖 `mira/mobile/dev/latest/`。
