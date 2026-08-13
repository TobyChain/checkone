const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("checkone", {
  platform: process.platform,
  openUrl: (url) => {
    require("electron").shell.openExternal(url);
  },
});