import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { syncConfigsForService } from "../../src/main/configSync";
import type { ProjectWithServices, Service } from "../../src/shared/types";

let root = "";

beforeEach(() => {
  root = join(tmpdir(), `serve-manager-config-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(root, { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const service = (input: Partial<Service>): Service => ({
  id: 1,
  projectId: 1,
  name: "service",
  servicePath: root,
  stack: "vue",
  command: "npm run dev",
  port: 5179,
  backendServiceId: null,
  note: "",
  environment: "",
  sortOrder: 0,
  lastStatus: "stopped",
  createdAt: "",
  updatedAt: "",
  ...input
});

const project = (services: Service[]): ProjectWithServices => ({
  id: 1,
  name: "project",
  rootPath: root,
  createdAt: "",
  updatedAt: "",
  services
});

describe("syncConfigsForService", () => {
  it("writes frontend Vite port and proxy target", () => {
    const frontend = service({ id: 1, stack: "vue", port: 5301, backendServiceId: 2 });
    const backend = service({ id: 2, stack: "spring-maven", port: 9091, servicePath: join(root, "backend") });
    writeFileSync(
      join(root, "vite.config.ts"),
      "export default defineConfig({\n  server: {\n    proxy: {\n      '/api': { target: 'http://localhost:8080' }\n    }\n  }\n});\n"
    );

    syncConfigsForService(frontend, [project([frontend, backend])]);

    const config = readFileSync(join(root, "vite.config.ts"), "utf8");
    expect(config).toContain("port: 5301");
    expect(config).toContain("target: 'http://localhost:9091'");
  });

  it("rewrites static frontend api base urls", () => {
    const frontend = service({ id: 1, stack: "vue", backendServiceId: 2 });
    const backend = service({ id: 2, stack: "spring-maven", port: 9092, servicePath: join(root, "backend") });
    writeFileSync(join(root, "app.js"), 'return isLocal ? "http://localhost:8088/api/v1" : "/api/v1";\n');

    syncConfigsForService(frontend, [project([frontend, backend])]);

    expect(readFileSync(join(root, "app.js"), "utf8")).toContain("http://localhost:9092/api/v1");
  });

  it("rewrites bound frontend computed api urls when backend port changes", () => {
    const frontend = service({ id: 1, stack: "vue", backendServiceId: 2 });
    const backend = service({ id: 2, stack: "spring-maven", port: 9095, servicePath: join(root, "backend") });
    const services = join(root, "src", "services");
    mkdirSync(services, { recursive: true });
    writeFileSync(
      join(services, "http.ts"),
      'const { protocol, hostname } = window.location;\n' +
        'export const apiBase = `${protocol}//${hostname}:8082/api/v1`;\n' +
        'export const fileBase = "http://localhost:8082/api/v1";\n' +
        'export const ipv6Base = "http://[::1]:8082/api/v1";\n'
    );

    syncConfigsForService(backend, [project([frontend, backend])]);

    const http = readFileSync(join(services, "http.ts"), "utf8");
    expect(http).toContain("`${protocol}//${hostname}:9095/api/v1`");
    expect(http).toContain("http://localhost:9095/api/v1");
    expect(http).toContain("http://[::1]:9095/api/v1");
    expect(http).not.toContain(":8082/api/v1");
  });

  it("writes Spring Boot application.yml ports", () => {
    const resources = join(root, "src", "main", "resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "application.yml"), "spring:\n  application:\n    name: demo\nserver:\n  port: 8080\n");
    const backend = service({ stack: "spring-maven", port: 9093 });

    syncConfigsForService(backend, [project([backend])]);

    expect(readFileSync(join(resources, "application.yml"), "utf8")).toContain("port: 9093");
  });

  it("deduplicates Vite server port settings across repeated syncs", () => {
    const frontend = service({ stack: "vue", port: 5173 });
    writeFileSync(
      join(root, "vite.config.ts"),
      "export default defineConfig({\n  server: {\n    port: 5173,\n    strictPort: false,\n    port: 5173,\n    strictPort: false\n  }\n});\n"
    );

    syncConfigsForService(frontend, [project([frontend])]);
    syncConfigsForService(frontend, [project([frontend])]);

    const config = readFileSync(join(root, "vite.config.ts"), "utf8");
    expect(config.match(/\bport\s*:\s*5173/g) ?? []).toHaveLength(1);
    expect(config.match(/\bstrictPort\s*:\s*false/g) ?? []).toHaveLength(1);
  });

  it("deduplicates Spring Boot yaml ports across repeated syncs", () => {
    const resources = join(root, "src", "main", "resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(
      join(resources, "application.yml"),
      "spring:\n  application:\n    name: demo\nserver:\n  port: 8080\n  servlet:\n    context-path: /api\nserver:\n  port: 8081\n"
    );
    const backend = service({ stack: "spring-maven", port: 9093 });

    syncConfigsForService(backend, [project([backend])]);
    syncConfigsForService(backend, [project([backend])]);

    const config = readFileSync(join(resources, "application.yml"), "utf8");
    expect(config.match(/^server:\s*$/gm) ?? []).toHaveLength(1);
    expect(config.match(/^\s+port:\s*9093\s*$/gm) ?? []).toHaveLength(1);
    expect(config).toContain("context-path: /api");
  });

  it("writes Spring Boot application.properties ports", () => {
    const resources = join(root, "src", "main", "resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "application.properties"), "spring.application.name=demo\nserver.port=8080\n");
    const backend = service({ stack: "spring-maven", port: 9094 });

    syncConfigsForService(backend, [project([backend])]);

    expect(readFileSync(join(resources, "application.properties"), "utf8")).toContain("server.port=9094");
  });

  it("deduplicates Spring Boot properties ports across repeated syncs", () => {
    const resources = join(root, "src", "main", "resources");
    mkdirSync(resources, { recursive: true });
    writeFileSync(join(resources, "application.properties"), "spring.application.name=demo\nserver.port=8080\nserver.port=8081\n");
    const backend = service({ stack: "spring-maven", port: 9094 });

    syncConfigsForService(backend, [project([backend])]);
    syncConfigsForService(backend, [project([backend])]);

    const lines = readFileSync(join(resources, "application.properties"), "utf8")
      .split(/\r?\n/)
      .filter((line) => /^server\.port\s*=/.test(line));
    expect(lines).toEqual(["server.port=9094"]);
  });
});
