# ENT00 — preservar, instrumentar e obter baselines reais

> Primeiro gate. Nada avança sem ele.
> Leia antes: `PROMPT-MESTRE-IMPLEMENTACAO.md` e `MAPA-DE-LACUNAS.md`.
> Ao terminar, este prompt **produz** `ESTADO-EXECUCAO.md`. Esse arquivo não
> existe antes daqui; se alguém o listou como pré-requisito, a leitura foi
> invertida.

## 1. O que este lote entrega

Nenhuma funcionalidade de produto. Entrega o direito de mexer no código sem
destruir nada, e a primeira medida honesta do que existe.

Três fatos do handoff que tornam este lote obrigatório:

1. **`siafic-cg` não está sob controle de versão.** Não existe `.git`. São cerca
   de 124 mil linhas sem rede: qualquer edição é irreversível. O `README-POC.md`
   cita commits e a tag `poc-v1.0`, e esse histórico não está no disco.
2. **`siafic-cg` não tem `node_modules`.** Nada roda antes de instalar.
3. **As portas 5432 e 6379 estão ocupadas** por Postgres e Redis nativos da
   máquina, que escutam no loopback. Um container publicado em `0.0.0.0:5432`
   perde para eles e você recebe `role "..." does not exist` achando que é erro
   de credencial. `saas-municipal` já usa 5434, 5435 e 6380.

## 2. Passos

### 2.1 Confirmar antes de tocar

Confirme no disco, e registre o que encontrou:

```
/Users/winnervinicius/Developer/siafic-cg
/Users/winnervinicius/Developer/saas-municipal
```

Caminho inexistente **não autoriza** recriar a base a partir de descrição,
trabalhar em outra pasta por semelhança de nome ou gerar uma aplicação nova.
Registre a ausência e pare.

O destino `/Users/winnervinicius/Developer/gestao-publica` provavelmente não
existe ainda — ele é criado neste lote, na etapa 2.3.

### 2.2 Colocar o `siafic-cg` sob controle de versão

Antes do primeiro commit, **revise segredos**. O repositório nunca passou por
`.gitignore` validado:

1. Liste candidatos a segredo: `.env`, `.env.*`, `*.pem`, `*.pfx`, `*.p12`,
   `*.key`, credenciais em `prisma/seed/`, tokens em `scripts/`, qualquer
   arquivo com `SECRET`, `PASSWORD`, `TOKEN` ou `API_KEY` no conteúdo.
2. Escreva ou corrija o `.gitignore` **antes** de adicionar qualquer arquivo.
3. Confira o que entraria com `git add --dry-run` e revise a lista item a item.
4. Só então: `git init`, `git add`, commit inicial descritivo.

Não use `git add -A` indiscriminadamente. Não faça push para lugar nenhum.

Se encontrar segredo real já presente no working tree, registre e trate antes do
commit — não commite "para depois remover", porque a partir do commit ele existe
no histórico.

### 2.3 Criar a cópia de trabalho

`gestao-publica` nasce como cópia versionada do `siafic-cg`, que é a base
autoritativa. Preserve o original intacto como referência.

- Copie preservando estrutura, incluindo `prisma/`, `modules/`, `packages/`,
  `app/`, `lib/`, `components/`, `test/`, `scripts/`, `docs/` e os `MODULO.md`.
- Não reorganize pastas neste lote. Não introduza pnpm, Turborepo, Fastify nem
  outra versão do Next junto de uma mudança de negócio.
- Faça commit inicial na cópia, separado, identificando a origem e o commit
  correspondente no `siafic-cg`.

### 2.4 Instalar e provisionar bancos isolados

Portas já ocupadas nesta máquina: 5432 e 6379 (nativos), 5434, 5435 e 6380
(`saas-municipal`). Use faixa livre para o produto:

```bash
cd /Users/winnervinicius/Developer/gestao-publica
npm install

docker run --name pg-gestao-publica \
  -e POSTGRES_USER=gestao -e POSTGRES_PASSWORD=gestao \
  -e POSTGRES_DB=gestao_publica -p 5436:5432 -d postgres:18
```

