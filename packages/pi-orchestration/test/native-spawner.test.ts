/**
 * Native Spawner Tests
 */

import { describe, expect, test } from "bun:test";
import { 
  spawnNativeSubagent, 
  getActiveSubagentCount,
  cleanupAllSubagents,
  type NativeSpawnerConfig,
} from "../src/execution/native-spawner.js";

describe("Native Spawner", () => {
  const mockCtx = {
    cwd: process.cwd(),
    modelRegistry: {
      getAvailable: () => [{ provider: "ollama", modelId: "llama3.2:3b" }],
    },
  } as any;

  test("exports native spawner functions", () => {
    expect(typeof spawnNativeSubagent).toBe("function");
    expect(typeof getActiveSubagentCount).toBe("function");
    expect(typeof cleanupAllSubagents).toBe("function");
  });

  test("config type is exported", () => {
    const config: Partial<NativeSpawnerConfig> = {
      agentType: "scout",
      task: "test task",
      cwd: "/tmp/test",
    };
    expect(config.agentType).toBe("scout");
  });
});
