// Job `review`: read-only. Collects PR state, checks preconditions and, only when
// they hold, asks DeepSeek for a verdict. Output: job output `result` (JSON).
import { randomBytes } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { callDeepSeek, describeFailure, DEFAULT_MODEL } from './deepseek.mjs';
import { buildMessages, newMarker } from './prompt.mjs';
import { validateVerdict } from './verdict.mjs';
import { BASE_BRANCH, LIMITS, failingChecks, withinLimits } from './rules.mjs';
import { collectState, createGitHub, GitHubError, resolveTarget } from './github.mjs';

export function emptyResult(now = new Date()) {
  return { version: 1, pr: null, sha: null, model: null, evaluatedAt: now.toISOString(), verdict: 'not_run', summary: '', findings: [], notes: [] };
}

/**
 * Decides whether to call the model and turns its answer into a result. I/O is injected.
 * @param {object} input
 * @param {{ number: number, ciSha: string|null }} input.target
 * @param {object} input.state  result of collectState
 * @param {string} input.instructions fixed prompt
 * @param {Function} input.callModel (messages) => callDeepSeek result
 * @param {string} input.model configured model name
 */
export async function runReview({ target, state, instructions, callModel, model = DEFAULT_MODEL, now = new Date(), random = randomBytes }) {
  const result = emptyResult(now);
  result.pr = target.number;
  const { pr } = state;
  result.sha = target.ciSha ?? pr.headSha;
  const stop = (verdict, note) => { result.verdict = verdict; result.notes.push(note); return result; };

  if (pr.state !== 'open') return stop('not_run', 'PR não está aberto');
  if (pr.draft !== false) return stop('not_run', 'PR é rascunho (draft): IA não chamada');
  if (pr.baseRef !== BASE_BRANCH) return stop('not_run', `base do PR não é ${BASE_BRANCH}`);
  if (pr.headRepo !== pr.repo) return stop('not_run', 'PR de fork não é revisado');
  if (target.ciSha && target.ciSha !== pr.headSha) return stop('not_run', 'head do PR mudou desde o CI: aguardando novo CI');
  const failing = failingChecks(state.checks);
  if (failing.length) return stop('not_run', `checks obrigatórios sem sucesso (${failing.join(', ')}): IA não chamada`);
  if (!withinLimits(state.size) || typeof state.diff !== 'string') {
    return stop('needs_human', `diff acima do limite (${LIMITS.maxFiles} arquivos / ${LIMITS.maxDiffBytes} bytes) ou indisponível: IA não chamada`);
  }

  const messages = buildMessages({
    instructions,
    pr: { number: pr.number, title: pr.title, body: pr.body, author: pr.author, baseRef: pr.baseRef, headRef: pr.headRef },
    files: state.files,
    commits: state.commits,
    diff: state.diff,
    marker: newMarker(random),
  });
  result.model = model;
  const response = await callModel(messages);
  if (!response.ok) return stop('error', describeFailure(response));
  if (response.model) result.model = response.model;

  const checked = validateVerdict(response.content, state.files.map(file => file.filename));
  if (!checked.ok) return stop('error', `veredito fora do schema: ${checked.reason}`);
  result.verdict = checked.verdict;
  result.summary = checked.summary;
  result.findings = checked.findings;
  result.notes.push(...checked.notes);
  return result;
}

export function writeOutput(file, name, value, random = randomBytes) {
  const delimiter = `EOF_${random(16).toString('hex')}`;
  appendFileSync(file, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

async function main() {
  const env = process.env;
  let result = emptyResult();
  try {
    const api = createGitHub({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPOSITORY, apiUrl: env.GITHUB_API_URL });
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const target = await resolveTarget({ api, event, eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF });
    if (target.error) {
      result.notes.push(target.error);
    } else {
      result.pr = target.number;
      const state = await collectState(api, target.number);
      const instructions = readFileSync(new URL('../../ai-review/prompt.md', import.meta.url), 'utf8');
      const model = env.DEEPSEEK_MODEL || DEFAULT_MODEL;
      result = await runReview({
        target, state, instructions, model,
        callModel: messages => callDeepSeek({ apiKey: env.DEEPSEEK_API_KEY, baseUrl: env.DEEPSEEK_BASE_URL, model, messages }),
      });
    }
  } catch (error) {
    // Only our own sanitized errors (GitHubError) carry a message worth keeping.
    result.verdict = 'error';
    result.notes.push(error instanceof GitHubError ? error.message : 'falha inesperada no job review');
  }
  console.log(`PR #${result.pr ?? '?'} sha ${result.sha ?? '?'}: verdict=${result.verdict}`);
  for (const note of result.notes) console.log(`- ${note}`);
  if (env.GITHUB_OUTPUT) writeOutput(env.GITHUB_OUTPUT, 'result', JSON.stringify(result));
}

// No top-level await: tests load this module through require(esm).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Falha inesperada no job review'); process.exitCode = 1; });
}
