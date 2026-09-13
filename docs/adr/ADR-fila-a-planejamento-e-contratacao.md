# ADR — Fila A: o planejamento plurianual conciliado do siafic-cg e a contratação pela tela

**Situação:** aceita, 2026-09-13 (sessão noturna V4, seção 8, Fila A).

## Contexto

O prompt V4 pede a reconciliação SELETIVA da origem `siafic-cg` em `c04ad5a760dfbce977ef7f28db7e42ee49d85761`
(m02b-plurianual, m22-rh, convênios, contrato/reserva/empenho) e o percurso "entrar como planejador →
PPA/LDO → contratação → empenho vinculado → nota → liquidação → pagamento". Localmente o M02 não tinha
PPA nem LDO; o M11 tinha os serviços de processo, homologação, contrato, aditivo e estorno sem tela; o
empenho tinha `contratoId` e `reservaId` no domínio e não os oferecia no formulário — e a porta ligava o
M05 SEM a port de contratos, de modo que qualquer `contratoId` seria recusado.

O commit `c04ad5a` não estava no clone local da origem (registrado em ESTADO §30.3); ele foi buscado
por `git fetch` para a referência local `refs/reconciliacao/c04ad5a` do clone `~/Developer/siafic-cg`
(leitura, sem push).

## Decisão

1. **M02b entra como módulo daqui, e só o que é reaproveitável.** Schema (20 models), domínio, serviços,
   consultas, anexos puros da LDO e testes vieram como estavam — os imports já eram os deste repositório.
   As back-relations entraram nos models locais do M02. A migration foi **gerada aqui** (`prisma migrate
   diff` sobre o schema local) e os CHECKs vieram da migration de origem um a um, em migration
   separada da que acrescenta as dez ações ao enum (`ALTER TYPE ADD VALUE` não convive com o uso do
   valor na mesma transação).
2. **As telas da origem NÃO entram.** Elas eram do `lib/scaffold` do siafic-cg, que aqui não existe;
   o molde (`lib/molde/`) é a superfície deste repositório. Quatro recursos: PPA, programas do PPA,
   estrutura temática, LDO — com os cadastros dependentes como ações do detalhe e os oito anexos da
   LRF em PDF pela rota autenticada (`lib/portas/anexos-ldo.ts`, `lib/pdf/anexos.ts`, portados).
3. **Dez ações para vinte serviços, agrupadas pelos anexos da LRF** (decisão da origem, mantida) e a
   **atualização de permissões v5** própria deste repositório: quem cria FICHA no escopo global recebe
   as dez, no global. O plano é ato do ente — nenhuma tabela tem `unidadeOrcId` (canário t5).
4. **A contratação ganha tela no molde:** processo licitatório (criar; homologar, reservar dotação,
   liberar reserva, contratar) e contrato (aditivo, estorno de movimento). Situação, valor atualizado
   e vigência são DERIVADOS pelas funções do M11 — a porta não soma.
5. **O empenho informa contrato e reserva** (selects opcionais, lidos no servidor: contratos de
   processos homologados e vigentes; reservas vivas com saldo), e a porta passa a ligar o M05 com
   `criarM05DepsComContratos` — sem isso o M05 recusa o vínculo nomeando. A TR 4.42 (reserva vinculada
   exige o contrato do processo) continua sendo decidida pelo M05 na transação.
6. **Erros de validação legíveis:** `ZodError.message` é JSON; `lib/portas/mensagem-do-erro.ts`
   formata "campo: mensagem" nas actions novas. As actions anteriores continuam mostrando o JSON —
   pendência `ZOD-LEGIVEL-NAS-ACTIONS-ANTIGAS`.

## O que NÃO entrou, e por quê

- **Compras (solicitação, pesquisa de preços, ordem, recebimento):** os serviços existem (M11) mas as
  entradas são de MÚLTIPLOS ITENS (arrays), que o molde não monta por decisão (limite 2); exigem ilha
  escrita à mão como a das entradas da liquidação. Pendência `COMPRAS-COM-ITENS-NA-TELA`.
- **Nota fiscal recebida com conferência de fornecedor, itens, duplicidade e anexos** (passo 8 do
  percurso): não há modelo de documento fiscal recebido; a liquidação registra a nota como texto.
  Pendência `NOTA-FISCAL-RECEBIDA`.
- **m22-rh e convênios da origem:** o RH fica para a Fila B; convênios já existem localmente (M28) com
  outro desenho — reconciliar exigiria decidir entre os dois modelos. Pendência `CONVENIOS-DA-ORIGEM`.
- **Extrato do contrato em PDF** (`montarExtratoContrato` da origem): não portado. Pendência
  `EXTRATO-DO-CONTRATO-PDF`.
- **Exportação SIGA do PPA/LDO** e **conformidade com o MDF** dos anexos: não afirmadas (ver o
  MODULO.md do M02b).

## Provas

`modules/m02b-plurianual/*.test.ts` (36), `m16-censo.test.ts`, `m16-atualizacoes.test.ts` (v5),
`test/molde/molde.test.ts` (t9/t10/t20 com as portas novas), `scripts/smoke-plurianual.ts` (31 passos),
`scripts/smoke-contratacao.ts`.
