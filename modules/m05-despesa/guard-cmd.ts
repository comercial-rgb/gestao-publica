import { competenciaCivil, janelaCivilDeMeses } from "../../packages/datas/index.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { somaLiquidaEstornaveis } from "../../packages/estornaveis/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * O GUARD DA LIMITAÇÃO DE EMPENHO PELO CMD (TR 4.43) — o que dá DENTES ao art. 9º da LRF.
 *
 * ═══ O QUE ELE FAZ ═══
 * Quando o ente CONTINGENCIA (a receita frustrou), ele liga a limitação de empenho: nenhum
 * empenho de uma fonte pode passar da COTA daquela fonte no MÊS. O guard, por empenho:
 *
 *   cota vigente(fonte, mês) + Σ liberações(fonte, mês) − Σ empenhos líquidos(fonte, mês) >= valor
 *
 * Se não couber, REJEITA — nomeando os cinco números (fonte, mês, cota, liberado, consumido,
 * pedido), porque "estourou a cota" sem os números não diz ao ordenador o que cortar.
 *
 * ═══ ⚠️ OPT-IN, DEFAULT OFF — e é isso que preserva a regressão ═══
 * A limitação é um EVENTO por exercício (`EventoLimitacaoEmpenho`). SEM o evento ativo, o guard
 * RETORNA NA PRIMEIRA LINHA e o `empenhar` roda idêntico ao de sempre. Nenhuma fixture liga
 * isto — logo, os 779 testes não sentem o guard. Ligá-lo é um ATO do Executivo, e o t3 o prova.
 *
 * ═══ ⚠️ A CORRIDA (0(c)), E POR QUE O `travarFichas` NÃO A COBRE ═══
 * Dois empenhos de fichas DIFERENTES da MESMA fonte travam FICHAS diferentes — nunca se cruzam.
 * Cada um lê o consumido da fonte no mês no mesmo estado, e os DOIS passam, estourando a cota. O
 * lock aqui é sobre a COTA (posto 3, logo depois da ficha): os dois travam a MESMA linha de
 * cota, serializam, e só um passa. O t7 prova em 5 rodadas.
 *
 * ═══ ⚠️ O LÍQUIDO — a regressão da parcial (50783ae) herdada de GRAÇA ═══
 * O consumido é `somaLiquidaEstornaveis`: o mesmo motor do `empenhadoLiquidoPorContrato`. Um
 * empenho anulado DEVOLVE a cota (sai da soma); uma anulação PARCIAL devolve a parte. Não há
 * aritmética nova aqui — o guard herda o líquido que o resto do M05 já usa.
 */

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
>;

// ═══ V36 (TR 5.9.3.33) — A PERIODICIDADE DO CONTROLE ═══
// Mora aqui, e não no M02, porque é o guard quem a aplica, e o M05 não importa o M02 (o M02 importa o M05). O M02
// declara a periodicidade e lê o período por estas mesmas funções, para o relatório não ter uma segunda régua.

export const PERIODICIDADES_DAS_COTAS = ["MENSAL", "BIMESTRAL", "TRIMESTRAL", "SEMESTRAL"] as const;
export type PeriodicidadeDasCotas = (typeof PERIODICIDADES_DAS_COTAS)[number];
const MESES_DO_PERIODO: Readonly<Record<PeriodicidadeDasCotas, number>> = { MENSAL: 1, BIMESTRAL: 2, TRIMESTRAL: 3, SEMESTRAL: 6 };
export const ROTULO_DO_PERIODO: Readonly<Record<PeriodicidadeDasCotas, string>> = { MENSAL: "mês", BIMESTRAL: "bimestre", TRIMESTRAL: "trimestre", SEMESTRAL: "semestre" };

/** O período do ano civil que contém o mês: o primeiro mês e quantos meses tem. Bimestre 1 = jan–fev, e assim por diante. */
export function mesesDoPeriodo(periodicidade: PeriodicidadeDasCotas, mes: number): { readonly primeiro: number; readonly quantidade: number } {
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error(`Mês ${String(mes)} fora de 1 a 12.`);
  const n = MESES_DO_PERIODO[periodicidade];
  return { primeiro: Math.floor((mes - 1) / n) * n + 1, quantidade: n };
}

