import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectWithServices, Service } from "@shared/types";

const frontendStacks = new Set(["react", "vue"]);
const backendStacks = new Set(["flask", "fastapi", "spring-maven", "spring-gradle"]);
const springStacks = new Set(["spring-maven", "spring-gradle"]);

export interface ConfigSyncResult {
  changedFiles: string[];
}

const unique = (values: string[]): string[] => Array.from(new Set(values));

const readText = (filePath: string): string => readFileSync(filePath, "utf8");

const writeIfChanged = (filePath: string, next: string, changedFiles: string[]): void => {
  const current = readText(filePath);
  if (current === next) return;
  writeFileSync(filePath, next, "utf8");
  changedFiles.push(filePath);
};

const existingFiles = (servicePath: string, names: string[]): string[] =>
  names.map((name) => join(servicePath, name)).filter((filePath) => existsSync(filePath) && statSync(filePath).isFile());

const proxyTarget = (port: number): string => `http://localhost:${port}`;
const detectNewline = (content: string): string => (content.includes("\r\n") ? "\r\n" : "\n");

const findMatchingBrace = (content: string, openIndex: number): number => {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return index;
  }

  return -1;
};

const splitLinesWithEndings = (content: string): string[] => {
  const lines = content.match(/.*(?:\r\n|\n|\r|$)/g) ?? [content];
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
};

const braceDeltaForLine = (line: string): number => {
  let delta = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === "/" && next === "/") break;

    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }

    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }

  return delta;
};

const removeDirectViteServerSettings = (body: string): string => {
  let depth = 0;

  return splitLinesWithEndings(body)
    .filter((line) => {
      const isManagedSetting = depth === 0 && /^\s*(?:port|strictPort)\s*:/.test(line);
      depth = Math.max(0, depth + braceDeltaForLine(line));
      return !isManagedSetting;
    })
    .join("");
};

