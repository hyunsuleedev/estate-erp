const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

app.commandLine.appendSwitch("remote-debugging-port", "9334");
const previewUserDataPath = path.join(
  app.getPath("temp"),
  "estate-erp-property-filter-layouts",
);
fs.mkdirSync(previewUserDataPath, { recursive: true });
app.setPath("userData", previewUserDataPath);

let previewWindow = null;

app.whenReady().then(() => {
  previewWindow = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#ffffff",
    title: "Estate ERP — 매물 필터 데모",
  });

  previewWindow.on("closed", () => {
    previewWindow = null;
  });

  void previewWindow.loadURL("http://127.0.0.1:4174/");
});

app.on("window-all-closed", () => {
  app.quit();
});
