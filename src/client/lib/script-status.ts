import type { Session, SessionStep } from "./api";
import type { ScriptState } from "../store/scripts";

export type DisplayStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

function stampAt(at: number | null | undefined): number {
  return at != null && Number.isFinite(at) ? at : 0;
}

/** Most recent finished-or-running session step for this script. */
export function latestSessionStep(
  sessions: Map<string, Session>,
  packageName: string,
  scriptName: string
): SessionStep | undefined {
  let best: SessionStep | undefined;
  let bestAt = -1;
  for (const session of sessions.values()) {
    for (const step of session.steps) {
      const pkg = step.packageName ?? session.packageName;
      if (pkg !== packageName || step.scriptName !== scriptName) continue;
      // A later queued session must not hide the last real result.
      if (step.status === "pending") continue;
      const at = stampAt(step.endedAt ?? step.startedAt);
      if (at >= bestAt) {
        bestAt = at;
        best = step;
      }
    }
  }
  return best;
}

function outcomeFromStep(step: SessionStep): {
  status: DisplayStatus;
  exitCode: number | null;
  endedAt: number | null;
} | null {
  if (step.status === "passed") {
    return {
      status: "passed",
      exitCode: step.exitCode,
      endedAt: step.endedAt ?? step.startedAt ?? null,
    };
  }
  if (step.status === "failed") {
    return {
      status: "failed",
      exitCode: step.exitCode,
      endedAt: step.endedAt ?? step.startedAt ?? null,
    };
  }
  if (step.status === "skipped") {
    return {
      status: "skipped",
      exitCode: null,
      endedAt: step.endedAt ?? step.startedAt ?? null,
    };
  }
  return null;
}

function outcomeFromScript(scriptState: ScriptState): {
  status: DisplayStatus;
  exitCode: number | null;
  endedAt: number | null;
} | null {
  if (scriptState.status === "errored") {
    return {
      status: "failed",
      exitCode: scriptState.exitCode,
      endedAt: scriptState.endedAt ?? null,
    };
  }
  if (scriptState.status === "stopped") {
    const code = scriptState.exitCode;
    if (code != null && code !== 0) {
      return {
        status: "failed",
        exitCode: code,
        endedAt: scriptState.endedAt ?? null,
      };
    }
    return {
      status: "passed",
      exitCode: code,
      endedAt: scriptState.endedAt ?? null,
    };
  }
  return null;
}

export function resolveDisplayStatus(
  scriptState: ScriptState | undefined,
  sessionStep: SessionStep | undefined
): {
  status: DisplayStatus;
  exitCode: number | null;
  endedAt: number | null;
} {
  // Live process wins while running.
  if (scriptState?.status === "running") {
    return { status: "running", exitCode: null, endedAt: null };
  }
  if (sessionStep?.status === "running") {
    return { status: "running", exitCode: null, endedAt: null };
  }

  // Group runs and direct runs are stored separately. The pill must follow
  // whichever finish is later — an older skip/pass was masking a newer run
  // and showing "Nh ago" for tasks that just finished.
  const fromStep = sessionStep ? outcomeFromStep(sessionStep) : null;
  const fromScript = scriptState ? outcomeFromScript(scriptState) : null;
  const stepAt = stampAt(fromStep?.endedAt);
  const scriptAt = stampAt(fromScript?.endedAt);
  if (fromStep && stepAt >= scriptAt) return fromStep;
  if (fromScript) return fromScript;
  return { status: "idle", exitCode: null, endedAt: null };
}