/** A periodicidade vigente no instante: o ato de maior `vigenteDesde` até ele (empate: o gravado por último). Sem ato, MENSAL. */
export async function periodicidadeVigente(tx: Pick<Tx, "periodicidadeDasCotasCmd">, exercicio: number, instante: Date): Promise<PeriodicidadeDasCotas> {
  const ato = await tx.periodicidadeDasCotasCmd.findFirst({
    where: { exercicio, vigenteDesde: { lte: instante } },
    orderBy: [{ vigenteDesde: "desc" }, { criadoEm: "desc" }, { id: "desc" }],
    select: { periodicidade: true },
  });
  const v = ato?.periodicidade;
  return v !== undefined && (PERIODICIDADES_DAS_COTAS as readonly string[]).includes(v) ? (v as PeriodicidadeDasCotas) : "MENSAL";
}

/**
 * A JANELA DO CONSUMIDO (antes `janelaDoMes`; desde a V36 é a do PERÍODO, por `janelaCivilDeMeses`), NO CALENDÁRIO DO ENTE.
 *
 * ⚠️ ERA `Date.UTC`, e a janela de junho ia de 31/05 às 21:00 a 30/06 às 20:59 civis. O
 * guard já classificava o empenho pelo mês CIVIL (`competenciaCivil`), mas somava o
 * consumido por esta janela: o empenho de 30/06 às 22:00 era cobrado contra a cota de
 * JULHO e não entrava na soma de junho nenhuma das duas vezes. As duas pontas do guard
 * precisam da mesma régua.
 */

/**
 * A limitação está LIGADA para este exercício? — a vigente é o `EventoLimitacaoEmpenho` de
 * `criadoEm` mais recente. Ausente = OFF.
 */
async function limitacaoAtiva(tx: Tx, exercicio: number): Promise<boolean> {
  const evento = await tx.eventoLimitacaoEmpenho.findFirst({
    where: { exercicio },
    orderBy: { criadoEm: "desc" },
    select: { ativo: true },
  });
  return evento?.ativo ?? false;
}

/**
 * EXIGE que o empenho caiba na cota do CMD (ou estoura). Roda DENTRO da transação do empenho,
 * DEPOIS de `travarFichas` (a ficha já está no posto 2; a cota é o posto 3).
 *
 * NO-OP quando a limitação está desligada — ver o cabeçalho.
 */
