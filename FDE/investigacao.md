# FDE
Em hipótese alguma se reescreve o projeto.

## Objetivo
Atuar como um Forward Deployed Engineer com o ciclo de:

1 Entender o negócio

Conversar com usuários, gestores e stakeholders para identificar problemas e oportunidades.

2 Investigar a aplicação

Entender arquitetura, APIs, banco de dados, regras de negócio e integrações existentes.

3 Desenvolver soluções

Criar funcionalidades, scripts, integrações, automações e ajustes na aplicação.

4 Implementar e validar

Colocar a solução em funcionamento, testar com usuários e corrigir problemas.

5 Acompanhar e evoluir

Monitorar resultados, coletar feedback e melhorar continuamente a solução.


# Entender 

## Rodar localmente

### Mensagem de erro 

Rodei localmente, o login para teste funcinou, no entanto, quando errei a senha de proposito, o design da mensagem de erro não é visualmente boa.

## Quem usa?
- O público-alvo dessa aplicação é um usuário que trabalha em uma empresa de segurança ou um usuário que faz parte de uma equipe de segurança de uma empresa. 

- Os perfis prováveis são de Analista de SOC júnior (N1), Administrador de Redes ou Sistemas ou Estudante de cibersegurança.

## Mapear a arquitetura


## Entrevistar o cliente

- O cliente me informou que: basicamente apenas foi montado o frontend e a lógica do sistema. Falta configurar o uso das APIs e a ingestão de dados, fazer ele funcionar mesmo.

- Para as consultas de verdade, precisa criar conta em um ou mais provedores e colar as chaves no @src/backend/.env. Pode ser realizado, para começar, cadastro em dois provedores:
    - AbuseIPDB (abuseipdb.com): reputação de IP, cadastro simples.
    - VirusTotal (virustotal.com): serve para IP, domínio e hash.

# Definir o que falta

## Funcionalidades
- Histórico de consultas (via AuditLog)
- Gerar relatório das consultas
- Alertas da Watchlist
- Dashboard de ameaças
- Consulta de Email
- Perfis de acesso (RBAC)
- Gestão de Conta (não há como trocar senha, recuperar senha ou excluir conta)
- Sessão persistente (o token vive só na memória; recarregar a página exige novo login) ? O cliente que desenvolveu essa regra de segurança.
- Modificadores do ThreatScore (os 6 modificadores C2, botnet, phishing, Tor, whitelist e infraestrutura estão programados, mas nenhum é ativado)

## Scripts
- docker-compose (subir banco, backend e frontend com um comando)

## Integrações
- Chaves das APIs de threat intelligence
- Conexões MCP
- Provedor para Consulta de Email (MCP do Gmail?)
- Integração com SIEM

## Automações
- CI (os testes só rodam à mão)
- Deploy
- Reconsulta agendada da watchlist (não existe nenhum job agendado, e sem isso os alertas da watchlist não funcionam)
- Limpeza de cache vencido (o cache expira pela leitura, mas as linhas antigas nunca são apagadas)
- Monitoramento (só há /health, sem alerta se uma API ou o banco cair)

## Ajustes na aplicação
- Melhorar o tratamento de erro de login/senha
- Melhorar o preenchimento na tela de cadastro
- Mensagem clara quando faltam chaves (503)
- Avisar sobre IP privado antes de enviar
- Rate limit por processo
- Revogar token
- Revisar README (o projeto usa Next.js 16)

## Ordem
1. Fazer funcionar: chaves de API, mensagem clara no 503, deploy no ar.
2. Experiência básica: sessão persistente (usar o refresh), estilo do erro de login.
3. Medir e dar valor: histórico via AuditLog, depois alertas da watchlist com reconsulta agendada.
4. Qualidade contínua: CI e docker-compose.
5. Expansão: email, RBAC, dashboard, integração com SIEM.



# Investigar o Uso
## O que foi construído foi usado?
- Foi realizado o login local com sucesso, porém, não foi possível consultar as APIs pois as 7 chaves de API estão vazias no @src/backend/.env. Sem nenhuma chave, o backend não tem a quem perguntar e responder erro em vez de investar um resultado.

## Há gamificação, e ela funciona?
- Não há gamificação.

- Busca por termos de gamificação. Procurei em todos os arquivos versionados por gamif, conquista, achievement, leaderboard, ranking, streak e recompensa. Não houve nenhum resultado, nem no código, nem nas SPECs, nem no README.

- Banco de dados. O modelo User em schema.prisma guarda só id, email, password, name, role e datas. Não há pontos, XP, nível do usuário nem conquistas, e nenhuma das 7 tabelas registra progresso.

- Telas. As três páginas (login, consulta e watchlist) não mostram nada parecido com placar ou progresso.

## Toda resposta com evidência

# Evoluir
## Novas Specs
- Há 13 specs vazias, fruto do desenvolvimento do cliente. 

- Apenas 4 têm requisitos de verdade e estão implementadas (com uma ressalva no ThreatScore). As que foram implementadas são cobertas por testes que passam.

## Backlog em issues

## Commits pequenos com teste

