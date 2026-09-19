import type { Subsistema, TipoPartida } from "../../packages/ledger/index.js";

/**
 * OS ROTEIROS CONTÁBEIS DA EXECUÇÃO — a política, num dono só.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO CONSERTA ═══
 * Até a 7.1, o roteiro (quais contas o lançamento debita e credita) era
 * responsabilidade do CHAMADOR, e nenhum código de produção montava um: `ContaPcasp`
 * nascia em 55 arquivos, todos `*.test.ts`. Cada fixture escolhia as contas que
 * queria — e escolheu errado em 12 delas (ver GUARD-NATUREZA-INFORMACAO no
 * MODULO.md). As telas de escrita ficaram bloqueadas porque não havia de onde tirar
 * um roteiro que não fosse inventado na borda.
 *
 * ═══ ⚠️ POR QUE HARDCODED, E NÃO TABELA (decisão registrada) ═══
 * Este repositório trata roteiro como DADO: existem 9 tabelas (`RoteiroOrcamentario`,
 * `RoteiroPatrimonial`, `RoteiroAlmoxarifado`, `RoteiroDivida`, …), cada uma com FK
 * para `ContaPcasp`. O natural seria uma 10ª. Mas a tabela exige SCHEMA e MIGRAÇÃO, e
 * a 7.2 é aditiva. A decisão foi: a política da execução nasce em CÓDIGO, aqui, e
 * migra para tabela quando o PCASP completo chegar. Está registrado no MODULO.md do
 * M01 como `ROTEIRO-HARDCODED-VS-TABELA`.
 *
 * ═══ AS CONTAS ═══
 * Classe 6 e 5: extrato oficial STN/MCASP. Patrimoniais: o inventário das fixtures
 * (pendência `MAPA-ELEMENTO-CONTA` — o xlsx PCASP Estendido confirma ou corrige).
 */

/** A perna de um roteiro. Estruturalmente igual à de M04/M05/M07/M08. */
export interface PernaRoteiro {
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
}
export type RoteiroContabil = readonly PernaRoteiro[];

// ── CONTROLE ORÇAMENTÁRIO DA DESPESA (classe 6 — extrato oficial) ────────────

export const CONTA_CREDITO_DISPONIVEL = "6.2.2.1.1.00.00";
/** Nasce no empenho e morre na liquidação. */
export const CONTA_CREDITO_EMPENHADO_A_LIQUIDAR = "6.2.2.1.3.01.00";
/**
 * ⚠️ DORMENTE — `SEM-ESTAGIO-EM-LIQUIDACAO`. O MCASP dá o estágio "em liquidação"
 * (6.2.2.1.3.02) como de uso FACULTATIVO, e este sistema não o usa: a liquidação vai
 * direto de "a liquidar" para "liquidado a pagar". A constante existe para que a
 * decisão fique VISÍVEL — um dia alguém vai perguntar por que o .02 não aparece, e a
 * resposta tem de estar onde ele procurar, não só num MODULO.md.
 */
export const CONTA_CREDITO_EMPENHADO_EM_LIQUIDACAO = "6.2.2.1.3.02.00";
export const CONTA_CREDITO_LIQUIDADO_A_PAGAR = "6.2.2.1.3.03.00";
export const CONTA_CREDITO_LIQUIDADO_PAGO = "6.2.2.1.3.04.00";

// ── CONTROLE DA APROVAÇÃO / DA RECEITA (classes 5 e 6) ───────────────────────

