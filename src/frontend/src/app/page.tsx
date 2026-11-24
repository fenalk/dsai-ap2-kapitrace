'use client';

import Link from 'next/link';
import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Icon, { type IconName } from '@/components/ui/Icon';
import { ButtonLink } from '@/components/ui/Button';
import { hasSession, serverSessionSnapshot, subscribeSession } from '@/lib/session';

const features: { icon: IconName; title: string; description: string; tone: string }[] = [
  { icon: 'globe', title: 'IP Reputation', description: 'Análise completa com AbuseIPDB, VirusTotal, Shodan e GreyNoise combinados em um score unificado.', tone: 'cyan' },
  { icon: 'link', title: 'Domain Intelligence', description: 'Reputação VirusTotal e contexto de relatórios existentes no URLScan.io e OTX.', tone: 'purple' },
  { icon: 'hash', title: 'Malware Hash Lookup', description: 'Consulte detecções de arquivos existentes por MD5, SHA-1 ou SHA-256.', tone: 'red' },
  { icon: 'mail', title: 'Email Reputation', description: 'Integração de email ainda indisponível nesta versão.', tone: 'amber' },
  { icon: 'chart', title: 'Threat Dashboard', description: 'Gerencie os indicadores da sua watchlist com sua sessão autenticada.', tone: 'green' },
  { icon: 'eye', title: 'Watchlist', description: 'Adicione, liste e remova indicadores. Alertas automáticos ainda indisponíveis.', tone: 'cyan' },
];

const providers = ['AbuseIPDB', 'VirusTotal', 'IPInfo', 'Shodan', 'GreyNoise', 'URLScan.io', 'AlienVault OTX'];
const examples = ['185.220.101.34', 'malware.xyz', 'd41d8cd98f00b204e9800998ecf8427e'];

export default function Home() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  // F2.6: calls to action follow the in-memory session (none after a reload).
  const signedIn = useSyncExternalStore(subscribeSession, hasSession, serverSessionSnapshot);
  function search(event: FormEvent) {
    event.preventDefault();
    const indicator = query.trim();
    if (!indicator) return;
    const type = indicator.includes(':') || /^\d+\.\d+\.\d+\.\d+$/.test(indicator) ? 'ip' : /^(?:[a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})$/i.test(indicator) ? 'hash' : 'domain';
    router.push(`/lookup?type=${type}&q=${encodeURIComponent(indicator)}`);
  }
  return (
    <div className="landing">
      <header className="landing-nav">
        <Link href="/" className="brand">
          <span className="brand-mark"><Icon name="shield" /></span>
          <span className="brand-name">KapiTrace</span>
        </Link>
        <nav className="landing-nav-actions" aria-label="Acesso">
          {signedIn ? <>
            <ButtonLink href="/dashboard" variant="ghost">Watchlist</ButtonLink>
            <ButtonLink href="/lookup">Ir para consultas <Icon name="arrow-right" /></ButtonLink>
          </> : <>
            <ButtonLink href="/login" variant="ghost">Entrar</ButtonLink>
            <ButtonLink href="/lookup">Consultar <Icon name="arrow-right" /></ButtonLink>
          </>}
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="hero-badge">v1.0 — 7 integrações disponíveis • Configure suas chaves</p>
          <h1 className="hero-title">
            Threat Intelligence
            <br />
            <span className="gradient-text">& IP Reputation</span>
          </h1>
          <p className="hero-lead">
            Analise a reputação de IPs, domínios e hashes agregando dados de <strong>7 fontes de inteligência</strong> em um score unificado.
          </p>

          <form className="search-hero" onSubmit={search} role="search">
            <span className="search-hero-icon"><Icon name="search" /></span>
            <input
              type="text"
              placeholder="IP, domínio ou hash"
              aria-label="Indicador inicial"
              required
              maxLength={512}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-lg">Analisar</button>
          </form>

          <div className="hero-examples">
            <span>Exemplos:</span>
            {examples.map(example => <code key={example}>{example}</code>)}
          </div>
        </section>

        <section className="sources-bar" aria-labelledby="fontes-titulo">
          <div className="sources-bar-inner">
            <h2 id="fontes-titulo" className="sources-bar-label">Fontes de inteligência</h2>
            {providers.map(name => (
              <div key={name} className="source-chip">
                <strong>{name}</strong>
                <span>Cota conforme plano</span>
              </div>
            ))}
          </div>
        </section>

        <section className="section" aria-labelledby="recursos-titulo">
          <div className="section-header">
            <h2 id="recursos-titulo">Inteligência completa em <span className="text-cyan">uma plataforma</span></h2>
            <p>Consultas de inteligência e watchlist com dados de fontes externas configuradas.</p>
          </div>
          <ul className="feature-grid stagger-children" role="list">
            {features.map(feature => (
              <li key={feature.title} className="card card-interactive feature-card">
                <span className={`feature-icon tone-${feature.tone}`}><Icon name={feature.icon} /></span>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="cta">
          <h2>Pronto para investigar?</h2>
          <p>{signedIn ? 'Sua sessão está ativa: continue de onde parou.' : 'Entre ou crie uma conta e comece a analisar indicadores agora.'}</p>
          <div className="cta-actions">
            {signedIn ? <>
              <ButtonLink href="/lookup" size="lg">Ir para consultas</ButtonLink>
              <ButtonLink href="/dashboard" variant="ghost" size="lg">Abrir watchlist</ButtonLink>
            </> : <>
              <ButtonLink href="/login" size="lg">Entrar ou criar conta</ButtonLink>
              <ButtonLink href="/lookup" variant="ghost" size="lg">Fazer uma consulta</ButtonLink>
            </>}
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <p>© 2026 KapiTrace Intelligence — UFPA DSAI</p>
        <p>Next.js 16 • Express.js • PostgreSQL • Prisma • 7 integrações</p>
      </footer>
    </div>
  );
}
