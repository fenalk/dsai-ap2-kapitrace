# SPEC-FDE 006 — Experiência do frontend: moderna, responsiva e com o percurso completo

- **ID:** SPEC-FDE 006
- **Prioridade:** P1
- **Data:** 2026-11-24
- **Status:** implementada (aprovada pelo responsável pelo repositório em 2026-11-24, issue #35; F1–F6 nas PRs #44–#49). Pendente para `validada`: a parte manual de "Como validar" (seção 8)
- **Agente:** Claude Code (Claude Opus 5.5)
- **Origem:** pedido do responsável: "um frontend moderno, responsivo e que seja possível realizar toda a experiência do usuário". Issue mãe #35, sub-issues #36–#42.
- **SPECs relacionadas:** `SPEC/SPEC-FDE/2026-11-18-consulta-indicadores-seguranca.md` (textos e estados da consulta), `SPEC/SPEC-FDE/2026-11-18-melhoria-mensagem-erro-login.md` e `SPEC/SPEC-FDE/2026-11-18-melhoria-preenchimento-cadastro.md` (conteúdo da tela de login), `SPEC/2026-10-06-auth-and-middleware-reactivation.md` (sessão só em memória)
- **Substitui:** o stub `SPEC/2026-09-30-frontend-architecture.md` (sem requisitos)

## Contexto

O frontend (`src/frontend`, Next.js 16 + React 19, CSS vanilla) tem quatro telas: landing (`/`), login/cadastro (`/login`), consulta (`/lookup`) e watchlist (`/dashboard`). O backend expõe:

| Rota | Uso no frontend |
| --- | --- |
| `POST /api/auth/register`, `POST /api/auth/login` | Cadastro e login (JWT só em memória, `lib/session.ts`) |
| `GET /api/lookup/:type/:indicator` | Consulta de IP, domínio e hash; `source` = `api` ou `cache`; `riskLevel` = `LOW`, `SUSPICIOUS`, `HIGH`, `CRITICAL` (limiares 20/50/80); `analysis.riskDescription` em inglês |
| `GET/POST/DELETE /api/watchlist` | Watchlist por usuário. Não há restrição de unicidade: o mesmo indicador pode ser adicionado várias vezes |

## 1. Problema

Percurso quebrado ou confuso:

1. A busca feita na landing se perde no login: `/login` sempre volta para `/lookup`, sem o indicador.
2. `/lookup?q=…` preenche o campo mas não consulta.
3. O item ativo da sidebar nunca acende nas consultas: `pathname` não contém a query string.
4. "Entrar" aparece para quem já entrou (Topbar, resultado, watchlist). "Sair" só existe na watchlist e mostra "Sessão encerrada." como alerta de erro.
5. Não há navegação no celular: a sidebar não tem versão recolhida nem gaveta.

Informação apresentada de forma fraca ou enganosa:

6. A sidebar exibe um ponto verde fixo "Fontes conforme configuração", que parece status ao vivo mas não é.
7. "Cobertura de evidências" mostra `0%` quando `analysis` é `null`.
8. O ThreatScore é só um número; `riskLevel` e `riskDescription` aparecem em inglês; a origem aparece crua (`api`/`cache`).
9. A tela de consulta exige escolher o tipo antes: colar um hash na aba IP dá erro de validação. Indicadores "defanged" (`8.8.8[.]8`, `hxxps://…`) são recusados.
10. Durante a consulta (até 10 s) só aparece "Consultando…"; com `Retry-After`, o tempo de espera vira texto fixo e o botão continua habilitado.
11. A watchlist é uma lista sem ação: não leva de volta à consulta, remove sem desfazer e aceita duplicatas sem aviso.

Base técnica: estilos inline na landing e na sidebar, emojis como ícones (lidos por leitores de tela), dois `layout.tsx` idênticos para `/lookup` e `/dashboard`.

## 2. Resultado esperado

O usuário completa, no desktop e no celular, sem becos sem saída: landing → cadastro/login → consulta (IP, domínio, hash) → leitura do resultado → watchlist → nova consulta → sair.

## 3. Escopo

Entregue em seis PRs, um por sub-issue. Cada requisito tem um ID para ser citado nos commits e nos testes.

### F1 — Fundação visual e shell responsivo (#37)

- **F1.1** Tokens em `globals.css`: escala de espaçamento, raios, tipografia fluida (`clamp`), cores das quatro faixas de risco e dos quatro estados de fonte (`ok`, `not_configured`, `not_applicable`, `failed`). Texto e fundo com contraste WCAG AA (4,5:1 para texto normal).
- **F1.2** Tipografia com pilhas de fontes do sistema (`system-ui`, `Segoe UI`, `Roboto`… e `ui-monospace`, `Cascadia Code`, `Menlo`…). Sem `next/font/google` nem fontes externas: o build e o E2E não podem depender de rede (o commit `da1a7d7` já tinha removido fontes baixadas).
- **F1.3** Componentes base em `src/components/ui/`: botão, campo, card, badge, alerta, skeleton, toast, estado vazio e abas. Abas com `role="tablist"`/`role="tab"`/`aria-selected`.
- **F1.4** Ícones em SVG inline, com `aria-hidden="true"`, no lugar dos emojis.
- **F1.5** Um único shell autenticado (route group) para `/lookup` e `/dashboard`, substituindo os dois `layout.tsx`. As URLs não mudam.
  - ≥ 1024 px: sidebar fixa com rótulos.
  - 768–1023 px: sidebar recolhida, só ícones, com nome acessível (`aria-label`) e dica ao passar o mouse.
  - < 768 px: barra superior com botão de menu que abre a navegação em gaveta (fecha com Esc, clique fora ou ao navegar; foco preso enquanto aberta).
- **F1.6** Sem estilos inline na landing e na sidebar. Animações e transições desligadas com `prefers-reduced-motion: reduce`.
- **F1.7** Sem rolagem horizontal da página em 360 px, 390 px, 768 px e 1280 px. Indicadores longos (hash SHA-256) quebram linha ou rolam dentro do próprio bloco.

### F2 — Navegação e sessão (#38)

- **F2.1** Ao exigir login, `RequireSession` redireciona para `/login?next=<caminho+query atuais>`. Após entrar ou cadastrar, `/login` vai para `next` se ele for um caminho interno (começa com `/` e não com `//`); caso contrário, para `/lookup`.
- **F2.2** Em `/lookup`, se a URL tiver `q`, a consulta é disparada automaticamente uma vez ao abrir a tela.
- **F2.3** O item ativo da navegação considera o `type` da URL (`/lookup?type=domain` acende "Domínio") e usa `aria-current="page"`.
- **F2.4** Com sessão, nenhuma tela autenticada mostra "Entrar". O shell tem um menu do usuário com "Sair", que limpa a sessão e leva a `/login?saiu=1`, onde aparece a mensagem informativa (não de erro) "Você saiu da sua conta.".
- **F2.5** Quando uma chamada autenticada retorna 401, o usuário vai para `/login?next=…&expirou=1` e vê "Sua sessão expirou. Entre novamente." O destino é preservado.
- **F2.6** A landing mostra "Entrar" sem sessão e "Ir para consultas" com sessão. A busca da landing segue o fluxo de F2.1/F2.2.
- **F2.7** O indicador fixo "Fontes conforme configuração" é removido.

### F3 — Login e cadastro, só a parte visual (#39)

- **F3.1** Abas "Entrar" / "Criar conta" (componente de F1.3) em vez do botão de alternância.
- **F3.2** Botão de mostrar/ocultar senha com `aria-pressed` e rótulo acessível.
- **F3.3** Foco automático no primeiro campo ao abrir e ao trocar de aba.
- **F3.4** O erro usa o componente de alerta de F1.3. **Os textos e as regras de validação não mudam nesta SPEC**: são objeto da SPEC-FDE 002 e da 003, que entram quando aprovadas.

### F4 — Consulta (#40)

Entrada:

- **F4.1** Campo único. O tipo é detectado enquanto o usuário digita e mostrado num seletor (IP / Domínio / Hash) que continua editável. A detecção é uma função pura em `lib/`:
  - IPv4 (quatro octetos) ou forma de IPv6 (só dígitos hexadecimais, `:` e `.`, com ao menos dois `:`, colchetes opcionais), sem esquema de URL → IP. `host:porta` e outros textos com um só `:` não são IP;
  - 32, 40 ou 64 caracteres hexadecimais → hash;
  - demais → domínio.
  Escolher o tipo manualmente prevalece até o campo ser alterado de novo.
- **F4.2** Normalização antes do envio, também função pura em `lib/`, aplicada só no frontend:
  - remove espaços nas pontas;
  - "refang": `[.]`, `(.)`, `{.}` e `[dot]` → `.`; `hxxp`/`hxxps` → `http`/`https`; `[:]` → `:`;
  - URL (com esquema) → só o host, sem porta e sem credenciais; host IP é tratado como IP;
  - domínio em minúsculas e sem ponto final.
  Quando o valor enviado difere do digitado, a tela mostra "Consultando como: `<valor>`". A validação continua sendo do backend.
- **F4.3** As abas IP/Domínio/Hash da navegação continuam funcionando como atalho (`?type=`), pré-selecionando o tipo.

Espera e erros:

- **F4.4** Durante a consulta: skeleton dos cards do resultado e o texto "A consulta pode levar até 10 s.".
- **F4.5** Em 429 ou 503 com `Retry-After` (ou `retryAfter` das fontes), o botão "Analisar" fica desabilitado e mostra a contagem regressiva; ao chegar a zero, volta a habilitar. Os textos de `lib/lookup-messages.ts` (SPEC-FDE 001) continuam válidos.

Resultado:

- **F4.6** Medidor do ThreatScore (0–100) com a cor da faixa e o rótulo em português: LOW → "Baixo", SUSPICIOUS → "Suspeito", HIGH → "Alto", CRITICAL → "Crítico". `threatScore: null` mostra "Sem pontuação" sem medidor preenchido.
- **F4.7** A descrição do risco é exibida em português, escolhida pelo `riskLevel` no frontend (texto do backend fica como está, em inglês, no contrato).
- **F4.8** Cobertura de evidências como barra com a porcentagem; se `analysis` for `null`, mostra "—" e nenhuma barra. Nunca `0%` por ausência de dado.
- **F4.9** Origem legível: `api` → "Consulta nova", `cache` → "Do cache"; data da coleta relativa ("há 3 h") com a data completa em `title`/`<time dateTime>`; validade ("expira em 21 h"). O valor cru continua em `data-source` para os testes.
- **F4.10** Fontes agrupadas por estado, nesta ordem: com dados (`ok`, `not_found`), falharam, não configuradas; as não aplicáveis ficam num grupo recolhido (`<details>`). Cada grupo mostra a contagem.
- **F4.11** Avisos de resultado parcial, dado antigo (`stale`) e dados insuficientes usam o componente de alerta, cada um com sua cor.
- **F4.12** Botão de copiar o indicador, com confirmação "Copiado" e falha silenciosa se a área de transferência estiver bloqueada.

Ações:

- **F4.13** Ao mostrar um resultado, a tela verifica a watchlist (`GET /api/watchlist`). Se o indicador (mesmo tipo e valor) já estiver nela, o botão mostra "Na watchlist" e fica desabilitado, com link para a watchlist. Depois de adicionar, o mesmo estado aparece, e um toast confirma.
- **F4.14** "Consultas recentes": as últimas 8 consultas bem-sucedidas da sessão, **só em memória** (módulo como `lib/session.ts`, sem `localStorage`/`sessionStorage`), apagadas ao sair. Clicar refaz a consulta.

### F5 — Watchlist (#41)

- **F5.1** < 768 px: um card por item. ≥ 768 px: tabela com tipo, valor, data de inclusão e ações.
- **F5.2** Filtro por tipo (Todos / IP / Domínio / Hash) e busca por texto no valor, ambos locais.
- **F5.3** Ação "Consultar" em cada item, que abre `/lookup?type=<tipo>&q=<valor>` (dispara pela F2.2).
- **F5.4** Remover tira o item da lista na hora e mostra um toast "Removido · Desfazer" por 6 s. "Desfazer" refaz o `POST` com o mesmo tipo e valor. Se o `DELETE` falhar, o item volta e aparece o erro.
- **F5.5** Estado vazio com explicação e botão "Consultar indicador". Estado de carregamento com skeleton.
- **F5.6** Itens duplicados existentes aparecem normalmente (o backend permite); a prevenção de novas duplicatas é a F4.13.

### F6 — Acessibilidade, responsividade e testes (#42)

- **F6.1** Ao terminar uma consulta, o foco vai para o título do resultado ou para o alerta de erro. Toasts usam `role="status"`; erros, `role="alert"`.
- **F6.2** Todo o percurso é feito só com teclado, com foco visível (`:focus-visible`) em todos os controles.
- **F6.3** Testes unitários (`node:test`, em `tests/unit/`) para as funções puras novas: detecção de tipo, normalização (F4.2), tempo relativo, faixa/rótulo de risco, agrupamento de fontes e validação do `next` (F2.1).
- **F6.4** O E2E (`tests/e2e/browser.test.ts`) cobre o percurso completo também em 390 × 844, via `Emulation.setDeviceMetricsOverride` do CDP (sem dependência nova), incluindo abrir a gaveta de navegação e sair.
- **F6.5** `README.md` atualizado na parte do frontend (telas e percurso).

## 4. Fora do escopo

- Funcionalidades sem backend: consulta de email (#29), alertas (#24), histórico de consultas no servidor (#22), gestão de conta (#31), dashboard de ameaças (#32). Onde a interface as menciona, continua o aviso de indisponível, sem botão que não faz nada.
- Sessão persistente ou renovação de token (#21). A sessão continua só em memória: recarregar a página exige novo login.
- Textos e regras do login/cadastro (SPEC-FDE 002 e 003).
- Qualquer mudança no backend, no contrato da API ou no ThreatScore.
- Tema claro.
- Novas dependências de runtime ou de teste.

## 5. Decisões

Adotadas na aprovação (padrões recomendados no plano da issue #35):

- **D1 — Tema:** só o escuro atual.
- **D2 — Normalização "defanged":** só no frontend, mostrando o valor enviado (F4.2).
- **D3 — Login/cadastro:** só a parte visual (F3); o conteúdo segue a 002/003.
- **D4 — Renovação silenciosa de token:** fora; tratada em #21.

Pendentes: nenhuma.

## 6. Critérios de aceite

1. O percurso da seção 2 funciona em 390 px, 768 px e 1280 px, sem rolagem horizontal da página.
2. Buscar na landing sem sessão → login → o resultado daquele indicador aparece sem clicar em "Analisar".
3. Nenhuma tela autenticada mostra "Entrar"; "Sair" está acessível em todas e não usa alerta de erro.
4. Colar `hxxps://Exemplo[.]com/path` consulta `exemplo.com` como domínio e mostra "Consultando como: exemplo.com".
5. Colar um SHA-256 com a navegação em "IP" consulta como hash.
6. `threatScore: null` mostra "Sem pontuação"; `analysis: null` mostra cobertura "—". Nenhum `0%` ou número sem dado.
7. Em 429 com `Retry-After: 120`, o botão fica desabilitado com contagem regressiva e volta a habilitar ao fim.
8. Adicionar um indicador à watchlist muda o botão para "Na watchlist"; consultar de novo o mesmo indicador mantém esse estado.
9. Remover um item e clicar "Desfazer" o devolve à lista.
10. Os `data-testid` existentes continuam presentes; os seis checks da CI passam, com o E2E rodando em desktop e em 390 px.
11. Nenhuma dependência nova em `src/frontend/package.json`; nenhum uso de `localStorage`/`sessionStorage` para guardar dados.

## 7. Dependências

- Nenhuma SPEC precisa ser aprovada antes. F3 não implementa a 002/003; quando elas forem implementadas, usam os componentes de F1.
- Ordem das PRs: F1 primeiro (base das demais); F2 a F5 em sequência, cada uma a partir da anterior; F6 por último.

## 8. Como validar

Automático:

```bash
npm run check:secrets
npm run test:unit
npm run test:e2e        # Docker + Chrome
npm --prefix src/frontend run lint && npm --prefix src/frontend run build
```

Manual (backend e frontend em `npm run dev`):

1. Nas ferramentas do navegador, testar 360, 390, 768 e 1280 px em `/`, `/login`, `/lookup` e `/dashboard`: sem rolagem horizontal; no celular, abrir e fechar a gaveta com toque e com Esc.
2. Fazer os critérios 2 a 9 da seção 6.
3. Navegar o percurso só com teclado (Tab, Shift+Tab, Enter, Esc).
4. Ativar "reduzir movimento" no sistema e confirmar que não há animações.
