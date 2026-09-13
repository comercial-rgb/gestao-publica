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
   para PDF (`puppeteer` é `serverExternalPackages` em `next.config.mjs`).
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

Banco dos percursos (isolado de dev e da suíte): `npm run percursos:preparar` e
`npm run percursos:servir` (porta 3010).

## Rollback

Voltar o código ao SHA anterior que compartilhe o schema atual. Migrations são
aditivas; não há desfazer de fato contábil.
