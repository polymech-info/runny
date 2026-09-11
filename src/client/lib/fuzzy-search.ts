/**
 * Fuzzy script search: case-insensitive, camelCase / separator word breaks,
 * compact match (ignoring seps), acronym, ordered word prefixes.
 *
 * Subsequence matching is limited to short script *names* — applying it to
 * long npm command strings caused false hits (e.g. `changelog:next` →
 * `build:cpp:plugins`).
 */

const SEP_RE = /[:\-_/.]+/;

/** Split on separators and camelCase boundaries. */
export function splitSearchWords(input: string): string[] {
  const spaced = input
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(SEP_RE, " ");
  return spaced
    .split(/\s+/)
    .map((w) => w.toLowerCase())
    .filter((w) => w.length > 0);
}

function compact(s: string): string {
  return s.toLowerCase().replace(/[:\-_/. \t]+/g, "");
}

function isSubsequence(needle: string, haystack: string): boolean {
  if (!needle) return true;
  let i = 0;
  for (let j = 0; j < haystack.length && i < needle.length; j++) {
    if (haystack[j] === needle[i]) i++;
  }
  return i === needle.length;
}

/** Every query word is a prefix of some haystack word, in order. */
function matchWordPrefixes(queryWords: string[], hayWords: string[]): boolean {
  if (queryWords.length === 0) return true;
  let hi = 0;
  for (const qw of queryWords) {
    let found = false;
    while (hi < hayWords.length) {
      if (hayWords[hi].startsWith(qw)) {
        found = true;
        hi++;
        break;
      }
      hi++;
    }
    if (!found) return false;
  }
  return true;
}

/** Query matches concatenation of word initials (and optionally more). */
function matchAcronym(queryCompact: string, hayWords: string[]): boolean {
  if (!queryCompact || hayWords.length === 0) return false;
  const initials = hayWords.map((w) => w[0]).join("");
  if (initials.startsWith(queryCompact) || initials.includes(queryCompact)) {
    return true;
  }
  return isSubsequence(queryCompact, initials);
}

type ScoreOpts = {
  /** Scattered char match — only safe on short names, not long commands. */
  allowSubsequence?: boolean;
  allowAcronym?: boolean;
};

function scoreMatch(query: string, hay: string, opts: ScoreOpts = {}): number {
  const allowSubsequence = opts.allowSubsequence ?? false;
  const allowAcronym = opts.allowAcronym ?? true;
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const lower = hay.toLowerCase();
  if (lower === q) return 100;
  if (lower.startsWith(q)) return 90;
  if (lower.includes(q)) return 80;

  const qCompact = compact(q);
  const hCompact = compact(hay);
  if (hCompact === qCompact) return 75;
  if (hCompact.startsWith(qCompact)) return 70;
  if (hCompact.includes(qCompact)) return 60;

  const qWords = splitSearchWords(q);
  const hWords = splitSearchWords(hay);
  if (matchWordPrefixes(qWords, hWords)) return 55;
  if (allowAcronym && matchAcronym(qCompact, hWords)) return 45;
  if (allowSubsequence && isSubsequence(qCompact, hCompact)) return 30;
  return 0;
}

/** Score a script against name (fuzzy) + command (strict substring only). */
export function fuzzyScoreScript(
  query: string,
  name: string,
  command?: string | null,
  description?: string | null,
  id?: string | null
): number {
  const q = query.trim();
  if (!q) return 1;
  const nameScore = scoreMatch(q, name, {
    allowSubsequence: true,
    allowAcronym: true,
  });
  // Commands are long — only contiguous includes, no subsequence/acronym.
  const cmdScore = command
    ? scoreMatch(q, command, { allowSubsequence: false, allowAcronym: false })
    : 0;
  const descScore = description
    ? scoreMatch(q, description, { allowSubsequence: true, allowAcronym: true })
    : 0;
  const idScore = id
    ? scoreMatch(q, id, { allowSubsequence: true, allowAcronym: true })
    : 0;
  return Math.max(nameScore, cmdScore, descScore, idScore);
}

/** True if query fuzzy-matches any of the provided strings (name-style). */
export function fuzzyMatch(
  query: string,
  ...candidates: Array<string | null | undefined>
): boolean {
  return fuzzyScore(query, ...candidates) > 0;
}

/** Best score across candidates (0 = no match). Higher is better. */
export function fuzzyScore(
  query: string,
  ...candidates: Array<string | null | undefined>
): number {
  const q = query.trim();
  if (!q) return 1;
  let best = 0;
  for (const c of candidates) {
    if (!c) continue;
    // Default: allow subsequence only for short candidates (script names).
    best = Math.max(
      best,
      scoreMatch(q, c, {
        allowSubsequence: c.length <= 80,
        allowAcronym: true,
      })
    );
  }
  return best;
}
