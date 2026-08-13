import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";
import { monitorRegistry } from "../monitor/index.js";
import { TerminalMonitor } from "../monitor/terminal.js";

export function buildTerminalTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "run_command",
        description: "运行一个 shell 命令并开始监控（如 npm install、npm run build、python train.py）。完成后会通知。",
        parameters: {
          type: "object",
          properties: {
            command: { type: "string", description: "要运行的命令" },
            cwd: { type: "string", description: "工作目录，默认用户主目录" },
            label: { type: "string", description: "监控标签，便于识别" },
          },
          required: ["command"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_process",
        description: "查看某个终端命令监控的状态：是否运行中、进度、退出码。",
        parameters: {
          type: "object",
          properties: { monitorId: { type: "string" } },
          required: ["monitorId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_output",
        description: "获取终端命令的最近输出（最后 N 行）。",
        parameters: {
          type: "object",
          properties: {
            monitorId: { type: "string" },
            tail: { type: "number", description: "返回行数，默认 30" },
          },
          required: ["monitorId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "cancel_command",
        description: "取消一个正在运行的终端命令（发送 SIGTERM）。",
        parameters: {
          type: "object",
          properties: { monitorId: { type: "string" } },
          required: ["monitorId"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    run_command: async (args) => {
      const command = String(args.command);
      const cwd = String(args.cwd || process.env.HOME || "/");
      const id = monitorRegistry.createTerminal({
        type: "terminal",
        label: String(args.label || command),
        command,
        cwd,
      });
      return JSON.stringify({ ok: true, monitorId: id, message: `已开始运行：${command}` });
    },
    check_process: async (args) => {
      const active = monitorRegistry.get(String(args.monitorId));
      if (!active || !(active.monitor instanceof TerminalMonitor)) {
        return JSON.stringify({ error: "监控不存在" });
      }
      const s = active.monitor.getState();
      return JSON.stringify({ status: s.status, progress: s.progress, exitCode: s.exitCode });
    },
    get_output: async (args) => {
      const active = monitorRegistry.get(String(args.monitorId));
      if (!active || !(active.monitor instanceof TerminalMonitor)) {
        return JSON.stringify({ error: "监控不存在" });
      }
      const tail = typeof args.tail === "number" ? args.tail : 30;
      return JSON.stringify({ ok: true, output: active.monitor.getOutput(tail) });
    },
    cancel_command: async (args) => {
      const ok = await monitorRegistry.cancel(String(args.monitorId));
      return JSON.stringify({ ok, message: ok ? "已取消" : "监控不存在" });
    },
  };

  return { tools, handlers };
}