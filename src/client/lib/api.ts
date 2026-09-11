const BASE = "";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    err.name === "TypeError" ||
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("load failed") ||
    msg.includes("network request failed")
  );
}

/**
 * fetch with retries for transient proxy/API blips (tsx watch restart,
 * rspack→3717 ECONNREFUSED, brief event-loop stalls).
 */
async function apiFetch(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number }
): Promise<Response> {
  const retries = opts?.retries ?? 3;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${BASE}${url}`, init);
      // Proxy may answer 502/504 while the API is restarting.
      if (
        (res.status === 502 || res.status === 503 || res.status === 504) &&
        attempt < retries
      ) {
        await sleep(120 * (attempt + 1));
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (!isTransientNetworkError(err) || attempt >= retries) break;
      await sleep(120 * (attempt + 1));
    }
  }
  const detail =
    lastErr instanceof Error ? lastErr.message : String(lastErr ?? "unknown");
  throw new Error(
    `Cannot reach API (${url}): ${detail}. If using npm run dev, wait for the server on :3717; for runny use http://127.0.0.1:3717 (not a stale :5173 tab).`
  );
}

async function getJson<T>(url: string): Promise<T> {
  const res = await apiFetch(url);
  if (!res.ok) {
    throw new Error(`${url} → ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // ignore
  }
  return `${fallback} → ${res.status}`;
}

export interface PackageInfo {
  name: string;
  path: string;
  relativePath: string;
  scripts: Record<string, string>;
  isRoot: boolean;
}

export interface AppConfig {
  repoName: string;
  rootPath: string;
  packageManager: string;
}

export interface ManagedProcess {
  id: string;
  packageName: string;
  packagePath: string;
  scriptName: string;
  command: string;
  pid: number | undefined;
  status: "running" | "stopped" | "errored";
  exitCode: number | null;
  startedAt: number;
  endedAt?: number | null;
}

export async function fetchConfig(): Promise<AppConfig> {
  return getJson<AppConfig>("/api/config");
}

export async function fetchPackages(): Promise<PackageInfo[]> {
  return getJson<PackageInfo[]>("/api/packages");
}

export async function fetchStatuses(): Promise<ManagedProcess[]> {
  return getJson<ManagedProcess[]>("/api/scripts/status");
}

export async function runScript(
  packageName: string,
  scriptName: string
): Promise<ManagedProcess> {
  const res = await apiFetch("/api/scripts/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageName, scriptName }),
  });
  if (!res.ok) throw new Error(await readError(res, "scripts/run"));
  return res.json() as Promise<ManagedProcess>;
}

export async function stopScript(id: string): Promise<void> {
  const res = await apiFetch("/api/scripts/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(await readError(res, "scripts/stop"));
}

export async function runInstall(): Promise<ManagedProcess> {
  const res = await apiFetch("/api/install", { method: "POST" });
  if (!res.ok) throw new Error(await readError(res, "install"));
  return res.json() as Promise<ManagedProcess>;
}

export async function removePackageScript(
  packageName: string,
  scriptName: string
): Promise<PackageInfo[]> {
  const res = await apiFetch("/api/scripts/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageName, scriptName }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    packages?: PackageInfo[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `remove → ${res.status}`);
  return data.packages ?? [];
}

export async function updatePackageScript(
  packageName: string,
  scriptName: string,
  patch: { name?: string; command?: string }
): Promise<PackageInfo[]> {
  const res = await apiFetch("/api/scripts/update", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageName, scriptName, ...patch }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    packages?: PackageInfo[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || `update → ${res.status}`);
  return data.packages ?? [];
}

export type SessionStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export type SessionStatus =
  | "queued"
  | "running"
  | "passed"
  | "failed"
  | "cancelled";

export interface SessionStep {
  scriptName: string;
  packageName?: string;
  packagePath?: string;
  command: string;
  status: SessionStepStatus;
  exitCode: number | null;
  startedAt: number | null;
  endedAt: number | null;
}

export interface Session {
  id: string;
  packageName: string;
  packagePath: string;
  groupPath: string;
  mode: "sequential";
  failFast: boolean;
  status: SessionStatus;
  steps: SessionStep[];
  currentIndex: number;
  startedAt: number;
  endedAt: number | null;
}

export async function fetchSessions(): Promise<Session[]> {
  return getJson<Session[]>("/api/sessions");
}

export async function startGroupSession(
  packageName: string,
  groupPath: string,
  failFast = true
): Promise<Session> {
  const res = await apiFetch("/api/sessions/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ packageName, groupPath, failFast }),
  });
  const data = (await res.json()) as Session & { error?: string };
  if (!res.ok) throw new Error(data.error || `sessions/start → ${res.status}`);
  return data;
}

/** Sequential run for a favourite group (`scriptIds` = `pkg:script`). */
export async function startFavouriteSession(
  groupPath: string,
  scriptIds: string[],
  failFast = true
): Promise<Session> {
  const res = await apiFetch("/api/sessions/start-list", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groupPath, scriptIds, failFast }),
  });
  const data = (await res.json()) as Session & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `sessions/start-list → ${res.status}`);
  }
  return data;
}

export function favouriteSessionPath(groupId: string): string {
  return `favourite:${groupId}`;
}

/** Process / terminal id for the session's current (or given) step. */
export function sessionStepScriptId(
  session: Session,
  stepIndex = session.currentIndex
): string | null {
  const step = session.steps[stepIndex];
  if (!step) return null;
  const pkg = step.packageName ?? session.packageName;
  return `${pkg}:${step.scriptName}`;
}

export async function stopSession(id: string): Promise<Session> {
  const res = await apiFetch("/api/sessions/stop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = (await res.json()) as Session & { error?: string };
  if (!res.ok) throw new Error(data.error || `sessions/stop → ${res.status}`);
  return data;
}
