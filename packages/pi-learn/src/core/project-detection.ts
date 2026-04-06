/**
 * Project Detection Module for pi-learn
 * Detects project context based on signature files
 */

import * as path from "path";
import * as fs from "fs";
import type { SQLiteStore } from "./store.js";
import { getCurrentProjectInfo, createProjectContextSnippet, type ProjectInfo } from "./project-integration.js";

// ============================================================================
// PROJECT SIGNATURE FILES
// ============================================================================

const PROJECT_SIGNATURE_FILES = [
  'package.json',           // Node.js
  'Cargo.toml',             // Rust
  'go.mod',                // Go
  'pyproject.toml',        // Python (PEP 621)
  'requirements.txt',      // Python (pip)
  'Pipfile',               // Python (Pipenv)
  'Gemfile',               // Ruby
  'composer.json',        // PHP
  'pom.xml',               // Java (Maven)
  'build.gradle',          // Java (Gradle)
  '.git/config',           // Git repository
  '.hg/hgrc',              // Mercurial repository
  'Makefile',              // Make
  'CMakeLists.txt',        // CMake
] as const;

type SignatureFile = typeof PROJECT_SIGNATURE_FILES[number];

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedProject {
  id: string;
  name: string;
  path: string;
  signatureFile: SignatureFile;
  detectedAt: number;
}

// ============================================================================
// FACTORY FUNCTION
// ============================================================================

export function createProjectDetector(
  store: SQLiteStore,
  defaultWorkspaceId: string,
  defaultWorkspaceName: string = "Default Workspace"
) {
  // Validate inputs
  console.assert(store !== null, 'store must not be null');
  console.assert(store !== undefined, 'store must not be undefined');
  console.assert(typeof defaultWorkspaceId === 'string', 'defaultWorkspaceId must be string');
  console.assert(defaultWorkspaceId.length > 0, 'defaultWorkspaceId must not be empty');

  // Internal state
  let lastDetectedProject: DetectedProject | null = null;
  let activeWorkspaceId = defaultWorkspaceId;

  // ============================================================================
  // DETECTION LOGIC
  // ============================================================================

  function detectProjectFromFiles(): DetectedProject | null {
    const cwd = process.cwd();
    console.assert(typeof cwd === 'string', 'cwd must be string');
    console.assert(cwd.length > 0, 'cwd must not be empty');

    for (const file of PROJECT_SIGNATURE_FILES) {
      const fullPath = path.join(cwd, file);
      
      try {
        if (fs.existsSync(fullPath)) {
          const stat = fs.statSync(fullPath);
          
          // Validate stat
          console.assert(stat !== null, 'stat must not be null');
          console.assert(typeof stat.ino === 'number', 'stat.ino must be number');

          return {
            id: `${path.basename(cwd)}-${stat.ino}`,
            name: path.basename(cwd),
            path: cwd,
            signatureFile: file,
            detectedAt: Date.now(),
          };
        }
      } catch (e) {
        // Skip files that can't be accessed
        continue;
      }
    }

    // No project files found
    console.assert(lastDetectedProject === null || lastDetectedProject !== null, 'lastDetectedProject state is valid');
    return null;
  }

  function checkAndSwitchProject(): string {
    const detected = detectProjectFromFiles();

    // Same project detected - no change needed
    if (detected && lastDetectedProject && detected.id === lastDetectedProject.id) {
      console.assert(activeWorkspaceId === lastDetectedProject.id, 'workspace should match');
      return activeWorkspaceId;
    }

    // Project changed or newly detected
    if (detected) {
      // Ensure workspace exists in store
      store.getOrCreateWorkspace(detected.id, detected.name);
      store.getOrCreatePeer(detected.id, "user", "User", "user");
      store.getOrCreatePeer(detected.id, "agent", "Agent", "agent");

      lastDetectedProject = detected;
      activeWorkspaceId = detected.id;

      console.assert(activeWorkspaceId === detected.id, 'workspace should be updated');
      return activeWorkspaceId;
    }

    // No project detected - use default workspace
    if (lastDetectedProject !== null) {
      // Was in a project, now not
      activeWorkspaceId = defaultWorkspaceId;
      lastDetectedProject = null;

      console.assert(activeWorkspaceId === defaultWorkspaceId, 'workspace should be default');
      return activeWorkspaceId;
    }

    // Still no project detected
    console.assert(activeWorkspaceId === defaultWorkspaceId, 'workspace should remain default');
    return activeWorkspaceId;
  }

  // ============================================================================
  // FILE WATCHER
  // ============================================================================

  let watchDebounce: NodeJS.Timeout | null = null;
  let watcher: fs.FSWatcher | null = null;

  function setupFileWatcher(): void {
    if (watcher) return; // Already watching

    try {
      watcher = fs.watch(process.cwd(), { recursive: false }, (_eventType, filename) => {
        if (!filename) return;

        // Debounce rapid changes
        if (watchDebounce) clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          checkAndSwitchProject();
        }, 2000);
      });

      // Handle watcher errors gracefully
      watcher.on('error', (err) => {
        console.warn("[pi-learn] File watcher error:", err);
        watcher = null;
      });
    } catch (e) {
      // fs.watch may fail in some environments (e.g., certain containers)
      console.warn("[pi-learn] File watching not available:", e);
    }
  }

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  return {
    /**
     * Check for project change and update workspace if needed
     * Returns the active workspace ID
     */
    check(): string {
      return checkAndSwitchProject();
    },

    /**
     * Get the currently active workspace ID
     */
    getActiveWorkspaceId(): string {
      console.assert(typeof activeWorkspaceId === 'string', 'activeWorkspaceId must be string');
      return activeWorkspaceId;
    },

    /**
     * Get the currently detected project info
     */
    getDetectedProject(): DetectedProject | null {
      return lastDetectedProject;
    },

    /**
     * Create a context snippet for the current project
     */
    createContextSnippet(): string | null {
      const detected = detectProjectFromFiles();
      if (!detected) return null;

      return createProjectContextSnippet({
        id: detected.id,
        name: detected.name,
        path: detected.path,
        detectedAt: detected.detectedAt,
      });
    },

    /**
     * Start the file watcher for project changes
     */
    startWatcher(): void {
      setupFileWatcher();
    },

    /**
     * Stop the file watcher
     */
    stopWatcher(): void {
      if (watchDebounce) {
        clearTimeout(watchDebounce);
        watchDebounce = null;
      }

      if (watcher) {
        watcher.close();
        watcher = null;
      }
    },

    /**
     * Get project info using the integration module
     */
    getProjectInfo(): ProjectInfo | null {
      return getCurrentProjectInfo();
    },
  };
}

