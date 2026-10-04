# Promoção da V34 na apresentação (porta 3010): procedimento, conferência e reversão

**Situação em 04/10/2026, madrugada:**
- O procedimento está preparado e ensaiado na 3011.
- Ele **não foi executado** na 3010. A janela é decisão do operador.
- Esta promoção substitui a da V33 (`PROMOCAO-V33-3010.md`), que nunca foi executada. A V34 já contém tudo o que a V33 continha.
- A 3010 continua **fora do ar**, como estava em 03/10. Nada foi religado nela.

Ativar a 3010 e publicar na produção são decisões **distintas**. Este documento trata só da 3010.

## O que se promove

| Item | Valor |
|---|---|
| Versão | `bcf5f7a`, na branch `apresentacao/contabilidade`. É local: não foi enviada ao GitHub. |
| Build pronto | Worktree `~/.gestao-publica-local/wt-v34`, fixada em `bcf5f7a`. A conferência de tipos foi aprovada (`df24f0d5…`) e o `next build` usou essa aprovação, com `AMBIENTE_DE_EXECUCAO=demonstracao`. |
| Ligações da worktree | `node_modules` e `.cache-puppeteer` são junções para as pastas do repositório. O Chrome do PDF depende da segunda: sem ela, o PDF não sai. |
| Migrations pendentes no banco da apresentação | Cinco, todas aditivas (sem `DROP`): `20261101092300_v29_proposta_orcamentaria`, `20261101092400_v32_roteiro_patrimonial_declarado`, `20261101092500_v32_diarias_e_suprimento_de_fundos`, `20261103100000_v33_vinculo_da_unidade_orcamentaria_com_ug` e **`20261104100000_v34_atribuicao_de_entidade_do_movimento_extra`** (nova na V34). |
| Permissões | Nenhuma versão pendente: `permissoes:atualizar pendentes` responde "nenhuma atualização pendente". A V34 não criou ação nova. A regularização do movimento sem titular usa ATRIBUIR_ENTIDADE_A_ARRECADACAO. |
| Banco de origem | `gestao_publica_apresentacao_v28`, o que a 3010 servia. Não é tocado. |
| Banco novo | `gestao_publica_apresentacao_v34`, criado por `pg_dump`/`pg_restore`. |
| Configuração | O `.env` da pasta de build aponta `DATABASE_URL` para o banco novo. A 3010 segue no papel de runtime (`gestao_app`). |

## Cópia de segurança (local)

- **Feita** em 04/10/2026, com a 3010 fora do ar.
- **Arquivo:** `~/.gestao-publica-local/backup-apresentacao-v28-20261004-v34.dump`.
- **Tamanho:** 2.056.245 bytes. O sha256 está gravado ao lado, em `.sha256`.
- **Comparação:** o tamanho é igual ao das cópias de 02/10 e 03/10. O último lançamento é de 29/09: nada foi gravado.
- **Na janela, faça outra** se a apresentação tiver voltado ao ar.
- **A cópia é local.** Não há destino externo nem agendamento instalado.

## Compatibilidade

- **As cinco migrations são aditivas.** O código da V34 lê tabelas que só existem depois delas. Por isso a ordem é: banco migrado, depois o build novo.
- **A reversão não depende do banco migrado.** Ela volta ao par anterior, o build da V28 sobre o banco da V28, que a promoção não toca. Não foi medido se o build da V28 roda sobre o banco migrado, e a reversão não precisa disso.

## Ensaio (medido em 04/10/2026, na 3011)

**1. Restauração da cópia**
- Destino: `gestao_publica_ensaio_v34_promocao`, em **7 s**.
- `migrate status` antes de aplicar listou exatamente as cinco migrations.

**2. Preparação do banco**

| Passo | Tempo |
|---|---|
| Migrations | 11 s |
| SQL manual | 3 s |
| Papel de runtime | 3 s |
| Permissões | 3 s |

Não havia permissão pendente.

**3. Build `bcf5f7a`**
- Conferência de tipos: 216 s.
- `next build`: 85 s.

**4. Servido na 3011**
- Comando: `servir-percursos` com `PERCURSO_COMO_RUNTIME=1`.
- Conexão: papel `gestao_app`, como a 3010.

**5. `scripts/percurso-v33-promocao.ts`** (só leitura, administrador): **10 de 10**.
- Saída bruta: `wt-v34/.registro-de-execucao/percursos/v34-promocao.log`.

**6. `scripts/percurso-v34.ts`** (grava só no ensaio). Saída bruta em `v34-dirigido.log` e `v34-dirigido-r2.log`.

