import { readFile } from "fs/promises";
import path from "path";
import { Router } from "express";

/** Read one pipe error report from the target repo. Path stays inside reports/. */
export function createReportsRouter(root: string): Router {
  const router = Router();
  const reportsDir = path.resolve(root, "reports");

  router.get("/api/pipe-report", async (req, res) => {
    const rel = String(req.query.path ?? "");
    const safe =
      rel.startsWith("reports/") &&
      !rel.includes("..") &&
      rel.endsWith("-errors.md") &&
      !rel.includes("\\");
    if (!safe) {
      res.status(400).json({ error: "invalid report path" });
      return;
    }
    const full = path.resolve(root, rel);
    if (full !== path.join(reportsDir, path.relative(reportsDir, full))) {
      res.status(400).json({ error: "invalid report path" });
      return;
    }
    try {
      const text = await readFile(full, "utf8");
      res.json({ path: rel, text });
    } catch {
      res.status(404).json({ error: "report not found" });
    }
  });

  return router;
}
