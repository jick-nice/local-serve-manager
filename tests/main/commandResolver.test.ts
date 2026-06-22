import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveLaunchCommand } from "../../src/main/commandResolver";
import type { Service } from "../../src/shared/types";

let root = "";

beforeEach(() => {
  root = join(tmpdir(), `serve-manager-command-${Date.now()}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const service = (input: Partial<Service>): Service => ({
  id: 1,
  projectId: 1,
  name: "web",
  servicePath: root,
  stack: "react",
  command: "npm run dev",
  port: 3007,
  note: "",
  sortOrder: 0,
  lastStatus: "stopped",
  createdAt: "",
  updatedAt: "",
  ...input
});

describe("resolveLaunchCommand", () => {
  it("passes Vite ports through npm run", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { dev: "vite" } }));
    const launch = resolveLaunchCommand(service({ command: "npm run dev" }));

    expect(launch.command).toBe("npm run dev -- --host 127.0.0.1 --port 3007");
    expect(launch.env.PORT).toBe("3007");
    expect(launch.env.NODE_ENV).toBe("development");
  });

  it("does not append Vite args to react-scripts because it uses PORT env", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { start: "react-scripts start" } }));
    const launch = resolveLaunchCommand(service({ command: "npm run start" }));

    expect(launch.command).toBe("npm run start");
    expect(launch.env.PORT).toBe("3007");
  });

  it("uses Next.js port flag without Vite host flag", () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { dev: "next dev" } }));
    const launch = resolveLaunchCommand(service({ command: "pnpm dev" }));

    expect(launch.command).toBe("pnpm dev --port 3007");
  });

  it("does not rewrite backend commands", () => {
    const launch = resolveLaunchCommand(
      service({ stack: "fastapi", command: "uvicorn main:app --reload --port 8000", port: 8000 })
    );

    expect(launch.command).toBe("uvicorn main:app --reload --port 8000");
  });
});
