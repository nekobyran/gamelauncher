# GameLauncher 1.1.0

GameLauncher 1.1.0 是正式公开版本。启动器采用 thin-shell + 按需 Runtime 架构：游戏、Wine、KRKR、ONS、EasyRPG、模型和打包运行时不再无条件塞进启动器本体，而由引擎中心按平台与 ABI 获取或使用内置后端。

## 主要变化

- 引擎中心改为直接展示游戏引擎卡片：竖屏每行 2 张，横屏每行 3 张，可查看适用范围、识别特征、运行后端、Runtime Variant、组件状态和使用流程。
- 新增独立 Engine Identity：Ren'Py、Godot、Siglus / SL、RPG Maker RGSS；它们可共享 Wine Runtime，但不会丢失各自引擎身份。
- 引入 Runtime Variant：Ren'Py 7.x / 8.x，以及 RPG Maker XP / VX / VX Ace / mkxp-z。
- Runtime 下载链支持 manifest、目标 ABI 选择、SHA-256 校验、安装记录、断点续传、重试和后台任务；ABI 不支持时直接显示明确原因，不再误报为网络失败。
- Android Wine-backed 引擎共享同一个 Wine 安装结果；扫描、编辑、打包 manifest 与 UnifiedGameLaunchService 使用同一 Runtime Catalog。
- Windows 正式 portable 内置官方 Android Emulator x86_64 运行环境，但不内置 Wine、游戏、引擎、模型或可变模拟器状态。

## 发布内容

- Windows x64 portable：`GameLauncher-1.1.0-windows-x64-portable.tar.zst`
  - 774,244,104 bytes
  - SHA-256 `4E396D0EB1E97542D19DEB58F019EF39F825F1630A452F229EADBE071DCD27DA`
- Android ARM64 thin launcher：`gamelauncher-android-stable.apk`
  - 11,772,997 bytes
  - SHA-256 `4F283540B6518BAD2A9CCDD7AE8A0B6C9104B21C9C6698DB71EEDAAEF45973B7`

## 验证

- Android `BuildStageAndroidStable`：PASS；版本 `1.1.0 (3)`，`arm64-v8a`，APK Signature Scheme v2/v3 验证通过。
- Android thin-shell audit：PASS；未发现 bundled engines、models、templates 或 Android simulator。
- Windows stable staging：PASS；thin-shell audit：PASS；包含官方 Android Emulator，未包含 Wine、游戏、引擎、模型、模板或可变模拟器状态。
- Windows Android Simulator helper Rust tests：3/3 PASS。
- Windows portable authority：PASS，`previewOnly=false`，归档低于 GitHub 2 GB 单资产限制。
- Flutter analyze：0 issue；GameDirectoryScanner 127/127；Runtime/引擎卡片/启动链相关回归均通过。
- MuMu x86_64 最终 APK 冷启动：MainActivity 正常 resumed，0 Fatal / 0 ANR。
- 真实 ARM64 Wine Runtime 下载链已完成 manifest → 下载 → SHA-256 → installed manifest 验证，并由 RGSS / Ren'Py / Godot / Siglus / Windows 共享同一 Wine Runtime。

## 已知限制

- 当前公开 Wine Android Runtime 仅提供 `arm64-v8a`；x86_64 Android 设备会在引擎中心明确显示当前 ABI 无可用构件。
- Windows portable 未使用受信任 Authenticode 证书，Windows 可能显示未知发布者或 SmartScreen 提示。
- ARM64 实体手机 UI 安装验证受到当前自动化环境的设备写入限制；Android ARM64 Runtime 下载与校验链已使用生产代码完成端到端验证。

完整 SHA-256 见 `checksums.txt`。
