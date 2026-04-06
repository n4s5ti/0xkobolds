import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { mkdir, writeFile, rm } from "fs/promises";
import { execSync } from "child_process";
import { quote } from "../src/utils/bash";
import { 
  createWorktree, 
  removeWorktree, 
  getWorktreeDiff 
} from "../src/utils/worktree";

describe("Pi Orchestration Worktree System", () => {
  let testDir: string;
  let repoDir: string;

  beforeEach(async () => {
    // Create a unique test directory
    testDir = join(process.cwd(), `test-worktree-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    
    repoDir = join(testDir, "repo");
    await mkdir(repoDir, { recursive: true });
    
    // Initialize a real git repo for testing
    execSync("git init", { cwd: repoDir });
    execSync("git config user.email 'test@example.com'", { cwd: repoDir });
    execSync("git config user.name 'Test User'", { cwd: repoDir });
    
    // Create an initial commit
    await writeFile(join(repoDir, "main.txt"), "main content");
    execSync("git add .", { cwd: repoDir });
    execSync("git commit -m 'initial'", { cwd: repoDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("Security: Bash Quoting", () => {
    it("should properly escape single quotes", () => {
      expect(quote("it's a test")).toBe("'it'\\''s a test'");
    });

    it("should wrap values in single quotes", () => {
      expect(quote("simple path")).toBe("'simple path'");
    });

    it("should neutralize command injection attempts", () => {
      const injection = '"; rm -rf /; "';
      const quoted = quote(injection);
      // The quoted string should be a literal single-quoted string
      // that the shell will not execute.
      expect(quoted).toBe("'\"; rm -rf /; \"'");
    });
  });

  describe("Worktree Lifecycle", () => {
    it("should create an isolated worktree", async () => {
      const handle = await createWorktree(repoDir);
      
      expect(handle.path).toBeDefined();
      expect(handle.branch).toBeDefined();
      
      // Test isolation: create file in worktree
      const testFileCwd = join(handle.path, "isolated.txt");
      await writeFile(testFileCwd, "isolated content");
      
      // The actual check: the file created in worktree should not be in repoDir
      const { existsSync } = await import("fs");
      const mainFile = join(repoDir, "isolated.txt");
      expect(existsSync(mainFile)).toBe(false);
      
      await removeWorktree(handle);
    });

    it("should correctly identify changes via diff", async () => {
      const handle = await createWorktree(repoDir);
      
      // Modify a file in the worktree
      const targetFile = join(handle.path, "main.txt");
      await writeFile(targetFile, "modified content");
      
      const diff = await getWorktreeDiff(handle.path);
      
      expect(diff.hasChanges).toBe(true);
      expect(diff.patch).toContain("modified content");
      expect(diff.stats?.files).toBe(1);
      
      await removeWorktree(handle);
    });

    it("should successfully apply changes back to main", async () => {
      const handle = await createWorktree(repoDir);
      
      // Modify a file
      const targetFile = join(handle.path, "main.txt");
      await writeFile(targetFile, "applied content");
      
      // Remove and apply
      await removeWorktree(handle, true);
      
      // Verify the main file was updated
      const { readFileSync } = await import("fs");
      const content = readFileSync(join(repoDir, "main.txt"), "utf-8");
      expect(content).toBe("applied content");
    });

    it("should fallback to plain directory if git fails", async () => {
      const nonRepoDir = join(testDir, "non-repo");
      await mkdir(nonRepoDir, { recursive: true });
      await writeFile(join(nonRepoDir, "file.txt"), "hi");
      
      // This should NOT throw despite not being a git repo
      const handle = await createWorktree(nonRepoDir);
      expect(handle.path).toBeDefined();
      
      await removeWorktree(handle);
    });
  });
});
