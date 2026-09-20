const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;
const failures = new Map<string, { count: number; firstFailureAt: number; blockedUntil: number }>();

export function loginRateLimitKey(ip: string | undefined, username: string) { return `${ip ?? "unknown"}:${username.trim().toLowerCase()}`; }
export function isLoginAllowed(key: string, now = Date.now()) {
  const entry = failures.get(key);
  if (!entry) return true;
  if (entry.blockedUntil > now) return false;
  if (now - entry.firstFailureAt >= WINDOW_MS) failures.delete(key);
  return true;
}
export function recordLoginFailure(key: string, now = Date.now()) {
  const current = failures.get(key);
  const entry = !current || now - current.firstFailureAt >= WINDOW_MS ? { count: 1, firstFailureAt: now, blockedUntil: 0 } : { ...current, count: current.count + 1 };
  if (entry.count >= MAX_FAILURES) entry.blockedUntil = now + WINDOW_MS;
  failures.set(key, entry);
}
export function clearLoginFailures(key: string) { failures.delete(key); }
