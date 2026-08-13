const { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, utilityProcess, Notification } = require("electron");
const path = require("node:path");
const fs   = require("node:fs");
const net  = require("node:net");
const http = require("node:http");

// Auto-update via GitHub Releases (electron-updater). Only active in packaged builds.
let autoUpdater = null;
if (app.isPackaged) {
  try {
    autoUpdater = require("electron-updater").autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch (e) {
    console.error("[updater] electron-updater unavailable:", e);
    autoUpdater = null;
  }
}

const ROOT = path.join(__dirname, "..");
const isDev = !app.isPackaged;

// Packaged apps have no visible stdout.
const LOG_PATH = path.join(app.getPath("userData"), "main.log");
const TRACE = "/tmp/checkone-trace.log";
function trace(msg) {
  try { fs.appendFileSync(TRACE, `${new Date().toISOString()} ${msg}\n`); } catch {}
}
trace("main.cjs loaded");
function logMain(msg) {
  try { fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${msg}\n`); } catch {}
  trace(msg);
}

let serverProc = null;
let mainWin    = null;
let tray       = null;
let serverPort = 0;
let isQuitting = false;

// ---- single instance ----
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  app.on("second-instance", () => {
    if (!mainWin) createMainWindow();
    else { mainWin.show(); mainWin.focus(); }
  });
}

// ---- port ----
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const probe = () => {
      const req = http.get({ host: "127.0.0.1", port, path: "/api/status", timeout: 1500 }, (res) => {
        res.destroy();
        if (res.statusCode === 200) resolve();
        else retry();
      });
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error("Express 子进程启动超时"));
      else setTimeout(probe, 300);
    };
    probe();
  });
}

// ---- server ----
function startServer(port) {
  const entry = path.join(ROOT, "dist", "index.js");
  trace(`startServer: entry=${entry} exists=${fs.existsSync(entry)}`);
  serverProc = utilityProcess.fork(entry, [], {
    stdio: "pipe",
    env: {
      ...process.env,
      PORT: String(port),
      CHECKONE_DATA_DIR: path.join(app.getPath("userData"), "data"),
    },
  });
  serverProc.stdout?.on("data", (d) => process.stdout.write(`[server] ${d}`));
  serverProc.stderr?.on("data", (d) => process.stderr.write(`[server] ${d}`));
}

// ---- windows ----
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1080, height: 720,
    minWidth: 720, minHeight: 500,
    title: "壹查 CheckOne",
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: "#f5f5f7",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });
  mainWin.loadURL(`http://127.0.0.1:${serverPort}/?shell=electron`);
  mainWin.once("ready-to-show", () => mainWin.show());
  mainWin.on("close", (e) => {
    if (!isQuitting) { e.preventDefault(); mainWin.hide(); }
  });
  mainWin.on("closed", () => { mainWin = null; });
}

function showMainWindow(tab) {
  if (!mainWin) createMainWindow();
  else { mainWin.show(); mainWin.focus(); }
  if (tab && mainWin) {
    mainWin.webContents.send("switch-tab", tab);
  }
}

// ---- tray ----
function createTray() {
  const iconPath = path.join(__dirname, "TrayTemplate.png");
  let img = nativeImage.createEmpty();
  try { img = nativeImage.createFromPath(iconPath); } catch {}
  if (!img.isEmpty()) img.setTemplateImage(true);
  tray = new Tray(img);
  tray.setToolTip("壹查 CheckOne");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开仪表盘", click: () => showMainWindow() },
    { type: "separator" },
    { label: "新建监控...", click: () => { showMainWindow(); } },
    { label: "截图", click: () => triggerScreenshot() },
    { type: "separator" },
    { label: "唤起 Asha", click: () => showMainWindow("chat") },
    { type: "separator" },
    { role: "quit", label: "退出" },
  ]));
}

