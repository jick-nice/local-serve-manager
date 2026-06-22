import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { DependencyCheck, ServiceDraft, StackDetectionResult } from "@shared/types";

const candidateDirs = ["", "frontend", "web", "client", "admin", "backend", "server", "api"];

const read = (path: string): string => readFileSync(path, "utf8");
const exists = (dir: string, file: string): boolean => existsSync(join(dir, file));
const readIfExists = (dir: string, file: string): string => (exists(dir, file) ? read(join(dir, file)) : "");
const isDir = (path: string): boolean => existsSync(path) && statSync(path).isDirectory();

const packageManager = (dir: string): "pnpm" | "yarn" | "bun" | "npm" => {
  if (exists(dir, "pnpm-lock.yaml")) return "pnpm";
  if (exists(dir, "yarn.lock")) return "yarn";
  if (exists(dir, "bun.lockb")) return "bun";
  return "npm";
};

const runScript = (dir: string, scripts: Record<string, string> = {}): string => {
  const script = ["dev", "start", "serve"].find((name) => scripts[name]);
  if (!script) return "";
  const manager = packageManager(dir);
  if (manager === "npm") return `npm run ${script}`;
  if (manager === "yarn") return `yarn ${script}`;
  if (manager === "pnpm") return `pnpm ${script}`;
  return `bun run ${script}`;
};

export const detectStack = (dir: string): StackDetectionResult => {
  if (exists(dir, "package.json")) {
    const pkg = JSON.parse(read(join(dir, "package.json")));
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const command = runScript(dir, pkg.scripts ?? {});
    if (deps.react || deps.next) return { stack: "react", command, port: 5173, confidence: "high", evidence: ["package.json", "react"] };
    if (deps.vue) return { stack: "vue", command, port: 5173, confidence: "high", evidence: ["package.json", "vue"] };
  }

  if (exists(dir, "pubspec.yaml")) {
    return { stack: "flutter", command: "flutter run -d windows", port: null, confidence: "high", evidence: ["pubspec.yaml"] };
  }

  const pythonHints = [
    readIfExists(dir, "requirements.txt"),
    readIfExists(dir, "pyproject.toml"),
    readIfExists(dir, "main.py"),
    readIfExists(dir, "app.py")
  ]
    .join("\n")
    .toLowerCase();

  if (pythonHints.includes("fastapi") || pythonHints.includes("uvicorn")) {
    return { stack: "fastapi", command: "uvicorn main:app --reload --port 8000", port: 8000, confidence: "medium", evidence: ["fastapi/uvicorn"] };
  }
  if (pythonHints.includes("flask")) {
    return { stack: "flask", command: "flask --app app run --port 5000", port: 5000, confidence: "medium", evidence: ["flask"] };
  }
  if (exists(dir, "pom.xml")) {
    return { stack: "spring-maven", command: "mvn spring-boot:run", port: 8080, confidence: "medium", evidence: ["pom.xml"] };
  }
  if (exists(dir, "build.gradle") || exists(dir, "build.gradle.kts")) {
    return {
      stack: "spring-gradle",
      command: exists(dir, "gradlew.bat") || exists(dir, "gradlew") ? "gradlew bootRun" : "gradle bootRun",
      port: 8080,
      confidence: "medium",
      evidence: ["gradle"]
    };
  }

  return { stack: "custom", command: "", port: null, confidence: "low", evidence: [] };
};

export const detectService = (servicePath: string): ServiceDraft => {
  const detection = detectStack(servicePath);
  return {
    name: basename(servicePath),
    servicePath,
    stack: detection.stack,
    command: detection.command,
    port: detection.port,
    note: detection.evidence.join(", ")
  };
};

export const scanProject = (rootPath: string): ServiceDraft[] => {
  const paths = new Set<string>();
  for (const name of candidateDirs) {
    const path = name ? join(rootPath, name) : rootPath;
    if (isDir(path)) paths.add(path);
  }

  for (const item of readdirSync(rootPath, { withFileTypes: true })) {
    if (item.isDirectory() && !item.name.startsWith(".") && paths.size < 16) {
      paths.add(join(rootPath, item.name));
    }
  }

  const drafts = Array.from(paths)
    .map(detectService)
    .filter((draft) => draft.stack !== "custom" || draft.command);
  return drafts.length > 0 ? drafts : [detectService(rootPath)];
};

export const checkDependencies = (service: ServiceDraft): DependencyCheck => {
  if ((service.stack === "react" || service.stack === "vue") && exists(service.servicePath, "package.json") && !exists(service.servicePath, "node_modules")) {
    const manager = packageManager(service.servicePath);
    const command = manager === "npm" ? "npm install" : `${manager} install`;
    return { missing: true, message: "未检测到 node_modules，建议先安装 Node 依赖。", installCommand: command };
  }

  if ((service.stack === "flask" || service.stack === "fastapi") && (exists(service.servicePath, "requirements.txt") || exists(service.servicePath, "pyproject.toml")) && !exists(service.servicePath, ".venv")) {
    const command = exists(service.servicePath, "requirements.txt")
      ? "python -m venv .venv && .venv\\Scripts\\python -m pip install -r requirements.txt"
      : "python -m venv .venv && .venv\\Scripts\\python -m pip install .";
    return { missing: true, message: "未检测到 .venv，建议先创建虚拟环境并安装 Python 依赖。", installCommand: command };
  }

  return { missing: false, message: "依赖检查通过。", installCommand: null };
};
