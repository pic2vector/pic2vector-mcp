#!/usr/bin/env node

process.removeAllListeners("warning");
process.on("warning", (warning) => {
  if (warning.name === "ExperimentalWarning" && warning.message.includes("WebAssembly")) {
    return;
  }
  console.error(warning.stack ?? warning.message);
});

const { startServer } = await import("./server.js");

startServer().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`pic2vector-mcp failed to start: ${message}`);
  process.exit(1);
});