function triggerScreenshot() {
  // Send request to server to take screenshot
  const req = http.request(
    { host: "127.0.0.1", port: serverPort, path: "/api/screenshot", method: "POST", headers: { "Content-Type": "application/json" } },
    (res) => res.resume()
  );
  req.on("error", () => {});
  req.end(JSON.stringify({ type: "full" }));
  if (Notification.isSupported()) {
    const n = new Notification({ title: "壹查", body: "截图已保存" });
    n.show();
  }
}

// ---- shortcuts ----
function registerShortcuts() {
  globalShortcut.register("Command+Shift+A", () => {
    showMainWindow("chat");
  });
  globalShortcut.register("Command+Shift+C", () => {
    captureBrowserUrl();
  });
}

function captureBrowserUrl() {
  const { exec } = require("node:child_process");
  const applescript = `tell application "System Events"
  set frontApp to name of first application process whose frontmost is true
end tell
if frontApp is "Google Chrome" then
  tell application "Google Chrome" to return URL of active tab of front window
else if frontApp is "Safari" then
  tell application "Safari" to return URL of current tab of front window
else if frontApp is "Microsoft Edge" then
  tell application "Microsoft Edge" to return URL of active tab of front window
else
  return ""
end if`;
  exec(`osascript -e '${applescript.replace(/'/g, "'\\''")}'`, (err, stdout) => {
    const url = (stdout || "").trim();
    if (!url) return;
    const body = JSON.stringify({ url });
    const req = http.request(
      { host: "127.0.0.1", port: serverPort, path: "/api/shortcut/url", method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) } },
      (res) => res.resume()
    );
    req.on("error", () => {});
    req.end(body);
    showMainWindow("chat");
  });
}

// ---- SSE subscription (dashboard updates) ----
function subscribeEvents() {
  logMain("subscribeEvents: connecting");
  const req = http.get({ host: "127.0.0.1", port: serverPort, path: "/api/events" }, (res) => {
    logMain(`subscribeEvents: connected status=${res.statusCode}`);
    // R10: Drain the response stream to prevent buffer leak
    res.on("data", () => {});
    res.on("end", () => { logMain("subscribeEvents: stream ended, reconnecting"); setTimeout(subscribeEvents, 3000); });
    res.on("error", (e) => { logMain(`subscribeEvents: error ${e.message}`); setTimeout(subscribeEvents, 3000); });
  });
  req.on("error", (e) => { logMain(`subscribeEvents: request error ${e.message}`); setTimeout(subscribeEvents, 3000); });
}

// ---- auto-update ----
function initAutoUpdate() {
  if (!autoUpdater) return;
  autoUpdater.on("update-available", (info) => logMain(`[updater] update available: ${info.version}`));
  autoUpdater.on("update-downloaded", (info) => {
    logMain(`[updater] downloaded ${info.version}, will install on quit`);
    if (Notification.isSupported()) {
      const n = new Notification({ title: "壹查", body: `v${info.version} 已下载，退出后自动安装` });
      n.show();
    }
  });
  autoUpdater.on("error", (err) => logMain(`[updater] error: ${err?.message || err}`));
  setTimeout(() => autoUpdater.checkForUpdates().catch((e) => logMain(`[updater] check failed: ${e?.message || e}`)), 8000);
}

// ---- lifecycle ----
app.whenReady().then(async () => {
  if (process.platform === "darwin") app.setActivationPolicy("accessory");
  logMain(`app ready: packaged=${app.isPackaged} version=${app.getVersion()}`);
  serverPort = process.env.CHECKONE_PORT ? Number(process.env.CHECKONE_PORT) : await getFreePort();
  logMain(`server port: ${serverPort}`);
  startServer(serverPort);
  try { await waitForServer(serverPort); } catch (err) { console.error(err); }
  createTray();
  createMainWindow();
  registerShortcuts();
  subscribeEvents();
  initAutoUpdate();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else if (mainWin && !mainWin.isVisible()) mainWin.show();
  });
});

function shutdown() {
  if (serverProc) { try { serverProc.kill(); } catch {}; serverProc = null; }
}
app.on("before-quit", () => { isQuitting = true; shutdown(); });
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") { shutdown(); app.quit(); }
});
process.on("exit", shutdown);