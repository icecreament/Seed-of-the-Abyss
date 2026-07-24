# 三端打包指南（PC / Android / iOS）

本项目是 **Phaser 网页游戏**，一套代码三端壳：

| 端 | 方案 | 产出 |
|----|------|------|
| PC Windows | Electron | `.exe`（portable / 安装包） |
| Android | Capacitor | `.apk`（GitHub Actions 或本机） |
| iOS | Capacitor | `.ipa`（**必须 Mac + Xcode**） |

---

## PC：生成 .exe

### 依赖
已内置：`electron` + `electron-builder`

### 开发预览（窗口里跑游戏）
```bash
npm run electron:dev
```

### 一键打 Windows 可执行文件
```bash
npm run desktop:exe
```

成功后在：
```text
release/SeedOfTheAbyss-<version>-portable.exe
release/SeedOfTheAbyss-<version>-win-x64.exe   # 安装包(NSIS)
```

把 **portable.exe** 发给朋友，双击就能玩（免安装）。

> 首次打包会下载 Electron 二进制，需要能访问外网。

---

## Android：APK

### 推荐：GitHub Actions 云端打
1. push 到 `main`
2. 仓库 → Actions → **Build Android APK**
3. 下载 Artifact `SeedOfTheAbyss-debug` → 解压得到 `app-debug.apk`

### 本机（需 Android SDK）
```bash
npm run android:apk
```

---

## iOS：必须用 Mac

Windows 上 **不能** 编出可上架的 iOS 包。流程：

```bash
# 1) 在任意系统准备好代码后，到 Mac 上：
npm install
npm run build
npm i @capacitor/ios@6
npx cap add ios
npx cap sync ios
npx cap open ios
```

然后在 **Xcode** 里：
1. 选真机/模拟器
2. Signing & Capabilities 配置 Apple 开发者账号
3. Product → Archive → 导出 ipa / TestFlight

命令别名（Mac）：
```bash
npm run ios:sync
npm run ios:open
```

---

## 三端适配原则（已落地）

1. **统一 1280×720 设计分辨率**
2. **Scale.FIT**：保证 UI 完整、点击坐标与画面一致（PC/安卓/iOS 都用）
3. **不要用 CSS 强行 width/height:100% 拉伸 canvas**（会导致点偏）
4. 按钮命中区域 = 可见矩形，`setTopOnly(true)`，避免相邻按钮同时高亮
5. 触屏：虚拟摇杆；PC：键鼠；Electron：独立窗口

---

## 常用命令

```bash
npm run dev              # 浏览器开发
npm run share:lan        # 手机网页局域网试玩
npm run desktop:exe      # 打 Windows exe
npm run android:apk      # 本机打 APK（需 SDK）
npm run electron:dev     # Electron 窗口开发
```
