# Implantação do candidato de demonstração

Ambiente identificado como **DEMONSTRAÇÃO**. `NODE_ENV=production` é o modo técnico
do runtime Node/Next — não é produção operacional de prefeitura.

## Inventário de hospedagem (2026-09-13)

| Item | Situação |
|---|---|
| Alvo autorizado (provedor, subdomínio, responsável) | **não definido** |
| Contratação de recurso pago, DNS, IAM | não autorizada nesta rodada |
| Publicação em domínio municipal ou alteração de produção | não autorizada |
| Runtime local verificado | Node v22.23.2, npm 10.9.8, PostgreSQL 18.6 em `localhost:5436` |
| Dockerfile / compose / Vercel / Fly / Render no repositório | ausentes (não inventar stack) |
| Segredos versionados | nenhum. Nomes em `.env.example`: `DATABASE_URL`, `DATABASE_URL_TEST`, `DATABASE_URL_PERCURSOS`, `SEED_ADMIN_SENHA`, `SEED_IDENTIDADE`, `POC_SENHA_RESTRITO` |

Pendência única de publicação: **alvo de publicação não definido**. Sem autorização
específica do operador, o artefato permanece local. Não há URL de acesso a inventar.

## O que o artefato precisa (quando o alvo existir)

1. Linux x86_64 ou aarch64, Node compatível com o `engines`/`package-lock.json`, Chromium
   para PDF (`puppeteer` é `serverExternalPackages` em `next.config.mjs`). Sem o binário,
   a rota de PDF responde 500 nomeando a ausência — não devolve um PDF vazio. Aponte
   `PUPPETEER_EXECUTABLE_PATH` (e, se o cache não for o padrão, `PUPPETEER_CACHE_DIR`)
   no ambiente do processo `next start`. O renderizador recebe HTML por `setContent`;
   não navega URL de usuário.
2. PostgreSQL persistente, sem porta pública. Papel `gestao_app` (sem superusuário,
   sem `BYPASSRLS`, sem DDL) separado do papel de migration.
3. Build reproduzível: `npm ci`, `npx prisma generate` na arquitetura-alvo,
   `npx prisma migrate deploy`, `npm run db:sql`, `npm run db:papel`, atualização de
   permissões, `npx next build` com `NEXT_PUBLIC_BUILD_COMMIT` igual ao SHA.
4. Processos: `npx next start` (não export estático). Relatórios/PDF no mesmo processo
   até haver job separado. Encerrar Chromium ocioso já existe (`lib/pdf/gerar.ts`).
5. Anexos em `ANEXOS_DIR` fora de `public/` e fora da camada descartável da imagem.
6. Segredos só no servidor. Nunca em `NEXT_PUBLIC_*`, Git, imagem ou relatório.
7. Health/readiness sem escrita de negócio. Banco e serviços auxiliares só em rede interna.
8. Backup de banco e anexos; rollback de código compatível com o schema atual — nunca
   “desmigrar” apagando fatos.
9. `--no-sandbox` do Chromium só se o isolamento do container for o sandbox efetivo.
   O renderizador não navega URLs; recebe HTML por `setContent`.

Standalone do Next **não** está habilitado. Não copiar `node_modules`, browser nem
caminhos do Mac para o Linux. Ensaio de restauração e de `next start` no SHA congelado
antes de qualquer publicação.

## Instalação local do candidato

```text
npm ci
npx prisma generate
npx prisma migrate deploy
npm run db:sql
npm run db:papel
# atualização de permissões (v6 nesta rodada) no banco da instalação
npx next build
NODE_ENV=production npx next start
```

### ⚠️ Em WORKTREE nova, `npx prisma generate` não é opcional — e a falha engana

O passo está na lista acima, e na árvore principal ele é invisível: `prisma/generated/` já existe.
Numa **worktree recém-criada** ele não existe (é gitignorado, e `git worktree add` não copia o que
o Git não versiona). Pular o passo faz o `next build` **compilar com sucesso** e só então quebrar
com:

```
./modules/m01-core-contabil/adapter-prisma.ts
Module not found: Can't resolve '../../prisma/generated/client/client.js'
```

⚠️ **A mensagem manda procurar no lugar errado.** Ela parece dependência faltando, e `npm ci` ou
refazer o symlink de `node_modules` **não resolvem**: o cliente não é pacote, é código gerado
dentro do repositório. Rode `npx prisma generate` DENTRO da worktree, uma vez, antes do build.
(Custou um build inteiro em V11 V9.3.)

### ⚠️ O typecheck do `next build` pode estourar o heap — e há caminho provado, com prova

O `next build` typecheca o MESMO projeto que `npm run typecheck:app` já confere, e numa máquina de
8 GB com outros `next start` de pé o worker de tipos **estoura** (medido em V11 V9.3: OOM a 5039 MB
com `--max-old-space-size=5120`, `SIGABRT`, ~17 min perdidos — e o `.next` fica **sem `BUILD_ID`**,
isto é, inservível; não se sobe artefato de build que falhou).

O caminho é a válvula de `next.config.mjs`, que **só abre com prova do conteúdo**:

```text
npm run tipos:conferir                       # roda o tsc de verdade e grava a aprovação pelo DIGESTO
PULAR_CONFERENCIA_DE_TIPOS_DO_BUILD=1 \
  NEXT_PUBLIC_BUILD_COMMIT=<SHA completo> npx next build
```

Sem aprovação para aquele conteúdo exato o build **para**, e para listando o que mudou. Não é
atalho: é a conferência feita **uma vez** em vez de duas. Enquanto o heap couber, **não se liga a
válvula** — a conferência do próprio build é melhor, porque olha o `.next/types/**` recém-gerado.

Banco dos percursos (isolado de dev e da suíte): `npm run percursos:preparar` e
`npm run percursos:servir` (porta 3010). O servir carrega `.env`, aponta
`DATABASE_URL` para `DATABASE_URL_PERCURSOS` e herda o Chromium do ambiente.

Se o PDF operacional falhar com “Could not find Chrome”, instale o browser do
puppeteer (`npx puppeteer browsers install chrome`) ou defina
`PUPPETEER_EXECUTABLE_PATH` para o binário já presente na máquina.

## Rollback

Voltar o código ao SHA anterior que compartilhe o schema atual. Migrations são
aditivas; não há desfazer de fato contábil.
