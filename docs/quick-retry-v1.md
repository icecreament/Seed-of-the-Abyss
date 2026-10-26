# 20261026 小版本收尾：一键重开与独立试玩包

## 范围与停止条件

用户已把目标调整为「你先别一直改了，帮我收尾一个小版本先」。因此本轮不再追求无限扩展的总体爽感目标，不加机制、不改数值；将现有工作区收成一个带日期、可交付、说明验证边界的 Windows 试玩构建。

生产变更只涉及 src/scenes/DeathScene.ts 与 src/i18n/i18n.ts。新增 scripts/check-quick-retry-browser.cjs 仅用于开发验证，未给生产版本加入测试全局变量。

## 一键重开

结算底部布局为天赋 x400、再来一局 x640、主菜单 x880（y662）。同职业以本局 runState.lastRun.classId 为准，无本局记录时回退到已保存选择；不是随意使用可能已经变过的选人状态。

重用 goScene 的输入禁用与单次转场；回调另有场景活跃和单次触发保护。R 使用现有 InputEdgeGuard，拒绝 OS repeat 与同一事件对象重放，场景 shutdown 解绑监听；守卫跨结算页重启保留。触屏不显示键盘快捷键提示。

未重置 deathSettled 或删除旧 lastRun；新一局结束仍由原 RunScene.endRun 更新记录和结算状态。原结算公式、奖励块、Run/Player/SaveSystem 均未改动。

## 冻结与验证

证据根目录：output/quick-retry-v1/。

- 前版权威清单 output/shade-link-v1/verified/source-hashes.json 共 337 项；初始零漂移，结束时只有上述两个预期生产文件变更。
- 本轮当前生产/检查输入冻结 200 项，验证前后逐字节一致。运行器已结束，verified/results.json 的 10/10 入口全部退出 0。
- audit-scope.cjs 反向移除本轮导入/守卫/底部导航与六行中英文文本，重构得到原文件；原奖励和渲染主体字节一致。
- TypeScript --noEmit 和 Vite build 通过。保留既有大包体警告，未为清除警告做新扩改。
- 通用回归 144/144；输入模型 8/8、浏览器 8/8；区域点击模型 8/8、浏览器 25/25；重开专项 25/25。
- 重开专项使用明确标注的合成已结束局指标和独立存档，覆盖四职业真实鼠标、真实 R、重复事件、双击/按键竞争、重启无重复奖励、死亡/胜利/放弃/旧版缺省结果、无记录回退、旧按下抬起不误触、旧天赋/菜单入口、中英文四档渲染比例及模拟触屏。
- production-verified/checks.json：6/6。直接从 ASAR 读取正式资源在无头 Edge 服务运行，确认没有 __seedGame / __seedDev；从菜单选人开始，用原敌人和时钟自然死亡：影行者三局（初局、R重开、鼠标重开），掠夺者模拟触屏两局（初局、触屏重开）。未注入战斗指标、伤害或生命值。
- production/ 保留首次检查工具失败：Windows ASAR 路径分隔符使用不正确；修正测试工具路径归一化后，在新的 production-verified/ 通过。不是生产代码缺陷，不隐去失败证据。

## 发布物

output/playable-20261026-v1/SeedOfTheAbyss-0.1.0-20261026-playtest.exe

- electron-builder 24.13.3，Electron 33.2.1，Windows x64 portable，退出 0。
- 使用单独的新输出目录，不覆盖 release/。旧 EXE 的 SHA256 仍为 6388d9bb421f493417fb9ffafb6e65ffe52cdde398528ab8fdbf68909c2c23ce。
- 新 EXE 85,014,123 字节；SHA256 cc8a9b60c45d3ada994fe250cc24a8555e8ff0f3a815ff0f1592e338353b7488。
- portable-payload.json 证明从交付 EXE 静态解出的 app.asar 与测试过的 ASAR 完全相同；不是只检查旁边的未打包目录。
- app.asar SHA256：11e627b4151acb764d9812ca421ea25d35670a2c19c4d71910e7d35808a83f0f。
- 包内 dist/index.html、正式 JS、Electron main/preload 均与当前构建文件逐项相同。
- 同目录试玩说明.md 与 SHA256SUMS.txt 提供入口、操作、版本内容及边界；release-manifest.json 记录交付文件及证据。

## 未作出的承诺

没有启动原生 Electron 窗口验证，没有真实手机或真人手感验收；默认图标与未签名状态保留。本次完成的是用户要求的小版本收尾，而不是宣称整个游戏的爽感、数值、长期内容已经全部完成。现有开发服务器保留，测试和打包进程均已结束。