/**
 * ⚠️ REPONTADA EM 2026-09-18, CONTRA A FONTE, E A MEDIÇÃO ESTÁ AQUI. Esta constante apontava para
 * `5.2.2.1.1.00.00`, que no PCASP oficial é **SINTÉTICA** — e conta sintética não recebe partida
 * (`INVARIANTE 5` do adapter). O efeito era um instalador que não termina: `seed:roteiro-orc`
 * recusava, nomeando, e a instalação limpa parava ali. Medido em banco novo e exclusivo:
 * `migrate exit=0`, `SQL manual exit=0`, `pcasp-oficial exit=0`, `roteiro exit=1`.
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB (`prisma/seed/oficial/procedencia.ts`), sha256
 * `52ae7c7336b27a5c2056f7e36947be8ca8c995b6fae74c891d88cab74c517ffb`, publicado em 2024-10-29,
 * o mesmo arquivo que `seed:pcasp-oficial` carrega. Ele particiona `5.2.2.1.1 DOTAÇÃO INICIAL`
 * em três ramos analíticos, e a partição é que decide — não a semelhança de nome:
 *
 *   · `5.2.2.1.1.01.00` CREDITO INICIAL            ← o crédito que a LOA fixa. É este.
 *   · `5.2.2.1.1.02.01` ANTECIPAÇÃO - LDO           (e `.02.09`, a anulação dela)
 *   · `5.2.2.1.1.99.00` DOTAÇÃO INICIAL - OUTRAS
 *
 * O movimento `DOTACAO_INICIAL` deste sistema é a LOA fixando a dotação — o crédito inicial. Os
 * outros dois ramos são fatos diferentes: antecipação pela LDO, e residual.
 */
export const CONTA_DOTACAO_INICIAL = "5.2.2.1.1.01.00";

/**
 * ⚠️ SINTÉTICA NO PLANO OFICIAL, E **NÃO SE ESCOLHE UMA FILHA AQUI**. Pendência
 * `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO`, e ela é estrutural, não de digitação.
 *
 * O PCASP particiona `5.2.2.1.2 DOTAÇÃO ADICIONAL` **POR TIPO DE CRÉDITO** — sete analíticas em
 * três ramos: `.01.00` SUPLEMENTAR; `.02.01/.02/.03` os ESPECIAIS; `.03.01/.02/.03` os
 * EXTRAORDINÁRIOS. O sistema **conhece** o tipo: `TipoCredito { SUPLEMENTAR, ESPECIAL,
 * EXTRAORDINARIO }` está no decreto do M03. Mas `RoteiroOrcamentario.tipo` é `@unique` por
 * `TipoMovimentoDotacao`, e `CREDITO_ADICIONAL` é **um** tipo de movimento: há lugar para um
 * roteiro só.
 *
 * Apontar esta constante para a suplementar faria todo crédito ESPECIAL e EXTRAORDINÁRIO ser
 * lançado como suplementar — e o erro sairia no balancete e na remessa, não aqui. Destravar exige
 * decisão de MODELO (roteiro por tipo de crédito), não a escolha de uma conta.
 */
export const CONTA_DOTACAO_ADICIONAL = "5.2.2.1.2.00.00";

/**
 * ⚠️ SINTÉTICA NO PLANO OFICIAL, E O NOME DIVERGE. Pendência `ROTEIRO-RESERVA-SEM-CONTA`.
 *
 * Este sistema chama `6.2.2.1.2.00.00` de "crédito reservado"; no PCASP ela é **CREDITO
 * INDISPONÍVEL**, e as suas analíticas são `.01.00` BLOQUEIO DE CREDITO, `.02.00` CREDITO
 * PRE-EMPENHADO e `.99.00` OUTRAS INDISPONIBILIDADES. Qual delas corresponde à RESERVA de dotação
 * deste sistema é decisão contábil do ente, com fundamento — não inferência por nome parecido.
 * Enquanto não houver, `RESERVA` e `RESERVA_LIBERADA` ficam sem roteiro, e o domínio recusa o
 * movimento, que é o estado correto para uma classificação que ninguém decidiu.
 */
export const CONTA_CREDITO_RESERVADO = "6.2.2.1.2.00.00";
export const CONTA_RECEITA_A_REALIZAR = "6.2.1.1.0.00.00";
export const CONTA_RECEITA_REALIZADA = "6.2.1.2.0.00.00";

// ── PATRIMONIAIS (inventário das fixtures — MAPA-ELEMENTO-CONTA) ─────────────

