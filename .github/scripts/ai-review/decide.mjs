// Pure merge decision (SPEC section 6). No I/O: the caller collects state.
import {
  BASE_BRANCH, BLOCK_LABEL, MAX_PR_COMMITS,
  sensitiveFiles, touchesCode, commitsMissingTrailers, withinLimits, failingChecks,
} from './rules.mjs';

const BLOCKING = new Set(['blocker', 'major']);

/**
 * @param {object} state
 * @param {object} state.pr          { state, draft, baseRef, mergeable, headRepo, repo, headSha, author, labels, commitCount }
 * @param {string} state.evaluatedSha SHA reviewed by the AI
 * @param {string|null} state.authorPermission admin | write | read | none
 * @param {object} state.checks      { checkName: conclusion|null } for evaluatedSha
 * @param {object} state.review      { verdict, sha, findings }
 * @param {Array}  state.files       PR files { filename, status, previous_filename }
 * @param {Array}  state.commits     PR commits { sha, message, parents }
 * @param {object} state.size        { files, bytes }
 * @returns {{ decision: 'merge' | 'skip', reasons: string[] }}
 */
export function decide_merge(state) {
  const reasons = [];
  const pr = state?.pr;
  const sha = state?.evaluatedSha;
  if (!pr || typeof sha !== 'string' || !sha) return { decision: 'skip', reasons: ['estado do PR indisponível'] };

  // 1. open, ready, base main, mergeable
  if (pr.state !== 'open') reasons.push('PR não está aberto');
  if (pr.draft !== false) reasons.push('PR é rascunho (draft)');
  if (pr.baseRef !== BASE_BRANCH) reasons.push(`base do PR não é ${BASE_BRANCH}`);
  if (pr.mergeable !== true) reasons.push('PR não está mesclável (conflito ou estado desconhecido)');
  if (pr.headSha !== sha) reasons.push('head do PR mudou desde a revisão');

  // 2. same repository only
  if (!pr.headRepo || pr.headRepo !== pr.repo) reasons.push('PR de fork não entra em merge automatizado');

  // 3. author permission
  if (!['admin', 'write'].includes(state.authorPermission)) reasons.push('autor sem permissão write/admin');

  // 4. required checks on the evaluated SHA
  const failing = failingChecks(state.checks);
  if (failing.length) reasons.push(`checks obrigatórios sem sucesso: ${failing.join(', ')}`);

  // 5. AI verdict for the same SHA
  const review = state.review;
  if (!review || review.sha !== sha) reasons.push('sem veredito da IA para este SHA');
  else {
    if (review.verdict !== 'approve') reasons.push(`veredito da IA: ${review.verdict ?? 'ausente'}`);
    if ((review.findings ?? []).some(finding => BLOCKING.has(finding?.severity))) reasons.push('há findings blocker/major');
  }

  // 6. manual block
  if ((pr.labels ?? []).includes(BLOCK_LABEL)) reasons.push(`label ${BLOCK_LABEL} presente`);

  // 7. sensitive paths
  const files = Array.isArray(state.files) ? state.files : null;
  if (!files || files.length === 0) reasons.push('lista de arquivos do PR indisponível');
  else {
    const sensitive = sensitiveFiles(files);
    if (sensitive.length) reasons.push(`requer revisão humana (caminho sensível): ${sensitive.slice(0, 10).join(', ')}${sensitive.length > 10 ? ', …' : ''}`);
  }

  // 8. trailers when code/tests change
  if (files && touchesCode(files)) {
    const commits = Array.isArray(state.commits) ? state.commits : [];
    // The commits API stops at MAX_PR_COMMITS: an incomplete list cannot prove the trailers.
    if (!commits.length || !Number.isInteger(pr.commitCount) || pr.commitCount !== commits.length || commits.length > MAX_PR_COMMITS) {
      reasons.push('não foi possível verificar os trailers de todos os commits');
    } else {
      const missing = commitsMissingTrailers(commits);
      if (missing.length) reasons.push(`commits sem trailers Agent:/Spec:: ${missing.join(', ')}`);
    }
  }

  // 9. size limit
  if (!withinLimits(state.size)) reasons.push('diff acima do limite ou tamanho desconhecido');

  return reasons.length ? { decision: 'skip', reasons } : { decision: 'merge', reasons: [] };
}
