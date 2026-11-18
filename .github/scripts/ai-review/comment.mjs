// Renders the single PR comment / job summary. Pure: no I/O.
// Model text is untrusted: HTML/Markdown is escaped and @mentions are neutralized.
import { COMMENT_MARKER } from './rules.mjs';

const VERDICT_LABELS = {
  approve: '✅ `approve`',
  request_changes: '❌ `request_changes`',
  needs_human: '🧑‍💻 `needs_human`',
  not_run: '⏸️ `not_run`',
  error: '⚠️ `error`',
};
const SEVERITY_ORDER = ['blocker', 'major', 'minor', 'info'];

/** Escape for inline Markdown + HTML; neutralize mentions and line structure. */
export function escapeText(value, max = 4000) {
  let text = String(value ?? '');
  if (text.length > max) text = `${text.slice(0, max)}…`;
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\\`*_{}[\]()#+\-!|~<>&]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[char] ?? `\\${char}`)
    .replace(/@/g, '@​')
    .replace(/:\/\//g, ':​//');
}

/** Single-line variant for titles, paths and table cells. */
export function escapeInline(value, max = 200) {
  return escapeText(String(value ?? '').replace(/\s+/g, ' ').trim(), max);
}

/**
 * @param {object} input
 * @param {object} input.review { verdict, summary, findings, notes, model, sha, evaluatedAt }
 * @param {{ decision: string, reasons: string[] }} input.decision
 * @param {string|null} input.mergeOutcome description of the merge attempt, when any
 * @param {string} input.runUrl
 * @param {boolean} [input.withMarker=true]
 */
export function renderComment({ review, decision, mergeOutcome = null, runUrl, withMarker = true }) {
  const verdict = VERDICT_LABELS[review?.verdict] ? review.verdict : 'error';
  const sha = /^[0-9a-f]{40}$/.test(review?.sha ?? '') ? review.sha : null;
  const lines = [];
  if (withMarker) lines.push(COMMENT_MARKER);
  lines.push('## 🤖 Revisão automatizada (DeepSeek)', '');
  lines.push('| Campo | Valor |', '| --- | --- |');
  lines.push(`| SHA avaliado | ${sha ? `\`${sha}\`` : 'indisponível'} |`);
  lines.push(`| Modelo | ${review?.model ? escapeInline(review.model, 100) : 'não chamado'} |`);
  const at = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(review?.evaluatedAt ?? '') ? review.evaluatedAt : new Date().toISOString();
  lines.push(`| Data/hora (UTC) | \`${at}\` |`);
  lines.push(`| Veredito final | **${VERDICT_LABELS[verdict]}** |`);
  lines.push(`| Decisão de merge | **${decision?.decision === 'merge' ? 'merge' : 'sem merge'}** |`);
  lines.push(`| Execução | [run](${encodeURI(String(runUrl ?? ''))}) |`);
  lines.push('');

  if (review?.summary) lines.push('### Resumo', '', escapeText(review.summary, 2000), '');

  const findings = [...(review?.findings ?? [])].sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
  lines.push(`### Findings (${findings.length})`, '');
  if (!findings.length) lines.push('Nenhum finding.', '');
  for (const finding of findings) {
    const severity = SEVERITY_ORDER.includes(finding.severity) ? finding.severity : 'info';
    const where = finding.file ? ` — ${escapeInline(finding.file, 300)}${finding.line > 0 ? `:${Number(finding.line)}` : ''}` : '';
    lines.push(`- **${severity}**${where}: ${escapeInline(finding.title, 200)}`);
    if (finding.detail) lines.push(`  ${escapeText(finding.detail, 4000).replace(/\n/g, '\n  ')}`);
  }
  if (findings.length) lines.push('');

  if (review?.notes?.length) {
    lines.push('### Observações do revisor automatizado', '');
    for (const note of review.notes) lines.push(`- ${escapeInline(note, 300)}`);
    lines.push('');
  }

  lines.push('### Decisão de merge', '');
  if (decision?.decision === 'merge') lines.push('Todos os critérios determinísticos da SPEC foram satisfeitos.');
  else for (const reason of decision?.reasons ?? ['motivo indisponível']) lines.push(`- ${escapeInline(reason, 400)}`);
  if (mergeOutcome) lines.push('', `Resultado do merge: ${escapeInline(mergeOutcome, 300)}`);
  lines.push('', '<sub>O veredito vale apenas para o SHA acima. Bloqueie com a label `no-automerge`; reexecute pelo re-run do workflow ou via `workflow_dispatch` com o número do PR.</sub>');
  return lines.join('\n');
}
