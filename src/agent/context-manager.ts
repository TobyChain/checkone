import type { ChatMessage } from "./llm.js";

const ESTIMATED_CONTEXT_WINDOW = 128_000;
const RESERVED_OUTPUT_TOKENS = 4_000;
const SYSTEM_PROMPT_BUDGET = 6_000;
const TOKEN_BUDGET = ESTIMATED_CONTEXT_WINDOW - RESERVED_OUTPUT_TOKENS - SYSTEM_PROMPT_BUDGET;
const PROTECTION_ZONE = 8;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function trimToTokenBudget(messages: ChatMessage[]): ChatMessage[] {
  const protected_ = messages.slice(-PROTECTION_ZONE);
  const rest = messages.slice(0, -PROTECTION_ZONE);

  let totalTokens = 0;
  for (const m of messages) {
    totalTokens += estimateTokens(m.content ?? "");
  }

  while (rest.length > 0 && totalTokens > TOKEN_BUDGET) {
    const removed = rest.shift()!;
    totalTokens -= estimateTokens(removed.content ?? "");
    // Also remove orphaned tool messages that follow
    if (removed.role === "assistant" && removed.tool_calls) {
      for (const call of removed.tool_calls) {
        const toolIdx = rest.findIndex((m) => m.role === "tool" && m.tool_call_id === call.id);
        if (toolIdx >= 0) {
          const removedTool = rest.splice(toolIdx, 1)[0];
          totalTokens -= estimateTokens(removedTool.content ?? "");
        }
      }
    }
  }

  return [...rest, ...protected_];
}

export function sanitizeToolMessages(messages: ChatMessage[]): ChatMessage[] {
  const validToolCallIds = new Set<string>();
  for (const m of messages) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const call of m.tool_calls) {
        validToolCallIds.add(call.id);
      }
    }
  }
  return messages.filter((m) => {
    if (m.role === "tool") {
      return m.tool_call_id && validToolCallIds.has(m.tool_call_id);
    }
    return true;
  });
}