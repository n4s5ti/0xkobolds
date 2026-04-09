/**
 * Gateway CLI Command
 *
 * Start/stop/manage the pi-gateway server.
 * Uses @0xkobold/pi-gateway/api for all operations.
 */

import { Command } from "commander";

export function createGatewayCommand(): Command {
  const cmd = new Command("gateway")
    .description("Manage the pi-gateway messaging server");

  // Start gateway
  cmd
    .command("start")
    .description("Start the gateway server")
    .option("-p, --port <port>", "Port to run on", "3847")
    .option("-h, --host <host>", "Host to bind to", "0.0.0.0")
    .option("--no-agent", "Don't spawn a pi RPC process")
    .action(async (options) => {
      try {
        const { startGateway, isGatewayRunning } = await import("@0xkobold/pi-gateway/api");
        const port = parseInt(options.port);
        const host = options.host;

        const alreadyRunning = await isGatewayRunning(port);
        if (alreadyRunning) {
          console.log(`🌐 Gateway already running on port ${port}`);
          return;
        }

        const status = await startGateway({
          port,
          host,
          noAgent: !options.agent,
        });

        console.log(`✅ Gateway started on http://${status.host}:${status.port}`);
        console.log(`   WebSocket: ws://${status.host}:${status.port}/ws`);
        console.log(`   Adapters: ${status.adapters.length > 0 ? status.adapters.join(", ") : "none"}`);
        console.log(`   Agent: ${status.agentConnected ? "connected" : "not spawned (--no-agent?)"}`);
        console.log("\nPress Ctrl+C to stop");

        // Keep running until signal
        await new Promise<void>((resolve) => {
          process.on("SIGINT", () => {
            console.log("\n🛑 Stopping gateway...");
            resolve();
          });
        });

        const { stopGateway } = await import("@0xkobold/pi-gateway/api");
        await stopGateway();
        console.log("✅ Gateway stopped");
      } catch (error) {
        console.error("❌ Failed to start gateway:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Stop gateway
  cmd
    .command("stop")
    .description("Stop the gateway server")
    .action(async () => {
      try {
        const { stopGateway, isRunning } = await import("@0xkobold/pi-gateway/api");

        if (!isRunning()) {
          console.log("⚪ Gateway is not running");
          return;
        }

        await stopGateway();
        console.log("✅ Gateway stopped");
      } catch (error) {
        console.error("❌ Failed to stop gateway:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Status
  cmd
    .command("status")
    .description("Check gateway server status")
    .action(async () => {
      try {
        const { getStatus } = await import("@0xkobold/pi-gateway/api");
        const status = getStatus();

        if (status.running) {
          console.log("🟢 Gateway Status: Running");
          console.log(`   Port: ${status.port}`);
          console.log(`   Host: ${status.host}`);
          console.log(`   Adapters: ${status.adapters.length > 0 ? status.adapters.join(", ") : "none"}`);
          console.log(`   WebSocket clients: ${status.clientCount}`);
          console.log(`   Active sessions: ${status.sessionCount}`);
          console.log(`   Agent: ${status.agentConnected ? "✅ connected" : "❌ disconnected"}`);
        } else {
          console.log("🔴 Gateway Status: Stopped");
          console.log("   Start it with: 0xkobold gateway start");
        }
      } catch (error) {
        console.error("❌ Failed to get status:", error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  return cmd;
}