# Promoção da V29 na apresentação (porta 3010) — procedimento, conferência e reversão

**Situação (02/10/2026, noite):** preparado e ensaiado; **não executado** na 3010. A janela é decisão do operador
(ordem V30, item 10).

## O que se promove

| Item | Valor |
|---|---|
| Versão | `4db430f` (branch `apresentacao/contabilidade`, local; não enviada ao GitHub) |
| Build pronto | `~/.gestao-publica-local/wt-v26a`, fixada em `4db430f`: `next typegen`, `tipos:conferir` (dois recortes limpos), `next build` com a aprovação |
| Migration nova | uma: `20261101092300_v29_proposta_orcamentaria` (aditiva: 2 enums, 6 tabelas insert-only) |
| Permissões | nenhuma ação nova; nada a aplicar em `permissoes:atualizar` |
| Banco de origem | `gestao_publica_apresentacao_v28` (o que a 3010 serve hoje) |
| Banco novo | `gestao_publica_apresentacao_v29`, cópia por `pg_dump`/`pg_restore` (não exige derrubar a 3010 para copiar) |

## Backup

- Feito em 02/10/2026 20:30, com a 3010 no ar: `~/.gestao-publica-local/backup-apresentacao-v28-20261002-2030.dump`
  (2.056.245 bytes, sha256 `fdecac5b091112b602c71562977ed0c83cbc5425d2828b38d1fab2367c0fc22a`, gravado ao lado).
- **Na janela, faça outro**: o que a apresentação gravar depois das 20:30 não está no primeiro.

## Ensaio (medido)

Restauração do backup em `gestao_publica_ensaio_v29b`, migration, SQL manual (32 arquivos) e papel de runtime:
**17 s** depois do restore. Servido na 3011 a partir da `wt-v26a`, como `gestao_app`.

Percurso pela tela (`scripts/smoke-proposta-orcamentaria.ts`, admin da apresentação): **23 de 23**.
- importar 2026 (5 receitas, 2 fichas; 5 fichas exclusivas de 2026 ficaram de fora, avisado na tela);
- alterar a ficha 1 para R$ 1.234.567,89 com motivo;
- abrir 2027 pela tela;
- gerar o orçamento de 2027;
- a ficha 1 de 2027 nasce com o valor alterado e uma dotação inicial em 01/01/2027;
- as fichas aparecem em Planejamento › Fichas de 2027.

A primeira corrida (`3ec45c6`) mediu silêncio na confirmação de abrir o exercício e de gerar o orçamento. Foi
corrigido em `4db430f` e a segunda corrida passou.

## Na janela (interrupção estimada: 2 a 3 minutos)

1. Backup novo do banco servido:
   `docker exec pg-gestao-publica-win pg_dump -U gestao -Fc gestao_publica_apresentacao_v28 > ~/.gestao-publica-local/backup-apresentacao-v28-<data>.dump`
2. Cópia: `docker exec pg-gestao-publica-win createdb -U gestao gestao_publica_apresentacao_v29`, depois
   `docker exec -i pg-gestao-publica-win pg_restore -U gestao -d gestao_publica_apresentacao_v29 --no-owner < <backup>`.
3. Com `DATABASE_URL` apontando para a cópia, na pasta do repositório:
   - `npx prisma migrate deploy` (deve aplicar só a da V29);
   - `npx tsx scripts/aplicar-sql-manual.ts`;
   - `npx tsx scripts/provisionar-papel-runtime.ts <url da cópia>`.
4. Parar a supervisão (hoje o PID 36584, `manter-apresentacao-no-ar.mjs 12`) e o servidor da 3010. Antes de
   encerrar, conferir a linha de comando do processo na porta: deve conter `wt-apresentacao`.
5. Subir a supervisão com `APRESENTACAO_BANCO=gestao_publica_apresentacao_v29` e
   `APRESENTACAO_PASTA=C:\Users\winer\.gestao-publica-local\wt-v26a`
   (`node scripts/demonstracao/manter-apresentacao-no-ar.mjs 12`, como na V28).

## Conferência depois da subida (só leitura)

- A entrada abre.
- **Planejamento** mostra "Proposta orçamentária do próximo exercício"; a tela abre com o formulário de importação e
  a lista vazia.
- **Planejamento › Fichas** de 2026: as 7 fichas de antes.
- **Integrações › SAGRES:** 58 de 58.
- Não gravar proposta na 3010 só para conferir: a demonstração da proposta é parte do roteiro ao vivo.

## Reversão (cerca de 2 minutos)

Parar o servidor e a supervisão e subir a supervisão com `APRESENTACAO_BANCO=gestao_publica_apresentacao_v28` e
`APRESENTACAO_PASTA=C:\Users\winer\.gestao-publica-local\wt-apresentacao` (o par de hoje). O banco da V28 não é
tocado pela promoção.

## O que continua como estava

- O pagamento da folha de 09/2026 recusa nomeando o PREV até a troca da conta do INSS pela tela (pendência da
  promoção da V28).
- O ente da demonstração continua "PREFEITURA MODELO - POC"; os fatos de Campina Grande não viram de Esperança.
