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
  backendServiceId: null,
  note: "",
  environment: "",
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

  it("passes FastAPI ports through uvicorn commands", () => {
    const launch = resolveLaunchCommand(
      service({ stack: "fastapi", command: "uvicorn main:app --reload --port 8000", port: 9001 })
    );

    expect(launch.command).toBe("uvicorn main:app --reload --port 9001");
  });

  it("passes Spring Boot Maven ports as command line arguments", () => {
    const launch = resolveLaunchCommand(
      service({ stack: "spring-maven", command: "mvn spring-boot:run", port: 9090 })
    );

    expect(launch.command).toBe("mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=9090");
    expect(launch.env.SERVER_PORT).toBe("9090");
  });

  it("replaces existing Spring Boot port arguments", () => {
    const launch = resolveLaunchCommand(
      service({ stack: "spring-maven", command: "mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8080", port: 9090 })
    );

    expect(launch.command).toBe("mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=9090");
  });

  it("merges service environment variables without leaking into the command", () => {
    const launch = resolveLaunchCommand(
      service({
        stack: "spring-maven",
        command: "mvn spring-boot:run",
        port: 8082,
        environment: [
          "TOKEN_SECRET=local-secret",
          "CRYPTO_SECRET=crypto-secret",
          "PATH=D:\\apache-maven-3.9.8\\bin;%PATH%"
        ].join("\n")
      }),
      { PATH: "C:\\Windows\\System32" }
    );

    expect(launch.command).toBe("mvn spring-boot:run -Dspring-boot.run.arguments=--server.port=8082");
    expect(launch.command).not.toContain("TOKEN_SECRET");
    expect(launch.env.TOKEN_SECRET).toBe("local-secret");
    expect(launch.env.CRYPTO_SECRET).toBe("crypto-secret");
    expect(launch.env.PATH).toBe("D:\\apache-maven-3.9.8\\bin;C:\\Windows\\System32");
  });

  it("keeps the configured service port authoritative over custom environment text", () => {
    const launch = resolveLaunchCommand(
      service({
        stack: "spring-maven",
        command: "mvn spring-boot:run",
        port: 9090,
        environment: "SERVER_PORT=7777"
      })
    );

    expect(launch.env.SERVER_PORT).toBe("9090");
  });

  it("updates existing Windows Path key without creating a duplicate PATH key", () => {
    const launch = resolveLaunchCommand(
      service({
        environment: "PATH=D:\\tools;%PATH%"
      }),
      { Path: "C:\\Windows" }
    );

    expect(launch.env.Path).toBe("D:\\tools;C:\\Windows");
    expect(launch.env.PATH).toBeUndefined();
  });
});
