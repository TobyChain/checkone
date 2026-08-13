import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";

export function buildSkillTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "list_skills",
        description: "列出所有可用技能。",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "call_skill",
        description: "调用一个已注册的技能。",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "技能名称" },
            args: { type: "string", description: "技能参数（JSON 字符串）" },
          },
          required: ["name"],
        },
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    list_skills: async () => {
      // Placeholder — skills will be registered in Phase 4
      return JSON.stringify({ ok: true, skills: ["暂无已注册技能"] });
    },
    call_skill: async (args) => {
      const name = String(args.name);
      return JSON.stringify({ ok: false, error: `技能 "${name}" 未注册（Phase 4 将实现技能系统）` });
    },
  };

  return { tools, handlers };
}