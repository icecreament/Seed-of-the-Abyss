# 像素动画工具接入评估

评估日期：2026-10-20。
范围：为《深渊之种》的主角外观与逐帧动画选择可编辑工具和自动化入口。本轮只做调研与本机发现，不安装软件、不执行第三方安装脚本、不购买授权、不修改 MCP 配置、不修改游戏运行代码。

## 结论

优先建议：Aseprite 编辑器 + 官方 CLI/Lua，先完成一轮可验证的导入／修改／导出。随后再决定是否把社区 MCP 接到这条已验证的工作流上。

免费候选：Pixelorama + 社区 Pixelorama-MCP。编辑器本身支持图层与逐帧动画；MCP 需要额外安装编辑器内桥接扩展并核对版本兼容。

“更好看”仍需逐帧修改、检查轮廓与节奏，不能由安装 MCP 保证。此次排序是针对当前 Phaser 项目的工程判断，不是对所有像素工具的通用排名。

## 本机发现

- PATH 中未找到 aseprite、libresprite、pixelorama。
- 常见 Aseprite 目录、可发现的 Steam 库与相关卸载记录中未检测到已安装编辑器；不能排除未登记的自定义便携目录。
- 已有 448×32 的守望者透明图集，含 14 个 32×32 帧；已有 64×80 展示肖像。
- 游戏目前使用 PixelFactory 在启动时生成纹理。外部导出图片不会自动替换这条管线，仍需明确接入代码。
- 已有源码回归与浏览器截图检查，可以用来验证外部资产接入后没有改变操作、碰撞和冷却。

## 方案 A：Aseprite + 官方 CLI/Lua（首选试点）

官方 CLI 可在 batch 模式运行 Lua，并导出 PNG 图集及 JSON 元数据。Lua API 可创建、打开、修改和保存 sprite；因此不必先装 MCP 才能进行自动化。

优势（针对本项目的判断）：路径短、脚本可纳入项目并审阅、可以重复导出和比较像素。后续编辑也能保留 .aseprite 源文件，而不只是最终 PNG。

前提：有可用、合法、可保存的 Aseprite 版本。官方发行版有购买渠道；本轮未购买，不引用未经结算确认的价格。

建议：先做官方脚本往返测试，再精修人物。不要一开始改变全部精灵分辨率、碰撞体或重写四职业。

## 方案 B：Vollkorn-Games/aseprite-mcp（可进入试点，不等于已通过安全审计）

项目说明提供像素读取／绘制、图层、帧、动画标签、图集导出和可视预览工具。架构仍是 Node MCP → Aseprite batch/Lua。

已核对材料：README、src/index.ts、src/context.ts、src/server.ts、package.json。入口源码确认存在 stdio、可选 HTTP、工具过滤与只读配置。不声称已审完整执行链、Lua 实现、全部依赖或 Windows 运行效果。

试点建议：

- 固定经过确认的仓库提交与依赖锁；不要长期盲用浮动 main 或每次拉取 latest。
- 初次接入仅启用必要绘制、帧、标签和导出工具。
- 优先 stdio，不额外开放 HTTP。仓库明确说明 HTTP 模式没有内置认证，不能暴露到公网。
- 工具过滤／只读模式不等于文件系统沙箱；进程权限和读写路径仍要单独约束。
- 在专用测试目录创建源文件；不让第三方工具覆盖当前代码或 V1 素材。
- 安装前继续检查执行器的参数传递、Lua 文件访问与导出路径验证。

此 MCP 不能替代 Aseprite 本体或授权。当前状态：候选，未安装、未接通、未实测。

## 方案 C：Pixelorama + abidoo22/Pixelorama-MCP（免费备选）

Pixelorama 官方项目支持时间轴图层／帧、动画、PNG 与图集导出，并采用 MIT 许可。可以通过官方发布渠道取得编辑器。

社区 MCP 的说明与入门文档展示了图层、帧和画布预览等工具；需要编辑器内 PixMcpBridge 扩展，文档使用本机 7373 端口。它声明自己是独立社区项目，不代表编辑器官方背书。

接入注意：