// ── CONTROLE DA DISPONIBILIDADE DE RECURSOS — a DDR (classes 7 e 8) ──────────
//
// ═══ ⚠️ O QUE A DDR RESPONDE, E POR QUE ELA NÃO É "MAIS UM CONTROLE" ═══
// O controle orçamentário (classe 6) responde "quanto do CRÉDITO já foi usado". A DDR
// responde outra coisa: "quanto DINHEIRO daquela fonte ainda está livre". São perguntas
// diferentes e podem divergir — há crédito disponível sem dinheiro (a receita não
// entrou) e dinheiro sem crédito (arrecadou-se além do previsto). É a DDR que impede
// empenhar contra dinheiro que não existe, e é ela que o RGF Anexo 5 publica.
//
// ═══ O PAR 7 × 8 ═══
// A classe 7 é o total sob controle; a 8 detalha o ESTADO em que ele está. Por isso só
// a arrecadação toca a 7 (é ela que traz dinheiro novo): D 7.2.1.1 / C 8.2.1.1.1. Dali
// em diante o dinheiro só muda de estado, dentro da 8:
//
//   arrecadação  D 7.2.1.1     / C 8.2.1.1.1     (entrou, e está disponível)
//   empenho      D 8.2.1.1.1   / C 8.2.1.1.2.01  (disponível → comprometido por empenho)
//   liquidação   D 8.2.1.1.2.01/ C 8.2.1.1.3.01  (→ comprometido por liquidação)
//   pagamento    D 8.2.1.1.3.01/ C 8.2.1.1.4.01  (→ utilizado: saiu)
//
// Cada crédito é o débito do seguinte — a mesma disciplina da cadeia orçamentária. E o
// saldo de cada fonte é `disponível − comprometida − utilizada` (ver `saldoDdrPorFonte`).
//
// ⚠️ A ANULAÇÃO NÃO TEM ROTEIRO PRÓPRIO: `gerarEstorno` inverte TODAS as pernas, então
// anular um empenho devolve a DDR ao disponível sozinho. Um roteiro de anulação seria a
// chance de ele divergir do fato que nega.

/**
 * Classe 7 — o par DEVEDOR. Só a arrecadação o move.
 *
 * ⚠️ SINTÉTICA NO PLANO OFICIAL, E **NÃO SE ESCOLHE UMA FILHA AQUI**. Pendência
 * `CONTROLE-DDR-POR-NATUREZA-DA-FONTE`. Medido em 2026-09-19 sobre banco de instalação
 * limpa: `roteiroArrecadacao` recusa, e portanto **não há arrecadação em instalação nova**
 * enquanto esta pendência viver.
 *
 * O PCASP particiona `7.2.1.1` pela NATUREZA DA FONTE, não pelo estado do dinheiro:
 * `.1.00.00` RECURSOS ORDINÁRIOS, `.2.00.00` RECURSOS VINCULADOS, `.3.00.00` RECURSOS
 * EXTRAORÇAMENTÁRIOS, `.4.00.00` RECURSOS PARA COMPENSAÇÃO FINANCEIRA, `.9.00.00` outros.
 * O sistema CONHECE a fonte de cada arrecadação — `saldoDdrPorFonte` agrupa por
 * `fonteId`/`fonteCodigo` —, mas o roteiro tem UMA perna fixa e não lê a fonte.
 *
 * Apontar esta constante para RECURSOS ORDINÁRIOS classificaria saúde, educação e FUNDEB
 * como ordinários, e o erro sairia no RGF Anexo 5 e na remessa, não aqui. Destravar exige
 * perna de roteiro RESOLVIDA PELA FONTE — decisão de modelo —, mais a correspondência
 * fonte → natureza, que é ato do ente. Não é escolha de conta.
 */
export const CONTA_CONTROLE_DDR = "7.2.1.1.0.00.00";

