#!/usr/bin/env node

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { startServer } from "./server/index.js";
import { runSessionCli } from "./server/cli/session-cli.js";
import { BUILD_PORT, DEV_API_PORT, DEV_UI_PORT } from "./shared/ports.js";

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
    --port <number>   Preferred port (dev API: ${DEV_API_PORT}, runny: ${BUILD_PORT}).
                      runny steps up when the port is busy; dev uses the next
                      free API/UI pair (${DEV_API_PORT} / ${DEV_UI_PORT}).
    --no-browser      Don't open the browser automatically
    -h, --help        Show this help message

  Soft CI:
    runny session run <groupPath> [--package <name>] [--no-fail-fast]
    runny session list
`);
  process.exit(0);
} else {
  const portIndex = args.indexOf("--port");
  const fromArg =
    portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : Number.NaN;
  const fromEnv = process.env.RUNNY_PORT
    ? parseInt(process.env.RUNNY_PORT, 10)
    : Number.NaN;
  const preferredPort = Number.isFinite(fromArg)
    ? fromArg
    : Number.isFinite(fromEnv)
      ? fromEnv
      : runningFromSource
        ? DEV_API_PORT
        : BUILD_PORT;
  const devUiPort = Number.isFinite(Number(process.env.RUNNY_UI_PORT))
    ? Number(process.env.RUNNY_UI_PORT)
    : DEV_UI_PORT;

  // Don't pass --no-browser through `tsx watch` (it can swallow unknown flags).
  // Source/dev mode never auto-opens the API port — use the Rspack UI port.
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

  if (runningFromSource) {
    console.log(
      `[runny] dev API :${preferredPort}  UI :${devUiPort}  (build default :${BUILD_PORT})`
    );
  }

  startServer(targetDir, preferredPort, {
    // Dev UI is pinned to this API port by scripts/dev.mjs. The built CLI
    // serves the UI on the same port and may step upward.
    allowPortFallback: !runningFromSource,
  })
    .then(async ({ port }) => {
      if (noBrowser) return;
      // Lazy-load: `open` can hang on import when stdout is piped.
      const { default: open } = await import("open");
      const url = runningFromSource
        ? `http://127.0.0.1:${devUiPort}`
        : `http://127.0.0.1:${port}`;
      await open(url);
    })
    .catch((err) => {
      console.error("\n  Failed to start server:", err);
      process.exit(1);
    });
}
