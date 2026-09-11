import { serializar, toMoney, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { arrecadadoPorNaturezaFonte } from "../m04-receita/consultas.js";
import { origemDaNatureza, parsearNaturezaReceita } from "../m04-receita/natureza.js";
import { ingressosOperacaoCreditoPorTipo } from "../m10-patrimonial/consultas.js";
import { rclAjustadaDoQuadrimestre } from "./rcl-ajustada.js";
import type { Quadrimestre } from "./rgf-anexo1.js";
import { janelaCivilDeMeses, janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * RGF — ANEXO 4: OPERAÇÕES DE CRÉDITO. LRF art. 55, I, "d".
 *
 * ═══ O QUE ESTE ANEXO DECIDE ═══
 * As operações de crédito realizadas no ano não podem passar de 16% da RCL ajustada (Res. Senado
 * 43/2001), com alerta em 90% do limite (14,4%). A ARO (antecipação de receita) tem limite próprio,
 * 7% da RCL. Estourar impede o ente de contratar dívida nova.
 *
 * ═══ AS DUAS COLUNAS — No Quadrimestre × Até o Quadrimestre ═══
 * "No Quadrimestre" é o fluxo DENTRO do quadrimestre; "Até o Quadrimestre" é o acumulado do ano até
 * o fim dele. É o mesmo par (b)/(c) do RREO Anexo 1, e o mesmo leitor por janela de datas (a
 * doutrina do campoData: um recorte, uma aritmética). O limite é medido sobre o ACUMULADO (Até).
 *
 * ═══ ⚠️ O QUE MEDE, E DE ONDE (Passo 0.2) ═══
 * O demonstrativo mede a RECEITA de operação de crédito (origem 21 do M04) — é o que foi
 * realizado. A classificação Internas × Externas sai da ESPÉCIE da natureza (3º dígito: 2.1.1
 * internas, 2.1.2 externas). O sub-split Mobiliária × Contratual das internas NÃO está na natureza
 * (é atributo do instrumento de dívida) — vem dos ingressos do M10 por tipo.
 *
 * ⚠️ A AMARRAÇÃO (R3): o vínculo 4.64 é implementado — o composto `arrecadarIngressoOperacaoCredito`
 * grava a receita (M04) e o ingresso (M10) na MESMA transação, e o guard de entrada lateral força
 * a op. de crédito de verdade a passar por ele. Então internas-receita == Σ ingressos M10
 * (mobiliária + contratual): dois subsistemas, um fato. Quando divergirem (receita de op. crédito
 * sem dívida cadastrada), a linha `AMARRACAO-OPCRED` avisa — não se inventa o split.
 *
 * ═══ VEDADAS / DEDUZIDAS / ARO / art. 29 §1º — parâmetros nomeados (Passo 0.3) ═══
 * Não há entidade para operação vedada, operação deduzida do limite, ARO nem assunção/confissão de
 * dívida (o `TipoMovimentoDivida` não tem esses fatos). Saem zerados e nomeados — a estrutura fica
 * pronta, o número não é inventado.
 *
 * ═══ RCL: MOTOR ÚNICO (regra Siconfi) ═══ — a RCL ajustada é a MESMA do RREO Anexo 3 (R2).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Res. Senado 43/2001: 16% da RCL; alerta em 90% = 14,4%. ARO: 7%. */
const LIMITE_SENADO = toMoney("16.00");
const LIMITE_ALERTA = toMoney("14.40");
const LIMITE_ARO = toMoney("7.00");

const ZERO = toMoney("0.00");

/** Um valor nos dois recortes: dentro do quadrimestre e acumulado até ele. */
export interface ParPeriodo {
  readonly noQuadrimestre: Dinheiro;
  readonly ateQuadrimestre: Dinheiro;
}

export interface LinhaAnexo4 {
  readonly chave: string;
  readonly rotulo: string;
  readonly nivel: "grupo" | "item" | "subitem" | "total";
  /** `true` quando é interruptor vazio nomeado (sem fato no sistema). */
  readonly interruptor: boolean;
  readonly valores: ParPeriodo;
}

export interface Anexo4Rgf {
  readonly exercicio: number;
  readonly quadrimestre: Quadrimestre;
  /** (I) operações de crédito, (II) vedadas, (III) deduzidas — com sub-linhas. */
  readonly linhas: readonly LinhaAnexo4[];
  /** TOTAL SUJEITO AO LIMITE = (I + II − III). */
  readonly totalSujeitoAoLimite: ParPeriodo;
  readonly rcl: Dinheiro;
  readonly emendasIndividuais: Dinheiro;
  readonly rclAjustada: Dinheiro;
  /** (total sujeito, ACUMULADO) / RCL ajustada × 100. `null` quando a RCL ajustada é zero. */
  readonly percentSobreRcl: string | null;
  readonly excedeuLimite: boolean | null;
  readonly emAlerta: boolean | null;
  readonly limiteSenado: string;
  readonly limiteAlerta: string;
  /** ARO — limite próprio (7% da RCL); o valor é interruptor (sem cadastro). */
  readonly aro: { readonly limitePercent: string; readonly valores: ParPeriodo; readonly excedeuLimite: boolean | null };
  /** Quadro "Outras Operações que Integram a DC" (art. 29 §1º) — parâmetros nomeados. */
  readonly outrasOperacoes: readonly LinhaAnexo4[];
  readonly notas: readonly string[];
}

const par = (no: Money, ate: Money): ParPeriodo => ({ noQuadrimestre: serializar(no), ateQuadrimestre: serializar(ate) });

function linha(chave: string, rotulo: string, nivel: LinhaAnexo4["nivel"], no: Money, ate: Money, interruptor = false): LinhaAnexo4 {
  return { chave, rotulo, nivel, interruptor, valores: par(no, ate) };
}

/** As janelas do quadrimestre. Receita usa `gte`; a dívida usa `gt` (daí o −1ms no início). */
function janelas(exercicio: number, quadrimestre: Quadrimestre): {
  readonly inicioExercicio: Date;
  readonly inicioQuadrimestre: Date;
  readonly fimQuadrimestre: Date;
} {
  const inicioExercicio = janelaCivilDoAno(exercicio).inicio;
  const q = janelaCivilDeMeses(exercicio, (quadrimestre - 1) * 4 + 1, 4);
  const inicioQuadrimestre = q.inicio;
  const fimQuadrimestre = q.fim;
  return { inicioExercicio, inicioQuadrimestre, fimQuadrimestre };
}

/** Σ da receita de operação de crédito (origem 21) na janela, separada por espécie interna/externa. */
async function receitaOpCredito(prisma: Tx, p: { desde: Date; ate: Date }): Promise<{ internas: Money; externas: Money }> {
  const rows = await arrecadadoPorNaturezaFonte(prisma, { desde: p.desde, ate: p.ate });
  let internas = ZERO;
  let externas = ZERO;
  for (const r of rows) {
    if (origemDaNatureza(r.naturezaCodigo) !== "OPERACOES_DE_CREDITO") continue;
    // Espécie (3º dígito): "1" = internas, "2" = externas. Fora disso, trata como interna
    // (o censo só tem 2.1.1); nunca some no lugar errado silenciosamente — a nota AMARRACAO avisa.
    const especie = parsearNaturezaReceita(r.naturezaCodigo).especie;
    if (especie === "2") externas = toMoney(externas.plus(r.arrecadado));
    else internas = toMoney(internas.plus(r.arrecadado));
  }
  return { internas, externas };
}

export async function rgfAnexo4(
  prisma: Tx,
  p: { readonly exercicio: number; readonly quadrimestre: Quadrimestre }
): Promise<Anexo4Rgf> {
  const j = janelas(p.exercicio, p.quadrimestre);
  const notas: string[] = [];

  // ── (I) OPERAÇÕES DE CRÉDITO — pela RECEITA (o que o demonstrativo mede) ──
  const recNo = await receitaOpCredito(prisma, { desde: j.inicioQuadrimestre, ate: j.fimQuadrimestre });
  const recAte = await receitaOpCredito(prisma, { desde: j.inicioExercicio, ate: j.fimQuadrimestre });

  // ── O sub-split MOBILIÁRIA × CONTRATUAL das internas — pelos ingressos do M10 (mesma janela) ──
  // A janela da dívida é `gt`, então recua 1ms para incluir o instante inicial.
  const movNo = await ingressosOperacaoCreditoPorTipo(prisma, { desde: new Date(j.inicioQuadrimestre.getTime() - 1), ate: j.fimQuadrimestre });
  const movAte = await ingressosOperacaoCreditoPorTipo(prisma, { desde: new Date(j.inicioExercicio.getTime() - 1), ate: j.fimQuadrimestre });

  // ⚠️ A AMARRAÇÃO (R3): internas-receita deve bater com a soma dos ingressos por tipo. Quando não
  // bate, há op. de crédito sem dívida cadastrada — a nota avisa, e o split fica com o que o M10 tem.
  if (!recAte.internas.equals(movAte.total)) {
    notas.push(
      `AMARRACAO-OPCRED: a receita de operações de crédito internas (${recAte.internas.toFixed(2)}) ` +
        `não bate com os ingressos de dívida cadastrada (${movAte.total.toFixed(2)}). Há operação de ` +
        `crédito realizada sem dívida vinculada (composto 4.64 não usado) — o split Mobiliária/` +
        `Contratual reflete só o que o M10 conhece.`
    );
  }

  const opCredito: LinhaAnexo4[] = [
    linha("OP_CREDITO", "OPERAÇÕES DE CRÉDITO (I)", "grupo", toMoney(recNo.internas.plus(recNo.externas)), toMoney(recAte.internas.plus(recAte.externas))),
    linha("OP_INTERNAS", "Internas", "item", recNo.internas, recAte.internas),
    linha("OP_INTERNAS_MOBILIARIA", "Mobiliária", "subitem", movNo.mobiliaria, movAte.mobiliaria),
    linha("OP_INTERNAS_CONTRATUAL", "Contratual", "subitem", movNo.contratual, movAte.contratual),
    linha("OP_EXTERNAS", "Externas", "item", recNo.externas, recAte.externas),
  ];

  // ── (II) VEDADAS e (III) DEDUZIDAS — parâmetros nomeados (Passo 0.3) ──
  const vedadas = linha("OP_VEDADAS", "OPERAÇÕES DE CRÉDITO VEDADAS (II)", "grupo", ZERO, ZERO, true);
  const deduzidas = linha("OP_DEDUZIDAS", "(−) OPERAÇÕES DEDUZIDAS DO LIMITE (III)", "grupo", ZERO, ZERO, true);
  notas.push(
    "VEDADAS-DEDUZIDAS-SEM-CADASTRO: não há entidade para operação de crédito vedada (art. 37) nem " +
      "para operação deduzida do limite (art. 7º §3º, refinanciamento etc.) — as linhas (II) e (III) " +
      "saem zeradas e nomeadas."
  );

  const linhas = [...opCredito, vedadas, deduzidas];

  // TOTAL SUJEITO AO LIMITE = I + II − III (nos dois recortes).
  const iNo = toMoney(recNo.internas.plus(recNo.externas));
  const iAte = toMoney(recAte.internas.plus(recAte.externas));
  const totalNo = toMoney(iNo.plus(ZERO).minus(ZERO)); // + vedadas − deduzidas (ambas zero)
  const totalAte = toMoney(iAte.plus(ZERO).minus(ZERO));

  // ── RCL AJUSTADA: motor único (R2). O limite mede o ACUMULADO (Até). ──
  const { rcl, emendasIndividuais, rclAjustada } = await rclAjustadaDoQuadrimestre(prisma, { exercicio: p.exercicio, quadrimestre: p.quadrimestre });
  notas.push(
    "RCL: motor único (regra Siconfi) — a RCL ajustada é a MESMA do RREO Anexo 3 do período."
  );

  const temRcl = rclAjustada.greaterThan(0);
  const percent = temRcl ? toMoney(totalAte.times(100).div(rclAjustada)) : null;
  if (!temRcl) {
    notas.push("SEM-RCL-NO-CORTE: a RCL ajustada é zero — o percentual e os limites não se aplicam.");
  }

  // ── ARO — limite próprio de 7% (interruptor: sem entidade de ARO, mesma chave do Anexo 2) ──
  notas.push(
    "ARO-CADASTRO: não há entidade de antecipação de receita orçamentária — a linha da ARO sai " +
      "zerada e nomeada (mesma pendência do quadro informativo do RGF Anexo 2). Limite próprio: 7% da RCL."
  );

  // ── QUADRO art. 29 §1º — Outras Operações que Integram a DC (parâmetros nomeados) ──
  const outrasOperacoes: LinhaAnexo4[] = [
    linha("ASSUNCAO", "Assunção de Dívidas (art. 29 §1º)", "item", ZERO, ZERO, true),
    linha("RECONHECIMENTO", "Reconhecimento de Dívidas (art. 29 §1º)", "item", ZERO, ZERO, true),
    linha("CONFISSAO", "Confissão de Dívidas (art. 29 §1º)", "item", ZERO, ZERO, true),
  ];
  notas.push(
    "ART-29-§1º-SEM-CADASTRO: assunção, reconhecimento e confissão de dívidas não têm fato próprio " +
      "no M10 (o `TipoMovimentoDivida` só conhece ingresso, atualização e amortização) — o quadro " +
      "sai zerado e nomeado. Estas operações integram a DC mas NÃO se sujeitam ao limite de contratação."
  );

  return {
    exercicio: p.exercicio,
    quadrimestre: p.quadrimestre,
    linhas,
    totalSujeitoAoLimite: par(totalNo, totalAte),
    rcl: serializar(rcl),
    emendasIndividuais: serializar(emendasIndividuais),
    rclAjustada: serializar(rclAjustada),
    percentSobreRcl: percent === null ? null : percent.toFixed(2),
    excedeuLimite: percent === null ? null : percent.greaterThan(LIMITE_SENADO),
    emAlerta: percent === null ? null : percent.greaterThanOrEqualTo(LIMITE_ALERTA) && percent.lessThanOrEqualTo(LIMITE_SENADO),
    limiteSenado: LIMITE_SENADO.toFixed(2),
    limiteAlerta: LIMITE_ALERTA.toFixed(2),
    aro: { limitePercent: LIMITE_ARO.toFixed(2), valores: par(ZERO, ZERO), excedeuLimite: temRcl ? false : null },
    outrasOperacoes,
    notas,
  };
}
