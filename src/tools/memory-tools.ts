import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";
import { store } from "../store.js";

export function buildMemoryTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "remember",
        description: "记住一条信息（用户偏好、上下文、事实）。后续对话会自动带上已记住的内容。",
        parameters: {
          type: "object",
          properties: {
            text: { type: "string", description: "要记住的内容" },
          },
          required: ["text"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "recall",
        description: "回忆已记住的信息。可以按关键词搜索。",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "搜索关键词，不传则返回所有" },
            limit: { type: "number", description: "最大返回条数，默认 10" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "forget",
        description: "删除一条已记住的信息（按序号，从 1 开始）",
        parameters: {
          type: "object",
          properties: {
            index: { type: "number", description: "序号，从 1 开始" },
          },
          required: ["index"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    remember: async (args) => {
      const text = String(args.text ?? "").trim();
      if (!text) throw new Error("text 不能为空");
      if (store.memory.some((m) => m.text === text)) {
        return JSON.stringify({ ok: true, message: "这条已经记住了" });
      }
      store.addMemory(text);
      return JSON.stringify({ ok: true, message: `已记住：${text}`, total: store.memory.length });
    },
    recall: async (args) => {
      const query = String(args.query ?? "").toLowerCase();
      const limit = typeof args.limit === "number" ? args.limit : 10;
      let items = store.memory;
      if (query) {
        items = items.filter((m) => m.text.toLowerCase().includes(query));
      }
      const list = items.slice(-limit).map((m, i) => `${store.memory.indexOf(m) + 1}. ${m.text}`);
      return JSON.stringify({ ok: true, count: list.length, items: list });
    },
    forget: async (args) => {
      const index = Number(args.index);
      if (!Number.isInteger(index) || index < 1 || index > store.memory.length) {
        throw new Error(`index 需在 1-${store.memory.length} 之间`);
      }
      const removed = store.memory.splice(index - 1, 1)[0];
      store.saveMemory();
      return JSON.stringify({ ok: true, message: `已忘记：${removed.text}` });
    },
  };

  return { tools, handlers };
}