const syncVitePort = (content: string, port: number): string => {
  const newline = detectNewline(content);
  const serverMatch = /\bserver\s*:\s*\{/.exec(content);

  if (!serverMatch) {
    return content.replace(/defineConfig\(\{/, `defineConfig({\n  server: {\n    port: ${port},\n    strictPort: false\n  },`);
  }

  const openIndex = content.indexOf("{", serverMatch.index);
  const closeIndex = findMatchingBrace(content, openIndex);
  if (closeIndex === -1) return content;

  const lineStart = content.lastIndexOf("\n", serverMatch.index) + 1;
  const serverIndent = content.slice(lineStart, serverMatch.index).match(/^\s*/)?.[0] ?? "  ";
  const propertyIndent = `${serverIndent}  `;
  const body = content.slice(openIndex + 1, closeIndex);
  const unmanagedBody = removeDirectViteServerSettings(body);
  const managedSettings = `${newline}${propertyIndent}port: ${port},${newline}${propertyIndent}strictPort: false,`;
  const needsSeparator = unmanagedBody.length > 0 && !unmanagedBody.startsWith("\n") && !unmanagedBody.startsWith("\r");
  const nextBody = `${managedSettings}${needsSeparator ? newline : ""}${unmanagedBody}`;

  return `${content.slice(0, openIndex + 1)}${nextBody}${content.slice(closeIndex)}`;
};

const syncViteProxyTarget = (content: string, backendPort: number): string =>
  content.replace(/(\btarget\s*:\s*['"])http:\/\/(?:localhost|127\.0\.0\.1):\d+(['"])/g, `$1${proxyTarget(backendPort)}$2`);

const syncLocalApiUrls = (content: string, backendPort: number): string =>
  content
    .replace(/(https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]):)\d+(\/api\/v1)/g, `$1${backendPort}$2`)
    .replace(
      /(\$\{(?:window\.location\.)?protocol\}\/\/\$\{(?:window\.location\.)?hostname\}:)\d+(\/api\/v1)/g,
      `$1${backendPort}$2`
    );

const syncPropertiesPort = (content: string, port: number): string => {
  const newline = detectNewline(content);
  const lines = content.split(/\r\n|\n|\r/);
  const firstPortIndex = lines.findIndex((line) => /^\s*server\.port\s*=/.test(line));

  if (firstPortIndex !== -1) {
    const unmanagedLines = lines.filter((line) => !/^\s*server\.port\s*=/.test(line));
    unmanagedLines.splice(Math.min(firstPortIndex, unmanagedLines.length), 0, `server.port=${port}`);
    return unmanagedLines.join(newline);
  }

  return `${content.replace(/\s*$/, "")}${newline}server.port=${port}${newline}`;
};

const syncYamlPort = (content: string, port: number): string => {
  const newline = detectNewline(content);
  const lines = content.split(/\r\n|\n|\r/);
  const output: string[] = [];
  const serverChildren: string[] = [];
  let insertIndex: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (!/^server:\s*(?:#.*)?$/.test(line)) {
      output.push(line);
      continue;
    }

    if (insertIndex === null) insertIndex = output.length;

    index += 1;
    while (index < lines.length) {
      const childLine = lines[index];
      const isTopLevelContent = childLine.trim().length > 0 && !/^[ \t]/.test(childLine);
      if (isTopLevelContent) {
        index -= 1;
        break;
      }

      if (!/^[ \t]+port\s*:/.test(childLine)) {
        serverChildren.push(childLine);
      }
      index += 1;
    }
  }

  if (insertIndex === null) {
    return `${content.replace(/\s*$/, "")}${newline}server:${newline}  port: ${port}${newline}`;
  }

  output.splice(insertIndex, 0, "server:", `  port: ${port}`, ...serverChildren);
  return output.join(newline);
};

const syncSpringConfig = (service: Service, changedFiles: string[]): void => {
  if (!service.port || !springStacks.has(service.stack)) return;

  const resources = join(service.servicePath, "src", "main", "resources");
  if (!existsSync(resources)) return;

  const configs = readdirSync(resources)
    .filter((name) => /^application(?:[-.][\w-]+)?\.(?:properties|ya?ml)$/i.test(name))
    .map((name) => join(resources, name));

  configs.forEach((filePath) => {
    const current = readText(filePath);
    const next = filePath.endsWith(".properties")
      ? syncPropertiesPort(current, service.port!)
      : syncYamlPort(current, service.port!);
    writeIfChanged(filePath, next, changedFiles);
  });
};

const syncFrontendConfig = (service: Service, backend: Service | null, changedFiles: string[]): void => {
  if (!frontendStacks.has(service.stack)) return;

  existingFiles(service.servicePath, ["vite.config.ts", "vite.config.js", "vite.config.mjs", "vite.config.cjs"]).forEach((filePath) => {
    let next = readText(filePath);
    if (service.port) next = syncVitePort(next, service.port);
    if (backend?.port) next = syncViteProxyTarget(next, backend.port);
    writeIfChanged(filePath, next, changedFiles);
  });

  if (!backend?.port) return;

  existingFiles(service.servicePath, [
    "app.js",
    "src/services/http.ts",
    "src/services/http.js",
    "src/utils/request.ts",
    "src/utils/request.js",
    "src/api/request.ts",
    "src/api/request.js"
  ]).forEach((filePath) => {
    writeIfChanged(filePath, syncLocalApiUrls(readText(filePath), backend.port!), changedFiles);
  });
};

const findBackendForFrontend = (frontend: Service, projects: ProjectWithServices[]): Service | null => {
  const allServices = projects.flatMap((project) => project.services);
  if (frontend.backendServiceId) {
    return allServices.find((service) => service.id === frontend.backendServiceId && backendStacks.has(service.stack)) ?? null;
  }

  const projectBackends = allServices.filter(
    (service) => service.projectId === frontend.projectId && service.id !== frontend.id && backendStacks.has(service.stack)
  );
  return projectBackends.length === 1 ? projectBackends[0] : null;
};

export const syncConfigsForService = (service: Service, projects: ProjectWithServices[]): ConfigSyncResult => {
  const changedFiles: string[] = [];
  syncSpringConfig(service, changedFiles);
  syncFrontendConfig(service, findBackendForFrontend(service, projects), changedFiles);

  if (backendStacks.has(service.stack)) {
    projects
      .flatMap((project) => project.services)
      .filter((candidate) => frontendStacks.has(candidate.stack))
      .filter((frontend) => frontend.backendServiceId === service.id || findBackendForFrontend(frontend, projects)?.id === service.id)
      .forEach((frontend) => syncFrontendConfig(frontend, service, changedFiles));
  }

  return { changedFiles: unique(changedFiles) };
};

export const syncConfigsForProject = (project: ProjectWithServices, projects: ProjectWithServices[]): ConfigSyncResult => {
  const changedFiles = project.services.flatMap((service) => syncConfigsForService(service, projects).changedFiles);
  return { changedFiles: unique(changedFiles) };
};
