import { Router } from "express";
import { sessionManager } from "../services/session-manager.js";
import type { PackageStore } from "../services/package-store.js";

export function createSessionsRouter(store: PackageStore): Router {
  const router = Router();

  router.get("/api/sessions", (_req, res) => {
    res.json(sessionManager.list());
  });

  router.get("/api/sessions/:id", (req, res) => {
    const session = sessionManager.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  });

  /** Start a sequential soft-CI session for a script group. */
  router.post("/api/sessions/start", (req, res) => {
    const { packageName, groupPath, failFast, continueOnErrorIds } = req.body as {
      packageName: string;
      groupPath: string;
      failFast?: boolean;
      continueOnErrorIds?: string[];
    };

    if (!packageName || !groupPath) {
      res.status(400).json({ error: "packageName and groupPath are required" });
      return;
    }

    const pkg = store.find(packageName);
    if (!pkg) {
      res.status(404).json({ error: `Package "${packageName}" not found` });
      return;
    }

    try {
      const session = sessionManager.startGroup({
        packageName,
        packagePath: pkg.path,
        groupPath,
        scripts: pkg.scripts,
        failFast,
        continueOnErrorIds,
      });
      res.json(session);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to start session",
      });
    }
  });

  /**
   * Start a sequential session from an explicit script id list
   * (`packageName:scriptName`). Used for favourite groups.
   */
  router.post("/api/sessions/start-list", async (req, res) => {
    const { groupPath, scriptIds, failFast, continueOnErrorIds } = req.body as {
      groupPath: string;
      scriptIds: string[];
      failFast?: boolean;
      continueOnErrorIds?: string[];
    };

    if (!groupPath || !Array.isArray(scriptIds) || scriptIds.length === 0) {
      res.status(400).json({
        error: "groupPath and a non-empty scriptIds array are required",
      });
      return;
    }

    const matchId = (id: string) => {
      for (const pkg of store.packages) {
        const prefix = `${pkg.name}:`;
        if (!id.startsWith(prefix)) continue;
        const scriptName = id.slice(prefix.length);
        if (pkg.scripts[scriptName]) {
          return {
            packageName: pkg.name,
            packagePath: pkg.path,
            scriptName,
          };
        }
      }
      return undefined;
    };

    let resolved = scriptIds.map((id) => ({ id, step: matchId(id) }));
    if (resolved.some((row) => !row.step)) {
      await store.refresh();
      resolved = scriptIds.map((id) => ({ id, step: matchId(id) }));
    }

    const missing = resolved.find((row) => !row.step);
    if (missing) {
      res.status(404).json({ error: `Script "${missing.id}" not found` });
      return;
    }

    const steps = resolved.map((row) => row.step!);

    try {
      const session = sessionManager.startSteps({
        packageName: "__favourites__",
        packagePath: steps[0].packagePath,
        groupPath,
        steps,
        failFast,
        continueOnErrorIds,
      });
      res.json(session);
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : "Failed to start session",
      });
    }
  });

  router.post("/api/sessions/stop", (req, res) => {
    const { id } = req.body as { id: string };
    if (!id) {
      res.status(400).json({ error: "id is required" });
      return;
    }
    const session = sessionManager.cancel(id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(session);
  });

  return router;
}
