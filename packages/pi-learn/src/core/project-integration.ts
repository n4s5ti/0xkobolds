/**
 * Pi-Project Integration for Pi-Learn
 * 
 * Automatically switches memory workspace based on detected project.
 * Subscribes to pi-project events and reconfigures workspace scope.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import type { SQLiteStore } from "./store.js";

// Project info from pi-project (mirrored from pi-project/index.ts)
export interface ProjectInfo {
  id: string;
  name: string;
  path: string;
  repo?: {
    remote: string;
    owner?: string;
    name?: string;
    branch?: string;
  };
  stack?: string[];
  detectedAt: number;
}

interface ProjectChangeEvent {
  previous: ProjectInfo | null;
  current: ProjectInfo | null;
  reason: "init" | "cwd_change" | "manual" | "error";
}

// Event names must match pi-project's exported constants
const PROJECT_CHANGE_EVENT = "project:change";
const PROJECT_DETECTED_EVENT = "project:detected";

export interface ProjectIntegrationConfig {
  enabled: boolean;
  autoDetect: boolean;
  injectContext: boolean;
}

export const DEFAULT_PROJECT_CONFIG: ProjectIntegrationConfig = {
  enabled: true,
  autoDetect: true,
  injectContext: true,
};

// Module-level cache for current project info
let cachedProject: ProjectInfo | null = null;

export function initProjectIntegration(
  pi: ExtensionAPI,
  store: SQLiteStore,
  config: ProjectIntegrationConfig,
  onWorkspaceChange?: (project: ProjectInfo | null) => void
): void {
  if (!config.enabled) return;

  // Subscribe to project changes from pi-project
  pi.events.on(PROJECT_CHANGE_EVENT, (data: unknown) => {
    const event = data as ProjectChangeEvent;
    handleProjectChange(event, store, config, onWorkspaceChange);
  });

  // Also subscribe to initial detection
  pi.events.on(PROJECT_DETECTED_EVENT, (data: unknown) => {
    const event = data as { project: ProjectInfo; source: string };
    ensureProjectWorkspace(store, event.project);
    cachedProject = event.project;
  });
}

function handleProjectChange(
  event: ProjectChangeEvent,
  store: SQLiteStore,
  config: ProjectIntegrationConfig,
  onWorkspaceChange?: (project: ProjectInfo | null) => void
): void {
  const { previous, current, reason } = event;

  if (previous && current) {
    console.log(`[pi-learn] Project switch: ${previous.name} → ${current.name} (${reason})`);
  } else if (current) {
    console.log(`[pi-learn] Project detected: ${current.name} (${reason})`);
  } else {
    console.log(`[pi-learn] Project cleared (was: ${previous?.name})`);
  }

  if (current) {
    ensureProjectWorkspace(store, current);
    cachedProject = current;
  } else {
    cachedProject = null;
  }

  if (onWorkspaceChange) {
    onWorkspaceChange(current);
  }
}

function ensureProjectWorkspace(store: SQLiteStore, project: ProjectInfo): string {
  const workspaceId = project.id;
  
  store.getOrCreateWorkspace(workspaceId, project.name);
  store.getOrCreatePeer(workspaceId, "user", "User", "user");
  store.getOrCreatePeer(workspaceId, "agent", "Agent", "agent");
  
  return workspaceId;
}

export function getCurrentProjectInfo(): ProjectInfo | null {
  return cachedProject;
}

export function createProjectContextSnippet(
  project: { id: string; name: string; path: string; repo?: { remote: string; owner?: string; name?: string; branch?: string }; stack?: string[]; detectedAt?: number }
): string {
  const parts = [
    `Current Project: ${project.name}`,
    `Path: ${project.path}`,
  ];
  
  if (project.repo) {
    parts.push(`Repository: ${project.repo.remote}`);
    if (project.repo.branch) {
      parts.push(`Branch: ${project.repo.branch}`);
    }
  }
  
  if (project.stack && project.stack.length > 0) {
    parts.push(`Tech Stack: ${project.stack.join(", ")}`);
  }
  
  return parts.join("\n");
}

export function isProjectExtensionAvailable(pi: ExtensionAPI): boolean {
  try {
    const tools = pi.getAllTools();
    return tools.some((t: any) => t.name === "get_current_project");
  } catch {
    return false;
  }
}
