import { useCallback } from "react";
import { runScript, stopScript } from "../lib/api";
import { useStore } from "../store/scripts";

export function useScriptRunner() {
  const setScriptStatus = useStore((s) => s.setScriptStatus);
  const clearScriptStatus = useStore((s) => s.clearScriptStatus);
  const selectScript = useStore((s) => s.selectScript);

  const run = useCallback(
    async (packageName: string, scriptName: string) => {
      const id = `${packageName}:${scriptName}`;
      const prev = useStore.getState().scriptStates.get(id);
      setScriptStatus(id, "running");
      selectScript(id);
      try {
        await runScript(packageName, scriptName);
      } catch (err) {
        if (prev) {
          setScriptStatus(id, prev.status, prev.exitCode);
        } else {
          clearScriptStatus(id);
        }
        console.error("[runny] run failed:", err);
        throw err;
      }
    },
    [setScriptStatus, clearScriptStatus, selectScript]
  );

  const stop = useCallback(
    async (packageName: string, scriptName: string) => {
      const id = `${packageName}:${scriptName}`;
      try {
        await stopScript(id);
      } catch (err) {
        console.error("[runny] stop failed:", err);
        throw err;
      }
    },
    []
  );

  return { run, stop };
}