| Bloco | O que passou |
|---|---|
| P.1–P.7 | O contador emite o PDF do Balanço Orçamentário, do Financeiro, da DFC e da composição de uma linha (PDF de verdade, `%PDF`). A linha que não existe é recusada com o caminho. |
| S.1–S.4 | O administrador abre a fila dos movimentos sem titular e regulariza um. A tela confirma por escrito, a atribuição fica no banco com a entidade e o autor, e o movimento sai da fila. |
| S.5 | O menu do extraorçamentário leva à fila. |
| G.1 | A remessa do SAGRES abre. |

- A primeira corrida teve falhas **do percurso**, corrigidas: texto em minúsculas, entidade cadastrada depois de abrir a página, e um `$$eval` trocado por `$eval` na edição.
- A segunda corrida fechou **10 de 10**. Nela S.2–S.4 não se repetem, porque a fila já estava vazia, e a tela disse isso.

**7. Achado na base da apresentação**
- Ela **não tem entidade contábil cadastrada**.
- O ensaio cadastrou "Entidade de ensaio V34" (código E34) pelo serviço normal, para poder atribuir.
- Isso existe só no banco de ensaio. Na apresentação, quem cadastra a entidade é o operador, em Contabilidade › Entidades.

## Na janela (interrupção estimada: 2 a 3 minutos)

1. **Cópia nova** do banco servido, se a 3010 estiver no ar e tiver gravado alguma coisa:
   `docker exec pg-gestao-publica-win pg_dump -U gestao -Fc gestao_publica_apresentacao_v28 > ~/.gestao-publica-local/backup-apresentacao-v28-<data>.dump`
2. **Banco novo:**
   - `docker exec pg-gestao-publica-win createdb -U gestao gestao_publica_apresentacao_v34`
   - `docker exec -i pg-gestao-publica-win pg_restore -U gestao -d gestao_publica_apresentacao_v34 --no-owner < <cópia>`
3. **Na pasta `wt-v34`, com `DATABASE_URL` apontando para o banco novo:**
   - `npx prisma migrate deploy` — deve aplicar exatamente as cinco migrations;
   - `npx tsx scripts/aplicar-sql-manual.ts`;
   - `npx tsx scripts/provisionar-papel-runtime.ts <url do banco novo>`;
   - `SEED_IDENTIDADE=admin@cg.pb.gov.br npm run permissoes:atualizar -- pendentes` — deve responder que não há nada pendente.
4. **Parar a 3010**, se estiver no ar. Antes, confira a linha de comando do processo na porta. Pare também a supervisão, se houver.
5. **Subir com `APRESENTACAO_BANCO=gestao_publica_apresentacao_v34`** e a pasta `wt-v34`. Duas formas:
   - `node scripts/demonstracao/manter-apresentacao-no-ar.mjs 12`;
   - ou `servir-percursos` com `PERCURSO_BANCO`, `PERCURSO_COMO_RUNTIME=1` e `PERCURSO_PORTA=3010`.

## Conferência depois da subida (só leitura)

`DATABASE_URL=<banco novo> npx tsx scripts/percurso-v33-promocao.ts http://localhost:3010 <senha do admin>`

- O resultado esperado é **10 de 10**.
- **Não rode o `percurso-v34` na 3010:** ele grava.

## Reversão (cerca de 2 minutos)

Pare o servidor e a supervisão. Depois suba de novo com o par anterior:
- `APRESENTACAO_BANCO=gestao_publica_apresentacao_v28`;
- `APRESENTACAO_PASTA=C:\Users\winer\.gestao-publica-local\wt-apresentacao` (build `435131c`).

A promoção não toca o banco da V28. Para voltar, basta trocar o par: não é preciso restaurar nada.

## O que a promoção não resolve, porque depende de terceiros

- **Esperança com 4 UGs.** Antes de remeter, é preciso declarar de qual UG é cada unidade orçamentária e quem é o titular de cada conta. Também é preciso regularizar os movimentos extraorçamentários e as guias sem entidade. Sem isso, cada registro sem vínculo sai nomeado como omitido, e o pacote é de conferência.
- **Configuração contábil de Esperança.** A classificação de cada conta na virada, a conta de resultados acumulados e o roteiro ADIANTAMENTO são decisões do ente. Foram exercitados com configuração de ensaio (`ENSAIO-ENCERRAMENTO-V34.md`).
- **Entidade contábil** da base da apresentação: falta cadastrar (achado acima).
- **O ente da demonstração** continua "PREFEITURA MODELO - POC".