/**
 * ⚠️ REPONTADA EM 2026-09-19, DENTRO DO MESMO RAMO, E A MEDIÇÃO ESTÁ AQUI. Esta constante
 * apontava para `8.2.1.1.1.00.00`, que no PCASP oficial é **SINTÉTICA** — e sintética não
 * recebe partida (`INVARIANTE 5` do adapter). O efeito não aparecia porque os bancos de
 * trabalho nasciam clonados, com a `analitica` do plano MÍNIMO; em instalação limpa com o
 * plano oficial, `empenhar` recusa: "Conta sintética não recebe partida: 8.2.1.1.1.00.00".
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB, o mesmo arquivo de `seed:pcasp-oficial`. Ele
 * particiona `8.2.1.1.1 DISPONIBILIDADE POR DESTINAÇÃO DE RECURSOS` em três analíticas:
 *
 *   · `8.2.1.1.1.01.00` RECURSOS DISPONÍVEIS PARA O EXERCÍCIO   ← é esta.
 *   · `8.2.1.1.1.02.00` RECURSOS DE EXERCÍCIOS ANTERIORES
 *   · `8.2.1.1.1.99.00` OUTROS CONTROLES
 *
 * ⚠️ E NÃO É SEMELHANÇA DE NOME — são DUAS medidas que fecham a escolha:
 *
 * 1. **O circuito já está nas folhas.** As outras três pernas da DDR apontam para a
 *    analítica do seu ramo desde sempre — `.2.01.00` A LIQUIDAR, `.3.01.00` COMPROMETIDA
 *    POR LIQUIDAÇÃO, `.4.01.00` UTILIZADA COM EXECUÇÃO ORÇAMENTÁRIA (o M08 repete os três
 *    literalmente). Só a primeira perna parou no pai sintético.
 * 2. **Não existe ato que traga recurso de exercício anterior.** O único CRÉDITO a esta
 *    conta em todo o sistema é `roteiroArrecadacao` — medido: duas ocorrências da
 *    constante, o débito do empenho e este crédito. Abertura de exercício com superávit
 *    financeiro não está modelada; quando estiver, ela nasce com a sua própria perna em
 *    `.02.00`, e não reclassifica o que já foi arrecadado neste exercício.
 *
 * ⚠️ SALDO JÁ LANÇADO NÃO MIGRA SOZINHO. Em base que já operava com a conta antiga, mover
 * o acumulado é `repontarConta` (M01), que grava o lançamento e o registro `MigracaoDeConta`
 * explicando de onde, para onde e quanto. Pendência `DDR-DISPONIVEL-SALDO-A-REPONTAR`.
 */
export const CONTA_DDR_DISPONIVEL = "8.2.1.1.1.01.00";
export const CONTA_DDR_COMPROMETIDA_EMPENHO = "8.2.1.1.2.01.00";
export const CONTA_DDR_COMPROMETIDA_LIQUIDACAO = "8.2.1.1.3.01.00";
export const CONTA_DDR_UTILIZADA = "8.2.1.1.4.01.00";

/**
 * A obrigação com o fornecedor que a liquidação faz nascer e o pagamento extingue.
 *
 * ⚠️ REPONTADA EM 2026-09-19, E ELA ESTAVA TRIPLICADA FORA DAQUI. Este código vivia como
 * `const CONTA_FORNECEDORES` repetido em `lib/portas/liquidacao.ts`, `pagamento.ts` e
 * `execucao-do-contrato.ts`, apontando para `2.1.3.1.1.00.00` — o nó de CONSOLIDAÇÃO, que é
 * SINTÉTICO no PCASP oficial. Em instalação limpa a liquidação recusava no meio do percurso
 * da ponte contratual, depois de a medição e o recebimento já terem passado.
 *
 * **Fonte:** `Pcasp_2025.xlsx` do TCE-PB. O ramo `2.1.3.1.1` se desdobra em FORNECEDORES
 * NACIONAIS (`.01`), CONTAS A PAGAR CREDORES NACIONAIS (`.03`), precatórios (`.05` a `.08`)
 * e decisões judiciais (`.09`/`.10`); dentro de `.01`, em não parcelados (`.01.01`),
 * parcelados (`.01.02`), renegociação (`.01.03`) e demais (`.01.99`). A liquidação ordinária
 * de um contrato faz nascer obrigação com fornecedor NÃO PARCELADA — o parcelamento e a
 * renegociação são atos próprios, que o sistema não tem.
 *
 * ⚠️ E ISTO NÃO DEVERIA SER CONSTANTE. `roteiroLiquidacao` recebe `obrigacaoAPagar` por
 * PARÂMETRO justamente porque o credor pode não ser fornecedor (uma conta de energia é
 * `.03.01`). Hoje as três portas passam sempre a mesma conta, e a escolha do credor não
 * chega ao roteiro. Pendência `OBRIGACAO-A-PAGAR-POR-NATUREZA-DO-CREDOR`: enquanto ela
 * viver, toda liquidação nasce como obrigação com fornecedor.
 *
 * ⚠️ Saldo já lançado na conta antiga não migra sozinho — `repontarConta` do M01.
 * Pendência `FORNECEDORES-SALDO-A-REPONTAR`.
 */
