# 思辨竞技场 (AI Battle Arena) ⚔️

一款基于大语言模型（Kimi & DeepSeek）的沉浸式 AI 辩论对战游戏。

![Banner](assets/screenshot.png)

## 🌟 核心亮点

- **双 AI 巅峰对决**：Kimi 与 DeepSeek 实时交锋，逻辑与修辞的碰撞。
- **沉浸式体验**：专属打字音效、背景音乐，以及动态血条和伤害判定。
- **真实思考逻辑**：AI 在发言前会进行内心思考（总结、吐槽、互动等），字数严格控制。
- **自由缩放**：战斗记录窗口支持自由拉伸，适配不同阅读习惯。
- **线性流程**：确保文字完全浮现后再进行判定，节奏感拉满。

## 🚀 快速开始

### 1. 获取代码
```bash
git clone https://github.com/您的用户名/ai-battle-arena.git
cd ai-battle-arena
```

### 2. 安装依赖
```bash
npm install
```

### 3. 运行程序
你可以直接双击根目录下的 `run_arena.bat`，输入你的 `MOONSHOT_API_KEY` 即可启动。
或者手动创建 `.env.local` 文件：
```env
MOONSHOT_API_KEY=你的密钥
```
然后运行：
```bash
npm run dev
```

## 📸 如何添加截图

1. **截图**：运行程序后，使用快捷键（如 `Win + Shift + S`）截取游戏画面。
2. **保存**：在项目根目录下创建一个 `assets` 文件夹，将截图命名为 `screenshot.png` 放入其中。
3. **更新 README**：README 中已经预留了图片引用代码 `![Banner](assets/screenshot.png)`，只要文件路径正确即可显示。

## 🛠️ 技术栈
- **框架**: Next.js 14 (App Router)
- **状态管理**: Zustand
- **样式**: Tailwind CSS
- **AI 模型**: Moonshot (Kimi) & DeepSeek

## 📄 开源协议
MIT License
