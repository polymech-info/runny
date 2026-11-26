import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import treeKill from "tree-kill";
import { DEV_API_PORT, DEV_UI_PORT, PORT_SPAN } from "./ports.mjs";

const host = "127.0.0.1";
const adminRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function canListen(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    const finish = (free) => {
      server.removeAllListeners();
      if (server.listening) server.close(() => resolve(free));
      else resolve(free);
    };
    server.once("error", () => finish(false));
    server.listen(port, host, () => finish(true));
  });
}

async function pick(start, label) {
  for (let offset = 0; offset < PORT_SPAN; offset++) {
    const port = start + offset;
    if (await canListen(port)) {
      if (offset > 0) {
        console.log(`[dev] ${label} :${start} is busy, using :${port}`);
      }
      return port;
    }
  }
  throw new Error(
    `[dev] no free ${label} port from ${start} to ${start + PORT_SPAN - 1}`
  );
}

const apiPort = await pick(DEV_API_PORT, "API");
const uiPort = await pick(DEV_UI_PORT, "UI");
console.log(
  `[dev] API http://${host}:${apiPort}  UI http://${host}:${uiPort}`
);

const env = {
  ...process.env,
  RUNNY_PORT: String(apiPort),
  RUNNY_API_PORT: String(apiPort),
  RUNNY_UI_PORT: String(uiPort),
  RUNNY_NO_BROWSER: "1",
};

function prefix(name, child) {
  const write = (chunk, stream) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line) stream.write(`[${name}] ${line}\n`);
    }
  };
  child.stdout?.on("data", (chunk) => write(chunk, process.stdout));
  child.stderr?.on("data", (chunk) => write(chunk, process.stderr));
}

function spawnNode(args) {
  return spawn(process.execPath, args, {
    cwd: adminRoot,
    env,
    stdio: ["inherit", "pipe", "pipe"],
  });
}

const tsxCli = path.join(adminRoot, "node_modules", "tsx", "dist", "cli.mjs");
const server = spawnNode([
  tsxCli,
  "watch",
  "--clear-screen=false",
  "src/cli.ts",
]);
prefix("server", server);

const client = spawnNode([
  path.join(adminRoot, "scripts", "wait-and-rspack.mjs"),
]);
prefix("client", client);

const children = [server, client];
let shuttingDown = false;

function killTree(child) {
  if (!child?.pid) return;
  treeKill(child.pid, "SIGKILL", () => {});
}

function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killTree(child);
  setTimeout(() => process.exit(code ?? 0), 300);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

for (const child of children) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shutdown(signal ? 1 : (code ?? 1));
  });
}
