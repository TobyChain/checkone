import type { ToolDefinition } from "../agent/llm.js";
import type { ToolHandler } from "../agent/loop.js";
import { skillRegistry } from "../agent/skill-registry.js";

export function buildSkillTools(): { tools: ToolDefinition[]; handlers: Record<string, ToolHandler> } {
  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "list_skills",
        description: "列出所有可用技能及其描述。",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "call_skill",
        description: "调用一个已注册的技能。先用 list_skills 查看可用技能。",
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
      return JSON.stringify({
        ok: true,
        skills: skillRegistry.list().map((s) => ({ name: s.name, description: s.description })),
      });
    },
    call_skill: async (args) => {
      const name = String(args.name);
      let parsed: Record<string, unknown> = {};
      if (typeof args.args === "string" && args.args) {
        try { parsed = JSON.parse(args.args); } catch {}
      } else if (typeof args.args === "object" && args.args) {
        parsed = args.args as Record<string, unknown>;
      }
      return skillRegistry.run(name, parsed);
    },
  };

  return { tools, handlers };
}