`.env` com `DATABASE_URL` na 5436 e `DATABASE_URL_TEST` apontando para um
**database distinto**. A suíte trunca tabelas de domínio no `beforeEach` e o
`test/db-teste.ts` aborta se `DATABASE_URL_TEST` faltar ou coincidir com
`DATABASE_URL` em host, porta, database e schema. Essa proteção é do repositório
e deve ser preservada, não contornada.

Aplicar, nesta ordem:

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:sql          # prisma/sql/ — obrigatório em ambiente novo
```

`migrate deploy` sozinho **não** deixa o banco pronto: os 17 arquivos de
`prisma/sql/` trazem índices parciais e checks que o Prisma não representa.
Índice parcial ausente não gera drift e não será apontado pelo diff.

### 2.5 Baselines executáveis

Execute e registre o resultado **real**, inclusive falhas, com comando, ambiente,
data e duração:

```bash
npx tsc --noEmit -p tsconfig.backend.json
npx vitest run
```

No `saas-municipal`, sem alterar nada:

```bash
pnpm typecheck
pnpm test
pnpm -C packages/folha-engine test
pnpm -C apps/worker test
pnpm smoke
```

Um teste vermelho no baseline é informação, não obstáculo. Registre e classifique:
falha de ambiente, dependência ausente, ou falha de negócio. Não conserte agora,
salvo se impedir todo o resto.

Ao usar um job do worker em teste, importe o caminho específico
(`@saas-municipal/worker/jobs/...`): o export raiz sobe um worker no import.

### 2.6 Verificar os invariantes do núcleo

Escreva testes que **violem de propósito** cada invariante e esperem rejeição:

1. Valor monetário em `number` onde o domínio exige `Decimal`.
2. `UPDATE` ou `DELETE` em lançamento contábil pelo papel da aplicação.
3. Entrada externa repetida com a mesma chave de idempotência.
4. Lançamento desbalanceado dentro de um subsistema.

Confirme também o guard de subsistema contra o primeiro dígito do código PCASP:
patrimonial 1 a 4, orçamentária 5 a 6, controle 7 a 8. Quando esse guard entrou,
revelou 85 falhas em 12 arquivos — todas fixtures com a conta errada. Falha nova
é fixture suspeita até prova em contrário, não guard errado.

### 2.7 Inventário de dependências externas

Crie `docs/dependencias-externas.md` com uma linha por integração e as colunas:
órgão, funcionalidade, documento oficial, versão, ambiente, credencial, convênio,
protocolo, restrição, próxima ação, responsável.

Preencha o que já é conhecido: tribunal de contas do estado de destino, ambiente
nacional de NFS-e, Receita Federal, junta comercial, eSocial, CADPREV, BNAFAR,
tribunal de justiça, convênios bancários, provedor de custódia de certificado.

Uma dependência sem credencial bloqueia a validação externa daquela integração.
Não bloqueia arquitetura, testes, nem o desenvolvimento do domínio. E não pode
ser substituída por protocolo fictício.

### 2.8 Registrar o estado

Produza `ESTADO-EXECUCAO.md` conforme o modelo em
`especificacoes/ESTADO-EXECUCAO.modelo.md`, preenchido com dados reais.

## 3. Gate — critérios de aprovação

O lote só encerra com todos estes itens verdadeiros e evidenciados:

1. `siafic-cg` é repositório git, com `.gitignore` revisado e sem segredo no
   commit inicial.
2. `gestao-publica` existe como cópia versionada, com origem registrada.
3. Dependências instaladas; bancos de desenvolvimento e teste provisionados em
   portas que não colidem, com o database de teste distinto.
4. Migrations aplicadas **e** `prisma/sql/` aplicado.
5. Typecheck e suíte executados nos dois repositórios, com resultado real
   registrado por comando, ambiente e data.
6. Os quatro invariantes verificados por teste que os viola.
7. `docs/dependencias-externas.md` criado e preenchido.
8. `ESTADO-EXECUCAO.md` criado.

## 4. Proibições deste lote

Não altere código de domínio. Não crie tela. Não faça merge de pastas entre os
dois repositórios. Não apague nem reescreva migration já aplicada. Não faça
push, deploy, transmissão fiscal ou pagamento. Não rode a suíte destrutiva
contra o banco de desenvolvimento.
