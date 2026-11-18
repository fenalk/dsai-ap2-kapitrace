// Minimal GitHub REST client (native fetch) and PR state collection.
// Errors carry only method, route and HTTP status: never headers, token or bodies.
import { setTimeout as delay } from 'node:timers/promises';
import { BASE_BRANCH, LIMITS, MAX_PR_COMMITS, requiredChecksState } from './rules.mjs';

export const CI_WORKFLOW_PATH = '.github/workflows/ci.yml';
const REQUEST_TIMEOUT_MS = 30_000;

export class GitHubError extends Error {
  constructor(method, route, status) {
    super(`GitHub API ${method} ${route} -> ${status === 0 ? 'falha de rede' : `HTTP ${status}`}`);
    this.status = status;
  }
}

export function createGitHub({ token, repo, apiUrl = 'https://api.github.com', fetchImpl = globalThis.fetch }) {
  if (!token) throw new Error('GITHUB_TOKEN ausente');
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) throw new Error('GITHUB_REPOSITORY inválido');
  const base = new URL(apiUrl);
  const headers = accept => ({
    accept: accept ?? 'application/vnd.github+json',
    authorization: `Bearer ${token}`,
    'x-github-api-version': '2022-11-28',
    'user-agent': 'kapitrace-ai-review',
  });

  async function raw(method, route, { body, accept, url } = {}) {
    const target = url ? new URL(url) : new URL(`${base.pathname.replace(/\/$/, '')}${route}`, base);
    if (target.origin !== base.origin) throw new GitHubError(method, route, 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetchImpl(target, {
        method,
        headers: { ...headers(accept), ...(body ? { 'content-type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      return response;
    } catch {
      throw new GitHubError(method, route, 0);
    } finally {
      clearTimeout(timer);
    }
  }

  async function request(method, route, options = {}) {
    const response = await raw(method, route, options);
    if (!response.ok) {
      try { await response.body?.cancel(); } catch { /* ignore */ }
      throw new GitHubError(method, route, response.status);
    }
    if (options.text) return response.text();
    if (response.status === 204) return null;
    return response.json();
  }

  async function paginate(route, { key, maxPages = 30 } = {}) {
    const items = [];
    let url;
    for (let page = 0; page < maxPages; page += 1) {
      const response = await raw('GET', route, { url });
      if (!response.ok) {
        try { await response.body?.cancel(); } catch { /* ignore */ }
        throw new GitHubError('GET', route, response.status);
      }
      const data = await response.json();
      items.push(...(key ? data[key] : data));
      const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get('link') ?? '')?.[1];
      if (!next) break;
      url = next;
    }
    return items;
  }

  return { repo, request, paginate };
}

/**
 * Which PR/SHA this run evaluates. Returns { number, ciSha } or { error }.
 * ciSha is the SHA CI ran on (workflow_run) or null (workflow_dispatch → current head).
 */
export async function resolveTarget({ api, event, eventName, ref }) {
  if (eventName === 'workflow_dispatch') {
    if (ref !== `refs/heads/${BASE_BRANCH}`) return { error: `workflow_dispatch só é aceito a partir de ${BASE_BRANCH}` };
    const input = String(event?.inputs?.pr_number ?? '').trim();
    if (!/^[1-9]\d{0,8}$/.test(input)) return { error: 'número de PR inválido' };
    return { number: Number(input), ciSha: null };
  }
  if (eventName !== 'workflow_run') return { error: 'evento não suportado' };
  const run = event?.workflow_run;
  if (run?.event !== 'pull_request') return { error: 'CI não originado de pull_request' };
  if (run?.path !== CI_WORKFLOW_PATH) return { error: 'workflow_run não veio de .github/workflows/ci.yml' };
  if (run?.head_repository?.full_name !== api.repo) return { error: 'PR de fork não é revisado' };
  const sha = run.head_sha;
  if (!/^[0-9a-f]{40}$/.test(sha ?? '')) return { error: 'SHA do CI inválido' };

  // pull_requests may list PRs of other repositories: keep only ours.
  const ours = (run.pull_requests ?? []).find(pr => pr?.base?.repo?.url?.endsWith(`/repos/${api.repo}`) && pr?.head?.sha === sha);
  if (ours) return { number: ours.number, ciSha: sha };
  const pulls = await api.request('GET', `/repos/${api.repo}/commits/${sha}/pulls`);
  const match = pulls.find(pr => pr.state === 'open' && pr.base?.ref === BASE_BRANCH && pr.head?.sha === sha && pr.head?.repo?.full_name === api.repo);
  return match ? { number: match.number, ciSha: sha } : { error: 'nenhum PR aberto para o SHA do CI' };
}

function normalizePr(pr, repo) {
  return {
    number: pr.number,
    state: pr.state,
    draft: pr.draft,
    baseRef: pr.base?.ref ?? null,
    mergeable: pr.mergeable,
    headRepo: pr.head?.repo?.full_name ?? null,
    repo,
    headSha: pr.head?.sha ?? null,
    headRef: pr.head?.ref ?? null,
    author: pr.user?.login ?? null,
    labels: (pr.labels ?? []).map(label => label.name),
    commitCount: pr.commits,
    changedFiles: pr.changed_files,
    title: pr.title ?? '',
    body: pr.body ?? '',
  };
}

/**
 * Collects everything decide_merge and the reviewer need, for the PR's current head.
 * @param {{ includeDiff?: boolean, sleep?: Function }} options
 */
export async function collectState(api, number, { sleep = delay, includeDiff = true } = {}) {
  const route = `/repos/${api.repo}/pulls/${number}`;
  let raw = await api.request('GET', route);
  // mergeable is computed asynchronously; null means "unknown" → ask again, then fail closed.
  for (let tries = 0; raw.state === 'open' && raw.mergeable === null && tries < 3; tries += 1) {
    await sleep(3_000);
    raw = await api.request('GET', route);
  }
  const pr = normalizePr(raw, api.repo);
  if (pr.mergeable !== true) pr.mergeable = false;

  const [files, commits, checkRuns, authorPermission] = await Promise.all([
    api.paginate(`${route}/files?per_page=100`),
    api.paginate(`${route}/commits?per_page=100`, { maxPages: Math.ceil(MAX_PR_COMMITS / 100) }),
    api.paginate(`/repos/${api.repo}/commits/${pr.headSha}/check-runs?per_page=100&filter=latest`, { key: 'check_runs', maxPages: 10 }),
    api.request('GET', `/repos/${api.repo}/collaborators/${encodeURIComponent(pr.author ?? '')}/permission`)
      .then(data => data?.permission ?? 'none')
      .catch(error => { if (error.status === 404) return 'none'; throw error; }),
  ]);

  let diff = null;
  if (includeDiff && Number.isInteger(pr.changedFiles) && pr.changedFiles <= LIMITS.maxFiles) {
    // GitHub refuses diffs that are too large (406/422): leave size unknown → fail closed.
    diff = await api.request('GET', route, { accept: 'application/vnd.github.diff', text: true })
      .catch(error => { if ([406, 422].includes(error.status)) return null; throw error; });
  }

  return {
    pr,
    files: files.map(file => ({
      filename: file.filename,
      status: file.status,
      previous_filename: file.previous_filename,
      additions: file.additions,
      deletions: file.deletions,
    })),
    commits: commits.map(commit => ({
      sha: commit.sha,
      message: commit.commit?.message ?? '',
      parents: (commit.parents ?? []).length,
    })),
    checks: requiredChecksState(checkRuns, pr.headSha),
    authorPermission,
    diff,
    size: {
      files: Math.max(Number.isInteger(pr.changedFiles) ? pr.changedFiles : Infinity, files.length),
      bytes: typeof diff === 'string' ? Buffer.byteLength(diff, 'utf8') : null,
    },
  };
}
