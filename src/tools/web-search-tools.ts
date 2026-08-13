import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";

export function buildWebSearchTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "fetch_url",
        description: "获取指定 URL 的网页内容（HTML 转 Markdown）。用于阅读文章、文档等。",
        parameters: {
          type: "object",
          properties: {
            url: { type: "string", description: "要获取的 URL" },
          },
          required: ["url"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    fetch_url: async (args) => {
      const url = String(args.url);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "CheckOne/1.0" },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return JSON.stringify({ error: `HTTP ${res.status}` });
        const html = await res.text();
        // Simple HTML to text extraction
        const text = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s{2,}/g, "\n")
          .trim()
          .slice(0, 8000);
        return JSON.stringify({ ok: true, url, text });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };

  return { tools, handlers };
}