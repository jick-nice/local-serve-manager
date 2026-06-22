import { app, BrowserWindow, session } from "electron";
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

const createContentSecurityPolicy = (allowDevServer: boolean): string => {
  return [
    "default-src 'self'",
    allowDevServer ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    allowDevServer
      ? "connect-src 'self' ws://localhost:* http://localhost:* ws://127.0.0.1:* http://127.0.0.1:*"
      : "connect-src 'self'"
  ].join("; ");
};

const registerContentSecurityPolicy = (allowDevServer: boolean): void => {
  const contentSecurityPolicy = createContentSecurityPolicy(allowDevServer);

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...(details.responseHeaders ?? {}),
        "Content-Security-Policy": [contentSecurityPolicy]
      }
    });
  });
};

const createWindow = (trustedDevUrl?: string): void => {
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

  if (trustedDevUrl) {
    void window.loadURL(trustedDevUrl);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
};

app.whenReady().then(() => {
  const trustedDevUrl = isTrustedDevUrl(process.env.ELECTRON_RENDERER_URL)
    ? process.env.ELECTRON_RENDERER_URL
    : undefined;

  registerContentSecurityPolicy(Boolean(trustedDevUrl));
  createWindow(trustedDevUrl);
});

app.on("window-all-closed", () => {
  app.quit();
});
