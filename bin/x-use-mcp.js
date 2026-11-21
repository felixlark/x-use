#!/usr/bin/env node
import { main } from "../src/server.js";

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`x-use MCP failed: ${message}\n`);
  process.exitCode = 1;
});

