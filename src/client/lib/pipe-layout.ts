/** Per-segment script lists for the pipe. Defaults live in PipePanel; this file remembers drops, reorders, renames, and removals. */

const KEY = "runny-pipe-layout";
const EVENT = "runny-pipe-layout";

export type PipeLayout = {
  facets: Record<string, Record<string, string[]>>;
  renames: Record<string, string>;
  omitted: string[];
};

export function emptyPipeLayout(): PipeLayout {
  return { facets: {}, renames: {}, omitted: [] };
}

export function loadPipeLayout(): PipeLayout {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPipeLayout();
    const parsed = JSON.parse(raw) as Partial<PipeLayout>;
    return {
      facets: parsed.facets && typeof parsed.facets === "object" ? parsed.facets : {},
      renames: parsed.renames && typeof parsed.renames === "object" ? parsed.renames : {},
      omitted: Array.isArray(parsed.omitted) ? parsed.omitted.filter((n) => typeof n === "string") : [],
    };
  } catch {
    return emptyPipeLayout();
  }
}

export function savePipeLayout(layout: PipeLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // ignore quota / private mode
  }
  window.dispatchEvent(new Event(EVENT));
}

export function subscribePipeLayout(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function applyPipeRename(name: string, renames: Record<string, string>): string {
  let current = name;
  const seen = new Set<string>();
  while (renames[current] && !seen.has(current)) {
    seen.add(current);
    current = renames[current];
  }
  return current;
}

export function notePipeRename(oldName: string, newName: string): void {
  if (!oldName || !newName || oldName === newName) return;
  const layout = loadPipeLayout();
  layout.renames[oldName] = newName;
  for (const [from, to] of Object.entries(layout.renames)) {
    if (to === oldName) layout.renames[from] = newName;
  }
  for (const release of Object.values(layout.facets)) {
    for (const facetId of Object.keys(release)) {
      release[facetId] = release[facetId].map((name) => (name === oldName ? newName : name));
    }
  }
  layout.omitted = layout.omitted.map((name) => (name === oldName ? newName : name));
  savePipeLayout(layout);
}

/** Script was deleted from package.json. Hide it on every segment, including built-in defaults. */
export function omitPipeScript(name: string): void {
  if (!name) return;
  const layout = loadPipeLayout();
  if (!layout.omitted.includes(name)) layout.omitted.push(name);
  for (const release of Object.values(layout.facets)) {
    for (const facetId of Object.keys(release)) {
      release[facetId] = release[facetId].filter((script) => script !== name);
    }
  }
  savePipeLayout(layout);
}
