#!/usr/bin/env node
// Exports the human/assistant dialogue of a Claude Code session to
// prompts/sessoes/AAAA-MM-DD-HHMM-<tool>.md. Native modules only.
// Thinking blocks, tool calls, tool results and injected reminders are dropped.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function parseArgs(argv) {
  const args = { tool: 'claude' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--session') { args.session = value; i += 1; }
    else if (key === '--tool') { args.tool = value; i += 1; }
    else if (key === '--out') { args.out = value; i += 1; }
    else if (key === '--cwd') { args.cwd = value; i += 1; }
    else if (key === '--assunto') { args.subject = value; i += 1; }
    else if (key === '--spec') { args.spec = value; i += 1; }
    else throw new Error(`Argumento desconhecido: ${key}`);
  }
  return args;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
const cwd = resolve(args.cwd ?? process.cwd());
const projectDir = join(homedir(), '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
if (!existsSync(projectDir)) fail(`Diretório de transcripts não encontrado: ${projectDir}`);

let transcript;
if (args.session) {
  if (!/^[0-9a-f-]{36}$/i.test(args.session)) fail('--session deve ser um UUID');
  transcript = join(projectDir, `${args.session}.jsonl`);
  if (!existsSync(transcript)) fail(`Transcript não encontrado: ${transcript}`);
} else {
  const candidates = readdirSync(projectDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => join(projectDir, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  if (candidates.length === 0) fail(`Nenhum transcript em ${projectDir}`);
  transcript = candidates[0];
}

const NOISE_TAGS = [
  'system-reminder', 'ide_selection', 'ide_opened_file', 'ide_diagnostics',
  'command-message', 'command-args', 'local-command-stdout', 'local-command-stderr',
];

function cleanUserText(text) {
  let out = text;
  for (const tag of NOISE_TAGS) {
    out = out.replace(new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g'), '');
  }
  // Slash commands become their literal invocation, e.g. "/registrar-sessao".
  out = out.replace(/<command-name>([\s\S]*?)<\/command-name>/g, (_, name) => name.trim());
  return out.trim();
}

function textBlocks(content) {
  if (typeof content === 'string') return [content];
  if (!Array.isArray(content)) return [];
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text);
}

const turns = [];
let firstHumanTimestamp;
let aiTitle;
let entrypoint;
const models = new Set();
// SPEC files actually opened or changed by a tool (Read/Write/Edit), not mere mentions.
const specs = new Set();

function push(role, text) {
  if (!text) return;
  const last = turns.at(-1);
  if (last && last.role === role) last.parts.push(text);
  else turns.push({ role, parts: [text] });
}

for (const line of readFileSync(transcript, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  let entry;
  try { entry = JSON.parse(line); } catch { continue; }
  if (entry.type === 'ai-title' && typeof entry.aiTitle === 'string') aiTitle = entry.aiTitle;
  if (entry.isSidechain || !entry.message) continue;
  entrypoint ??= entry.entrypoint;

  if (entry.type === 'assistant') {
    const model = entry.message.model;
    if (typeof model === 'string' && !model.startsWith('<')) models.add(model);
    for (const block of Array.isArray(entry.message.content) ? entry.message.content : []) {
      const filePath = block?.type === 'tool_use' ? block.input?.file_path : undefined;
      const match = typeof filePath === 'string' ? filePath.match(/(?:^|\/)(SPEC\/[^/]+\.md)$/) : null;
      if (match) specs.add(match[1]);
    }
  }

  if (entry.type === 'user' && entry.origin?.kind === 'human') {
    const text = cleanUserText(textBlocks(entry.message.content).join('\n\n'));
    if (!text) continue;
    firstHumanTimestamp ??= entry.timestamp;
    push('Usuário', text);
  } else if (entry.type === 'assistant') {
    const text = textBlocks(entry.message.content).join('\n\n').trim();
    push('Assistente', text);
  }
}

if (!firstHumanTimestamp) fail('Nenhuma mensagem do usuário encontrada no transcript.');

const start = new Date(firstHumanTimestamp);
const pad = (n) => String(n).padStart(2, '0');
const stamp = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}-${pad(start.getHours())}${pad(start.getMinutes())}`;
const outDir = resolve(args.out ?? join(cwd, 'prompts', 'sessoes'));
if (!existsSync(outDir)) fail(`Diretório de saída não existe: ${outDir}`);
const outFile = join(outDir, `${stamp}-${args.tool}.md`);
if (existsSync(outFile)) fail(`Arquivo já existe, não será sobrescrito: ${outFile}`);

const tool = args.tool === 'claude'
  ? `Claude Code${entrypoint ? ` (${entrypoint})` : ''}`
  : args.tool;
const agent = models.size > 0 ? [...models].join(', ') : 'não identificado';
const specLine = args.spec
  ?? (specs.size > 0 ? [...specs].sort().map((s) => `\`${s}\``).join(', ') : 'nenhuma spec utilizada na sessão');

const header = [
  '# Diálogo da sessão',
  '',
  `- **Assunto:** ${args.subject ?? aiTitle ?? ''}`,
  `- **Data:** ${stamp.slice(0, 10)}`,
  `- **Hora:** ${pad(start.getHours())}:${pad(start.getMinutes())}`,
  `- **Ferramenta/agente:** ${tool} / ${agent}`,
  `- **SPEC:** ${specLine}`,
].join('\n');

const body = turns.map((turn) => `## ${turn.role}\n\n${turn.parts.join('\n\n')}`).join('\n\n');
writeFileSync(outFile, `${header}\n\n${body}\n`);
console.log(outFile);
