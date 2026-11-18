// Deterministic rules shared by the review and publish jobs. Pure: no I/O.
// SPEC/SPEC-FDE/2026-11-18-ci-code-review-ia-merge.md (sections 6 and 7.4).

export const COMMENT_MARKER = '<!-- kapitrace-ai-review -->';
export const BOT_LOGIN = 'github-actions[bot]';
export const GITHUB_ACTIONS_APP = 'github-actions';
export const BASE_BRANCH = 'main';
export const BLOCK_LABEL = 'no-automerge';
export const REQUIRED_CHECKS = Object.freeze(['secrets', 'unit', 'integration', 'build-backend', 'frontend', 'e2e']);
export const LIMITS = Object.freeze({ maxFiles: 100, maxDiffBytes: 120_000 });
export const MAX_PR_COMMITS = 250; // GitHub API ceiling for GET /pulls/{n}/commits

const SENSITIVE_PREFIXES = [
  '.github/', 'scripts/', 'SPEC/',
  'src/backend/prisma/migrations/',
];
const SENSITIVE_EXACT = new Set([
  'src/backend/prisma/schema.prisma',
  'README.md', '.gitignore', '.gitattributes', 'AGENTS.md', 'CLAUDE.md',
  'src/frontend/AGENTS.md', 'src/frontend/CLAUDE.md',
]);
// Agent tool directories are matched as any path segment (conservative superset of D9).
const SENSITIVE_SEGMENTS = new Set(['.claude', '.cursor', '.agents', '.devin']);
const SENSITIVE_BASENAMES = new Set(['package.json', 'package-lock.json']);
const EXISTING_ONLY_PREFIXES = ['prompts/sessoes/', 'metrics/'];

/** True when a single path always requires human review (independent of status). */
export function isSensitivePath(file) {
  if (typeof file !== 'string' || !file) return false;
  if (SENSITIVE_EXACT.has(file)) return true;
  if (SENSITIVE_PREFIXES.some(prefix => file.startsWith(prefix))) return true;
  const segments = file.split('/');
  const base = segments.at(-1);
  if (segments.slice(0, -1).some(segment => SENSITIVE_SEGMENTS.has(segment))) return true;
  if (SENSITIVE_BASENAMES.has(base)) return true;
  if (base.startsWith('.env') && base !== '.env.example') return true;
  return false;
}

/**
 * Sensitive entries of a PR file list ({ filename, status, previous_filename }).
 * Renames are checked on both sides; prompts/sessoes/ and metrics/ only accept new files.
 */
export function sensitiveFiles(files) {
  const hits = new Set();
  for (const entry of files) {
    const paths = [entry.filename, entry.previous_filename].filter(Boolean);
    for (const file of paths) if (isSensitivePath(file)) hits.add(file);
    if (entry.status !== 'added') {
      for (const file of paths) if (EXISTING_ONLY_PREFIXES.some(prefix => file.startsWith(prefix))) hits.add(file);
    }
  }
  return [...hits].sort();
}

/** True when any path (or rename source) lives under src/ or tests/. */
export function touchesCode(files) {
  return files.some(entry => [entry.filename, entry.previous_filename]
    .some(file => typeof file === 'string' && (file.startsWith('src/') || file.startsWith('tests/'))));
}

/** Both trailers present as their own lines with a non-empty value. */
export function hasTrailers(message) {
  if (typeof message !== 'string') return false;
  return /^Agent:[ \t]*\S/m.test(message) && /^Spec:[ \t]*\S/m.test(message);
}

/** Non-merge commits lacking Agent:/Spec: trailers. */
export function commitsMissingTrailers(commits) {
  return commits
    .filter(commit => (commit.parents ?? 1) <= 1 && !hasTrailers(commit.message))
    .map(commit => String(commit.sha ?? '').slice(0, 7));
}

export function withinLimits(size) {
  return Number.isInteger(size?.files) && Number.isInteger(size?.bytes)
    && size.files <= LIMITS.maxFiles && size.bytes <= LIMITS.maxDiffBytes;
}

/**
 * Required checks state for one SHA from GitHub check runs.
 * Only runs from the github-actions app count; the newest run per name wins.
 * Returns { name: conclusion | null } for every required check.
 */
export function requiredChecksState(checkRuns, sha) {
  const latest = new Map();
  for (const run of checkRuns) {
    if (run?.head_sha !== sha || run?.app?.slug !== GITHUB_ACTIONS_APP || !REQUIRED_CHECKS.includes(run.name)) continue;
    const current = latest.get(run.name);
    if (!current || Number(run.id) > Number(current.id)) latest.set(run.name, run);
  }
  return Object.fromEntries(REQUIRED_CHECKS.map(name => {
    const run = latest.get(name);
    return [name, run && run.status === 'completed' ? run.conclusion ?? null : null];
  }));
}

export function failingChecks(checks) {
  return REQUIRED_CHECKS.filter(name => checks?.[name] !== 'success');
}
