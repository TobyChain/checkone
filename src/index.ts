import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config, getLlmConfig, maskApiKey } from "./config.js";
import { store, applySettingsPatch } from "./store.js";
import { addClient, broadcast, sseFrame } from "./events.js";
import chatRouter from "./routes/chat.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// ---- DNS rebinding protection ----
app.use((req, res, next) => {
  const host = (req.headers.host || "").split(":")[0];
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "") return next();
  res.status(403).json({ error: "仅允许本机访问" });
});

app.use(express.json({ limit: "1mb" }));

// ---- static files ----
const publicDir = path.resolve(__dirname, "..", "public");
app.use(express.static(publicDir));
app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

// ---- API: status ----
app.get("/api/status", (_req, res) => {
  res.json({
    app: "checkone",
    name: "壹查",
    llmConfigured: Boolean(getLlmConfig().baseUrl && getLlmConfig().apiKey),
    settings: { ...store.settings, llm: { ...store.settings.llm, apiKey: store.maskApiKey() } },
  });
});

// ---- API: settings ----
app.put("/api/settings", (req, res) => {
  try {
    const updated = applySettingsPatch(req.body ?? {});
    broadcast("settings_updated", {});
    res.json({ ok: true, settings: { ...updated, llm: { ...updated.llm, apiKey: store.maskApiKey() } } });
  } catch (err) {
    res.status(400).json({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- API: screenshot ----
app.post("/api/screenshot", (req, res) => {
  const { execFile } = require("node:child_process");
  const fs = require("node:fs");
  const screenshotDir = path.join(config.dataDir, "screenshots");
  fs.mkdirSync(screenshotDir, { recursive: true });
  const outPath = path.join(screenshotDir, `ss_${Date.now()}.png`);
  execFile("/usr/sbin/screencapture", ["-x", "-T0", outPath], (err: Error | null) => {
    if (err) { res.status(500).json({ ok: false, error: err.message }); return; }
    broadcast("screenshot_taken", { path: outPath });
    res.json({ ok: true, path: outPath });
  });
});

// ---- API: shortcut/url ----
app.post("/api/shortcut/url", (req, res) => {
  const { url } = (req.body ?? {}) as { url?: string };
  if (!url) { res.status(400).json({ ok: false, error: "缺少 url" }); return; }
  broadcast("url_received", { url, ts: Date.now() });
  res.json({ ok: true, url });
});

// ---- API: chat ----
app.use("/api", chatRouter);

// ---- SSE events ----
function sseInit(res: express.Response): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders?.();
  addClient(res);
  // keepalive
  const keepalive = setInterval(() => { try { res.write(": ping\n\n"); } catch { clearInterval(keepalive); } }, 25_000);
  res.on("close", () => clearInterval(keepalive));
}

app.get("/api/events", (req, res) => {
  sseInit(res);
  res.write(sseFrame("hello", { ts: Date.now() }));
});

// ---- start ----
app.listen(config.port, "127.0.0.1", () => {
  console.log(`[checkone] server listening on 127.0.0.1:${config.port}`);
});