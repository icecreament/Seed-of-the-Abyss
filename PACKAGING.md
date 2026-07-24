# 低流量打包 / 分享（不装 Android Studio）

手机流量下 **不要下 Android Studio**（好几 GB）。用下面方案。

---

## 方案 1：局域网直玩（几乎不耗流量，最推荐）

电脑连着手机热点时，手机和电脑本来就在同一局域网：

```bash
npm run share:lan
```

手机浏览器打开终端打印的地址，例如：

```text
http://192.168.x.x:4173
```

游戏文件只在手机↔电脑之间传，**不走外网流量**（构建若已完成，几乎 0 额外流量）。

---

## 方案 2：GitHub Actions 云端打 APK（不用本机装安卓环境）

本仓库已带工作流：`.github/workflows/android-apk.yml`

### 步骤

1. 把项目推到 GitHub（新建一个私有/公开仓库均可）
2. 打开仓库 → **Actions** → **Build Android APK** → **Run workflow**
   - 或 push 到 `main`/`master` 自动跑
3. 跑完后点那次运行 → **Artifacts** → 下载 `SeedOfTheAbyss-debug`
4. 解压得到 `app-debug.apk`，发给朋友安装

> 首次 push 会上传代码，大约几 MB 级（不含 node_modules）。  
> APK 构建在 GitHub 服务器上完成，**不吃你手机流量打 Gradle**。

本地可用这些命令准备：

```bash
git init
git add .
git commit -m "Seed of the Abyss"
# 在 GitHub 建好仓库后：
git remote add origin https://github.com/<你的用户名>/<仓库名>.git
git branch -M main
git push -u origin main
```

---

## 方案 3：打网页 zip（约 1～2MB）

```bash
npm run pack:web
```

输出：

```text
release/SeedOfTheAbyss-web.zip
```

可发给会架静态站的朋友，或丢到 Cloudflare Pages / Netlify / 任意静态空间后发链接。

---

## 方案 4：本机一键 APK（需要 Android SDK，体积大）

仅在你有 Wi‑Fi / 已装 SDK 时：

```bash
npm run android:apk
```

输出：`release/SeedOfTheAbyss-debug.apk`

---

## 命令一览

| 命令 | 流量/环境 | 结果 |
|------|-----------|------|
| `npm run share:lan` | 局域网，几乎 0 外网 | 手机浏览器玩 |
| `npm run pack:web` | 很小 | `release/*-web.zip` |
| GitHub Actions | 上传代码一次 | 云端 APK artifact |
| `npm run android:apk` | 需本机 SDK | 本地 APK |
