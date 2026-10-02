# Promoção da V26 na apresentação (porta 3010) — procedimento e reversão

**Situação:** preparado e ensaiado numa cópia; **não executado** na 3010. A ordem V26 (item 3) manda não trocar
nem reiniciar a 3010 sem janela definida pelo operador.

## O que se promove

- Versão: o commit indicado no `ESTADO-EXECUCAO.md` como candidato da V26 (build feito ANTES da janela, numa
  worktree fixada nesse commit).
- Banco: uma **cópia** do banco atual da apresentação, migrada. O banco original (`gestao_publica_apresentacao`)
  não é alterado, apagado nem recriado: ele é a reversão.

## Medido no ensaio (cópia do banco da 3010, 01/10/2026)

| Passo | Tempo |
|---|---:|
| Cópia do banco (`create database ... template gestao_publica_apresentacao`) | 3 s |
| 14 migrations (V24 a V26), todas aditivas | 9 s |
| SQL manual (índices parciais e travas) | 3 s |
| Papel de runtime | 3 s |
| Tabelas da retenção (IN 1.234, INSS, IRRF) | 5 s |
| `scripts/implantacao/v26-preparar-promocao.ts` (vínculos e cadeia de receita) | 3 s |
| Segunda execução do mesmo script (nada muda: idempotente) | 3 s |

**Interrupção estimada da 3010: 3 a 5 minutos** — parar o servidor (a cópia do banco exige que ninguém esteja
conectado ao original), os passos acima (cerca de 30 s), e a subida do servidor com o build pronto (1 a 2 min
nesta máquina). O build não entra na janela.

## Procedimento

1. Antes da janela: worktree no commit candidato, `prisma generate`, build (`PULAR_CONFERENCIA_DE_TIPOS_DO_BUILD=1
   AMBIENTE_DE_EXECUCAO=demonstracao npx next build`), `.env` copiado.
2. Parar a supervisão e o servidor da 3010 (conferir a linha de comando do processo na porta antes de encerrar).
3. `create database gestao_publica_apresentacao_v26 template gestao_publica_apresentacao`.
4. Com `DATABASE_URL` apontando para a cópia: `npx prisma migrate deploy`; `npx tsx scripts/aplicar-sql-manual.ts`;
   `npx tsx scripts/provisionar-papel-runtime.ts <url da cópia>`; `npx tsx scripts/carregar-tabelas-da-retencao.ts`;
   `CARGA_POR=<administrador> npx tsx scripts/implantacao/v26-preparar-promocao.ts <relatório.md>`.
5. Subir a supervisão com `APRESENTACAO_BANCO=gestao_publica_apresentacao_v26` e
   `APRESENTACAO_PASTA=<worktree do build>` (`scripts/demonstracao/manter-apresentacao-no-ar.mjs`).
6. Conferir: tela de entrada; Financeiro › Retenções do município (três decisões vigentes); Financeiro ›
   Consignações (ISS em 2.1.8.8.1.01.08, INSS em 2.1.8.8.1.01.02, IRRF em 2.1.8.8.1.01.04); Integrações › SAGRES
   (45 de 58 tabelas).

## Reversão (cerca de 2 minutos)

Parar o servidor e subir a supervisão sem as duas variáveis (voltam ao padrão: o banco original e a pasta do
repositório com o build anterior). Nenhum dado do original foi tocado; a cópia fica para análise.

## Vínculos corrigidos pelo script (pelos serviços, com fundamento e histórico)

| Consignação | Antes | Depois |
|---|---|---|
| ISS | 2.1.8.8.1.02.00 Garantias | 2.1.8.8.1.01.08 ISS |
| INSS | 2.1.8.8.1.01.00 (sintética) | 2.1.8.8.1.01.02 Contribuição ao RGPS |
| IRRF | não existia | 2.1.8.8.1.01.04 IRRF |

E a cadeia de receita do IR e do ISS próprios (naturezas 11130311, 11130341, 11145111; crédito tributário e VPA do
PCASP do TCE-PB). A redefinição é versionada: fato antigo continua na conta em que foi lançado.

## Fatos afetados pelos vínculos antigos (identificados, não regularizados)

| Dia | Fato | Valor | Conta |
|---|---|---:|---|
| 14/09/2026 | ISS retido no pagamento, consignatário Município de Campina Grande | 500,00 | 2.1.8.8.1.02.00 |
| 20/09/2026 | Recolhimento desse ISS | 300,00 | 2.1.8.8.1.02.00 |
| | **Saldo em Garantias** | **200,00** | |

O ISS é de outro município (terceiro): continua consignação; só a conta está errada. **Proposta ao contador:**
lançamento de reclassificação D 2.1.8.8.1.02.00 / C 2.1.8.8.1.01.08 de 200,00, citando os dois movimentos
(Contabilidade › Lançamentos). Depois disso o recolhimento do saldo sai da conta certa. Nada é apagado; nenhuma
retenção do próprio município foi achada nos fatos antigos.

## A identidade de Esperança e o histórico de Campina Grande

O banco da apresentação é a demonstração com o ente "PREFEITURA MODELO - POC" (IBGE 2504009) e fatos de Campina
Grande. **A promoção não troca o nome nem o IBGE** (a ordem proíbe converter fatos antigos assim). A operação de
Esperança entra num banco próprio, instalado pelas mesmas migrations, quando houver os dados oficiais:

- CNPJ e nome oficiais do município (não estão no repositório);
- códigos e vigências das unidades gestoras no cadastro do Tribunal (Prefeitura, Câmara e o que mais houver);
- a LOA 2026 publicada (o PDF da Lei 613/2025, para conferir as deduções carregadas por
  `scripts/demonstracao/carregar-deducoes-loa-esperanca-2026.ts`);
- os usuários dos servidores de Esperança (os da apresentação são do domínio de Campina Grande).

## Pendências concretas para executar

- Janela definida pelo operador (a ordem a reserva a ele).
- A supervisão da 3010 está parada desde a reinicialização da máquina em 01/10/2026 (o Docker também estava): a
  3010 não está no ar agora, e não foi religada, por ordem.
- Decisão do contador sobre a reclassificação dos 200,00.