export const CONTA_FORNECEDORES_A_PAGAR = "2.1.3.1.1.01.01";

/** Variação Patrimonial Diminutiva — a despesa incorrida que NÃO vira ativo. */
export const CONTA_VPD = "3.3.2.1.1.01.00";
/**
 * Almoxarifado — material de consumo entra como ATIVO, não como despesa.
 *
 * ⚠️ REPONTADA NO ENT05 (ITEM 3). Era `1.1.5.1.1.00.00`, que no PCASP oficial é
 * **MERCADORIAS PARA REVENDA OU DOAÇÃO** — estoque para ALIENAR ou DISTRIBUIR, não o
 * almoxarifado de consumo próprio. O saldo já lançado na conta antiga é movido pelo
 * `repontarConta`, com lançamento que explica a mudança; esta constante passa a apontar o
 * conceito certo daqui para a frente.
 */
export const CONTA_ESTOQUE = "1.1.5.6.1.01.00";
/**
 * Dívida fundada — o empenho do elemento 71 AMORTIZA passivo; não há VPD.
 *
 * ⚠️ REPONTADA NO ENT05 (ITEM 3). Era `2.2.1.1.1.00.00`, que no PCASP oficial é
 * **PESSOAL A PAGAR** — obrigação de folha. Empréstimo interno de longo prazo por
 * contrato é `2.2.2.1.1.02.98`.
 */
export const CONTA_DIVIDA_FUNDADA = "2.2.2.1.1.02.98";

/**
 * O ROL FECHADO DA PERNA DEVEDORA DA LIQUIDAÇÃO — e por que ele é fechado.
 *
 * ═══ A PERGUNTA QUE A LIQUIDAÇÃO FAZ ═══
 * "A despesa que acabou de ser incorrida virou o quê?" São três respostas possíveis,
 * e a natureza da despesa é quem decide:
 *   · serviço/pessoal → nada sobra: é VPD (a riqueza diminuiu).
 *   · material de consumo → vira ESTOQUE (a riqueza mudou de forma, não diminuiu).
 *   · amortização (elemento 71) → baixa o PASSIVO (a dívida encolheu).
 *
 * ⚠️ FECHADO E FAIL-CLOSED, e é isto que o torna útil. O rol cobre só os elementos
 * PROVADOS pelas fixtures (39, 30, 71). Os outros ~75 do Anexo II da Portaria
 * 163/2001 não têm regra aqui — e um `default: VPD` seria a pior escolha possível:
 * o empenho de equipamento (elemento 52) viraria despesa em vez de imobilizado, o
 * patrimônio nunca cresceria, e ninguém veria, porque o lançamento fecharia.
 * Melhor DERRUBAR nomeando o elemento e obrigar a decisão.
 *
 * Pendência: `MAPA-ELEMENTO-CONTA`. O xlsx PCASP Estendido fecha o rol.
 */
const CONTRAPARTIDA_DA_LIQUIDACAO: Readonly<Record<string, string>> = {
  "30": CONTA_ESTOQUE, // Material de Consumo
  "39": CONTA_VPD, // Outros Serviços de Terceiros — Pessoa Jurídica
  "71": CONTA_DIVIDA_FUNDADA, // Principal da Dívida Contratual Resgatado
};

