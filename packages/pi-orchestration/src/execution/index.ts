/**
 * Execution Module Index
 */

export { 
  orchestrate, 
  formatOrchestrateResult, 
  getOrchestratorState,
  setDefaultLLMExecutor,
  getDefaultLLMExecutor,
  configureEngine,
  getEngineConfig,
  checkPiAvailability,
} from "./engine.js";

export {
  spawnPiSubagent,
  spawnParallelPiSubagents,
  spawnChainPiSubagents,
  getActiveProcessCount,
  killAllProcesses,
  type SpawnOptions,
  type SpawnProgress,
  type SpawnResult,
} from "./pi-spawner.js";

export {
  spawnNativeSubagent,
  forkNativeSubagent,
  getActiveSubagentCount,
  cleanupAllSubagents,
  type NativeSpawnerConfig,
} from "./native-spawner.js";
