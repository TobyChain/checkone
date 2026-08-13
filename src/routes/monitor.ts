import { Router } from "express";
import { monitorRegistry } from "../monitor/index.js";

const router = Router();

router.get("/monitors", (_req, res) => {
  res.json({ monitors: monitorRegistry.list() });
});

router.post("/monitors", (req, res) => {
  const { type, url, command, cwd, label } = (req.body ?? {}) as {
    type?: string;
    url?: string;
    command?: string;
    cwd?: string;
    label?: string;
  };
  if (type === "web" && url) {
    const id = monitorRegistry.createWeb({
      type: "web",
      label: label || url,
      url,
      screenshotIntervalMs: 5000,
    });
    res.json({ ok: true, id });
  } else if (type === "terminal" && command) {
    const id = monitorRegistry.createTerminal({
      type: "terminal",
      label: label || command,
      command,
      cwd: cwd || process.env.HOME || "/",
    });
    res.json({ ok: true, id });
  } else {
    res.status(400).json({ ok: false, error: "type 需为 web(带 url) 或 terminal(带 command)" });
  }
});

router.delete("/monitors/:id", async (req, res) => {
  const ok = await monitorRegistry.remove(req.params.id);
  res.json({ ok });
});

export default router;