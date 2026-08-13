const { contextBridge, shell, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("checkone", {
  platform: process.platform,
  openUrl: (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        shell.openExternal(url);
      }
    } catch {}
  },
  onSwitchTab: (callback) => ipcRenderer.on("switch-tab", (_e, tab) => callback(tab)),
});