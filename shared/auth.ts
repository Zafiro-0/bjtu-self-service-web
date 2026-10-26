// 30 days — bounded enough to limit exposure if a device is lost, long enough to avoid constant re-login.
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
export const SESSION_TTL_MS = SESSION_MAX_AGE_SECONDS * 1000;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_FAILURE_LIMIT = 5;
export const API_WINDOW_MS = 60 * 1000;
export const API_REQUEST_LIMIT = 60;
export const HOMEWORK_BATCH_SIZE = 12;

export function withRequestTimeout(init: RequestInit = {}, timeoutMs = 15_000) {
  return init.signal ? init : { ...init, signal: AbortSignal.timeout(timeoutMs) };
}

export function calculateCaptcha(expression: string) {
  const match = expression.replace(/\s+/g, "").match(/^(\d+)([+\-*])(\d+)=?$/);
  if (!match) return null;
  const left = Number(match[1]);
  const right = Number(match[3]);
  if (!Number.isSafeInteger(left) || !Number.isSafeInteger(right)) return null;
  if (match[2] === "+") return String(left + right);
  if (match[2] === "-") return String(left - right);
  return String(left * right);
}

export function mergeHomeworkPages(pages: Array<{ items?: unknown[]; pendingCount?: number }>) {
  return {
    pendingCount: pages.reduce((total, page) => total + Number(page.pendingCount || 0), 0),
    items: pages.flatMap(page => page.items || []),
  };
}
