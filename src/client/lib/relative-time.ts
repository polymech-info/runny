/** Compact relative time for finished-script stamps. */
export function formatTimeAgo(at: number | null | undefined, now = Date.now()): string {
  if (at == null || !Number.isFinite(at)) return "";
  const sec = Math.max(0, Math.floor((now - at) / 1000));
  if (sec < 45) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 14) return `${day}d ago`;
  return new Date(at).toLocaleDateString();
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "";
  const sec = Math.max(0, Math.round(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return rem ? `${min}m ${rem}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const mrem = min % 60;
  return mrem ? `${hr}h ${mrem}m` : `${hr}h`;
}

/** Clock time for a finished run. Same day is just the time. */
export function formatRunClock(at: number | null | undefined, now = Date.now()): string {
  if (at == null || !Number.isFinite(at)) return "";
  const when = new Date(at);
  const hm = when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (new Date(now).toDateString() === when.toDateString()) return hm;
  const day = when.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${day} ${hm}`;
}
