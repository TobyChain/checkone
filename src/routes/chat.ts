import { Router } from "express";
import { runAgentLoop } from "../agent/loop.js";
import { buildToolkit } from "../agent/tools.js";
import { buildSystemPrompt } from "../agent/prompt.js";
import { getOrCreateSession } from "../agent/session.js";
import { sseFrame } from "../events.js";
import { store } from "../store.js";
import { monitorRegistry } from "../monitor/index.js";

const router = Router();

router.post("/chat", async (req, res) => {
  const { messages, sessionId } = (req.body ?? {}) as {
    messages?: { role: string; content: string }[];
    sessionId?: string;
  };

  const userMessages = (messages ?? []).filter(
    (m): m is { role: string; content: string } =>
      (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
  );

  if (!Array.isArray(userMessages) || userMessages.length === 0) {
    res.status(400).json({ error: "缺少消息" });
    return;
  }

  // SSE streaming
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: string, data: unknown) => {
    try { res.write(sseFrame(event, data)); } catch {}
  };

  const sid = sessionId || "default";
  const session = getOrCreateSession(sid);

  // Add the latest user message to session
  const lastUserMsg = userMessages[userMessages.length - 1];
  if (lastUserMsg.role === "user") {
    session.addUserMessage(lastUserMsg.content);
  }

  const { tools, handlers } = buildToolkit();
  const systemPrompt = buildSystemPrompt({
    activeMonitors: monitorRegistry.count(),
    memoryCount: store.memory.length,
  });
  const context = session.buildContext(systemPrompt);

  const aborter = new AbortController();
  // R2: Abort agent loop when client disconnects
  req.on("close", () => aborter.abort());

  try {
    let streamEl: string | null = null;

    const result = await runAgentLoop(context, tools, handlers, {
      signal: aborter.signal,
      onContentDelta: (text) => {
        if (!streamEl) {
          streamEl = text;
        } else {
          streamEl += text;
        }
        send("delta", { text });
      },
      onToolStart: (name, argsSummary) => {
        send("tool_start", { name, args: argsSummary });
      },
      onToolEnd: (name, resultPreview, durationMs) => {
        send("tool_end", { name, result: resultPreview, durationMs });
      },
    });

    // Record tool calls from the final run
    session.addAssistantMessage(result);
    if (streamEl) {
      session.messages[session.messages.length - 1] = {
        ...session.messages[session.messages.length - 1],
        content: streamEl,
      };
    }
    send("message", { text: result });
  } catch (err) {
    send("error", { message: err instanceof Error ? err.message : String(err) });
  }

  res.end();
});

export default router;