/**
 * A NATUREZA DA OPERAÇÃO, pelo rol: este elemento liquida em ESTOQUE? (sessão noturna V4, §6)
 *
 * ⚠️ É a NATUREZA que decide se a liquidação é de material — não a existência de uma classe
 * de material cadastrada (a completude da parametrização é outra pergunta, e a ausência dela é
 * pendência IMPEDITIVA, não desligamento da integração). Não lança para elemento sem regra:
 * quem cobra o roteiro é `contrapartidaDaLiquidacao`; aqui a resposta é só "é estoque".
 */
export function elementoDebitaEstoque(codElemento: string): boolean {
  return CONTRAPARTIDA_DA_LIQUIDACAO[codElemento] === CONTA_ESTOQUE;
}

/** Os elementos com regra — para o teste de exaustividade e a mensagem de erro. */
export const ELEMENTOS_COM_ROTEIRO: readonly string[] = Object.keys(
  CONTRAPARTIDA_DA_LIQUIDACAO
);

/**
 * A conta que a liquidação DEBITA, decidida pelo elemento da natureza da despesa.
 * Lança nomeando o elemento quando não há regra — nunca chuta.
 */
export function contrapartidaDaLiquidacao(codElemento: string): string {
  const conta = CONTRAPARTIDA_DA_LIQUIDACAO[codElemento];
  if (conta === undefined) {
    throw new Error(
      `SEM ROTEIRO PARA O ELEMENTO ${codElemento}: a liquidação precisa saber em que ` +
        `a despesa incorrida se transformou (VPD? estoque? baixa de passivo?), e essa ` +
        `resposta é do PLANO DE CONTAS, não do sistema. Elementos com regra hoje: ` +
        `${ELEMENTOS_COM_ROTEIRO.join(", ")}. Um default aqui faria, por exemplo, um ` +
        `empenho de equipamento (52) virar despesa em vez de imobilizado — e o ` +
        `lançamento fecharia, então ninguém veria. Ver MAPA-ELEMENTO-CONTA no ` +
        `MODULO.md do M01.`
    );
  }
  return conta;
}

// ── OS ROTEIROS ──────────────────────────────────────────────────────────────

/**
 * EMPENHO — orçamentário + controle. Não há fato patrimonial: nada foi recebido ainda,
 * e a obrigação com o fornecedor só nasce na liquidação.
 *
 * ORÇAMENTÁRIO: D crédito disponível / C crédito empenhado a liquidar
 * CONTROLE:     D DDR disponível     / C DDR comprometida por empenho
 *
 * ⚠️ AS DUAS PERGUNTAS, NO MESMO ATO. O orçamentário diz "usei crédito"; o controle diz
 * "comprometi dinheiro daquela fonte". Empenhar sem a perna de controle deixaria o
 * mesmo dinheiro parecer livre para outro empenho — o crédito acabaria e o caixa,
 * duas vezes prometido, não.
 */
