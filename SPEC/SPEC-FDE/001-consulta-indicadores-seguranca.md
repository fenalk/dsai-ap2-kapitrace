# SPEC-FDE 001 — Consulta de indicadores de segurança (AbuseIPDB + VirusTotal)

- **Prioridade:** P0 — Alta
- **Data:** 2026-11-18
- **Status:** implementada (PR #13; issue #2 fechada). Pendentes: decisão D1 e validação manual com chaves reais ("Como validar", parte manual). Atualizado em 2026-11-19 pela SPEC-FDE 005.
- **Agente:** Claude Code (Claude Opus 5.5)
- **Origem:** diagnóstico FDE (issue #1) e entrevista com o cliente
- **SPECs relacionadas:** `SPEC/2026-10-06-real-api-integration.md`, `SPEC/2026-10-01-threat-analyzer.md`, `SPEC/2026-10-06-auth-and-middleware-reactivation.md`

## Contexto

A principal necessidade do cliente é consultar indicadores de segurança. Segundo o cliente, já existem contas no AbuseIPDB e no VirusTotal, com API Keys geradas. Este agente **não leu nem verificou** essas chaves; a existência e a validade delas são uma premissa a confirmar (ver Dependências).

O código de integração com os dois provedores **já existe** (implementado pela SPEC `2026-10-06-real-api-integration.md`), mas só foi exercitado com fixtures HTTP nos testes (`tests/http-fixtures.ts`). O diagnóstico FDE registra que localmente as 7 chaves estão vazias em `src/backend/.env` e que nenhuma consulta real foi feita até agora. Portanto, **a integração não é considerada operacional**: esta SPEC cobre ativar, validar e tornar útil a consulta real com esses dois provedores, sem reescrever o que já existe.

### Como o sistema recebe indicadores hoje

- Tela `/lookup` (`src/frontend/src/app/lookup/page.tsx`): abas **IP / DOMAIN / HASH**, um indicador por vez, botão "Analisar".
- API autenticada `GET /api/lookup/:type/:indicator` (`src/backend/src/modules/lookup/lookup.route.ts`), protegida por `authenticate` + `limitLookup` (30 req/min por IP, por processo).
- Validação antes de cache/provedores (`src/backend/src/modules/threat-analyzer/validators.ts`): IPv4/IPv6 **públicos** (privados/reservados retornam 400), domínio (≤253 caracteres), hash MD5/SHA-1/SHA-256.

### Tipos suportados pelos provedores e pelo código atual

| Provedor | IP | Domínio | Hash | Endpoint usado | Autenticação |
| --- | --- | --- | --- | --- | --- |
| AbuseIPDB v2 | Sim (IPv4/IPv6) | Não (`not_applicable`) | Não (`not_applicable`) | `GET /api/v2/check?ipAddress=…&maxAgeInDays=90` | header `Key` |
| VirusTotal v3 | Sim | Sim | Sim (MD5/SHA-1/SHA-256) | `/ip_addresses/{ip}`, `/domains/{d}`, `/files/{hash}` | header `x-apikey` |

O VirusTotal também consulta URLs, mas isso exigiria identificador/submissão de URL. O projeto é **somente leitura** (sem upload, submissão ou varredura ativa), então URL fica fora do escopo.

Evidência normalizada hoje (`intelligence.service.ts`, `normalizeProvider`):
- AbuseIPDB: `abuseConfidenceScore`, `totalReports`, `country`, `isp`.
- VirusTotal: `malicious`, `engines` (soma de `last_analysis_stats`), `country`, `asn`, `organization`, `fileType`.

## 1. Problema observado

1. **Sem chaves, a consulta falha com mensagem opaca.** Com todas as fontes `not_configured`, `collectIntelligence` retorna `successful: false` e o controller responde **503** `{"error":"Threat intelligence currently unavailable", "sources":[…]}` (`lookup.controller.ts`, classe `LookupUnavailable`). O frontend (`src/frontend/src/lib/api.ts`) só repassa o texto de `error`, em inglês, e a tela não exibe o array `sources` nem o header `Retry-After` do 503. O usuário não sabe se o problema é configuração, limite ou indisponibilidade.
2. **Detalhes exibidos com nomes técnicos.** A lista "Fontes consultadas" imprime as chaves cruas do objeto (`abuseConfidenceScore: 77`, `totalReports: 12`, `malicious: 5`, `engines: 90`), sem rótulo, unidade ou contexto.
3. **Com apenas dois provedores, todo resultado é "parcial".** `partial` é verdadeiro quando qualquer fonte aplicável não está `ok`, e isso inclui `not_configured` (`intelligence.service.ts`, linha final de `collectIntelligence`). Com só AbuseIPDB e VirusTotal configurados, toda consulta:
   - mostra o aviso "Resultado parcial: algumas fontes não estão disponíveis";
   - é gravada com TTL parcial de 5 min (`LOOKUP_PARTIAL_CACHE_TTL_SECONDS=300`) em vez de 24 h, o que aumenta o consumo da cota do VirusTotal.
4. **Domínio e hash dependem só do VirusTotal**, dentre os dois provedores. `VIRUSTOTAL_MIN_INTERVAL_MS=15000` faz uma segunda consulta, feita em menos de 15 s, falhar localmente como `rate_limited`. Sem cache, domínio/hash resultam em 503.
5. **Mensagens de validação em inglês** chegam à tela (ex.: `Invalid hash length of 10 characters (expected 32 for MD5…)` vindo de `validators.ts`).
6. **Não há como confirmar a configuração sem fazer uma consulta.** Nada indica, na inicialização, quais provedores estão habilitados.

## 2. Resultado esperado

- Com as chaves do AbuseIPDB e do VirusTotal configuradas **somente no backend**, o analista consulta IP, domínio e hash pela tela `/lookup` e recebe ThreatScore, nível de risco, cobertura de evidência e os dados dos dois provedores com rótulos claros em português.
- Falhas (falta de configuração, limite de requisições, indisponibilidade, indicador inexistente) aparecem com mensagens em português que dizem **o que aconteceu e o que fazer**, sem fabricar score (`null`, nunca `0`).
- Nenhuma API Key aparece no frontend, no bundle, no repositório, nas respostas HTTP ou nos logs.

## 3. Escopo

**E1 — Configuração das chaves (operação, sem código):**
- Preencher `ABUSEIPDB_API_KEY` e `VIRUSTOTAL_API_KEY` apenas em `src/backend/.env` local (já ignorado pelo `.gitignore` e bloqueado por `npm run check:secrets`).
- Ajustar `VIRUSTOTAL_MIN_INTERVAL_MS` e `ABUSEIPDB_MIN_INTERVAL_MS` à cota real das contas, se necessário.
- Documentar no README o passo de configuração para o host do backend em produção (variáveis de ambiente do servidor), **sem alterar** a configuração de produção nesta entrega.

**E2 — Erro 503 compreensível no frontend:**
- `lib/api.ts` passa a expor `status`, corpo e `Retry-After` do erro (ex.: uma classe `ApiError`), preservando o comportamento atual de 401 (`AuthenticationError` limpa a sessão) e de falha de rede.
- A tela `/lookup`, ao receber 503 com `sources`, mostra uma mensagem em português e o status de cada fonte. Exemplos:
  - todas `not_configured`: "Nenhuma fonte de inteligência está configurada no servidor. Contate o administrador.";
  - alguma `rate_limited`: "Limite de consultas do provedor atingido. Tente novamente em N s.";
  - demais casos: "As fontes de inteligência não responderam. Tente novamente em instantes."

**E3 — Apresentação dos dados dos dois provedores:**
- Rótulos em português para os detalhes conhecidos:
  - AbuseIPDB: "Confiança de abuso: X%", "Denúncias (90 dias)", "País", "Provedor (ISP)";
  - VirusTotal: "Detecções maliciosas: X de Y motores", "País", "ASN", "Organização", "Tipo de arquivo".
- Chaves não mapeadas continuam visíveis com o nome original (sem perder evidência).
- Distinguir visualmente fonte **consultada**, **não configurada**, **não aplicável** e **com falha**. O aviso de resultado parcial passa a listar quais fontes faltaram.

**E4 — Mensagens de validação em português na tela de consulta:** mapear no frontend, por tipo, as mensagens 400 de `Validation Error` para português (ex.: "Hash inválido: use MD5 (32), SHA-1 (40) ou SHA-256 (64) caracteres hexadecimais."; "Apenas IPs públicos podem ser consultados."). O contrato do backend não muda.

**E5 — Visibilidade da configuração:** na inicialização (`server.ts`), registrar em log **apenas os nomes** dos provedores com chave preenchida (ex.: `Threat intelligence providers configured: ABUSEIPDB, VIRUSTOTAL`), nunca valores, tamanhos ou prefixos.

**E6 — Testes:** integração para 503 com `sources` e `Retry-After` só com dois provedores configurados; e2e para a mensagem de 503 e para os rótulos. Usar as fixtures existentes de `api.abuseipdb.com` e `www.virustotal.com` em `tests/http-fixtures.ts`.

### Decisão pendente (não implementar sem aprovação)

**D1 — `not_configured` deve tornar o resultado "parcial"?** (problema 3)
- **Opção A (atual):** manter. Mais conservador, mas força TTL de 5 min e o aviso permanente, com mais consumo de cota.
- **Opção B (recomendada):** fontes `not_configured` não contam para `partial`, mas continuam listadas e reduzindo `confidencePercentage`. Mantém o princípio de não fabricar reputação e permite o cache de 24 h.
- A opção B altera uma regra da SPEC `2026-10-06-real-api-integration.md` e os testes de `lookup-resilience`. Por isso exige aprovação e atualização da SPEC antes do código.

## 4. Fora do escopo

- Os outros 5 provedores (Shodan, GreyNoise, URLScan, OTX, IPInfo) e a consulta de email (`EmailCache`).
- Consulta de URL, upload de arquivo ou submissão para análise no VirusTotal.
- Consulta em lote/CSV e detecção automática do tipo de indicador.
- Alterar pesos, fórmula ou modificadores do ThreatScore (`threat-score.service.ts`).
- Histórico de consultas (`AuditLog`), relatórios, alertas e reconsulta da watchlist.
- Rate limit distribuído, deploy e alteração de configuração de produção.
- Persistência de sessão e RBAC.

## 5. Critérios de aceite

- **CA1 — Chaves fora do frontend:** Dado o build do frontend (`npm --prefix src/frontend run build`), quando procuro o valor de cada chave e os nomes `ABUSEIPDB_API_KEY`/`VIRUSTOTAL_API_KEY` em `src/frontend/.next`, então nenhuma ocorrência é encontrada. Além disso, nenhuma variável `NEXT_PUBLIC_*` contém chave.
- **CA2 — Chaves fora do Git e dos logs:** Dado o backend rodando com as chaves configuradas, quando executo consultas de sucesso e de falha, então os logs do processo não contêm o valor de nenhuma chave e `npm run check:secrets` passa.
- **CA3 — IP:** Dado um usuário autenticado e os dois provedores configurados, quando consulto um IP público, então AbuseIPDB e VIRUSTOTAL aparecem como "Consultada", o ThreatScore é numérico (0–100) e os detalhes aparecem com os rótulos de E3.
- **CA4 — Domínio e hash:** Dado o mesmo cenário, quando consulto um domínio ou um hash SHA-256, então VIRUSTOTAL aparece como "Consultada" e AbuseIPDB como "Não aplicável".
- **CA5 — Sem configuração:** Dado o backend sem nenhuma chave e sem cache do indicador, quando consulto um IP, então a API responde 503 sem score, e a tela mostra a mensagem em português de E2 com o status de cada fonte, sem exibir ThreatScore.
- **CA6 — Limite parcial:** Dado que o VirusTotal responde 429 (ou está em cooldown local), quando consulto um IP, então o resultado usa o AbuseIPDB, VIRUSTOTAL aparece como "Limite de consultas — tente em N s" e o aviso de parcial cita o VirusTotal.
- **CA7 — Limite total:** Dado que o VirusTotal está limitado e não há cache do domínio, quando consulto esse domínio, então a tela mostra a mensagem de limite com o tempo de `Retry-After`, sem score.
- **CA8 — Sem registro:** Dado que o VirusTotal responde 404 para um hash, quando consulto o hash, então a fonte aparece como "Sem registro" e o score é `null` ("Dados insuficientes"), nunca `0`.
- **CA9 — Cache:** Dada uma consulta bem-sucedida, quando repito a mesma consulta dentro do TTL, então a origem é `cache` e nenhum provedor é chamado.
- **CA10 — Validação:** Dado um IP privado (ex.: `10.0.0.1`) ou um hash de tamanho inválido, quando consulto, então a tela mostra a mensagem em português de E4 e nenhum provedor é chamado.
- **CA11 — Log de configuração:** Dado o backend iniciando com as duas chaves, quando observo o log de inicialização, então aparecem apenas os nomes `ABUSEIPDB, VIRUSTOTAL`.
- **CA12 — Regressão:** `npm run test:unit`, `npm run test:integration`, `npm run test:e2e`, `npm --prefix src/backend run build`, `npm --prefix src/frontend run lint` e `npm --prefix src/frontend run build` passam.

## 6. Dependências

- **Chaves válidas** do AbuseIPDB e do VirusTotal, fornecidas pelo cliente e colocadas pelo responsável no `.env` local. Nunca devem ser enviadas por issue, chat, commit ou registro em `prompts/sessoes/`.
- **Cotas e termos dos planos:** pela documentação pública, o plano gratuito do AbuseIPDB oferece cerca de 1.000 checks/dia. A Public API do VirusTotal oferece cerca de 4 req/min e 500 req/dia e **não permite uso comercial**. Esses valores devem ser confirmados no painel de cada conta antes de ajustar `*_MIN_INTERVAL_MS`. Se o uso pelo cliente for comercial, é preciso confirmar se a licença do VirusTotal cobre esse uso.
- PostgreSQL configurado (`DATABASE_URL`, `DIRECT_URL`, migrations aplicadas) e `JWT_SECRET` com ≥32 caracteres.
- Componentes: `intelligence.service.ts`, `http.ts` (cooldown, allowlist de hosts), `lookup.controller.ts`, `lib/api.ts`, `app/lookup/page.tsx`, `server.ts`, `tests/http-fixtures.ts`, `tests/e2e/browser.test.ts`.
- **Ponto compartilhado com a SPEC-FDE 002:** a mudança em `lib/api.ts` (expor `status`/`Retry-After`) também é usada pela 002. Implemente uma vez, nesta SPEC, que tem prioridade maior.
- Decisão D1 aprovada pelo cliente/orientador antes de mexer em `partial`.

## 7. Como validar

**Automatizado (sem chaves reais):**
1. `npm install` em `src/backend` e `src/frontend`.
2. `npm run check:secrets`
3. `npm run test:unit && npm run test:integration && npm run test:e2e` (Docker e Chrome; `CHROME_BIN` se necessário).
4. `npm --prefix src/backend run build && npm --prefix src/frontend run lint && npm --prefix src/frontend run build`

**Manual com chaves reais (consome cota; limitar a poucas chamadas):**
1. Preencher só `ABUSEIPDB_API_KEY` e `VIRUSTOTAL_API_KEY` em `src/backend/.env`. Subir o backend (`npm run dev`) e conferir o log de CA11.
2. Subir o frontend, entrar e consultar:
   - IP `8.8.8.8` (CA3);
   - domínio `example.com` (CA4);
   - hash SHA-256 do arquivo de teste EICAR, `275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f` (CA4).
3. Repetir a consulta de IP e conferir "Origem: cache" (CA9).
4. Consultar dois domínios diferentes em menos de 15 s e conferir a mensagem de limite (CA7).
5. Consultar `10.0.0.1` e um hash curto (CA10).
6. Esvaziar as duas chaves, reiniciar e consultar um IP ainda não cacheado (CA5).
7. Conferir CA1 e CA2 sem imprimir valores, num subshell:
   `( set -a; . src/backend/.env; set +a; for v in "$ABUSEIPDB_API_KEY" "$VIRUSTOTAL_API_KEY"; do [ -n "$v" ] && grep -rqF -- "$v" src/frontend/.next && echo VAZOU || echo OK; done )`
   Repetir o mesmo `grep -qF` sobre o arquivo de log do backend, se houver.
