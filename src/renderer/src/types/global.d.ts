import type { ServeManagerApi } from "@shared/types";

declare global {
  interface Window {
    serveManager: ServeManagerApi;
  }
}

export {};
