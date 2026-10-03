# Promoção da V33 na apresentação (porta 3010): procedimento, conferência e reversão

**Situação em 03/10/2026, à tarde:** o procedimento está preparado e ensaiado, mas **não foi executado** na 3010. A janela é decisão do operador (ordem V33, item 10). Esta promoção substitui a da V29 (`PROMOCAO-V29-3010.md`), que nunca foi executada: a V33 já contém a V29, a V31 e a V32.

**Atenção:** quando este documento foi escrito, a 3010 estava **fora do ar**. Ela não respondia na porta e não havia processo de supervisão rodando, e nada foi religado. A cópia do banco mostra que nada foi gravado desde a última cópia, de 02/10.

## O que se promove

| Item | Valor |
|---|---|
| Versão | `42dba82`, na branch `apresentacao/contabilidade`. É local: não foi enviada ao GitHub. |
| Build pronto | Na worktree `~/.gestao-publica-local/wt-v31`, fixada em `42dba82`. Foram rodados `prisma generate` e `next typegen`; a conferência de tipos foi aprovada (`8d57e7cc…`); o `next build` usou essa aprovação, com `AMBIENTE_DE_EXECUCAO=demonstracao`. |
| Migrations pendentes no banco da apresentação | São quatro, todas aditivas (sem `DROP`): `20261101092300_v29_proposta_orcamentaria`, `20261101092400_v32_roteiro_patrimonial_declarado`, `20261101092500_v32_diarias_e_suprimento_de_fundos` e `20261103100000_v33_vinculo_da_unidade_orcamentaria_com_ug`. |
| Permissões | Nenhuma versão pendente: `permissoes:atualizar pendentes` responde "nenhuma atualização pendente". Não há ação nova no censo. |
| Banco de origem | `gestao_publica_apresentacao_v28`, o que a 3010 servia. |
| Banco novo | `gestao_publica_apresentacao_v33`, criado por `pg_dump`/`pg_restore`. O banco de origem não é tocado. |
| Configuração | A mesma da V28: o `.env` da pasta de build com `DATABASE_URL` apontando para o banco novo. A 3010 continua no papel de runtime (`gestao_app`). |

## Cópia de segurança (local)

- Feita em 03/10/2026, com a 3010 fora do ar, em `~/.gestao-publica-local/backup-apresentacao-v28-20261003-v33.dump`.
- Tamanho: 2.056.245 bytes. O sha256 está gravado ao lado, em `.sha256`.
- O tamanho é igual ao da cópia de 02/10: nada foi gravado entre as duas.
- **Faça outra na janela**, se a apresentação tiver voltado ao ar e gravado alguma coisa.
- A cópia é **local**. Não há destino externo nem agendamento instalado; o destino externo depende do operador (ver `COPIA-DE-SEGURANCA.md`).

## Ensaio (medido em 03/10/2026)

1. A cópia foi restaurada em `gestao_publica_ensaio_v33_promocao` em **9 s**.
2. Migrations, SQL manual, papel de runtime e permissões levaram **17 s**. As quatro migrations foram aplicadas e não havia permissão pendente.
3. Os dados conferem: 7 fichas de 2026 e 74 lançamentos, os mesmos de antes.
4. O build `42dba82` foi servido na 3011 sobre essa cópia. O percurso de conferência pela tela (`scripts/percurso-v33-promocao.ts`, só leitura, como administrador da apresentação) passou: **10 de 10**. As telas conferidas foram:
   - a entrada, com o menu do contador;
   - as fichas de 2026;
   - a proposta orçamentária;
   - A pagar;
   - a central de anulações;
   - o fechamento mensal;
   - o vínculo unidade → UG;
   - diárias e suprimento;
   - o SAGRES;
   - o Balanço Patrimonial.
   - Saída bruta: `.registro-de-execucao/percursos/v33-promocao-r2.log`.

## Na janela (interrupção estimada: 2 a 3 minutos)

1. **Cópia nova** do banco servido, se a 3010 estiver no ar e tiver gravado alguma coisa:
   `docker exec pg-gestao-publica-win pg_dump -U gestao -Fc gestao_publica_apresentacao_v28 > ~/.gestao-publica-local/backup-apresentacao-v28-<data>.dump`
2. **Banco novo:**
   - `docker exec pg-gestao-publica-win createdb -U gestao gestao_publica_apresentacao_v33`
   - `docker exec -i pg-gestao-publica-win pg_restore -U gestao -d gestao_publica_apresentacao_v33 --no-owner < <cópia>`
3. **Com `DATABASE_URL` apontando para o banco novo**, na pasta de build:
   - `npx prisma migrate deploy`, que deve aplicar exatamente as quatro migrations acima;
   - `npx tsx scripts/aplicar-sql-manual.ts`;
   - `npx tsx scripts/provisionar-papel-runtime.ts <url do banco novo>`;
   - `SEED_IDENTIDADE=admin@cg.pb.gov.br npm run permissoes:atualizar -- pendentes`, que deve responder que não há nada pendente.
4. **Parar a 3010**, se estiver no ar. Antes, confira a linha de comando do processo na porta. Pare também a supervisão, se houver.
5. **Subir com `APRESENTACAO_BANCO=gestao_publica_apresentacao_v33`** e a pasta do build de `42dba82`:
   - use `node scripts/demonstracao/manter-apresentacao-no-ar.mjs 12`, como na V28;
   - ou use `next start -p 3010` com `IDENTIDADE_DO_CANDIDATO=42dba82` e `AMBIENTE_DE_EXECUCAO=demonstracao`.

## Conferência depois da subida (só leitura)

`DATABASE_URL=<banco novo> npx tsx scripts/percurso-v33-promocao.ts http://localhost:3010 <senha do admin>`. O resultado esperado é **10 de 10**. Não grave nada na 3010 só para conferir.

## Reversão (cerca de 2 minutos)

Pare o servidor e a supervisão. Depois suba de novo com o par anterior:
- `APRESENTACAO_BANCO=gestao_publica_apresentacao_v28`;
- `APRESENTACAO_PASTA=C:\Users\winer\.gestao-publica-local\wt-apresentacao` (build `435131c`).

A promoção não toca o banco da V28.

## O que a promoção não resolve, porque depende de terceiros

- **Esperança com 4 UGs:** antes de remeter, é preciso declarar de qual UG é cada unidade orçamentária e o titular de cada conta bancária. Sem isso, a remessa do SAGRES sai como pacote de conferência, com o motivo de cada arquivo que ficou fora.
- **Extras, receita orçamentária e ordenador** continuam fora do pacote quando há 2 ou mais UGs. É a pendência `SAGRES-EXTRAS-RECEITA-ORDENADOR-POR-UG`.
- **O ente da demonstração** continua "PREFEITURA MODELO - POC".
- **O pagamento da folha de 09/2026** continua recusando, com o nome do PREV, até a conta do INSS ser trocada pela tela. É pendência da V28.
