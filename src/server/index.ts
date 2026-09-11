import express from "express";
import { createServer, type Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { detectPackageManager } from "./services/detector.js";
import { processManager } from "./services/process-manager.js";
import { PackageStore } from "./services/package-store.js";
import { createConfigRouter } from "./routes/config.js";
import { createUserConfigRouter } from "./routes/user-config.js";
import { createPackagesRouter } from "./routes/packages.js";
import { createScriptsRouter } from "./routes/scripts.js";
import { createSessionsRouter } from "./routes/sessions.js";
import { setupWebSocket } from "./ws/log-stream.js";
import { userConfigPath } from "./services/user-config.js";
import { sessionManager } from "./services/session-manager.js";
import type { AppConfig } from "./types.js";
import type { Express } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LISTEN_HOST = "127.0.0.1";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeServer(server: Server, ms = 250): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve) => {
      server.close(() => resolve());
      // Node may leave a half-open handle after a hung listen(); don't wait forever.
      try {
        server.closeAllConnections?.();
      } catch {
        // ignore
      }
    }),
    sleep(ms),
  ]);
}

/** Bind a fresh HTTP server — never probe/close/re-listen the same handle (Windows hang). */
async function listenApp(
  app: Express,
  preferredPort: number,
  options: { allowFallback: boolean }
): Promise<{ server: Server; port: number }> {
  const maxPorts = options.allowFallback ? 40 : 1;
  const perPortAttempts = 10;
  let lastError: unknown;

  for (let offset = 0; offset < maxPorts; offset++) {
    const port = preferredPort + offset;
    for (let attempt = 0; attempt < perPortAttempts; attempt++) {
      const server = createServer(app);
      setupWebSocket(server);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            server.removeListener("error", onError);
            server.removeListener("listening", onListening);
            reject(
              Object.assign(new Error(`listen timed out on ${port}`), {
                code: "ETIMEDOUT",
              })
            );
          }, 1000);

          const onError = (err: Error) => {
            clearTimeout(timer);
            server.off("listening", onListening);
            reject(err);
          };
          const onListening = () => {
            clearTimeout(timer);
            server.off("error", onError);
            resolve();
          };

          server.once("error", onError);
          server.once("listening", onListening);
          // Avoid exclusive:true — on Windows it can stall forever after TIME_WAIT.
          server.listen(port, LISTEN_HOST);
        });
        return { server, port };
      } catch (err) {
        lastError = err;
        await closeServer(server);
        const code = (err as NodeJS.ErrnoException).code;
        if (
          code === "EADDRINUSE" ||
          code === "EACCES" ||
          code === "ETIMEDOUT"
        ) {
          await sleep(200);
          continue;
        }
        throw err;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        options.allowFallback
          ? `No free port near ${preferredPort}`
          : `Port ${preferredPort} is busy or listen stalled (stop the old process and retry)`
      );
}

export async function startServer(
  targetDir: string,
  preferredPort: number,
  options: { allowPortFallback?: boolean } = {}
) {
  const allowFallback = options.allowPortFallback ?? true;
  console.log(`[runny] starting (target=${targetDir}, port=${preferredPort})`);

  const pm = detectPackageManager(targetDir);
  processManager.setRoot(targetDir);
  processManager.setPackageManager(pm);
  sessionManager.setRoot(targetDir);
  sessionManager.setPackageManager(pm);

  const store = new PackageStore(targetDir, pm);
  const repoName = path.basename(targetDir);

  const config: AppConfig = {
    repoName,
    rootPath: targetDir,
    packageManager: pm,
  };

  const app = express();
  app.use(express.json());

  // API routes
  app.use(createConfigRouter(config));
  app.use(createUserConfigRouter(targetDir));
  app.use(createPackagesRouter(store));
  app.use(createScriptsRouter(store, config));
  app.use(createSessionsRouter(store));

  // Serve static frontend (production). In Rspack dev, the client is on :5173.
  const clientDir = path.join(__dirname, "..", "client");
  app.use(express.static(clientDir));
  app.get("/{*splat}", (_req, res) => {
    res.sendFile(path.join(clientDir, "index.html"));
  });

  // Bind before package discovery so the Rspack proxy has a live target.
  const { server, port } = await listenApp(app, preferredPort, {
    allowFallback,
  });

  console.log(`\n  🏃 Runny is running!\n`);
  console.log(`  Local:   http://${LISTEN_HOST}:${port}`);
  if (port !== preferredPort) {
    console.log(`  (port ${preferredPort} was in use, using ${port} instead)`);
  }

  await store.refresh();

  console.log(`  Target:  ${targetDir}`);
  console.log(`  Config:  ${userConfigPath(targetDir)}`);
  console.log(`  Manager: ${pm}`);
  console.log(`  Packages: ${store.packages.length}\n`);

  const cleanup = () => {
    processManager.killAll();
    server.close();
    process.exit(0);
  };

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  return { server, port };
}