export async function exigirCotaCmd(
  tx: Tx,
  p: {
    readonly fichaId: string;
    readonly valor: Money;
    /** A data do FATO do empenho — dela saem o exercício e o mês. */
    readonly data: Date;
  }
): Promise<void> {
  // ── de qual FONTE e de qual EXERCÍCIO é este empenho? (a ficha carrega os dois) ──
  const ficha = await tx.fichaOrcamentaria.findUnique({
    where: { id: p.fichaId },
    // ⚠️ O CÓDIGO DA FONTE VEM JUNTO, e não só o id: as duas recusas deste guard são LIDAS POR
    // GENTE, e o percurso da V19 mostrou a mensagem dizendo "na fonte ac-fnt" — o id interno. Quem
    // opera conhece a fonte 500, não o identificador dela no banco.
    select: { fonteId: true, exercicio: true, fonte: { select: { codigo: true } } },
  });
  if (ficha === null) {
    throw new Error(`Ficha ${p.fichaId} não encontrada (guard do CMD).`);
  }

  // ── (1) A LIMITAÇÃO ESTÁ LIGADA? Se não, o guard é NO-OP. ──
  if (!(await limitacaoAtiva(tx, ficha.exercicio))) return;

  // ⚠️ O MÊS **CIVIL DO ENTE**, e não o de UTC. Um empenho de **30/06 às 22:00** no
  // horário de Brasília é `2026-07-01T01:00Z`: pelo mês UTC ele seria contado contra a
  // cota de JULHO, deixando a de junho com folga que não existe e estourando a de julho
  // com despesa que não é dela. Ver `packages/datas`.
  const mes = Number(competenciaCivil(p.data).slice(5, 7));

  // ── (2) A COTA VIGENTE de (fonte, mês) na data do empenho. ──
  // A vigente é a cota da VersaoCmd de maior `vigenteDesde` <= data, para aquela fonte/mês.
  const versaoVigente = await tx.versaoCmd.findFirst({
    where: { exercicio: ficha.exercicio, vigenteDesde: { lte: p.data } },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true },
  });
  const cota =
    versaoVigente === null
      ? null
      : await tx.cotaCmd.findFirst({
          where: { versaoId: versaoVigente.id, fonteId: ficha.fonteId, mes },
          select: { id: true, valor: true },
        });

  // ⚠️ COTA AUSENTE COM REGIME ATIVO = REJEITA. Fail-closed: se o ente ligou a limitação, uma
  // fonte sem cota programada NÃO empenha — programar zero é uma cota de valor 0, não a
  // ausência. Deixar passar seria abrir um buraco exatamente onde o contingenciamento aperta.
  if (cota === null) {
    throw new Error(
      `LIMITAÇÃO DE EMPENHO: a fonte ${ficha.fonte.codigo} NÃO tem cota de cronograma para o mês ` +
        `${mes}/${ficha.exercicio}, e a limitação está ATIVA. Com o regime ligado, empenhar numa ` +
        `fonte sem cota é proibido — programe a cota (valor 0 se for para bloquear de propósito) ` +
        `ou desative a limitação. Nada foi gravado.`
    );
  }

  // ── (2b) V36 (TR 5.9.3.33) — O PERÍODO DO CONTROLE: o mês, ou o bimestre/trimestre/semestre que o contém, pela
  // periodicidade vigente na data do empenho. Mensal (o padrão sem ato) reduz tudo abaixo ao comportamento de antes.
  const periodicidade = await periodicidadeVigente(tx, ficha.exercicio, p.data);
  const periodo = mesesDoPeriodo(periodicidade, mes);
  const meses = Array.from({ length: periodo.quantidade }, (_, i) => periodo.primeiro + i);
  const cotasDoPeriodo =
    versaoVigente === null
      ? []
      : await tx.cotaCmd.findMany({
          where: { versaoId: versaoVigente.id, fonteId: ficha.fonteId, mes: { in: meses } },
          select: { id: true, valor: true },
        });

  // ── (3) TRAVA AS COTAS DO PERÍODO (posto 3) — antes de somar o consumido. Ver a corrida no cabeçalho: com período,
  // dois empenhos em meses diferentes do MESMO período travam o mesmo conjunto e serializam. ──
  await travar(tx, "CotaCmd", cotasDoPeriodo.map((c) => c.id));

  // ── (4) O TETO = Σ cotas do período + Σ liberações do período (TR 4.44). ──
  const liberacoes = await tx.liberacaoProgramacao.findMany({
    where: { exercicio: ficha.exercicio, fonteId: ficha.fonteId, mes: { in: meses } },
    select: { valor: true },
  });
  const liberado = liberacoes.reduce(
    (acc, l) => toMoney(acc.plus(toMoney(l.valor.toFixed(2)))),
    toMoney("0.00")
  );
  const programado = cotasDoPeriodo.reduce((acc, c) => toMoney(acc.plus(toMoney(c.valor.toFixed(2)))), toMoney("0.00"));
  const teto = toMoney(programado.plus(liberado));

  // ── (5) O CONSUMIDO = Σ empenhos LÍQUIDOS da fonte no período (net de anulação e parcial). ──
  const { inicio, fim } = janelaCivilDeMeses(ficha.exercicio, periodo.primeiro, periodo.quantidade);
  const empenhos = await tx.empenho.findMany({
    where: {
      ficha: { fonteId: ficha.fonteId },
      data: { gte: inicio, lte: fim },
    },
    select: { id: true, valor: true, estornoDeId: true, anulacaoParcialDeId: true },
  });
  const consumido = somaLiquidaEstornaveis(
    empenhos.map((e) => ({
      id: e.id,
      valor: toMoney(e.valor.toFixed(2)),
      estornoDeId: e.estornoDeId,
      anulacaoParcialDeId: e.anulacaoParcialDeId,
    }))
  );

  // ── (6) CABE? ──
  const disponivel = toMoney(teto.minus(consumido));
  if (p.valor.greaterThan(disponivel)) {
    const mensal = periodicidade === "MENSAL";
    const onde = mensal
      ? `mês ${mes}/${ficha.exercicio}`
      : `${ROTULO_DO_PERIODO[periodicidade]} de ${String(meses[0])}/${ficha.exercicio} a ${String(meses.at(-1))}/${ficha.exercicio} (controle ${periodicidade.toLowerCase()})`;
    throw new Error(
      `LIMITAÇÃO DE EMPENHO ESTOURADA na fonte ${ficha.fonte.codigo}, ${onde}:\n` +
        `  cota programada .......... ${programado.toFixed(2)}\n` +
        `  liberado ....... ${liberado.toFixed(2)}\n` +
        `  teto do ${mensal ? "mês" : "período"} .............. ${teto.toFixed(2)}\n` +
        `  já empenhado (líquido) ... ${consumido.toFixed(2)}\n` +
        `  disponível ............... ${disponivel.toFixed(2)}\n` +
        `  pedido ................... ${p.valor.toFixed(2)}\n` +
        `A cota do ${mensal ? "mês NÃO ROLA para o mês seguinte" : "período NÃO ROLA para o período seguinte"} — realocar exige LIBERAÇÃO ou uma ` +
        `VERSÃO NOVA do cronograma. Nada foi gravado.`
    );
  }
}
