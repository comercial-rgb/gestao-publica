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

/**
 * A janela [início, fim] de um mês (1-12) de um exercício, NO CALENDÁRIO DO ENTE.
 *
 * ⚠️ ERA `Date.UTC`, e a janela de junho ia de 31/05 às 21:00 a 30/06 às 20:59 civis. O
 * guard já classificava o empenho pelo mês CIVIL (`competenciaCivil`), mas somava o
 * consumido por esta janela: o empenho de 30/06 às 22:00 era cobrado contra a cota de
 * JULHO e não entrava na soma de junho nenhuma das duas vezes. As duas pontas do guard
 * precisam da mesma régua.
 */
function janelaDoMes(exercicio: number, mes: number): { inicio: Date; fim: Date } {
  return janelaCivilDeMeses(exercicio, mes, 1);
}

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
    select: { fonteId: true, exercicio: true },
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
      `LIMITAÇÃO DE EMPENHO (TR 4.43): a fonte ${ficha.fonteId} NÃO tem cota de CMD para o mês ` +
        `${mes}/${ficha.exercicio}, e a limitação está ATIVA. Com o regime ligado, empenhar numa ` +
        `fonte sem cota é proibido — programe a cota (valor 0 se for para bloquear de propósito) ` +
        `ou desative a limitação. Nada foi gravado.`
    );
  }

  // ── (3) TRAVA A COTA (posto 3) — antes de somar o consumido. Ver a corrida no cabeçalho. ──
  await travar(tx, "CotaCmd", [cota.id]);

  // ── (4) O TETO = cota + Σ liberações (TR 4.44). ──
  const liberacoes = await tx.liberacaoProgramacao.findMany({
    where: { exercicio: ficha.exercicio, fonteId: ficha.fonteId, mes },
    select: { valor: true },
  });
  const liberado = liberacoes.reduce(
    (acc, l) => toMoney(acc.plus(toMoney(l.valor.toFixed(2)))),
    toMoney("0.00")
  );
  const teto = toMoney(toMoney(cota.valor.toFixed(2)).plus(liberado));

  // ── (5) O CONSUMIDO = Σ empenhos LÍQUIDOS da fonte no mês (net de anulação e parcial). ──
  const { inicio, fim } = janelaDoMes(ficha.exercicio, mes);
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
    throw new Error(
      `LIMITAÇÃO DE EMPENHO ESTOURADA (TR 4.43) na fonte ${ficha.fonteId}, mês ` +
        `${mes}/${ficha.exercicio}:\n` +
        `  cota programada .......... ${toMoney(cota.valor.toFixed(2)).toFixed(2)}\n` +
        `  liberado (TR 4.44) ....... ${liberado.toFixed(2)}\n` +
        `  teto do mês .............. ${teto.toFixed(2)}\n` +
        `  já empenhado (líquido) ... ${consumido.toFixed(2)}\n` +
        `  disponível ............... ${disponivel.toFixed(2)}\n` +
        `  pedido ................... ${p.valor.toFixed(2)}\n` +
        `A cota do CMD NÃO ROLA para o mês seguinte — realocar exige LIBERAÇÃO (TR 4.44) ou uma ` +
        `VERSÃO NOVA do cronograma. Nada foi gravado.`
    );
  }
}
