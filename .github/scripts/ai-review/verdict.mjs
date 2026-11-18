// Strict validation of the model output (SPEC section 4). Pure: no I/O.

export const MODEL_VERDICTS = Object.freeze(['approve', 'request_changes', 'needs_human']);
export const INTERNAL_VERDICTS = Object.freeze(['not_run', 'error']);
export const SEVERITIES = Object.freeze(['blocker', 'major', 'minor', 'info']);
export const TEXT_LIMITS = Object.freeze({ summary: 2000, file: 500, title: 200, detail: 4000, findings: 50 });

const TOP_KEYS = ['verdict', 'summary', 'findings'];
const FINDING_KEYS = ['severity', 'file', 'line', 'title', 'detail'];
const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const sameKeys = (value, keys) => {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
};
const boundedText = (value, max) => typeof value === 'string' && value.length <= max;

function invalid(reason) {
  return { ok: false, reason };
}

/**
 * @param {string} raw model message content
 * @param {string[]} prFiles filenames changed by the PR
 * @returns {{ ok: true, verdict, summary, findings, notes: string[] } | { ok: false, reason: string }}
 */
export function validateVerdict(raw, prFiles) {
  if (typeof raw !== 'string' || !raw.trim()) return invalid('resposta vazia');
  let data;
  try { data = JSON.parse(raw); } catch { return invalid('JSON inválido'); }
  if (!isObject(data) || !sameKeys(data, TOP_KEYS)) return invalid('campos ausentes ou extras no veredito');
  if (!MODEL_VERDICTS.includes(data.verdict)) return invalid('verdict fora do enum');
  if (!boundedText(data.summary, TEXT_LIMITS.summary) || !data.summary.trim()) return invalid('summary inválido');
  if (!Array.isArray(data.findings) || data.findings.length > TEXT_LIMITS.findings) return invalid('findings inválido');

  for (const finding of data.findings) {
    if (!isObject(finding) || !sameKeys(finding, FINDING_KEYS)) return invalid('finding com campos ausentes ou extras');
    if (!SEVERITIES.includes(finding.severity)) return invalid('severity fora do enum');
    if (!boundedText(finding.file, TEXT_LIMITS.file)) return invalid('file inválido');
    if (!Number.isSafeInteger(finding.line) || finding.line < 0) return invalid('line inválido');
    if (!boundedText(finding.title, TEXT_LIMITS.title) || !finding.title.trim()) return invalid('title inválido');
    if (!boundedText(finding.detail, TEXT_LIMITS.detail)) return invalid('detail inválido');
  }

  const notes = [];
  let verdict = data.verdict;
  // Downgrade considers every finding, including ones discarded below (fail closed).
  if (verdict === 'approve' && data.findings.some(finding => finding.severity === 'blocker' || finding.severity === 'major')) {
    verdict = 'request_changes';
    notes.push('modelo retornou approve com finding blocker/major: tratado como request_changes');
  }

  const known = new Set(prFiles);
  const findings = [];
  for (const finding of data.findings) {
    // Empty file = general finding about the PR as a whole.
    if (finding.file !== '' && !known.has(finding.file)) {
      notes.push(`finding descartado: arquivo fora do PR (${finding.file.slice(0, 120)})`);
      continue;
    }
    findings.push({ ...finding });
  }
  return { ok: true, verdict, summary: data.summary, findings, notes };
}