// ============================================================================
// RETENTION SCHEDULER
// ============================================================================

export function createRetentionScheduler(
  store: SQLiteStore,
  retentionConfig: {
    retentionDays: number;
    summaryRetentionDays: number;
    conclusionRetentionDays: number;
    pruneOnStartup: boolean;
    pruneIntervalHours: number;
  },
  notify?: (message: string, type?: "info" | "warning" | "error") => void
) {
  // Validate inputs
  console.assert(store !== null, 'store must not be null');
  console.assert(retentionConfig !== null, 'retentionConfig must not be null');
  console.assert(typeof retentionConfig.pruneIntervalHours === 'number', 'pruneIntervalHours must be number');
  console.assert(retentionConfig.pruneIntervalHours > 0, 'pruneIntervalHours must be positive');

  let intervalId: NodeJS.Timeout | null = null;
  let running = false;

  return {
    start() {
      console.assert(!running, 'retention scheduler should not already be running');

      // Initial prune on startup if enabled
      if (retentionConfig.pruneOnStartup) {
        setTimeout(() => {
          const result = store.prune(
            retentionConfig.retentionDays,
            retentionConfig.summaryRetentionDays,
            retentionConfig.conclusionRetentionDays
          );
          if (result.deleted > 0 && notify) {
            notify(`Pruned ${result.deleted} old records`, "info");
          }
        }, 5000);
      }

      // Recurring prune
      intervalId = setInterval(() => {
        const result = store.prune(
          retentionConfig.retentionDays,
          retentionConfig.summaryRetentionDays,
          retentionConfig.conclusionRetentionDays
        );
        if (result.deleted > 0 && notify) {
          notify(`Pruned ${result.deleted} old records`, "info");
        }
      }, retentionConfig.pruneIntervalHours * 60 * 60 * 1000);

      running = true;
    },

    stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      running = false;
    },

    isRunning() {
      return running;
    },
  };
}
