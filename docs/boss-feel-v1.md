# Boss 反击节奏与整章实战（2026-10-21）

## 本轮目标

不是继续叠技能特效，而是让「识别预警 → 躲过重击 → 抓住反击窗口」成为能看见、能操作、能得到回报的战斗节奏。

## 实现

- 冲锋锁定方向不跟踪；正常冲锋结束后暴露核心 **1100ms**。
- 诱导冲锋撞到竞技场围墙，真实 Arcade 碰撞会提前终止冲锋，并产生更长的 **1400ms** 硬直。
- 地刺/孢子发招后分别有 **700ms / 900ms** 收招。多枚同步地刺不会重复播放破甲提示。
- 核心暴露时停止移动、停止触碰伤害，受到的玩家伤害乘 **1.35**，统一由实际伤害入口结算；仍然存在的弹幕/地刺并不会因此消失或无害。
- 破绽中不会开启下一轮预警；二阶段切换不会中断既有破绽。
- 骨甲打开为同尺寸原生像素姿态，露出更大的金色心核；角度姿态、核心括号与倒计时弧提供反馈，不通过缩放改变真实碰撞体。
- HUD 显示中英招式提示、破绽和伤害收益，暴露期间 Boss 血条变金。孢子预警用紫色区分地刺/冲锋。
- 新增原生 PCM 骨甲破裂音，继续遵循静音、音量、失焦、暂停和声部上限。
- 击杀立即清除 Boss 预警和弱点图形，避免胜利时残留伤害预警。

## 自然整章控制器的约束

`scripts/check-chapter-natural.cjs`：

- 每职业使用独立全新浏览器上下文；验证初始种子阶段为 1。
- 仅在开局设定职业/语言、切换到 Run；开打后只读游戏状态。
- 通过真实鼠标瞄准、Space、WASD、Q、Shift 和数字键选择突变操作。
- 不改属性、敌人、伤害、楼层、时钟或游戏速度；不调用攻击/伤害/传送方法。
- 控制器根据可见敌人、预警进度、弹道和地形选择行动；这是熟练自动控制器，不代表初次游玩的人类。
- 三次突变都在实际三选一卡片中选择；支持职业优先和生存优先两种偏好。
- 正常速度录像通过浏览器 MediaRecorder 记录画面和游戏实际音频，不依赖 ffmpeg。

## 基线证据（改动前）

四职业均正常通关：守望者 83.74s、掠夺者 80.96s、影行者 107.22s、棘语者 73.94s（游戏内战斗时间，不包括选择/加载/停顿）。

- 守望者原始结果：`output/feel-v1/chapter-probe/chapter-playchecks.json`
- 另三职业原始结果与录像：`output/feel-v1/chapter-baseline/`

以上证明原流程可通关，不证明新改动已通过验证；新版本证据需单独看下面的结果。

## 新版本验证入口

- `npm run build`
- `npm run test:regression`
- `npm run test:chapter`
- `npm run test:feel`（现含每职业 10 种程序音色）
- 四职业旧浏览器回归：`scripts/check-hero-browser.cjs`
- `npm run test:chapter:browser`
- `npm run test:feel:browser`
- `npm run test:boss:browser`（8 组实际引擎机制检查）
- `npm run test:chapter:natural`（4 个职业正常整章，默认生存优先）

职业优先复验可设置 `SEED_BUILD_STYLE=class`，输出目录通过 `SEED_CHAPTER_PLAY_OUTPUT` 指定。CI/本地需要可用的 Playwright 和 Edge；脚本支持既有的 `PLAYWRIGHT_MODULE` / `NODE_PATH` 配置。

本轮完整验证日志与新版本录像放在 `output/boss-feel-v1/`。结果以实际 JSON、进程退出状态为准，不把启动测试写作通过。

## 仍需继续

- 自动控制器通关不等于人类觉得爽、初见难度合理，仍需要人工试玩反馈。
- 手机为浏览器触屏模拟，不是安卓/iOS 真机手感或性能结论。
- 地图边缘 HUD 遮挡、职业可见进化和更多构筑路线仍未在本轮解决。

## 最终复验结果

已完成 TypeScript 检查、Vite 构建，以及 **251 项**检查：原离线回归 142、章节模型 10、手感模型 11、四职业浏览器回归 37、章节浏览器 22、手感浏览器 17、新 Boss 机制 8、正常速度整章 4，全部通过；浏览器脚本未捕获运行时异常。

Vite 构建仍有主包体积提示；本轮没有处理拆包。旧章节隔离测试现在显式清理新增的收招状态，避免上一用例的硬直影响下一招式的独立验证；新增 Boss 用例另外验证收招不能被提前跳过。

新版本使用「职业优先」选择，四局均为两项职业突变 + 循环腺体，没有吞生根须（击杀回血）：

| 职业 | 整章战斗时间 | Boss 战斗时间 | 击杀前最近一次观测生命 | 观测到的破绽窗口 |
| --- | ---: | ---: | ---: | ---: |
| 守望者 | 89.61s | 23.55s | 140/140 | 8 |
| 掠夺者 | 75.16s | 14.44s | 110/110 | 5 |
| 影行者 | 110.04s | 37.72s | 31/95 | 13 |
| 棘语者 | 74.51s | 17.39s | 85/85 | 6 |

生命值为约 90ms 采样间隔下、击杀前最后一次正常观测，不是另行增加的结算字段。窗口次数也是控制器观测值，不当作逐帧精确计数。战斗时间不包括选择和加载；不是人类完成时间基准，也不能仅凭四局决定职业强弱。

权威新版本证据：

- `output/boss-feel-v1/{build,regressions,chapter-model,feel-model,hero-regression,chapter-browser,feel-browser,boss-browser}.txt`
- `output/boss-feel-v1/checks.json`（8 组 Boss 机制）
- `output/boss-feel-v1/chapter-playtests/chapter-playchecks.json`（四职业正常整章）
- `output/boss-feel-v1/chapter-playtests/*-chapter.webm`（有声实战录像）
- `output/boss-feel-v1/chapter-playtests/*-natural-exposed.png`（正常实战里的暴露姿态）
- `output/boss-feel-v1/core-exposed-{zh,en}.png`（隔离展示图，不冒充自然战斗截图）
