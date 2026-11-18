// Job `publish`: no DeepSeek secret. Re-collects PR state, runs decide_merge,
// merges only the evaluated SHA and keeps a single review comment up to date.
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decide_merge } from './decide.mjs';
import { renderComment } from './comment.mjs';
import { BOT_LOGIN, COMMENT_MARKER } from './rules.mjs';
import { MODEL_VERDICTS, INTERNAL_VERDICTS, SEVERITIES } from './verdict.mjs';
import { collectState, createGitHub, GitHubError, resolveTarget } from './github.mjs';

const MAX_COMMENT = 60_000;
const isSha = value => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);

function errorReview(note) {
  return { version: 1, pr: null, sha: null, model: null, evaluatedAt: new Date().toISOString(), verdict: 'error', summary: '', findings: [], notes: [note] };
}

/** Re-validates the review job output; anything unexpected becomes verdict `error`. */
export function parseReviewResult(raw, jobResult) {
  if (jobResult !== 'success') return errorReview(`job review terminou com ${jobResult || 'resultado desconhecido'}`);
  let data;
  try { data = JSON.parse(raw ?? ''); } catch { return errorReview('saída do job review ausente ou inválida'); }
  const valid = data && typeof data === 'object'
    && [...MODEL_VERDICTS, ...INTERNAL_VERDICTS].includes(data.verdict)
    && (data.sha === null || isSha(data.sha))
    && (data.pr === null || (Number.isSafeInteger(data.pr) && data.pr > 0))
    && typeof data.summary === 'string'
    && Array.isArray(data.findings) && data.findings.every(finding => finding && SEVERITIES.includes(finding.severity))
    && Array.isArray(data.notes) && data.notes.every(note => typeof note === 'string');
  if (!valid) return errorReview('saída do job review fora do formato esperado');
  return {
    version: 1,
    pr: data.pr,
    sha: data.sha,
    model: typeof data.model === 'string' ? data.model : null,
    evaluatedAt: typeof data.evaluatedAt === 'string' ? data.evaluatedAt : new Date().toISOString(),
    verdict: data.verdict,
    summary: data.summary,
    findings: data.findings,
    notes: data.notes,
  };
}

/** Pure: final decision for the collected state. */
export function decideFromState({ review, state, fallbackSha }) {
  const evaluatedSha = review.sha ?? fallbackSha ?? state.pr.headSha;
  const decision = decide_merge({
    pr: state.pr,
    evaluatedSha,
    authorPermission: state.authorPermission,
    checks: state.checks,
    review,
    files: state.files,
    commits: state.commits,
    size: state.size,
  });
  return { decision, review: { ...review, sha: evaluatedSha } };
}

/** Merge exactly `sha`; the API refuses when the head moved. */
export async function mergeSha(api, number, sha) {
  try {
    await api.request('PUT', `/repos/${api.repo}/pulls/${number}/merge`, { body: { merge_method: 'merge', sha } });
    return { merged: true, outcome: `merge realizado do SHA ${sha}` };
  } catch (error) {
    if (!(error instanceof GitHubError)) throw error;
    const why = error.status === 409 ? 'head do PR mudou' : error.status === 405 ? 'PR não mesclável ou proteção da branch não satisfeita' : 'falha na API';
    return { merged: false, outcome: `merge recusado (HTTP ${error.status}): ${why}` };
  }
}

/** Updates the bot comment carrying the marker, or creates it. Never touches others' comments. */
export async function upsertComment(api, number, body) {
  const text = body.length > MAX_COMMENT ? `${body.slice(0, MAX_COMMENT)}\n\n…(comentário truncado)` : body;
  const comments = await api.paginate(`/repos/${api.repo}/issues/${number}/comments?per_page=100`);
  const mine = comments.filter(comment => comment.user?.login === BOT_LOGIN && comment.user?.type === 'Bot' && typeof comment.body === 'string' && comment.body.startsWith(COMMENT_MARKER));
  const existing = mine.at(-1);
  if (existing) {
    await api.request('PATCH', `/repos/${api.repo}/issues/comments/${existing.id}`, { body: { body: text } });
    return { action: 'updated', id: existing.id };
  }
  const created = await api.request('POST', `/repos/${api.repo}/issues/${number}/comments`, { body: { body: text } });
  return { action: 'created', id: created?.id };
}

async function main() {
  const env = process.env;
  const runUrl = `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
  const api = createGitHub({ token: env.GITHUB_TOKEN, repo: env.GITHUB_REPOSITORY, apiUrl: env.GITHUB_API_URL });
  const review = parseReviewResult(env.REVIEW_RESULT, env.REVIEW_JOB_RESULT);

  let number = review.pr;
  let fallbackSha = null;
  if (!number) {
    const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
    const target = await resolveTarget({ api, event, eventName: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF });
    if (target.error) {
      console.log(`Nada a publicar: ${target.error}`);
      return;
    }
    number = target.number;
    fallbackSha = target.ciSha;
  }

  const state = await collectState(api, number);
  const result = decideFromState({ review, state, fallbackSha });
  let { decision } = result;
  let mergeOutcome = null;
  if (decision.decision === 'merge') {
    const merge = await mergeSha(api, number, result.review.sha);
    mergeOutcome = merge.outcome;
    if (!merge.merged) decision = { decision: 'skip', reasons: [merge.outcome] };
  }

  const body = renderComment({ review: result.review, decision, mergeOutcome, runUrl });
  const comment = await upsertComment(api, number, body);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `${renderComment({ review: result.review, decision, mergeOutcome, runUrl, withMarker: false })}\n`);
  console.log(`PR #${number} sha ${result.review.sha}: verdict=${result.review.verdict} decision=${decision.decision} comment=${comment.action}`);
  for (const reason of decision.reasons) console.log(`- ${reason}`);
}

// No top-level await: tests load this module through require(esm).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof GitHubError ? error.message : 'Falha inesperada no job publish');
    process.exitCode = 1;
  });
}
