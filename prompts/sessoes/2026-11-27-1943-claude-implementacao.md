# Diálogo da sessão

- **Assunto:** Aprovação e implementação da SPEC-FDE 003 (preenchimento do cadastro) e respostas à revisão por IA da PR #63
- **Data:** 2026-11-27
- **Hora:** 19:43
- **Ferramenta/agente:** Claude Code (claude-vscode) / claude-opus-5-5
- **SPEC:** SPEC/SPEC-FDE/2026-11-18-melhoria-preenchimento-cadastro.md

## Usuário

Quero começar ela leia a SPEC 003 e te explico as 4 decisões de forma simples, como fiz com a 008.

## Assistente

Li a SPEC-FDE 003 e conferi o backend atual ([auth.controller.ts](src/backend/src/modules/auth/auth.controller.ts)). Antes das decisões, um ponto de contexto: a maior parte da SPEC (E1–E6) mexe só na tela, no formulário de "Criar conta". As 4 decisões ficaram pendentes porque **mudariam regras do backend**, e a SPEC não quis fazer isso sem você aprovar.

---

### D1 — Igualar os limites do cadastro aos do login

**O problema:** o login recusa email com mais de 254 caracteres e senha com mais de 1024 ([linha 81](src/backend/src/modules/auth/auth.controller.ts#L81)). O cadastro aceita qualquer tamanho. Então dá para criar uma conta que **nunca vai conseguir entrar**.

**A tela nova já impede isso** (o campo não deixa digitar além do limite). Mas quem chama a API direto, sem passar pela tela, ainda consegue criar essa conta quebrada.

**Proposta:** o cadastro passa a recusar com erro 400 os mesmos tamanhos que o login recusa.

**Minha recomendação: aprovar.** É pequena (uma condição a mais no `register` e um teste de integração), corrige um defeito real e não afeta nenhum usuário legítimo.

---

### D2 — Tamanho máximo do Nome

**O problema:** o Nome não tem limite em lugar nenhum. Dá para mandar um nome de 1 MB e ele vai para o banco.

**Proposta:** definir um máximo oficial (sugestão: 100 caracteres) e aplicar também no backend. Sem a D2, o limite de 100 fica só na tela.

**Minha recomendação: aprovar junto com a D1.** É o mesmo tipo de mudança, no mesmo arquivo e no mesmo teste. Só precisa confirmar o número: 100 é suficiente para nomes compostos longos.

---

### D3 — O cadastro revela se um email já tem conta

**O problema:** ao cadastrar um email que já existe, o servidor responde "User already exists". Assim, um atacante descobre quais emails têm conta no KapiTrace (isso se chama *enumeração de usuários*).

**Por que não dá para resolver agora:** a solução correta seria responder "verifique seu email" para qualquer caso e mandar um link de confirmação. Mas o projeto **não envia email**, e criar isso é um projeto inteiro.

**O que a SPEC já faz:** a tela mostra uma mensagem neutra ("Não foi possível criar a conta com este email. Se você já tem cadastro, use 'Já tenho conta'..."). Ela ajuda o usuário, mas o servidor continua revelando a informação por trás.

**Minha recomendação: aceitar o risco por enquanto e registrar isso.** Num projeto acadêmico sem envio de email, é o meio-termo razoável. Se a SPEC-FDE 008 (segurança antes do deploy) tratar de limite de tentativas, isso reduz o abuso.

---

### D4 — Exigir uma senha mais forte

**O problema:** hoje basta ter 8 caracteres, então `12345678` é aceita. E existe uma divergência antiga: a SPEC de 2026-10-01 §4.1 pede maiúsculas, minúsculas, números e símbolos, o código nunca implementou isso, e nenhuma SPEC revogou a regra.

**As opções:**
- **(a) Manter só os 8 caracteres** e escrever que a regra de §4.1 foi revogada. Isso encerra a divergência.
- **(b) Exigir tipos de caractere** (maiúscula, número, símbolo), como manda §4.1.
- **(c) Recusar senhas conhecidas/vazadas** (ex.: `12345678`, `password`) usando uma lista local.

**Minha recomendação: não resolver dentro da 003.** É mudança de regra de negócio e merece uma SPEC própria. O que importa é **decidir explicitamente** entre (a), (b) e (c), para a divergência parar de aparecer como pendência. As recomendações atuais de segurança (NIST) preferem a opção (c), ou (a) com um mínimo maior, à (b): obrigar tipos de caractere costuma gerar senhas como `Senha@123`.

---

### Resumo

| Decisão | O que é | Recomendação |
| --- | --- | --- |
| D1 | Cadastro recusa email >254 / senha >1024 | Aprovar |
| D2 | Nome com no máximo 100 caracteres no backend | Aprovar (confirmar o número) |
| D3 | Cadastro revela email existente | Aceitar o risco e documentar |
| D4 | Senha mais forte | Tirar da 003 e decidir em SPEC própria |

Se você aprovar D1 e D2, a 003 deixa de ser "só frontend": passa a mexer em `auth.controller.ts`, nos testes de integração e na SPEC de auth. Quer que eu atualize a SPEC com as suas decisões?

## Usuário

sim, atualize a SPEC com as recomendações

## Assistente

Vou fazer a mudança numa branch própria a partir do `main`, para não misturar com a PR da 008.

CA11 ficou antes do CA10; corrijo a ordem e atualizo o índice.

Atualizei a SPEC-FDE 003 com as recomendações que você aprovou. Por enquanto as mudanças estão só no seu computador, na branch nova `spec/4-preenchimento-cadastro`, criada a partir do `main` para não misturar com a PR da 008. Ainda não fiz commit.

**Na SPEC** ([2026-11-18-melhoria-preenchimento-cadastro.md](SPEC/SPEC-FDE/2026-11-18-melhoria-preenchimento-cadastro.md)):
- **Status:** passou de `proposta` para `aprovada` (2026-11-27, com as recomendações de D1–D4). Segui o mesmo formato da SPEC-FDE 007.
- **Nova seção E7, limites no backend (D1 + D2):** o cadastro passa a recusar com erro 400:
  - email com mais de 254 caracteres, com a mesma mensagem do email inválido (a tradução da tela continua a mesma);
  - senha com mais de 1024 caracteres;
  - nome com mais de 100 caracteres.

  Essas checagens acontecem antes de consultar o banco, e nenhuma conta é criada. Não precisa de migration.
- **Decisões:** a lista "pendentes" virou "Decisões aprovadas em 2026-11-27":
  - **D3:** o risco fica aceito e documentado, para revisar se o projeto passar a enviar email.
  - **D4:** saiu da 003 e vai para uma SPEC própria.
- **Novo critério de aceite CA11:** testa os limites chamando a API direto. 255/1025/101 caracteres dão erro 400; 254/1024/100 criam a conta normalmente.
- **Resultado esperado, fora do escopo, dependências e validação:** ajustei essas seções. Agora elas dizem que a 003 mexe no `auth.controller.ts` e nos testes de integração, e que a SPEC de auth de 2026-10-06 precisa ser atualizada na implementação.

**No índice** ([SPEC/README.md](SPEC/README.md)):
- a linha da 003 mostra `aprovada` e um resumo das decisões;
- a item 2.2 da ordem de implementação não depende mais de D1–D4;
- a divergência da regra de senha continua listada, agora apontando para a SPEC futura da D4.

Rodei `check:secrets` e não encontrou nada.

Quer que eu faça o commit e abra a PR? O commit seria `docs(spec): aprovar SPEC-FDE 003 com as decisoes D1-D4`, com os trailers no formato do AGENTS.md. Como a PR mexe em `SPEC/**`, ela não recebe merge automático e vai precisar da sua aprovação.

## Usuário

sim, faça o commit e abra a PR

## Assistente

O `gh` provavelmente tentou abrir a PR no repositório de origem (upstream). Vou indicar o repositório certo de forma explícita.

Fiz o commit e abri a PR: https://github.com/fenalk/dsai-ap2-kapitrace/pull/61

- **Commit:** `a1a0351` na branch `spec/4-preenchimento-cadastro`. Conferi os trailers `Agent:` e `Spec:` com `git log`.
- **Problema na primeira tentativa:** o `gh` tentou abrir a PR no repositório de origem (`hug0mgs`) e falhou. Repeti apontando para `fenalk/dsai-ap2-kapitrace` e deu certo.
- **Merge:** a PR mexe em `SPEC/**`, então só entra com a sua aprovação. O CI e a revisão por IA vão rodar normalmente.

Esta PR só registra as decisões; o código da 003 (tela e limites no `register`) ainda está por fazer. A SPEC recomenda começar depois da 002, e a 002 já foi implementada na PR #57. Então dá para começar assim que a #61 entrar no `main`.

## Usuário

/registrar-sessao

## Assistente

Registrei a sessão em [prompts/sessoes/2026-11-27-1943-claude.md](prompts/sessoes/2026-11-27-1943-claude.md).

- **Cabeçalho:**
  - assunto "Aprovação das decisões D1–D4 da SPEC-FDE 003";
  - data e hora 2026-11-27 19:43;
  - ferramenta Claude Code (VS Code) / Opus 5.5;
  - SPEC: a SPEC-FDE 003.
- **Dados sensíveis:** li o arquivo e não encontrei JWTs, chaves, senhas nem URLs de conexão com credenciais.
- **O que não entrou:** este pedido de registro e esta resposta, porque ainda não estavam no histórico quando o script rodou.

O arquivo está só no seu computador, sem commit, e fora da branch da PR #61. Se quiser publicá-lo, faço como manda o AGENTS.md: branch `docs/sessao-spec-fde-003` a partir do `main`, commit `docs(sessao): registrar sessao de aprovacao da SPEC-FDE 003` e uma PR própria citando a #61. Quer que eu faça?

## Usuário

sim, faça o commit e abra a PR do registro

## Assistente

Fiz o commit do registro e abri a PR: https://github.com/fenalk/dsai-ap2-kapitrace/pull/62

- **Branch e commit:** `docs/sessao-spec-fde-003`, criada a partir do `main` atualizado. O commit `de9ea74` inclui só o arquivo do registro e traz os trailers `Agent:` e `Spec:`.
- **Verificação:** rodei `check:secrets` antes do commit e não encontrou nada.
- **Descrição da PR:** cita a PR da SPEC (#61) e a issue #4.

As duas PRs (#61 e #62) estão abertas e esperando a sua aprovação. Elas não dependem uma da outra.

## Usuário

qual é a spec 008?

## Assistente

A SPEC-FDE 008 trata da **segurança antes do deploy**. Antes de o KapiTrace ir para um endereço público (issue #20), ela quer garantir duas coisas: que o histórico do Git não tem segredos e que as bibliotecas não têm falhas graves conhecidas. Ela está como **`proposta`**, em [SPEC-FDE/2026-11-24-seguranca-segredos-dependencias.md](SPEC/SPEC-FDE/2026-11-24-seguranca-segredos-dependencias.md), na branch `spec/56-seguranca-pre-deploy`, e **ainda não tem PR aberta**.

### O que a verificação de 2026-11-24 encontrou

**Segredos:** nada grave. Três segredos de JWT antigos e fracos (um deles só de teste) ficaram no histórico, mas já foram removidos do código. Nenhum funciona hoje, porque o backend exige um segredo de 32 caracteres ou mais. Nenhuma chave de provedor ou senha de banco foi commitada.

**Bibliotecas, o problema real:**
- **Crítico:** o `next` 16.3.8 tem uma falha que permite executar código remotamente. A correção é atualizar para a 16.4.6.
- **Altos:** `body-parser` (via `express`), `follow-redirects` (via `axios`, que nem é usado) e `zod` (só em desenvolvimento).
- `dotenv`, `node-cache` e `nodemon` estão instalados e ninguém usa.

### O que ela propõe

1. **Limpar as dependências:** remover `axios` e os três pacotes sem uso, e atualizar `next`, `express` e `zod` sem mudar de versão major.
2. **Registrar os achados antigos** num arquivo `.gitleaksignore`, com o motivo de cada um, para as próximas varreduras não apontarem tudo de novo. Esse arquivo passa a exigir revisão humana.
3. **Não reescrever o histórico.** Não há credencial real para remover, e reescrever quebraria todos os hashes, PRs e trailers.
4. **Verificar sempre:** um novo check `security` no CI roda o `npm audit` e o gitleaks em todo PR.
5. **Configurar o GitHub (manual):** ligar o Dependabot e o bloqueio de push com segredo.

### As 3 decisões pendentes

| Decisão | Recomendação |
| --- | --- |
| D1 — Como verificar sempre | **A:** check `security` obrigatório no CI + Dependabot + bloqueio de push com segredo |
| D2 — Pacotes sem uso | Remover `dotenv`, `node-cache` e `nodemon` junto com o `axios` |
| D3 — Alertas moderados | Corrigir os que têm atualização simples; os que sobrarem ficam documentados no README como aceitos |

Assim como a 007, a 008 **bloqueia o deploy**. Quer aprovar a 008 com as recomendações e abrir a PR dela, do mesmo jeito que fizemos com a 003?

## Usuário

não quero fazer essa, quais outras issues eu posso fazer para implementar spec?

## Assistente

Você quer issues para implementar uma SPEC. Nesse critério, a lista se divide em três grupos.

### 1. Pronta para implementar agora

**#4 — SPEC-FDE 003 (preenchimento do cadastro).** É a única com SPEC `aprovada` e sem implementação. Acabamos de aprovar as decisões D1–D4, e a 002, da qual ela depende, já está implementada. O trabalho é a tela de cadastro mais os limites de tamanho no `register`. Só falta mesclar a PR #61 antes de começar o código.

### 2. Precisam de uma SPEC nova, e nada impede começar

- **#27 — docker-compose:** subir banco, backend e frontend com um comando. Não depende de nada. A única exigência é não alterar as garantias de `scripts/run-tests.mjs`.
- **#22 — Histórico de consultas em `AuditLog`:** a tabela já existe no banco, mas nenhum código grava nela. É a base dos relatórios (#25). A ordem de implementação sugere fazer depois da Fase 1, mas tecnicamente não depende do deploy.
- **Fase 5 (#29–#34):** email, RBAC, gestão de conta, dashboard, demais provedores, SIEM. São maiores, e a ordem recomenda deixá-las por último.

### 3. Bloqueadas no momento

- **#20 — Deploy:** primeiro é preciso definir onde hospedar, e ele depende da 007 e da 008.
- **#21 — Sessão persistente:** a sessão só em memória foi uma regra de segurança do cliente, então precisa da confirmação dele antes.
- **#23, #24 e #28 (reconsulta da watchlist, alertas, limpeza de cache):** dependem do deploy, porque precisam saber onde o job agendado vai rodar.

Há também três validações sem código novo: a validação manual da 007 (#19), a da 006 (#35) e o registro da conferência do CI (#26). Elas não implementam SPEC, mas mudam o status das SPECs para `validada`.

**Minha recomendação:** a **#4 (SPEC-FDE 003)**, porque já está aprovada e é continuação direta desta sessão. Se preferir começar uma SPEC do zero, a **#27 (docker-compose)** é a mais independente. Qual você quer?

## Usuário

vamos implementar a SPEC-FDE 003

## Assistente

A PR #61 já foi mesclada. Vou criar a branch de implementação a partir do `main` e ler os arquivos envolvidos.

Nada aqui usa API nova do Next: a mudança é React de cliente comum, sem rotas, Server Actions ou `next/image`. Começo pelo backend (E7).

Agora o módulo puro com as regras e os textos do cadastro, no mesmo padrão do `login-messages.ts` da 002.

Agora a tela. Vou reescrever o [login/page.tsx](src/frontend/src/app/login/page.tsx), mantendo intacto o comportamento do modo "Entrar".

Troco o truque `'x'.repeat(...)` por uma função que recebe o tamanho direto, e adiciono o CSS.

O CSS segue o tema escuro único que já existe (o `globals.css` não tem tema claro). Agora os testes unitários das regras e dos textos.

Agora o CA11 no [auth.test.ts](tests/integration/auth.test.ts): as mensagens exatas, a prova de que nenhuma conta foi criada e o nome em branco gravado como `null`.

Agora o e2e (E6). Primeiro conto as requisições de `register`, do mesmo jeito que o teste já conta as de `login`.

Os testes estão escritos. Agora rodo lint, builds e as suítes, começando pelas que não precisam de Docker.

O e2e falhou por timeout numa condição de espera. Vou localizar qual foi.

Vou incluir temporariamente a pilha de quem chamou na mensagem de timeout, para descobrir qual espera travou. Desfaço isso depois.

Os dois commits estão prontos e sem nada sensível. Agora envio a branch e abro a PR.

Agora, como fizemos na 007, atualizo o status da SPEC e do índice citando a PR #63.

Implementei a SPEC-FDE 003 e abri a PR: https://github.com/fenalk/dsai-ap2-kapitrace/pull/63 (fecha a issue #4). Todas as suítes passaram localmente: unitários 143/143, integração 76/76, e2e 1/1, além dos builds, do lint e do `check:secrets`. O CI do GitHub já está rodando; ainda não vi o resultado dele.

**Backend:** o cadastro agora recusa com erro 400 email com mais de 254 caracteres, senha com mais de 1024 e nome com mais de 100, os mesmos limites do login. Um nome só com espaços passa a ser gravado como vazio (`null`); antes virava texto vazio.

**Tela de cadastro:**
- Os rótulos mostram o que é obrigatório: "Nome (opcional)", "Email *", "Senha *" e a legenda "* obrigatório".
- Sob a senha aparece "Mínimo de 8 caracteres."; com 8 caracteres, o ícone muda e surge "Atendido.", sem depender só da cor.
- Os campos são conferidos ao sair deles e no envio. Com erro, nada é enviado e o foco vai para o primeiro campo com problema.
- Os campos não aceitam digitar além dos limites do backend.
- Os erros do servidor aparecem em português, em textos fixos.
- Se a conta é criada mas o login automático falha, a tela avisa "Conta criada…", passa para "Entrar" com o email preenchido e não tenta criar a conta de novo.

**Duas diferenças em relação à SPEC, já registradas nela:**
- A SPEC mandava dizer "use 'Já tenho conta'", mas desde a 006 esse botão é a aba "Entrar". A mensagem aponta para a aba.
- Ao sair de um campo, só mostro erro se você já digitou nele. Passar o foco por um campo vazio não acusa nada, e o erro de campo obrigatório aparece no envio.

**Testes novos:** um teste unitário das regras e mensagens, e um teste de contrato que confirma que a tela e o servidor aceitam e recusam exatamente os mesmos valores nos limites. Também acrescentei os casos do CA11 nos testes de integração e o percurso de CA1 a CA9 no e2e.

**Documentação:**
- Atualizei o README e anotei os limites na SPEC de auth.
- A 003 está como `implementada` no cabeçalho e no índice, citando a PR #63.

Falta a sua validação manual da seção 7 da SPEC: conferir a tela em 360 px e o contraste. O frontend só tem tema escuro, então o item "temas claro e escuro" vale só para ele. A PR mexe em `SPEC/**` e no `README.md`, então o merge depende da sua aprovação.

## Usuário

<pasted_content id="59c5">
Resumo
O PR implementa a SPEC-FDE 003 de forma consistente: limites do register alinhados ao login, nome em branco como null, validação no cliente com textos fixos em português, tratamento de falha parcial e testes unitários, de contrato e e2e proporcionais. Encontrei um problema relevante: o `register` passou a validar o tamanho do email com `email.trim().length > EMAIL_MAX`, mas o login usa a mesma checagem e o teste de contrato usa emails de 254/255 caracteres; a lógica parece correta, porém o `register` não valida `typeof email === 'string'` antes de `isValidEmail`, o que pode gerar comportamento inesperado com tipos não-string (ex.: número), diferente do login. Também há um detalhe de UX/regra: o `maxLength` do campo de senha no cadastro é 1024, mas o `minLength` foi removido e a validação de senha curta depende só do JS, o que é aceitável pela SPEC. O ponto que exige correção é a assimetria de validação de tipo entre register e login e a falta de teste para isso.

Findings (4)
major — src/backend/src/modules/auth/auth.controller.ts:52: register não valida tipo de email antes de isValidEmail, diferente do login
O login checa `typeof email !== 'string'` antes de `isValidEmail`. O register faz `!email || !isValidEmail(email) || email.trim().length > EMAIL_MAX`. Se `email` for um número ou objeto, `isValidEmail` pode se comportar de forma inesperada e `email.trim()` lançaria erro (500) em vez de 400. Alinhe a checagem de tipo com a do login e adicione um caso de teste (email não-string) em auth.test.ts.
minor — src/frontend/src/app/login/page.tsx:195: Remoção do minLength no campo de senha do cadastro
O `minLength={register ? 8 : undefined}` foi removido e substituído por `maxLength`. A validação de senha curta agora depende só do JS (validateRegister). Como o formulário usa `noValidate`, isso é coerente com a SPEC, mas vale confirmar que nenhum teste ou comportamento nativo dependia do minLength.
minor — src/frontend/src/lib/register-messages.ts:60: Mapeamento de erro do servidor por texto é frágil
O mapeamento usa o texto exato do backend como chave. Se o backend mudar a mensagem, cai no genérico 400, o que é aceitável, mas o teste de contrato não cobre a mensagem de nome longo nem a de senha longa no mapeamento (só no fallback). Considere documentar ou testar explicitamente que essas mensagens caem no genérico.
info — tests/integration/register-contract.test.ts: Teste de contrato depende de estado do banco
O teste cria contas reais com emails únicos; se rodar repetidamente contra o mesmo banco, pode acumular dados. Verifique se o helper de teste limpa o banco ou usa transação, como nos demais testes de integração.
Decisão de merge
veredito da IA: request_changes
há findings blocker/major
requer revisão humana (caminho sensível): README.md, SPEC/2026-10-06-auth-and-middleware-reactivation.md, SPEC/README.md, SPEC/SPEC-FDE/2026-11-18-melhoria-preenchimento-cadastro.md
</pasted_content id="59c5">

## Assistente

Antes de mexer em qualquer coisa, vou conferir cada achado no código.

Conferi os 4 achados da revisão por IA no código: corrigi o primeiro e mantive os outros três como estão. O commit `b753d9a` já está na PR #63, e a integração passou (77/77, um teste a mais).

**1. Major, email que não é texto:** o erro 500 descrito não acontece. A função `isValidEmail` já recusava números, objetos e arrays com 400, antes de chegar no `email.trim()`. O que procedia é que essa checagem estava escondida dentro dessa função. Corrigi assim:
- deixei a checagem de tipo explícita no `register`, igual à do login (o comportamento não muda);
- acrescentei um teste: email não-texto (número, booleano, objeto, array, `null`) e senha não-texto recebem 400 e não criam conta.

**2. Minor, `minLength` removido:** mantido. Com `noValidate`, o navegador ignora o `minLength`, e a regra dos 8 caracteres é conferida no código da tela, com mensagem em português. Nenhum teste dependia dele.

**3. Minor, mapeamento por texto:** mantido, porque o teste que a revisão pede já existe. O [register-messages.test.ts](tests/unit/register-messages.test.ts) confirma que as mensagens de senha longa e nome longo caem no texto genérico "Verifique os dados informados.".

**4. Info, estado do banco:** sem problema. Cada execução de teste usa um schema próprio (`kapitrace_test_<uuid>`), que é apagado no final ([postgres-helper.ts:26](tests/postgres-helper.ts#L26)).

O novo push faz a revisão por IA rodar de novo. A PR continua precisando da sua aprovação, porque mexe em `SPEC/**` e no `README.md`. Quer que eu publique na PR um comentário com essas respostas aos achados?

## Usuário

sim, publique o comentário na PR

## Assistente

Publiquei o comentário na PR #63: https://github.com/fenalk/dsai-ap2-kapitrace/pull/63#issuecomment-7229975508

Ele responde aos 4 achados da revisão por IA:
- **Major (tipo do email):** corrigido no commit `b753d9a`, com o teste novo.
- **Minor (`minLength`) e minor (mapeamento por texto):** mantidos. O comentário explica por quê e cita os testes que já cobrem esses casos.
- **Info (estado do banco):** não precisa de mudança, porque cada teste roda num schema próprio que é apagado no final.

A revisão por IA roda de novo por causa do push. O merge continua dependendo da sua aprovação, porque a PR mexe em `SPEC/**` e no `README.md`.

## Usuário

tem como fazer a revisão novamente?

## Assistente

Sim, e ela já rodou de novo sozinha. A revisão por IA roda depois de cada CI da PR, e o comentário dela é editado no mesmo lugar. A versão atual avaliou o commit `b753d9a`, às 23:13 UTC, logo depois da correção.

Para rodar manualmente sem novo push, há dois caminhos (eu não disparei nenhum):
- **Pela linha de comando:** `gh workflow run "AI Review" --repo fenalk/dsai-ap2-kapitrace --ref main -f pr_number=63`
- **Pelo GitHub:** Actions → "AI Review" → "Run workflow", informando o número 63.

Rodar de novo sem mudar o código tende a dar um resultado parecido. O veredito continua **`request_changes`**, agora com outros achados:

| Achado | Procede? | Minha avaliação |
| --- | --- | --- |
| **Major:** "senha longa" e "nome longo" do servidor caem na mensagem genérica, sem apontar o campo | Em parte | Não é bug: a SPEC (E7) previu esse fallback, e o `maxLength` impede o caso na tela. Mas mapear as duas mensagens para o campo certo é simples e melhora a experiência. Exige ajustar uma frase da E7. |
| **Minor:** o asterisco dentro do label faria o leitor de tela anunciar "Email *" | Não | O cálculo do nome acessível ignora elementos com `aria-hidden="true"`, então o nome fica "Email". O e2e confere o texto visível (`textContent`), não o nome acessível. |
| **Minor:** o teste de contrato não testa a tradução das mensagens | Em parte | Se eu fizer o mapeamento do major, incluo esse teste junto. |
| **Info:** um nome que não é texto (ex.: `{}`) vira `"[object Object]"` | Sim, mas já existia antes | Recusar isso muda o comportamento além do que a SPEC pede. Eu deixaria para outra SPEC. |
| **Info:** falta a validação manual (360 px e contraste) | Sim | Já está registrada como pendência. É com você. |

**Recomendo:** fazer o mapeamento do major com o teste do minor e ajustar a frase da E7. Os outros eu manteria e responderia no comentário. Quer que eu faça isso?

## Usuário

sim, faça o mapeamento e responda no comentário

## Assistente

Unitários (143) e integração (77) passaram, e o lint está ok. Rodo o build do frontend para conferir os tipos e depois faço o commit.

Fiz o mapeamento e publiquei a resposta na PR: https://github.com/fenalk/dsai-ap2-kapitrace/pull/63#issuecomment-7230055887

**Mapeamento das mensagens (commit `74ed265`):**
- Quando o servidor recusa uma senha longa ou um nome longo, a mensagem aparece junto ao campo: "A senha pode ter no máximo 1024 caracteres." e "O nome pode ter no máximo 100 caracteres.". Antes aparecia o texto genérico.
- Uma mensagem do backend que a tela não conhece continua caindo no texto genérico.
- O teste de contrato agora passa cada resposta 400 real do servidor pela tradução da tela. Ele confere que ela aponta para o mesmo campo que a regra da tela marca.
- Ajustei a tabela da E4 e a E7 na SPEC.
- Unitários 143/143, integração 77/77, lint e build do frontend ok. Não rodei o e2e de novo, porque a mudança não altera o percurso testado no navegador.

**O que respondi sem mudar:**
- **Asterisco no label:** elementos com `aria-hidden` ficam fora do nome acessível do campo, então o leitor de tela anuncia "Email", não "Email *". Sugeri confirmar com um leitor de tela na sua validação manual.
- **Nome que não é texto:** é um comportamento que já existia antes desta PR. Corrigir isso mudaria a regra do cadastro além do que a SPEC aprovou, então fica para outra SPEC, se você quiser.
- **Validação manual:** continua como pendência sua.

O push dispara o CI e uma nova revisão por IA. O merge continua dependendo da sua aprovação.

## Usuário

verifique o resultado da nova revisão por IA

## Assistente

A nova revisão por IA aprovou a PR #63 (**`approve`**). Ela avaliou o commit `74ed265`, o último da branch, e o CI desse commit passou nos seis checks.

**O que ela disse:** não há nenhum achado grave (blocker) ou importante (major). Sobraram 4 observações informativas, e nenhuma pede correção nesta PR:

| Observação | Situação |
| --- | --- |
| Nome que não é texto (ex.: `{}`) é convertido com `String()` | Já existia antes desta PR. A própria revisão diz que não é falha de segurança. Fica para outra SPEC, se você quiser. |
| A tradução depende do texto exato do backend | A revisão confirma que está certo como a SPEC pede, com mensagem genérica quando o texto é desconhecido. |
| Falta a validação manual (360 px e contraste) | Pendência sua, já registrada. A revisão recomenda anotar o resultado antes de marcar a SPEC como `validada`. |
| A SPEC foi ajustada na mesma PR do código | A revisão considera os ajustes coerentes com o código. É também por isso que o merge é humano. |

**Para mesclar:** a "Decisão de merge" é **sem merge automático**, porque a PR mexe em `SPEC/**` e no `README.md`. O merge depende de você aprovar e mesclar no GitHub.

Depois do merge, falta a sua validação manual da seção 7 da SPEC: abrir `/login`, ir em "Criar conta", testar em 360 px e conferir o contraste. Com isso a SPEC-FDE 003 pode passar de `implementada` para `validada`.

## Usuário

registre a sessão
