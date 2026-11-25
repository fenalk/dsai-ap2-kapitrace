// SPEC-FDE 007, E3: log only the route and the error category, never message, stack, meta or the object.
const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;
const SAFE_CODE = /^[A-Za-z0-9_]{1,32}$/;

/** Pure: builds the sanitized log line for an unexpected route error. */
export function format_route_error(route: string, error: unknown): string {
  const value = typeof error === 'object' && error !== null ? error as { name?: unknown; code?: unknown } : {};
  const name = typeof value.name === 'string' && SAFE_NAME.test(value.name) ? value.name : 'Error';
  const code = typeof value.code === 'string' && SAFE_CODE.test(value.code) ? ` code=${value.code}` : '';
  return `${route} failed: ${name}${code}`;
}

export function logRouteError(route: string, error: unknown): void {
  console.error(format_route_error(route, error));
}
