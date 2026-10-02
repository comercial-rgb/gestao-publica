# Promoção da V27 na apresentação (porta 3010) — roteiro pronto para a janela do operador

**Situação:** preparado e ensaiado numa cópia; **não executado**. A ordem V27 (item 7) reserva ao operador a janela,
e manda não reiniciar nem alterar a 3010. Este roteiro substitui o da V26 (`PROMOCAO-V26-3010.md`, que fica como
histórico) e inclui o que a V26 já trazia.

## O artefato

| Item | Valor |
|---|---|
| Commit candidato | o indicado no `ESTADO-EXECUCAO.md` como candidato da V27 (no fechamento desta rodada: `f82f7ff` ou o commit de checkpoint seguinte, que só muda documentos) |
| Build | `~/.gestao-publica-local/wt-v27` (worktree fixada no commit; `prisma generate`, `next typegen`, `tipos:conferir`, `next build`) |
| Migrations a aplicar na cópia | 21: de `20261020…` (as V24 em diante que a 3010 não tem) até `20261101091600_v27_norma_antes_do_protocolo`. Contadas no ensaio: a 3010 está com 251 e o repositório com 272 |
| Atualização de permissões | v42 `frota-e-farmacia` (4 concessões ao perfil do administrador no ensaio) |

## Medido no ensaio (cópia `gestao_publica_ensaio_promocao_v27` do banco da 3010, 02/10/2026)

| Passo | Tempo |
|---|---:|
| Cópia do banco (`create database … template gestao_publica_apresentacao`) | 3 s |
| 21 migrations | 10 s |
| SQL manual (32 arquivos) | 3 s |
| Papel de runtime | 3 s |
| Tabelas da retenção | 4 s |
| `scripts/implantacao/v26-preparar-promocao.ts` (vínculos das consignações e receita própria) | 4 s |
| `permissoes:atualizar -- pendentes` (v42) | 4 s |
| Segunda execução dos dois últimos | nada muda (zero gravações; "nenhuma atualização pendente") |

**Interrupção estimada da 3010: 3 a 5 minutos.**
- Parar o servidor e a supervisão.
- Fazer os passos acima, cerca de 31 s.
- Subir com o build pronto, de 1 a 2 min nesta máquina.
- O build não entra na janela.

## Antes da janela

1. Build na worktree no commit candidato (feito para a 3011: `wt-v27`).
2. Conferir que nenhuma conexão usa o banco da apresentação, para que a cópia por template seja possível.
3. Ter à mão o roteiro de verificação abaixo.

## Na janela

1. Parar a supervisão e o servidor da 3010. Antes de encerrar, conferir a linha de comando do processo na porta: ela
   deve ser a da apresentação.
2. `create database gestao_publica_apresentacao_v27 template gestao_publica_apresentacao`.
3. Com `DATABASE_URL` apontando para a cópia:
   - `npx prisma migrate deploy`
   - `npx tsx scripts/aplicar-sql-manual.ts`
   - `npx tsx scripts/provisionar-papel-runtime.ts <url>`
   - `npx tsx scripts/carregar-tabelas-da-retencao.ts`
   - `CARGA_POR=<administrador> npx tsx scripts/implantacao/v26-preparar-promocao.ts <relatório.md>`
   - `SEED_IDENTIDADE=<administrador> npm run permissoes:atualizar -- pendentes`
4. Subir a supervisão com `APRESENTACAO_BANCO=gestao_publica_apresentacao_v27` e
   `APRESENTACAO_PASTA=<worktree do build>` (`scripts/demonstracao/manter-apresentacao-no-ar.mjs`).

## Verificação depois da subida (5 minutos)

- **Tela de entrada:** a sessão abre.
- **Integrações › SAGRES:** a tabela do leiaute mostra **58 de 58**. A prévia de um dia traz os arquivos da frota e da
  farmácia; com pendência, o botão diz "Baixar para conferência (incompleto)".
- **Patrimônio › Frota** e **› Farmácias públicas:** abrem, vazias. O banco da apresentação não tem frota.
- **Financeiro › Consignações:**
  - ISS em 2.1.8.8.1.01.08;
  - INSS em 2.1.8.8.1.01.02;
  - IRRF em 2.1.8.8.1.01.04.
- **Financeiro › Retenções do município:** três decisões vigentes.
- **Planejamento › Créditos adicionais › Leis no Tribunal:** a lista abre, com o campo de protocolo opcional.

## Reversão (cerca de 2 minutos)

- Parar o servidor.
- Subir a supervisão sem as duas variáveis. Elas voltam ao banco original e à pasta do repositório com o build
  anterior.
- O original não foi tocado. A cópia fica para análise.

## O que esta promoção NÃO faz

- **Não troca o nome nem o IBGE** do ente da demonstração ("PREFEITURA MODELO - POC", IBGE 2504009). Os fatos de
  Campina Grande não viram de Esperança.
  - A base de Esperança é outra: `scripts/implantacao/esperanca-instalar-base.ts`, ensaiada em
    `gestao_publica_esperanca_ensaio`.
  - Essa base recebe a Lei 613/2025 com o PDF e espera o código Poder/Órgão, o protocolo e as datas das UGs.
- **Não lança a reclassificação dos R$ 200,00** de ISS em Garantias. A decisão é do contador; ver
  `DIVERGENCIA-ISS-200-GARANTIAS.md`.
- **Não leva a V28** (a outra sessão de trabalho, em `v28-integrado`). Incluí-la é decisão do operador.
  - Nesse caso, entram as migrations da V28 (`20261101092000` em diante) e a declaração do desconto PREV da folha de
    demonstração.
  - Sem essa declaração, o pagamento da folha de 09/2026 seria recusado nomeando o PREV, e o roteiro tem de ser
    ensaiado de novo.

### Se o operador levar também a V28 (informado pela sessão da V28, não ensaiado aqui)

- Os contracheques passam a recusar a natureza da receita sem a VPA declarada. `prisma/seed/m04-contas-da-receita.ts`
  (na V28) declara as seis naturezas em uso e tem de rodar no banco da apresentação.
- A declaração do PREV → INSS e a troca da conta do INSS da folha estão no seed da folha de demonstração da V28.
- Os contracheques já registrados na demonstração creditaram 4.1.1.2.1.01.00, que no plano do TCE-PB é a VPA do ITR.
  É história e não se reescreve, mas aparece na DVP.
