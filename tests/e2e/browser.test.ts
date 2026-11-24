// Native Chrome DevTools Protocol runner. No browser automation dependency.
import { it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { startTestServer } from '../test-helper';
import { calls, responses, json } from '../http-fixtures';
import { resetHttpState } from '../../src/backend/src/modules/intelligence/http';

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>(resolve => server.close(() => resolve()));
  return port;
}
async function until<T>(check: () => Promise<T>, timeout = 60000): Promise<T> {
  const end = Date.now() + timeout;
  let error: unknown;
  while (Date.now() < end) {
    try { const value = await check(); if (value) return value; } catch (failure) { error = failure; }
    await delay(100);
  }
  throw new Error(`Browser condition timed out: ${String(error || '')}`);
}
async function stop(child: ChildProcess | undefined) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  child.kill('SIGTERM');
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null) child.kill('SIGKILL');
  await exited;
}

it('browser: login errors, memory JWT, protected lookup/cache, watchlist, 401, reload and phone journey', { timeout: 180000 }, async () => {
  const backend = await startTestServer();
  let frontend: ChildProcess | undefined;
  let chrome: ChildProcess | undefined;
  let socket: WebSocket | undefined;
  const directory = await mkdtemp(path.join(tmpdir(), 'kapitrace-chrome-'));
  let frontendLog = '';
  try {
    const port = await freePort();
    const frontendDirectory = path.resolve(__dirname, '../../src/frontend');
    frontend = spawn(process.execPath, [path.join(frontendDirectory, 'node_modules/next/dist/bin/next'), 'dev', '--webpack', '--hostname', '127.0.0.1', '--port', String(port)], {
      cwd: frontendDirectory, env: { ...process.env, NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1', NEXT_PUBLIC_API_BASE_URL: backend.url }, stdio: ['ignore', 'pipe', 'pipe']
    });
    frontend.stdout?.on('data', chunk => { frontendLog = (frontendLog + chunk).slice(-6000); });
    frontend.stderr?.on('data', chunk => { frontendLog = (frontendLog + chunk).slice(-6000); });
    await until(async () => { const res = await fetch(`http://127.0.0.1:${port}/login`); return res.ok; });
    let endpoint = '';
    chrome = spawn(process.env.CHROME_BIN || '/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${directory}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
    chrome.stderr?.on('data', chunk => { const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) endpoint = match[1]; });
    let chromeError: Error | undefined;
    chrome.on('error', error => { chromeError = error; });
    await until(async () => { if (chromeError) throw chromeError; return endpoint; }, 15000);
    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => { socket!.addEventListener('open', () => resolve(), { once: true }); socket!.addEventListener('error', () => reject(new Error('CDP connection failed')), { once: true }); });
    const lookupRequests: { hasBearer: boolean; path: string }[] = [];
    // SPEC-FDE 002: login requests are counted to prove invalid fields never reach the server.
    let loginRequests = 0;
    let onPaused: ((params: Record<string, any>) => void) | undefined;
    let id = 0;
    let sessionId: string | undefined;
    const pending = new Map<number, { resolve: (value: Record<string, any>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Network.requestWillBeSent' && message.params.request.method === 'GET' && message.params.request.url.startsWith(`${backend.url}/api/lookup/`)) {
        const header = Object.entries(message.params.request.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1];
        lookupRequests.push({ hasBearer: typeof header === 'string' && header.startsWith('Bearer '), path: new URL(message.params.request.url).pathname });
      }
      if (message.method === 'Network.requestWillBeSent' && message.params.request.method === 'POST' && message.params.request.url === `${backend.url}/api/auth/login`) loginRequests++;
      if (message.method === 'Fetch.requestPaused') onPaused?.(message.params);
      const operation = pending.get(message.id);
      if (operation) { pending.delete(message.id); clearTimeout(operation.timer); if (message.error) operation.reject(new Error(message.error.message)); else operation.resolve(message.result); }
    });
    const send = (method: string, params: Record<string, unknown> = {}) => new Promise<Record<string, any>>((resolve, reject) => {
      const current = ++id;
      const timer = setTimeout(() => { pending.delete(current); reject(new Error(`CDP timeout: ${method}`)); }, 60000);
      pending.set(current, { resolve, reject, timer });
      socket!.send(JSON.stringify({ id: current, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const target = await send('Target.createTarget', { url: 'about:blank' });
    sessionId = (await send('Target.attachToTarget', { targetId: target.targetId, flatten: true })).sessionId;
    await send('Runtime.enable'); await send('Page.enable'); await send('Network.enable');
    const evaluate = async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
      return result.result.value;
    };
    const navigate = async (pathname: string) => {
      await send('Page.navigate', { url: `http://127.0.0.1:${port}${pathname}` });
      await until(async () => await evaluate(`document.readyState === 'complete' && location.pathname === ${JSON.stringify(pathname)}`));
      // Next hydration installs listeners after HTML is loaded.
      await delay(400);
    };
    const button = async (label: string) => evaluate(`(() => { const button = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing'); button.click(); })()`);
    const fill = async (selector: string, value: string) => evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    const clientNavigate = async (pathname: string) => {
      await evaluate(`(() => { const link = document.querySelector('a[href="${pathname}"]'); if (!link) throw new Error('Navigation link missing'); link.click(); })()`);
      await until(async () => await evaluate(`location.pathname === ${JSON.stringify(pathname)}`));
    };
    // F3: "Entrar" is both a tab and the submit label, so the form is submitted through its submit button.
    const submitLogin = async () => evaluate(`document.querySelector('form.auth-form button[type="submit"]').click()`);
    const selectedTab = () => evaluate(`document.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]')?.textContent`);
    const waitForLogin = () => until(async () => await evaluate(`location.pathname === '/login' && Boolean(document.querySelector('#email'))`));
    // F4.9: the screen shows "Consulta nova"/"Do cache"; the raw origin stays in data-source.
    const lookupSource = () => evaluate(`document.querySelector('[data-testid="lookup-source"]')?.dataset.source ?? null`);
    const watchStatus = () => evaluate(`(() => { const b = document.querySelector('[data-testid="watchlist-status"]'); return b ? { text: b.textContent, disabled: b.disabled } : null; })()`);
    // F4.3: the sidebar shortcuts pre-select the type.
    const navigateToType = async (type: string) => {
      await evaluate(`document.querySelector('a.sidebar-link[href="/lookup?type=${type}"]').click()`);
      await until(async () => await evaluate(`location.pathname === '/lookup' && location.search === '?type=${type}'`));
    };
    const waitForLookup = () => until(async () => await evaluate(`location.pathname === '/lookup' && Boolean(document.querySelector('[aria-label="Indicador"]'))`));
    const text = (selector: string): Promise<string> => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
    const email = `browser-${Date.now()}@example.com`;
    await navigate('/login');
    // F3.1/F3.2: login and sign-up are tabs; the password can be shown and hidden again.
    assert.equal(await selectedTab(), 'Entrar');
    await button('Criar conta');
    await until(async () => await selectedTab() === 'Criar conta' && await evaluate(`Boolean(document.querySelector('#name'))`));
    assert.equal(await evaluate(`document.querySelector('#auth-panel').getAttribute('aria-labelledby')`), 'auth-tab-register');
    await evaluate(`document.querySelector('.input-adornment').click()`);
    await until(async () => await evaluate(`document.querySelector('#password').type === 'text' && document.querySelector('.input-adornment').getAttribute('aria-pressed') === 'true'`));
    await evaluate(`document.querySelector('.input-adornment').click()`);
    await until(async () => await evaluate(`document.querySelector('#password').type === 'password'`));
    await fill('#name', 'Browser Analyst'); await fill('#email', email); await fill('#password', 'BrowserTestOnly-2026!');
    await button('Criar conta e entrar'); await waitForLookup();
    assert.equal(await evaluate(`sessionStorage.getItem('kapitrace.session') === null && localStorage.getItem('kapitrace.session') === null`), true);
    await clientNavigate('/dashboard');
    // F5.5: empty state with a way back to the lookup.
    await until(async () => await evaluate(`document.body.textContent.includes('Nenhum indicador monitorado') && Boolean(document.querySelector('.empty-state a[href="/lookup"]'))`));
    // F2.4: "Sair" sits in the closed account disclosure; open it like a user would.
    assert.equal(await evaluate(`document.querySelector('.user-menu-panel').hidden`), true);
    await evaluate(`document.querySelector('.user-menu-toggle').click()`);
    await until(async () => await evaluate(`document.querySelector('.user-menu-panel').hidden === false && document.querySelector('.user-menu-email')?.textContent.includes(${JSON.stringify(email)})`));
    await button('Sair'); await waitForLogin();
    assert.equal(await evaluate(`location.search`), '?saiu=1');
    await until(async () => await evaluate(`document.querySelector('[role="status"]')?.textContent.includes('Você saiu da sua conta.')`));
    // SPEC-FDE 002 CA3: empty fields are reported next to them, in Portuguese, and nothing is sent.
    const requestsBefore = loginRequests;
    await submitLogin();
    await until(async () => await text('#email-error') === 'Informe seu email.' && await text('#password-error') === 'Informe sua senha.');
    assert.equal(await evaluate(`document.querySelector('#email').getAttribute('aria-invalid') === 'true' && document.querySelector('#password').getAttribute('aria-invalid') === 'true'`), true);
    assert.equal(await evaluate(`document.querySelector('#email').getAttribute('aria-describedby')`), 'email-error');
    assert.equal(await evaluate(`document.activeElement?.id`), 'email');
    // CA9: editing a field clears its own error only.
    await fill('#email', 'nome@');
    await until(async () => await evaluate(`document.querySelector('#email-error') === null && document.querySelector('#password-error') !== null`));
    // CA4: invalid format, still no request.
    await submitLogin();
    await until(async () => (await text('#email-error')).startsWith('Informe um email válido'));
    await delay(300);
    assert.equal(loginRequests, requestsBefore);
    assert.equal(await evaluate(`document.querySelector('[role="alert"]')`), null);
    // CA1: wrong password keeps the email, clears and focuses the password.
    const invalidCredentials = 'Email ou senha incorretos. Confira os dados e tente novamente.';
    await fill('#email', email); await fill('#password', 'WrongTestOnlyPassword!'); await submitLogin();
    await until(async () => await text('[role="alert"]') === invalidCredentials);
    assert.equal(await evaluate(`location.pathname`), '/login');
    assert.equal(await evaluate(`document.querySelector('#email').value`), email);
    assert.equal(await evaluate(`document.querySelector('#password').value === '' && document.activeElement?.id === 'password'`), true);
    // CA2: an unknown email gets exactly the same text and behavior.
    const unknown = `missing-${email}`;
    await fill('#email', unknown); await fill('#password', 'WrongTestOnlyPassword!'); await submitLogin();
    await until(async () => await evaluate(`document.querySelector('#password').value === ''`));
    assert.equal(await text('[role="alert"]'), invalidCredentials);
    assert.equal(await evaluate(`document.querySelector('#email').value === ${JSON.stringify(unknown)} && document.activeElement?.id === 'password'`), true);
    assert.equal(calls.length, 0);
    // CA6: a 500 shows the generic text, never the server's English message.
    onPaused = params => {
      // The CORS preflight uses the same URL: let it through untouched.
      if (params.request.method !== 'POST') { void send('Fetch.continueRequest', { requestId: params.requestId }); return; }
      const cors = (params.responseHeaders as { name: string; value: string }[]).filter(header => header.name.toLowerCase().startsWith('access-control-'));
      void send('Fetch.fulfillRequest', { requestId: params.requestId, responseCode: 500, responseHeaders: [...cors, { name: 'Content-Type', value: 'application/json' }], body: Buffer.from('{"error":"Login failed"}').toString('base64') });
    };
    await send('Fetch.enable', { patterns: [{ urlPattern: `${backend.url}/api/auth/login`, requestStage: 'Response' }] });
    await fill('#email', email); await fill('#password', 'BrowserTestOnly-2026!'); await submitLogin();
    await until(async () => (await text('[role="alert"]')).startsWith('Não foi possível entrar agora.'));
    assert.equal((await text('[role="alert"]')).includes('Login failed'), false);
    assert.equal(await evaluate(`location.pathname`), '/login');
    await send('Fetch.disable'); onPaused = undefined;
    // CA5: no connection.
    await fill('#password', 'BrowserTestOnly-2026!');
    await send('Network.setBlockedURLs', { urls: [`${backend.url}/api/auth/login`] });
    await submitLogin();
    await until(async () => await text('[role="alert"]') === 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    assert.equal(await evaluate(`location.pathname`), '/login');
    await send('Network.setBlockedURLs', { urls: [] });
    await submitLogin(); await waitForLookup();
    await fill('[aria-label="Indicador"]', '8.8.8.8'); await button('Analisar');
    await until(async () => await evaluate(`document.querySelector('[data-testid="lookup-result"]') !== null`));
    // F6.1: focus lands on the result title.
    await until(async () => await evaluate(`document.activeElement?.id === 'lookup-result-title'`));
    assert.equal(await evaluate(`document.querySelector('[data-testid="threat-score"]').textContent`), '75');
    assert.equal(await lookupSource(), 'api');
    assert.equal(await text('[data-testid="lookup-source"]'), 'Consulta nova');
    // F4.6/F4.7: score band and Portuguese label/description; F4.8 coverage as a bar.
    assert.match(await text('[data-testid="risk-label"]'), /^Risco (baixo|suspeito|alto|crítico)$/);
    assert.ok((await text('[data-testid="risk-description"]')).length > 0);
    assert.match(await text('[data-testid="coverage"]'), /Cobertura de evidências\d+%/);
    // F4.10: sources grouped by state; not applicable ones are collapsed.
    assert.equal(await evaluate(`document.querySelector('[data-testid="lookup-result"] [data-group="not_applicable"]')?.tagName`), 'DETAILS');
    assert.equal(calls.length, 6);
    assert.match(await text('[data-testid="source-ABUSEIPDB"]'), /AbuseIPDB.*Consultada.*Confiança de abuso: 80%.*Denúncias \(90 dias\): 42.*País: US/);
    assert.match(await text('[data-testid="source-VIRUSTOTAL"]'), /VirusTotal.*Consultada.*Detecções maliciosas: 8 de 10 motores/);
    assert.match(await text('[data-testid="source-URLSCAN"]'), /Não aplicável/);
    await button('Analisar');
    await until(async () => await lookupSource() === 'cache');
    assert.equal(calls.length, 6);
    // The button is busy while the watchlist is checked (F4.13); a disabled button ignores clicks.
    await until(async () => { const status = await watchStatus(); return status?.text === 'Adicionar à Watchlist' && !status.disabled; });
    await button('Adicionar à Watchlist');
    await until(async () => await evaluate(`document.body.textContent.includes('Indicador adicionado à watchlist.')`));
    // F4.13: once listed, the button says so, and a new lookup of the same indicator keeps that state.
    assert.deepEqual(await watchStatus(), { text: 'Na watchlist', disabled: true });
    const beforeRepeat = lookupRequests.length;
    await button('Analisar');
    await until(async () => lookupRequests.length > beforeRepeat && await lookupSource() === 'cache' && (await watchStatus())?.text === 'Na watchlist');
    assert.equal(calls.length, 6);
    await clientNavigate('/dashboard');
    const watchItems = () => evaluate(`[...document.querySelectorAll('[data-testid="watchlist-item"]')].map(row => row.querySelector('code').textContent)`);
    await until(async () => (await watchItems())?.includes('8.8.8.8'));
    assert.ok(await evaluate(`Boolean(document.querySelector('[data-testid="watchlist-item"] time[datetime]'))`), 'F5.1: inclusion date');
    // F5.2: local filter by type and text.
    await evaluate(`document.querySelector('input[name="watchlist-filter"][value="domain"]').click()`);
    await until(async () => (await watchItems()).length === 0 && await evaluate(`document.body.textContent.includes('Nenhum item encontrado')`));
    await button('Limpar filtros');
    await until(async () => (await watchItems()).length === 1);
    await fill('[aria-label="Buscar no valor"]', 'nada-aqui');
    await until(async () => (await watchItems()).length === 0);
    await fill('[aria-label="Buscar no valor"]', '8.8');
    await until(async () => (await watchItems()).length === 1);
    assert.equal(await text('[data-testid="watchlist-summary"]'), '1 de 1 item');
    await fill('[aria-label="Buscar no valor"]', '');
    // F5.4: removal is immediate and can be undone from the toast for 6 s.
    await button('Remover');
    await until(async () => (await watchItems()).length === 0 && await evaluate(`[...document.querySelectorAll('[data-testid="toast"]')].some(t => t.textContent.includes('Removido'))`));
    await button('Desfazer');
    await until(async () => (await watchItems()).includes('8.8.8.8'));
    // F5.3: "Consultar" reopens the lookup, which runs by itself (F2.2) and keeps "Na watchlist" (F4.13).
    await evaluate(`document.querySelector('[data-testid="watchlist-lookup"]').click()`);
    await until(async () => await evaluate(`location.pathname === '/lookup' && location.search === '?type=ip&q=8.8.8.8'`) && await lookupSource() === 'cache' && (await watchStatus())?.text === 'Na watchlist');
    assert.equal(calls.length, 6);
    await clientNavigate('/dashboard');
    await until(async () => (await watchItems())?.includes('8.8.8.8'));
    await button('Remover');
    await until(async () => await evaluate(`document.body.textContent.includes('Nenhum indicador monitorado')`));
    await clientNavigate('/lookup'); await waitForLookup(); await fill('[aria-label="Indicador"]', '999.1.2.3'); await button('Analisar');
    await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent.startsWith('IP inválido')`));
    // F6.1: ... or on the error.
    await until(async () => await evaluate(`document.activeElement?.id === 'lookup-error'`));
    assert.equal(await evaluate(`document.querySelector('[data-testid="lookup-result"]')`), null);
    await fill('[aria-label="Indicador"]', '10.0.0.1'); await button('Analisar');
    await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent === 'Apenas IPs públicos podem ser consultados.'`));
    assert.equal(calls.length, 6);
    // 503 paths: providers run in this process, so the test toggles server-side keys only.
    const providerKeys = ['ABUSEIPDB_API_KEY', 'VIRUSTOTAL_API_KEY', 'SHODAN_API_KEY', 'GREYNOISE_API_KEY', 'OTX_API_KEY', 'URLSCAN_API_KEY', 'IPINFO_TOKEN'];
    const savedKeys = Object.fromEntries(providerKeys.map(key => [key, process.env[key]]));
    try {
      for (const key of providerKeys) delete process.env[key];
      await fill('[aria-label="Indicador"]', '1.1.1.1'); await button('Analisar');
      await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent === 'Nenhuma fonte de inteligência está configurada no servidor. Contate o administrador.'`));
      assert.match(await text('[data-testid="lookup-error"] [data-testid="source-VIRUSTOTAL"]'), /Não configurada/);
      assert.equal(await evaluate(`document.querySelector('[data-testid="threat-score"]')`), null);
      process.env.VIRUSTOTAL_API_KEY = 'test-only-key';
      responses.set('www.virustotal.com', () => json({}, 429, { 'Retry-After': '120' }));
      await navigateToType('domain');
      assert.equal(await evaluate(`document.querySelector('input[name="indicator-type"]:checked').value`), 'domain');
      await fill('[aria-label="Indicador"]', 'limited.example.com'); await button('Analisar');
      await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent === 'Limite de consultas do provedor atingido. Tente novamente em 120 s.'`));
      assert.match(await text('[data-testid="lookup-error"] [data-testid="source-VIRUSTOTAL"]'), /Limite de consultas — tente em 120 s/);
      // F4.5: with Retry-After the button is disabled and counts down.
      assert.deepEqual(await evaluate(`(() => { const b = document.querySelector('[data-testid="lookup-submit"]'); return [b.disabled, /^Aguarde (\\d+ s|\\d+ min)$/.test(b.textContent)]; })()`), [true, true]);
      assert.equal(calls.length, 7);
    } finally {
      responses.delete('www.virustotal.com'); resetHttpState();
      for (const [key, value] of Object.entries(savedKeys)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const baseline = calls.length;
    // The countdown belongs to the lookup screen: leaving it and coming back through the sidebar starts fresh.
    await clientNavigate('/dashboard');
    await navigateToType('ip');
    assert.ok(lookupRequests.length >= 3 && lookupRequests.every(request => request.hasBearer), 'Every browser lookup must carry Bearer');
    assert.equal(await evaluate(`Object.keys(localStorage).some(key => /^[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+$/.test(localStorage.getItem(key) || ''))`), false);
    // Rotate only the runtime test secret to invalidate the current token.
    process.env.JWT_SECRET = randomBytes(48).toString('hex');
    await fill('[aria-label="Indicador"]', '8.8.8.8'); await button('Analisar'); await waitForLogin();
    assert.equal(calls.length, baseline);
    // F2.5: 401 keeps the destination and says the session expired.
    assert.deepEqual(await evaluate(`Object.fromEntries(new URLSearchParams(location.search))`), { next: '/lookup?type=ip', expirou: '1' });
    await until(async () => await evaluate(`document.querySelector('[role="status"]')?.textContent.includes('Sua sessão expirou. Entre novamente.')`));
    await fill('#email', email); await fill('#password', 'BrowserTestOnly-2026!'); await submitLogin(); await waitForLookup();
    assert.equal(await evaluate(`location.search`), '?type=ip');
    await send('Page.reload'); await waitForLogin();
    assert.equal(await evaluate(`document.querySelector('[data-testid="lookup-result"]')`), null);
    assert.equal(calls.length, baseline);
    // F2.1 + F2.2: a deep link with ?q= survives the login and runs the lookup once (served from cache).
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/lookup?type=ip&q=8.8.8.8` }); await waitForLogin();
    assert.equal(await evaluate(`new URLSearchParams(location.search).get('next')`), '/lookup?type=ip&q=8.8.8.8');
    await delay(400);
    await fill('#email', email); await fill('#password', 'BrowserTestOnly-2026!'); await submitLogin(); await waitForLookup();
    await until(async () => await lookupSource() === 'cache');
    assert.equal(await evaluate(`document.querySelector('[aria-label="Indicador"]').value`), '8.8.8.8');
    assert.equal(lookupRequests.filter(request => request.hasBearer).length, lookupRequests.length);
    assert.equal(calls.length, baseline);
    // F4.1/F4.2: a defanged URL is detected as a domain and sent as its host, and the screen says so.
    await fill('[aria-label="Indicador"]', 'hxxps://Exemplo[.]com/path');
    assert.equal(await evaluate(`document.querySelector('input[name="indicator-type"]:checked').value`), 'domain');
    assert.equal(await text('[data-testid="sent-value"]'), 'Consultando como: exemplo.com');
    await button('Analisar');
    await until(async () => await lookupSource() === 'api' && await text('[data-testid="lookup-result"] .result-indicator code') === 'exemplo.com');
    assert.equal(lookupRequests.at(-1)?.path, '/api/lookup/domain/exemplo.com');
    // F4.14: recent lookups of this session (the expired session's list was dropped), newest first; a click repeats it.
    assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-testid="recent-lookups"] code')].map(code => code.textContent)`), ['exemplo.com', '8.8.8.8']);
    const beforeRecent = lookupRequests.length;
    await evaluate(`[...document.querySelectorAll('[data-testid="recent-lookups"] button')].find(b => b.textContent.includes('8.8.8.8')).click()`);
    await until(async () => lookupRequests.length > beforeRecent && await lookupSource() === 'cache');
    assert.equal(lookupRequests.at(-1)?.path, '/api/lookup/ip/8.8.8.8');
    // Acceptance 5: a SHA-256 pasted with the navigation on "IP" is detected as a hash.
    await navigateToType('ip');
    await fill('[aria-label="Indicador"]', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(await evaluate(`document.querySelector('input[name="indicator-type"]:checked').value`), 'hash');

    // F6.4: the whole journey again on a phone (390 x 844), with real key presses where a user would use them.
    const press = async (key: string, code: string, keyCode: number, extra: Record<string, unknown> = {}) => {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: keyCode, ...extra });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode });
    };
    const typeInto = async (selector: string, value: string) => {
      await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.focus(); element.select(); })()`);
      await send('Input.insertText', { text: value });
    };
    const noHorizontalScroll = async (where: string) => assert.equal(await evaluate(`document.documentElement.scrollWidth - window.innerWidth <= 0`), true, `horizontal scroll on ${where}`);
    const drawerOpen = () => evaluate(`document.querySelector('.menu-toggle').getAttribute('aria-expanded') === 'true'`);
    const mobileBaseline = calls.length;
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    try {
      // Landing (a reload drops the memory session) → search → login → result, without clicking "Analisar" (acceptance 2).
      await navigate('/');
      await noHorizontalScroll('/');
      await typeInto('[aria-label="Indicador inicial"]', 'hxxps://Exemplo[.]com/path');
      await press('Enter', 'Enter', 13, { text: '\r' });
      await waitForLogin();
      await noHorizontalScroll('/login');
      await delay(400);
      await fill('#email', email); await fill('#password', 'BrowserTestOnly-2026!'); await submitLogin(); await waitForLookup();
      await until(async () => await lookupSource() === 'cache' && await text('[data-testid="lookup-result"] .result-indicator code') === 'exemplo.com');
      await until(async () => await evaluate(`document.activeElement?.id === 'lookup-result-title'`));
      await noHorizontalScroll('/lookup');
      await until(async () => { const status = await watchStatus(); return status?.text === 'Adicionar à Watchlist' && !status.disabled; });
      await button('Adicionar à Watchlist');
      await until(async () => (await watchStatus())?.text === 'Na watchlist');
      // F1.5 drawer: opens from the menu button, keeps focus inside, closes with Esc and returns focus to the button.
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.menu-toggle')).display !== 'none'`), true);
      await evaluate(`document.querySelector('.menu-toggle').click()`);
      await until(async () => await drawerOpen() && await evaluate(`document.getElementById('app-sidebar').contains(document.activeElement)`));
      await press('Escape', 'Escape', 27);
      await until(async () => !(await drawerOpen()) && await evaluate(`document.activeElement === document.querySelector('.menu-toggle')`));
      // ... and closes when a link is followed.
      await evaluate(`document.querySelector('.menu-toggle').click()`);
      await until(async () => await drawerOpen());
      await evaluate(`document.querySelector('#app-sidebar a[href="/dashboard"]').click()`);
      await until(async () => await evaluate(`location.pathname === '/dashboard'`) && !(await drawerOpen()));
      // F5.1: on a phone each item is a card.
      await until(async () => (await watchItems()).includes('exemplo.com'));
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('[data-testid="watchlist-item"]')).display`), 'grid');
      await noHorizontalScroll('/dashboard');
      // Back to the lookup from the list, then a new lookup submitted with Enter.
      await evaluate(`document.querySelector('[data-testid="watchlist-lookup"]').click()`);
      await until(async () => await evaluate(`location.pathname === '/lookup'`) && await lookupSource() === 'cache' && (await watchStatus())?.text === 'Na watchlist');
      await typeInto('[aria-label="Indicador"]', '8.8.8.8');
      await press('Enter', 'Enter', 13, { text: '\r' });
      await until(async () => await text('[data-testid="lookup-result"] .result-indicator code') === '8.8.8.8' && await lookupSource() === 'cache');
      assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-testid="recent-lookups"] code')].map(code => code.textContent)`), ['8.8.8.8', 'exemplo.com']);
      // Sign out from the account menu.
      await evaluate(`document.querySelector('.user-menu-toggle').click()`);
      await until(async () => await evaluate(`document.querySelector('.user-menu-panel').hidden === false`));
      await button('Sair'); await waitForLogin();
      assert.equal(await evaluate(`location.search`), '?saiu=1');
      assert.equal(calls.length, mobileBaseline, 'the phone journey is served from cache');
    } finally { await send('Emulation.clearDeviceMetricsOverride'); }
  } catch (error) { throw new Error(`${String(error)}\nFrontend output:\n${frontendLog}`); }
  finally { socket?.close(); await stop(chrome); await stop(frontend); await backend.close(); await rm(directory, { recursive: true, force: true }); }
});
