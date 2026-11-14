export type VoiceAccess = {
  sessionSeconds: number; limit: number; windowSeconds: number;
  remaining: number | null; retryAt: number; sessionDeadline?: number;
};
export const DEFAULT_VOICE_ACCESS: VoiceAccess = {
  sessionSeconds: 90, limit: 5, windowSeconds: 3600, remaining: null, retryAt: 0,
};
export function formatClock(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}
export function accessUrl(wsBase: string): string {
  const url = new URL(wsBase);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/voice/access"; url.search = ""; url.hash = "";
  return url.toString();
}
export function parseVoiceAccess(data: any, now = Date.now()): Partial<VoiceAccess> {
  const result: Partial<VoiceAccess> = {};
  if (Number.isFinite(data.session_seconds) && data.session_seconds > 0)
    result.sessionSeconds = Math.min(90, data.session_seconds);
  if (Number.isInteger(data.limit) && data.limit > 0) result.limit = data.limit;
  if (Number.isFinite(data.window_seconds) && data.window_seconds > 0)
    result.windowSeconds = data.window_seconds;
  if (Number.isInteger(data.remaining) && data.remaining >= 0) result.remaining = data.remaining;
  if (Number.isFinite(data.retry_after_seconds) && data.retry_after_seconds >= 0)
    result.retryAt = data.retry_after_seconds ? now + data.retry_after_seconds * 1000 : 0;
  if (Number.isFinite(data.remaining_session_seconds) && data.remaining_session_seconds >= 0)
    result.sessionDeadline = now + Math.min(90, data.remaining_session_seconds) * 1000;
  return result;
}
