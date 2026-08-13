#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { startServer } from "./server/index.js";
import { runSessionCli } from "./server/cli/session-cli.js";

const args = process.argv.slice(2);

// Dev (tsx from admin/src): default target is the parent repo, not admin/.
// Production (dist/cli.js): keep cwd unless TARGET_DIR is set.
const here = path.dirname(fileURLToPath(import.meta.url));
const runningFromSource = path.basename(here) === "src";
const defaultTarget = runningFromSource
  ? path.resolve(here, "..", "..")
  : process.cwd();
const targetDir = process.env.TARGET_DIR || defaultTarget;

if (args[0] === "session") {
  if (!fs.existsSync(path.join(targetDir, "package.json"))) {
    console.error(
      `\n  Error: No package.json found in ${targetDir}\n  Run this command from a project directory.\n`
    );
    process.exit(1);
  }
  runSessionCli(args.slice(1), targetDir)
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error("\n  Session failed:", err);
      process.exit(1);
    });
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  Usage: runny [options]
         runny session <command>

  Options:
    --port <number>   Port to run on (default: 3717)
    --no-browser      Don't open the browser automatically
    -h, --help        Show this help message

  Soft CI:
    runny session run <groupPath> [--package <name>] [--no-fail-fast]
    runny session list
`);
  process.exit(0);
} else {
  const portIndex = args.indexOf("--port");
  const preferredPort =
    portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3717;

  // Don't pass --no-browser through `tsx watch` (it can swallow unknown flags).
  // Source/dev mode never auto-opens the API port — use Rspack on :5173.
  const noBrowser =
    args.includes("--no-browser") ||
    process.env.RUNNY_NO_BROWSER === "1" ||
    runningFromSource;

  // Verify package.json exists
  if (!fs.existsSync(path.join(targetDir, "package.json"))) {
    console.error(
      `\n  Error: No package.json found in ${targetDir}\n  Run this command from a project directory.\n`
    );
    process.exit(1);
  }

  startServer(targetDir, preferredPort, {
    // Rspack proxies /api and /ws to 127.0.0.1:3717 — never fall back in source/dev.
    allowPortFallback: !runningFromSource,
  })
    .then(async ({ port }) => {
      if (noBrowser) return;
      // Lazy-load: `open` can hang on import when stdout is piped (e.g. concurrently).
      const { default: open } = await import("open");
      const url = runningFromSource
        ? "http://127.0.0.1:5173"
        : `http://127.0.0.1:${port}`;
      await open(url);
    })
    .catch((err) => {
      console.error("\n  Failed to start server:", err);
      process.exit(1);
    });
}
