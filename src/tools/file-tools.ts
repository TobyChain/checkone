import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ALLOWED_ROOTS = [
  os.homedir(),
  "/tmp",
  "/Users",
];

function isAllowed(p: string): boolean {
  const resolved = path.resolve(p);
  return ALLOWED_ROOTS.some((root) => resolved.startsWith(root));
}

export function buildFileTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "read_file",
        description: "读取文件内容。支持 offset（起始行）和 limit（最大行数）。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "文件路径" },
            offset: { type: "number", description: "起始行（从 0 开始）" },
            limit: { type: "number", description: "最大行数，默认 200" },
          },
          required: ["path"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "list_files",
        description: "列出目录内容。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "目录路径" },
          },
          required: ["path"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    read_file: async (args) => {
      const p = String(args.path);
      if (!isAllowed(p)) return JSON.stringify({ error: "路径不在允许范围内" });
      try {
        const content = fs.readFileSync(p, "utf-8");
        const lines = content.split("\n");
        const offset = typeof args.offset === "number" ? args.offset : 0;
        const limit = typeof args.limit === "number" ? args.limit : 200;
        const slice = lines.slice(offset, offset + limit);
        return JSON.stringify({ ok: true, lines: slice.length, content: slice.join("\n") });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
    },
    list_files: async (args) => {
      const p = String(args.path);
      if (!isAllowed(p)) return JSON.stringify({ error: "路径不在允许范围内" });
      try {
        const entries = fs.readdirSync(p, { withFileTypes: true });
        const list = entries.map((e) => `${e.isDirectory() ? "d" : "f"} ${e.name}`).slice(0, 100);
        return JSON.stringify({ ok: true, count: list.length, entries: list });
      } catch (err) {
        return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
      }
    },
  };

  return { tools, handlers };
}