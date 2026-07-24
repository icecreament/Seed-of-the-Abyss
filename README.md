# Seed of the Abyss · 深渊之种

俯视角 2D 动作 Roguelike。玩家被「深渊之种」寄生，每次死亡都会让种子进化，获得永久成长。

## 核心机制

- **死亡进化**：每局死亡结算 Abyss Essence，解锁永久属性与天赋点
- **天赋路线**：Growth / Predation / Resilience 三条路线
- **职业路线**：Warden / Reaver / Shade，影响战斗风格
- **双端操作**：PC 键鼠 + 手机虚拟摇杆/按钮

## 开发

```bash
npm install
npm run dev
```

打开终端给出的本地地址即可游玩（默认 `http://localhost:5173`）。

## 操作

| 端 | 移动 | 攻击 | 冲刺 | 技能 |
|----|------|------|------|------|
| PC | WASD | 鼠标左键 / Space | Shift | Q |
| 手机 | 左摇杆 | 右侧攻击键 | 冲刺键 | 技能键 |

## 技术栈

- Phaser 3
- TypeScript
- Vite


## 手机试玩 / 打包 APK

```bash
# 局域网网页分享（最简单，手机浏览器打开）
npm run share:lan

# 一键打 debug APK（需先安装 Android Studio 一次）
npm run android:apk
```

APK 输出：`release/SeedOfTheAbyss-debug.apk`

详见 [PACKAGING.md](PACKAGING.md)。
