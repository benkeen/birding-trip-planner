"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("electron", {
  ipcRenderer: {
    invoke: (channel, ...args) => electron.ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => electron.ipcRenderer.send(channel, ...args),
    on: (channel, func) => {
      electron.ipcRenderer.on(channel, (event, ...args) => func(...args));
    }
  }
});
