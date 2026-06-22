import type { ServiceStack } from "./types";

export const STACK_LABELS: Record<ServiceStack, string> = {
  react: "React",
  vue: "Vue",
  flutter: "Flutter",
  flask: "Flask",
  fastapi: "FastAPI",
  "spring-maven": "Spring Boot Maven",
  "spring-gradle": "Spring Boot Gradle",
  custom: "Custom"
};

export const DEFAULT_PORTS: Record<ServiceStack, number | null> = {
  react: 5173,
  vue: 5173,
  flutter: null,
  flask: 5000,
  fastapi: 8000,
  "spring-maven": 8080,
  "spring-gradle": 8080,
  custom: null
};
