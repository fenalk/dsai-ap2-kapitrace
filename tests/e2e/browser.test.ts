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

it('browser: login errors, memory JWT, protected lookup/cache, watchlist, 401 and reload', { timeout: 180000 }, async () => {
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
    const lookupRequests: { hasBearer: boolean }[] = [];
    let id = 0;
    let sessionId: string | undefined;
    const pending = new Map<number, { resolve: (value: Record<string, any>) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      if (message.method === 'Network.requestWillBeSent' && message.params.request.method === 'GET' && message.params.request.url.startsWith(`${backend.url}/api/lookup/`)) {
        const header = Object.entries(message.params.request.headers).find(([name]) => name.toLowerCase() === 'authorization')?.[1];
        lookupRequests.push({ hasBearer: typeof header === 'string' && header.startsWith('Bearer ') });
      }
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
    const waitForLookup = () => until(async () => await evaluate(`location.pathname === '/lookup' && Boolean(document.querySelector('[aria-label="Indicador"]'))`));
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
    await until(async () => await evaluate(`document.body.textContent.includes('Nenhum indicador monitorado.')`));
    // F2.4: "Sair" sits in the closed account disclosure; open it like a user would.
    assert.equal(await evaluate(`document.querySelector('.user-menu-panel').hidden`), true);
    await evaluate(`document.querySelector('.user-menu-toggle').click()`);
    await until(async () => await evaluate(`document.querySelector('.user-menu-panel').hidden === false && document.querySelector('.user-menu-email')?.textContent.includes(${JSON.stringify(email)})`));
    await button('Sair'); await waitForLogin();
    assert.equal(await evaluate(`location.search`), '?saiu=1');
    await until(async () => await evaluate(`document.querySelector('[role="status"]')?.textContent.includes('Você saiu da sua conta.')`));
    await fill('#email', email); await fill('#password', 'WrongTestOnlyPassword!'); await submitLogin();
    await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent.includes('Invalid credentials')`));
    assert.equal(await evaluate(`location.pathname`), '/login');
    assert.equal(calls.length, 0);
    await fill('#password', 'BrowserTestOnly-2026!');
    await send('Network.setBlockedURLs', { urls: [`${backend.url}/api/auth/login`] });
    await submitLogin();
    await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent.includes('Não foi possível conectar')`));
    assert.equal(await evaluate(`location.pathname`), '/login');
    await send('Network.setBlockedURLs', { urls: [] });
    await submitLogin(); await waitForLookup();
    await fill('[aria-label="Indicador"]', '8.8.8.8'); await button('Analisar');
    await until(async () => await evaluate(`document.querySelector('[data-testid="lookup-result"]') !== null`));
    assert.equal(await evaluate(`document.querySelector('[data-testid="threat-score"]').textContent`), '75');
    assert.equal(await evaluate(`document.querySelector('[data-testid="lookup-source"]').textContent`), 'api');
    assert.equal(calls.length, 6);
    const text = (selector: string) => evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent ?? ''`);
    assert.match(await text('[data-testid="source-ABUSEIPDB"]'), /AbuseIPDB.*Consultada.*Confiança de abuso: 80%.*Denúncias \(90 dias\): 42.*País: US/);
    assert.match(await text('[data-testid="source-VIRUSTOTAL"]'), /VirusTotal.*Consultada.*Detecções maliciosas: 8 de 10 motores/);
    assert.match(await text('[data-testid="source-URLSCAN"]'), /Não aplicável/);
    await button('Analisar');
    await until(async () => await evaluate(`document.querySelector('[data-testid="lookup-source"]')?.textContent === 'cache'`));
    assert.equal(calls.length, 6);
    await button('Adicionar à Watchlist');
    await until(async () => await evaluate(`document.body.textContent.includes('Indicador adicionado à watchlist.')`));
    await clientNavigate('/dashboard');
    await until(async () => await evaluate(`document.querySelector('[data-testid="watchlist-item"]')?.textContent.includes('8.8.8.8')`));
    await button('Remover');
    await until(async () => await evaluate(`document.body.textContent.includes('Nenhum indicador monitorado.')`));
    await clientNavigate('/lookup'); await waitForLookup(); await fill('[aria-label="Indicador"]', '999.1.2.3'); await button('Analisar');
    await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent.startsWith('IP inválido')`));
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
      await evaluate(`(() => { const tab = [...document.querySelectorAll('button')].find(b => b.textContent === 'DOMAIN'); tab.click(); })()`);
      await until(async () => await evaluate(`location.search === '?type=domain'`));
      await fill('[aria-label="Indicador"]', 'limited.example.com'); await button('Analisar');
      await until(async () => await evaluate(`document.querySelector('[role="alert"]')?.textContent === 'Limite de consultas do provedor atingido. Tente novamente em 120 s.'`));
      assert.match(await text('[data-testid="lookup-error"] [data-testid="source-VIRUSTOTAL"]'), /Limite de consultas — tente em 120 s/);
      assert.equal(calls.length, 7);
    } finally {
      responses.delete('www.virustotal.com'); resetHttpState();
      for (const [key, value] of Object.entries(savedKeys)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    const baseline = calls.length;
    await button('IP'); await until(async () => await evaluate(`location.search === '?type=ip'`));
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
    await until(async () => await evaluate(`document.querySelector('[data-testid="lookup-source"]')?.textContent === 'cache'`));
    assert.equal(await evaluate(`document.querySelector('[aria-label="Indicador"]').value`), '8.8.8.8');
    assert.equal(lookupRequests.filter(request => request.hasBearer).length, lookupRequests.length);
    assert.equal(calls.length, baseline);
  } catch (error) { throw new Error(`${String(error)}\nFrontend output:\n${frontendLog}`); }
  finally { socket?.close(); await stop(chrome); await stop(frontend); await backend.close(); await rm(directory, { recursive: true, force: true }); }
});
