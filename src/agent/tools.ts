import type { ToolDefinition } from "./llm.js";
import type { ToolHandler } from "./loop.js";
import { buildScreenshotTools } from "../tools/screenshot-tools.js";
import { buildWebSearchTools } from "../tools/web-search-tools.js";
import { buildFileTools } from "../tools/file-tools.js";
import { buildMemoryTools } from "../tools/memory-tools.js";
import { buildSkillTools } from "../tools/skill-tools.js";
import { buildWebMonitorTools } from "../tools/web-monitor-tools.js";
import { buildTerminalTools } from "../tools/terminal-tools.js";

export function buildToolkit(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const modules = [
    buildScreenshotTools(),
    buildWebSearchTools(),
    buildFileTools(),
    buildMemoryTools(),
    buildSkillTools(),
    buildWebMonitorTools(),
    buildTerminalTools(),
  ];

  return {
    tools: modules.flatMap((m) => m.tools),
    handlers: Object.assign({}, ...modules.map((m) => m.handlers)),
  };
}