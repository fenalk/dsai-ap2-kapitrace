import { Request, Response, NextFunction } from 'express';
import { setting } from '../shared/config';

// SPEC-FDE 007, E1: failed-login limit per IP+email and per IP, fixed window, per process.
// Every attempt is counted provisionally when it starts, so parallel requests cannot exceed the limit;
// the count is kept only for 401, removed for other outcomes, and a success clears the IP+email key.
const MAX_KEYS = 10000;
const windows = new Map<string, { starts: number; count: number }>();

function limits() {
  return {
    perAccount: setting('LOGIN_MAX_FAILURES_PER_ACCOUNT', 5, 1, 1000),
    perIp: setting('LOGIN_MAX_FAILURES_PER_IP', 20, 1, 100000),
    windowMs: setting('LOGIN_WINDOW_SECONDS', 900, 1, 86400) * 1000
  };
}

/** Test helper: forget every counter of this process. */
export function resetLoginLimits(): void {
  windows.clear();
}

export function limitLogin(req: Request, res: Response, next: NextFunction): void {
  const { perAccount, perIp, windowMs } = limits();
  const now = Date.now();
  for (const [key, value] of windows) if (now - value.starts >= windowMs) windows.delete(key);

  // Does not trust unconfigured proxy headers; deploy behind a proxy must set `trust proxy`.
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
  const keys: { key: string; max: number }[] = [{ key: `ip:${ip}`, max: perIp }];
  if (email) keys.push({ key: `account:${ip}\n${email}`, max: perAccount });

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  const blocked = keys.map(({ key, max }) => ({ entry: windows.get(key), max })).filter(({ entry, max }) => entry && entry.count >= max);
  if (blocked.length) {
    const wait = Math.max(...blocked.map(({ entry }) => Math.ceil((windowMs - (now - entry!.starts)) / 1000)));
    res.setHeader('Retry-After', Math.max(1, wait));
    res.status(429).json({ error: 'Too many login attempts' });
    return;
  }
  const missing = keys.filter(({ key }) => !windows.has(key)).length;
  if (missing && windows.size + missing > MAX_KEYS) {
    res.status(503).json({ error: 'Login capacity exceeded' });
    return;
  }

  const counted = keys.map(({ key }) => {
    let entry = windows.get(key);
    if (!entry) { entry = { starts: now, count: 0 }; windows.set(key, entry); }
    entry.count++;
    return { key, entry };
  });
  // 'finish' settles before the client reads the response; 'close' covers aborted requests.
  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    const status = res.headersSent ? res.statusCode : 0;
    if (status === 401) return;
    for (const { key, entry } of counted) {
      // Only undo our own increment, and only while that window is still the one we counted in.
      if (windows.get(key) !== entry) continue;
      if (status === 200 && key.startsWith('account:')) windows.delete(key);
      else if (--entry.count <= 0) windows.delete(key);
    }
  };
  res.once('finish', settle);
  res.once('close', settle);
  next();
}
