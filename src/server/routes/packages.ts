import { Router } from "express";
import type { PackageStore } from "../services/package-store.js";

export function createPackagesRouter(store: PackageStore): Router {
  const router = Router();

  router.get("/api/packages", async (req, res) => {
    if (req.query.refresh === "1") await store.refresh();
    res.json(store.packages);
  });

  return router;
}
