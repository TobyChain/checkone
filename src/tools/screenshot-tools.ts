import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

const execFileAsync = promisify(execFile);

export function buildScreenshotTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "take_screenshot",
        description: "截取全屏并保存到文件。返回截图路径。",
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: "可选，保存路径。默认保存到 data/screenshots/ 目录" },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "screenshot_region",
        description: "截取屏幕指定区域。x, y 为左上角坐标，width, height 为区域大小。",
        parameters: {
          type: "object",
          properties: {
            x: { type: "number", description: "左上角 X 坐标" },
            y: { type: "number", description: "左上角 Y 坐标" },
            width: { type: "number", description: "区域宽度" },
            height: { type: "number", description: "区域高度" },
          },
          required: ["x", "y", "width", "height"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    take_screenshot: async (args) => {
      const dir = path.join(config.dataDir, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      const outPath = (args.path as string) || path.join(dir, `ss_${Date.now()}.png`);
      await execFileAsync("/usr/sbin/screencapture", ["-x", "-T0", outPath]);
      return JSON.stringify({ ok: true, path: outPath });
    },
    screenshot_region: async (args) => {
      const x = Number(args.x);
      const y = Number(args.y);
      const w = Number(args.width);
      const h = Number(args.height);
      const dir = path.join(config.dataDir, "screenshots");
      fs.mkdirSync(dir, { recursive: true });
      const outPath = path.join(dir, `ss_${Date.now()}.png`);
      await execFileAsync("/usr/sbin/screencapture", ["-x", "-T0", "-R", `${x},${y},${w},${h}`, outPath]);
      return JSON.stringify({ ok: true, path: outPath });
    },
  };

  return { tools, handlers };
}