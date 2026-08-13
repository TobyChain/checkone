import type { ChatMessage } from "./llm.js";
import { trimToTokenBudget, sanitizeToolMessages } from "./context-manager.js";

const MAX_SESSION_MESSAGES = 100;

export class Session {
  id: string;
  messages: ChatMessage[] = [];
  createdAt: number;

  constructor(id: string) {
    this.id = id;
    this.createdAt = Date.now();
  }

  addUserMessage(content: string): void {
    this.messages.push({ role: "user", content });
    if (this.messages.length > MAX_SESSION_MESSAGES) {
      this.messages = this.messages.slice(-MAX_SESSION_MESSAGES);
    }
  }

  addAssistantMessage(content: string, toolCalls?: ChatMessage["tool_calls"]): void {
    this.messages.push({
      role: "assistant",
      content: content || null,
      tool_calls: toolCalls,
    });
  }

  addToolResult(toolCallId: string, content: string): void {
    this.messages.push({
      role: "tool",
      content,
      tool_call_id: toolCallId,
    });
  }

  /** Build the context for LLM: system prompt + trimmed history */
  buildContext(systemPrompt: string): ChatMessage[] {
    const history = sanitizeToolMessages(this.messages);
    const trimmed = trimToTokenBudget(history);
    return [{ role: "system", content: systemPrompt }, ...trimmed];
  }
}

// In-memory session store (Phase 4 will persist to PGlite)
const sessions = new Map<string, Session>();
const MAX_SESSIONS = 20;

export function getOrCreateSession(id: string): Session {
  let session = sessions.get(id);
  if (!session) {
    session = new Session(id);
    sessions.set(id, session);
    // R6: Evict oldest session if over limit
    if (sessions.size > MAX_SESSIONS) {
      const oldest = [...sessions.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt)[0];
      if (oldest) sessions.delete(oldest[0]);
    }
  }
  return session;
}

export function listSessions(): Session[] {
  return [...sessions.values()].sort((a, b) => b.createdAt - a.createdAt);
}