- 要同时核对 MCP、桥接扩展和 Pixelorama 的兼容版本，不根据 README 的性能宣称承诺本机效果。
- 对桥接扩展实际监听地址、认证、脚本执行和文件访问继续审查。本轮未完成桥接源码审计。
- .pck 预编译扩展不能仅因仓库开源就视为已验证；正式采用前需要核对来源／发布物，必要时从审阅源码构建。
- 游戏用 Phaser，不直接采用该 MCP 宣传的 Godot 专用导出资产；应导出普通 PNG 图集与元数据。
- 这条路线需要多一层运行中的编辑器桥接，故在本项目中排在 Aseprite 官方脚本试点之后。

当前状态：免费备选，未安装、未接通、未实测。

## Phaser 兼容性

已核对 Phaser 3.90.0 的 AsepriteFile 源码；它支持 PNG + Aseprite JSON 的加载及通过 frameTags 创建动画。

但是当前游戏使用的是数值帧索引和固定纹理名。因此首轮建议保留固定 32×32 单元、帧序、透明边距与现有动画键，避免直接启用裁边／去重后引发原点与帧名变化。通过往返测试后，再考虑切换完整 Aseprite atlas 管线。

## 首轮验收：只做守望者，不覆盖 V1

1. 在独立文件中导入 V1 14 帧，保存可编辑源文件。
2. 建立 walk=0–3、idle=4–7、attack=8–11、dash=12、hurt=13 的标签；注意不同工具的帧号基准可能不同。
3. 第一轮只改一个已知像素，往返导出并比较，确认没有全图色彩漂移、透明底丢失或帧顺序改变。
4. 保存关闭后重新打开，确认帧数、标签与修改仍然存在。
5. 再精修轮廓、骨白面甲、寄生肩甲、胸核明暗与挥剑预备／发力／回收。
6. 以 V2 名称导出 PNG、JSON 和可视动画预览；先不覆盖 V1。
7. 接到 Phaser 后检查靴底锚点、碰撞体、16fps 攻击姿态和原有 300ms 攻击冷却。
8. 重新执行构建、回归与实际浏览器待机／攻击／冲刺／受击检查。

重要限制：当前 PNG 各部件已经合成。导入编辑器只能恢复像素与帧，不能自动恢复真实的“身体／甲胄／根系／武器”分层；这些分层要重新制作。

## 待确认

用户是否已有 Aseprite 可用版本，及其安装路径。若没有且希望全程免费，则改用 Pixelorama 试点。

## 来源（仅列已实际打开核对的主要材料）

- Aseprite 官方 CLI：https://www.aseprite.org/docs/cli/
- Aseprite 官方 Lua API：https://www.aseprite.org/api/
- Aseprite 官方购买页：https://www.aseprite.org/buy/
- Aseprite MCP 候选：https://github.com/Vollkorn-Games/aseprite-mcp
- 候选入口源码：https://raw.githubusercontent.com/Vollkorn-Games/aseprite-mcp/main/src/index.ts
- 候选上下文源码：https://raw.githubusercontent.com/Vollkorn-Games/aseprite-mcp/main/src/context.ts
- 候选服务源码：https://raw.githubusercontent.com/Vollkorn-Games/aseprite-mcp/main/src/server.ts
- 候选依赖声明：https://raw.githubusercontent.com/Vollkorn-Games/aseprite-mcp/main/package.json
- Pixelorama 官方仓库：https://github.com/Orama-Interactive/Pixelorama
- Pixelorama 社区 MCP：https://github.com/abidoo22/Pixelorama-MCP
- Pixelorama MCP 入门：https://raw.githubusercontent.com/abidoo22/Pixelorama-MCP/main/docs/getting-started.md
- Phaser 3.90.0 Aseprite loader：https://raw.githubusercontent.com/phaserjs/phaser/v3.90.0/src/loader/filetypes/AsepriteFile.js

本轮未克隆／构建／执行上述社区 MCP，未安装编辑器，也未绕过本机 HTTPS 证书验证。后续实际下载可能需要先解决本机证书信任问题；网页资料检索不等于下载构建链路已通过。
