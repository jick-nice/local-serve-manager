import { describe, expect, it } from "vitest";
import type { ProjectWithServices, Service } from "@shared/types";
import { filterProjects } from "../../src/renderer/src/projectFilters";

const baseService: Service = {
  id: 1,
  projectId: 1,
  name: "api",
  servicePath: "E:/Work/api",
  stack: "spring-maven",
  command: "mvn spring-boot:run",
  port: 8080,
  backendServiceId: null,
  note: "",
  environment: "",
  sortOrder: 0,
  lastStatus: "stopped",
  createdAt: "2026-06-23T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z"
};

const project = (id: number, services: Service[]): ProjectWithServices => ({
  id,
  name: `project-${id}`,
  rootPath: `E:/Work/project-${id}`,
  createdAt: "2026-06-23T00:00:00.000Z",
  updatedAt: "2026-06-23T00:00:00.000Z",
  services
});

describe("filterProjects", () => {
  it("hides projects after their last service has been deleted", () => {
    const result = filterProjects([project(1, [])], "", "all");

    expect(result).toEqual([]);
  });

  it("keeps projects that still have matching services", () => {
    const result = filterProjects([project(1, [baseService])], "api", "all");

    expect(result).toHaveLength(1);
    expect(result[0].services).toHaveLength(1);
  });

  it("matches service environment text", () => {
    const result = filterProjects([project(1, [{ ...baseService, environment: "TOKEN_SECRET=local" }])], "token_secret", "all");

    expect(result).toHaveLength(1);
  });
});
