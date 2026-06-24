import type { ProjectWithServices, ServiceStatus } from "@shared/types";

export type StatusFilter = ServiceStatus | "all";

export const filterProjects = (
  projects: ProjectWithServices[],
  query: string,
  statusFilter: StatusFilter
): ProjectWithServices[] => {
  const lowered = query.trim().toLowerCase();

  return projects
    .map((project) => ({
      ...project,
      services: project.services.filter((service) => {
        const matchesText =
          !lowered ||
          service.name.toLowerCase().includes(lowered) ||
          service.servicePath.toLowerCase().includes(lowered) ||
          service.note.toLowerCase().includes(lowered) ||
          service.command.toLowerCase().includes(lowered) ||
          service.environment.toLowerCase().includes(lowered);
        const matchesStatus = statusFilter === "all" || service.lastStatus === statusFilter;
        return matchesText && matchesStatus;
      })
    }))
    .filter((project) => project.services.length > 0);
};
