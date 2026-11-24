// Pure indicator rules for the lookup input (SPEC-FDE 006, F4.1/F4.2): no React, no I/O.
// They only prepare what is sent; validation stays with the backend.
import type { LookupType } from './lookup-messages';

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const HASH = /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i;

/** Undoes common "defanging": [.] (.) {.} [dot] → ".", [:] → ":", hxxp(s) → http(s). */
export function refang(raw: string): string {
  return raw
    .replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]/gi, '.')
    .replace(/\[:\]/g, ':')
    .replace(/\bhxxp(s?)(?=:\/\/)/gi, (_, secure: string) => `http${secure.toLowerCase()}`);
}

/** Host of a URL with scheme, without port, credentials or IPv6 brackets; null when it is not such a URL. */
function urlHost(value: string): string | null {
  if (!SCHEME.test(value)) return null;
  try {
    const host = new URL(value).hostname;
    return host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  } catch { return null; }
}

/** Trimmed, refanged and reduced to the host when it is a URL: the common part of detection and normalization. */
function prepare(raw: string): string {
  const value = refang(raw.trim());
  return urlHost(value) ?? value;
}

/**
 * Type suggested while the user types (F4.1): IPv4 or text with ":" (no URL scheme) → IP;
 * 32/40/64 hex characters → hash; anything else → domain. A URL is judged by its host.
 */
export function detectIndicatorType(raw: string): LookupType {
  const value = prepare(raw);
  if (IPV4.test(value) || value.includes(':')) return 'ip';
  if (HASH.test(value)) return 'hash';
  return 'domain';
}

/** Value actually sent (F4.2). Domains are lower-cased and lose the trailing dot; other types are only refanged. */
export function normalizeIndicator(raw: string, type: LookupType): string {
  const value = prepare(raw);
  return type === 'domain' ? value.toLowerCase().replace(/\.+$/, '') : value;
}

/** What the screen shows as "Consultando como: …": only when the sent value differs from what was typed. */
export function sentValueNotice(raw: string, type: LookupType): string | null {
  const typed = raw.trim();
  const sent = normalizeIndicator(raw, type);
  return typed && sent && sent !== typed ? sent : null;
}
