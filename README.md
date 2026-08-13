# 壹查 CheckOne

帮你维护 AI 时代的**心流状态**。

CheckOne 是一个轻量级 macOS 菜单栏应用，内置 AI 助手 **Asha（艾莎）**。它帮你在专注工作时盯着各种进度——浏览器页面加载、终端命令执行、网页 Agent 运行——聚合到一站式仪表盘，让你不被打断、随时掌握。

## 核心能力

- **监控浏览器**：监控网页加载、资源请求、网页 Agent 进度，定期截图
- **监控终端**：`npm install`、`npm run build`、训练脚本等，实时进度 + 完成通知
- **截图**：全屏 / 选区截图（macOS 内置 `screencapture`，零依赖）
- **自然语言**：对 Asha 说"帮我看着这个 npm install"即可
- **快捷键**：`Cmd+Shift+C` 发送当前浏览器 URL 给 Asha；`Cmd+Shift+A` 唤起对话
- **记忆**：Asha 记住你的偏好和上下文
- **技能**：可扩展的技能系统（`list_skills` / `call_skill`）

## 架构

```
macOS 菜单栏（accessory 策略，无 Dock）
├── Electron 主进程   → Tray + 全局快捷键 + utilityProcess fork
├── Express 服务      → REST API + SSE + 监控管道 + Asha Agent
└── 渲染器            → 仪表盘 / 对话 / 配置 三面板
```

- **Agent**：ReAct 循环 + 20 个工具（截图/网页/终端/文件/搜索/记忆/技能）
- **监控**：Playwright 网页监控 + child_process 终端监控，SSE 实时推送
- **存储**：文件备份 JSON（设置）+ PGlite（监控历史/会话/记忆）

## 开发

```bash
npm install
npm run build        # 编译 TypeScript
npm run app          # 启动 Electron 应用
npm run dev          # 仅启动 Express 服务（开发）
npm run dist:mac     # 打包 DMG + 签名
```

## 配置 LLM

在应用「设置」页填写 Base URL / API Key / Model，或在 `.env` 中设置：

```
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek-v4-flash
```

## 技术栈

Electron 33 · TypeScript · Express · SSE · Playwright · PGlite · electron-updater

## License

MIT