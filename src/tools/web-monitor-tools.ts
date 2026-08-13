import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";
import { monitorRegistry } from "../monitor/index.js";
import { store } from "../store.js";

export function buildWebMonitorTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "monitor_url",
        description: "打开一个网页并开始监控：跟踪资源加载、页面状态，定期截图。用于监控网页/网页 Agent 进度。",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "要监控的 URL" },
            waitForSelector: { type: "string", description: "可选，等待该 CSS 选择器出现后再标记完成" },
          },
          required: ["url"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "check_page_state",
        description: "查看某个网页监控的当前状态：标题、资源请求数、成功/失败数。",
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
        name: "get_page_content",
        description: "获取被监控网页的文本内容（前 5000 字）。",
        parameters: {
          type: "object",
          properties: { monitorId: { type: "string" } },
          required: ["monitorId"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    monitor_url: async (args) => {
      const url = String(args.url);
      const id = monitorRegistry.createWeb({
        type: "web",
        label: url,
        url,
        waitForSelector: args.waitForSelector as string | undefined,
        screenshotIntervalMs: (store.settings.screenshotIntervalSec || 5) * 1000,
      });
      return JSON.stringify({ ok: true, monitorId: id, message: `已开始监控 ${url}` });
    },
    check_page_state: async (args) => {
      const active = monitorRegistry.get(String(args.monitorId));
      if (!active || !(active.monitor instanceof (await import("../monitor/web.js")).WebMonitor)) {
        return JSON.stringify({ error: "监控不存在" });
      }
      return JSON.stringify(await active.monitor.checkState());
    },
    get_page_content: async (args) => {
      const active = monitorRegistry.get(String(args.monitorId));
      if (!active) return JSON.stringify({ error: "监控不存在" });
      const content = await (active.monitor as any).getContent?.();
      return JSON.stringify({ ok: true, content: content || "" });
    },
  };

  return { tools, handlers };
}