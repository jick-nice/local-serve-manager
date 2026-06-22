import { app, BrowserWindow } from "electron";
import { join } from "node:path";

const isTrustedDevUrl = (rawUrl: string | undefined): rawUrl is string => {
  if (app.isPackaged || !rawUrl) {
    return false;
  }

  try {
    const url = new URL(rawUrl);
    return url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
};

const createWindow = (): void => {
  const window = new BrowserWindow({
    width: 1220,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  window.once("ready-to-show", () => window.show());

  if (isTrustedDevUrl(process.env.ELECTRON_RENDERER_URL)) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});