export function roteiroEmpenho(): RoteiroContabil {
  return [
    { conta: CONTA_CREDITO_DISPONIVEL, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    {
      conta: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    { conta: CONTA_DDR_DISPONIVEL, tipo: "DEBITO", subsistema: "CONTROLE" },
    {
      conta: CONTA_DDR_COMPROMETIDA_EMPENHO,
      tipo: "CREDITO",
      subsistema: "CONTROLE",
    },
  ];
}

/**
 * LIQUIDAÇÃO — o fato patrimonial nasce aqui: a despesa foi incorrida e a obrigação
 * existe.
 *
 * PATRIMONIAL:  D (VPD | estoque | passivo)      / C obrigação a pagar
 * ORÇAMENTÁRIO: D crédito empenhado a liquidar   / C crédito liquidado a pagar
 *
 * ⚠️ Pula o estágio `.02` (SEM-ESTAGIO-EM-LIQUIDACAO) — ele é facultativo no MCASP.
 *
 * `obrigacaoAPagar` vem do ATO (como a disponibilidade no pagamento): o credor pode
 * ser fornecedor, pessoal ou consignatário, e quem sabe qual é o chamador.
 */
export function roteiroLiquidacao(p: {
  readonly codElemento: string;
  readonly obrigacaoAPagar: string;
}): RoteiroContabil {
  return [
    {
      conta: contrapartidaDaLiquidacao(p.codElemento),
      tipo: "DEBITO",
      subsistema: "PATRIMONIAL",
    },
    { conta: p.obrigacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    {
      conta: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
      tipo: "DEBITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_CREDITO_LIQUIDADO_A_PAGAR,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    // CONTROLE: o dinheiro passa de "comprometido por empenho" a "comprometido por
    // liquidação" — a obrigação agora é exigível, e a fila do art. 141 começa a contar.
    {
      conta: CONTA_DDR_COMPROMETIDA_EMPENHO,
      tipo: "DEBITO",
      subsistema: "CONTROLE",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
      tipo: "CREDITO",
      subsistema: "CONTROLE",
    },
  ];
}

/**
 * LIQUIDAÇÃO DA FOLHA (M33, V6.1) — as MESMAS seis pernas, com o par PATRIMONIAL declarado.
 *
 * ⚠️ POR QUE ELA EXISTE, e por que não é `roteiroLiquidacao` com um elemento a mais no rol.
 * `contrapartidaDaLiquidacao` responde "a despesa incorrida virou o quê?" por ELEMENTO, e o rol
 * cobre 30, 39 e 71. O elemento 11 (vencimentos e vantagens fixas) não está lá, e a conta que o
 * rol chama de VPD é `3.3.2.1.1.01.00` — VPD de SERVIÇOS DE TERCEIROS. Acrescentar "11" apontando
 * para ela lançaria a remuneração dos servidores como serviço contratado, e o lançamento
 * FECHARIA: ΣD = ΣC em cada subsistema, e ninguém veria.
 *
 * ⚠️ E UM MAPA POR ELEMENTO NÃO RESOLVERIA NEM COM A CONTA CERTA: vencimento, 13º e férias
 * dividem o elemento e creditam contas de "pessoal a pagar" distintas no PCASP. O par certo é
 * decisão do ENTE, por grupo de empenho — e é de lá que ele vem (`GrupoDeEmpenhoDaFolha`),
 * fail-closed. Aqui só o ORÇAMENTÁRIO e o CONTROLE permanecem canônicos, porque esses NÃO variam:
 * a DDR tem de sair de "comprometida por empenho" para "comprometida por liquidação", ou o
 * pagamento debitaria um comprometido que nunca foi creditado.
 */
export function roteiroLiquidacaoDaFolha(p: {
  readonly variacaoDiminutiva: string;
  readonly obrigacaoAPagar: string;
}): RoteiroContabil {
  return [
    { conta: p.variacaoDiminutiva, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.obrigacaoAPagar, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    {
      conta: CONTA_CREDITO_EMPENHADO_A_LIQUIDAR,
      tipo: "DEBITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_CREDITO_LIQUIDADO_A_PAGAR,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_EMPENHO,
      tipo: "DEBITO",
      subsistema: "CONTROLE",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
      tipo: "CREDITO",
      subsistema: "CONTROLE",
    },
  ];
}

/**
 * PAGAMENTO — a obrigação é extinta e o dinheiro sai do caixa.
 *
 * PATRIMONIAL:  D obrigação a pagar          / C disponibilidade
 * ORÇAMENTÁRIO: D crédito liquidado a pagar  / C crédito liquidado pago
 *
 * CONTROLE:     D DDR comprometida por liq. / C DDR utilizada
 *
 * `disponibilidade` vem do ATO: é a conta bancária de onde o dinheiro saiu, e a TR
 * 5.23 já a amarra à fonte.
 *
 * ⚠️ COM RETENÇÃO, AS PERNAS DE CONTROLE FICAM NO **BRUTO** — e isso é uma decisão,
 * não um descuido. `comporPagamentoComRetencoes` (M07) dá o líquido a UMA perna só (a
 * do caixa, e ele recusa qualquer outra: "deduzir o orçamentário faria a retenção virar
 * desconto de despesa"). Então a DDR do pagamento retido registra que o dinheiro INTEIRO
 * saiu do comprometido, sem separar o que foi ao credor do que ficou retido.
 *
 * O espelho oficial (TCE-SC) refina isso com uma conta a mais — `8.2.1.1.3.02`
 * (comprometida por consignações): o retido creditaria `.3.02` em vez de `.4.01`, e o
 * pagamento da extra depois moveria `.3.02 → .4.01`. Implementar exigiria que a perna
 * de controle também se dividisse entre líquido e retido — ou seja, mudar
 * `comporPagamentoComRetencoes`, que é motor do M07 e não desta fatia.
 *
 * Pendência: **DDR-RETENCAO-CONSIGNACOES** (o espelho está no MODULO.md do M07).
 * Enquanto ela existir, a DDR utilizada inclui o retido — o que é conservador (o
 * dinheiro de fato saiu do comprometido) e nunca superestima o disponível.
 */
export function roteiroPagamento(p: {
  readonly obrigacaoAPagar: string;
  readonly disponibilidade: string;
}): RoteiroContabil {
  return [
    { conta: p.obrigacaoAPagar, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.disponibilidade, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    {
      conta: CONTA_CREDITO_LIQUIDADO_A_PAGAR,
      tipo: "DEBITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_CREDITO_LIQUIDADO_PAGO,
      tipo: "CREDITO",
      subsistema: "ORCAMENTARIO",
    },
    {
      conta: CONTA_DDR_COMPROMETIDA_LIQUIDACAO,
      tipo: "DEBITO",
      subsistema: "CONTROLE",
    },
    { conta: CONTA_DDR_UTILIZADA, tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}

/**
 * ARRECADAÇÃO — o dinheiro entra e a previsão baixa.
 *
 * PATRIMONIAL:  D disponibilidade      / C variação aumentativa
 * ORÇAMENTÁRIO: D receita a realizar   / C receita realizada
 *
 * ⚠️ A VPA VEM DO ATO, e não do rol. A contrapartida patrimonial da receita depende
 * da natureza dela (VPA de impostos, de transferências, de contribuições…) e, na
 * operação COMPOSTA, nem VPA é: `arrecadarComVinculo` (M04×M10) passa o CRÉDITO A
 * RECEBER, porque a VPA já nasceu no reconhecimento pelo fato gerador — repeti-la
 * aqui contaria a mesma receita duas vezes. Um rol fechado nesta perna quebraria
 * exatamente esse caso. Pendência irmã: `MAPA-NATUREZA-CONTA`.
 */
export function roteiroArrecadacao(p: {
  readonly disponibilidade: string;
  readonly variacaoAumentativa: string;
}): RoteiroContabil {
  return [
    { conta: p.disponibilidade, tipo: "DEBITO", subsistema: "PATRIMONIAL" },
    { conta: p.variacaoAumentativa, tipo: "CREDITO", subsistema: "PATRIMONIAL" },
    { conta: CONTA_RECEITA_A_REALIZAR, tipo: "DEBITO", subsistema: "ORCAMENTARIO" },
    { conta: CONTA_RECEITA_REALIZADA, tipo: "CREDITO", subsistema: "ORCAMENTARIO" },
    // ⚠️ A ÚNICA PERNA DE CLASSE 7 DO SISTEMA. É aqui que o dinheiro ENTRA sob controle:
    // a arrecadação é o único ato que traz recurso novo. Dali em diante ele só muda de
    // estado, dentro da classe 8 — por isso empenho, liquidação e pagamento são 8×8.
    { conta: CONTA_CONTROLE_DDR, tipo: "DEBITO", subsistema: "CONTROLE" },
    { conta: CONTA_DDR_DISPONIVEL, tipo: "CREDITO", subsistema: "CONTROLE" },
  ];
}
