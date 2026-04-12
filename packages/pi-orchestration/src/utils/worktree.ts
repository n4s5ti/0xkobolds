/**
 * Worktree Utilities
 * 
 * Provides git worktree isolation for subagent execution.
 * Allows subagents to make changes in isolation and optionally apply them back.
 */

import { randomUUID } from "crypto";
import { join, basename } from "path";
import { bash, quote } from "./bash.js";

/**
 * Worktree handle for cleanup and diff operations
 */
export interface WorktreeHandle {
  path: string;
  branch: string;
  created: number;
}

/**
 * Diff result from worktree changes
 */
export interface WorktreeDiff {
  hasChanges: boolean;
  stats?: {
    insertions: number;
    deletions: number;
    files: number;
  };
  patch?: string;
}

/**
 * Create a new worktree for isolated execution
 */
export async function createWorktree(basePath: string): Promise<WorktreeHandle> {
  const id = randomUUID().slice(0, 8);
  const branchName = `pi-orchestration-branch-${id}`;
  // Create as sibling directory to prevent contamination
  // e.g. /home/user/code/my-project -> /home/user/code/my-project-wt-abc123
  const repoName = basename(basePath);
  const worktreePath = join(basePath, "..", `${repoName}-wt-${id}`);
  
  // Create the worktree directory
  await bash(`mkdir -p ${quote(worktreePath)}`);
  
  // Initialize as git worktree if in a git repo
  try {
    // Create the branch first to ensure it exists
    await bash(`cd ${quote(basePath)} && git checkout -b ${quote(branchName)} && git checkout -`);
    
    await bash(`cd ${quote(basePath)} && git worktree add ${quote(worktreePath)} ${quote(branchName)} -f`, {
      timeout: 30000,
    });
  } catch (error) {
    // If not in git repo or worktree add fails, just use the directory
    console.warn("[Worktree] Could not create git worktree, using directory:", error);
  }
  
  return {
    path: worktreePath,
    branch: branchName,
    created: Date.now(),
  };
}

/**
 * Remove a worktree after execution
 */
export async function removeWorktree(handle: WorktreeHandle, applyToMain = false): Promise<void> {
  try {
    if (applyToMain) {
      // Merge changes back first
      await bash(`cd ${quote(handle.path)} && git add -A && git commit -m "pi-orchestration worktree merge"`);
      
      // Find the main repo from the worktree's .git file
      const mainRepoPath = join(handle.path, "..", `${basename(handle.path).replace(/-wt-\w+$/, "")}`);
      // Use git merge instead of cherry-pick for simplicity and better tracking
      await bash(`cd ${quote(mainRepoPath)} && git merge ${quote(handle.branch)} --no-edit`, {
        timeout: 10000,
      });
    }
    
    // Remove the worktree
    try {
      // Use git worktree remove from the main repo
      const mainRepoPath = join(handle.path, "..", `${basename(handle.path).replace(/-wt-\w+$/, "")}`);
      await bash(`cd ${quote(mainRepoPath)} && git worktree remove ${quote(handle.path)} --force`, {
        timeout: 10000,
      }).catch(() => {
        // Fallback: just remove the directory
        bash(`rm -rf ${quote(handle.path)}`);
      });
    } catch {
      // Fallback: just remove the directory
      await bash(`rm -rf ${quote(handle.path)}`);
    }
  } catch (error) {
    console.error("[Worktree] Error removing worktree:", error);
    // Still try to clean up the directory
    await bash(`rm -rf ${quote(handle.path)}`);
  }
}

/**
 * Get diff of changes in a worktree
 */
export async function getWorktreeDiff(worktreePath: string): Promise<WorktreeDiff> {
  try {
    const result = await bash(
      `cd ${quote(worktreePath)} && git diff --stat && echo "---" && git diff`,
      { timeout: 30000 }
    );
    
    const output = result.stdout;
    const lines = output.split("\n").filter(l => l.trim() !== "");
    
    // Parse stats from the first line that looks like a git diff stat
    let statsLine = "";
    for (const line of lines) {
      if (line.match(/\d+ files? changed/)) {
        statsLine = line;
        break;
      }
    }
    const statsMatch = statsLine.match(/(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(\-\))?/);
    
    let stats: WorktreeDiff["stats"];
    if (statsMatch) {
      stats = {
        files: parseInt(statsMatch[1] || "0", 10),
        insertions: parseInt(statsMatch[2] || "0", 10),
        deletions: parseInt(statsMatch[3] || "0", 10),
      };
    }
    
    // Get patch (everything after ---)
    const patchIndex = lines.indexOf("---");
    const patch = patchIndex >= 0 ? lines.slice(patchIndex + 1).join("\n") : "";
    
    return {
      hasChanges: stats ? stats.files > 0 : patch.length > 0,
      stats,
      patch: patch || undefined,
    };
  } catch (error) {
    console.warn("[Worktree] Could not get diff:", error);
    return { hasChanges: false };
  }
}

/**
 * Get list of modified files in a worktree
 */
export async function getModifiedFiles(worktreePath: string): Promise<string[]> {
  try {
    const result = await bash(
      `cd ${quote(worktreePath)} && git diff --name-only`,
      { timeout: 10000 }
    );
    return result.stdout.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Stage all changes in a worktree
 */
export async function stageWorktreeChanges(worktreePath: string): Promise<void> {
  await bash(`cd ${quote(worktreePath)} && git add -A`);
}

/**
 * Create a backup copy of a directory
 */
export async function createCopy(sourcePath: string, copyPath: string): Promise<void> {
  await bash(`cp -r ${quote(sourcePath)} ${quote(copyPath)}`);
}

/**
 * Apply changes from copy back to original
 */
export async function applyChanges(sourcePath: string, targetPath: string): Promise<WorktreeDiff> {
  // Get diff first
  const diff = await getWorktreeDiff(sourcePath);
  
  // Copy changes back
  await bash(`cp -r ${quote(sourcePath)}/." ${quote(targetPath)}/"`);
  
  return diff;
}

/**
 * Clean up old worktrees from previous sessions
 */
export async function cleanupOldWorktrees(basePath: string, maxAgeMs: number = 86400000): Promise<number> {
  const worktreesDir = join(basePath, ".worktrees");
  const maxAge = Date.now() - maxAgeMs;
  let cleaned = 0;
  
  try {
    const result = await bash(
      `find ${quote(worktreesDir)} -maxdepth 1 -type d -name "pi-orchestration-*" -mmin +1440 2>/dev/null || true`
    );
    
    const oldDirs = result.stdout.split("\n").filter(Boolean);
    
    for (const dir of oldDirs) {
      await bash(`rm -rf ${quote(dir)}`);
      cleaned++;
    }
  } catch {
    // No old worktrees to clean
  }
  
  return cleaned;
}
