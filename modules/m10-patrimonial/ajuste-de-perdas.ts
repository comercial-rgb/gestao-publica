import { z } from "zod";
import { serializar, toMoney, toPercentual, type Dinheiro, type Money } from "../../packages/contracts/index.js";
import { diaCivil, fimDoDiaCivil } from "../../packages/datas/index.js";
import { travar } from "../../packages/locks/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somasPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { roteiroPatrimonialVigente } from "../m01-core-contabil/roteiro-patrimonial-declarado.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { saldoDaDividaAtivaEm } from "./divida-ativa.js";

/**
 * V35 — O AJUSTE PARA PERDAS DA DÍVIDA ATIVA (MCASP 11ª ed., Parte III, 5.2.5). Ver `prisma/schema/m10-ajuste-de-perdas.prisma`.
 *
 * ═══ O QUE O MCASP MANDA, E O QUE ELE DEIXA AO ENTE ═══
 * Manda: a perda esperada vai a uma conta redutora do ativo contra VPD; é revista ao menos anualmente; se a nova
 * estimativa é maior, a diferença se lança como a constituição; se menor, reverte-se a diferença contra VPA.
 * Deixa ao ente: a METODOLOGIA ("este Manual não especifica"), que vai às notas explicativas. Por isso o percentual é
 * declarado (`declararPercentualDePerda`), versionado, com o texto da metodologia — e o código só aplica.
 *
 * ═══ A APURAÇÃO ═══
 *   saldo da dívida ativa da origem no corte (Σ `saldoDaDividaAtivaEm` — a soma do M10, não outra)
 *   ajuste esperado = percentual vigente do exercício do corte × saldo
 *   saldo anterior  = saldo credor da retificadora no razão até o corte (a conta creditada na CONSTITUIÇÃO)
 *   diferença       = esperado − anterior → > 0 constitui, < 0 reverte, = 0 registra a apuração sem lançar
 * A reversão tem de debitar a MESMA retificadora que a constituição credita: roteiros que divergem são recusados,
 * porque a diferença seria lançada numa conta e medida em outra.
 *
 * Fail-closed: sem percentual declarado para o exercício, sem roteiro declarado, ou com a competência travada
 * (o funil do razão), nada é gravado. Idempotência: uma apuração por origem e dia de corte (único no banco).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
export type OrigemDaDividaAtiva = "TRIBUTARIA" | "NAO_TRIBUTARIA";

const zOrigem = z.enum(["TRIBUTARIA", "NAO_TRIBUTARIA"]);

export const zDeclararPercentualDePerda = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  origem: zOrigem,
  percentual: z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,6})?$/, "Percentual com ponto decimal, ex.: 62.5")
    .refine((p) => Number(p) >= 0 && Number(p) <= 100, "O percentual vai de 0 a 100."),
  metodologia: z.string().trim().min(40, "Descreva a metodologia e as premissas: é o texto das notas explicativas."),
  criadoPor: z.string().min(1),
});

export async function declararPercentualDePerda(
  prisma: PrismaClient,
  input: z.input<typeof zDeclararPercentualDePerda>
): Promise<{ readonly versao: number }> {
  const d = zDeclararPercentualDePerda.parse(input);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararPercentualDePerda, "ENTE");
    const vigente = await tx.percentualDePerdaDaDividaAtiva.findFirst({
      where: { exercicio: d.exercicio, origem: d.origem },
      orderBy: { versao: "desc" },
      select: { versao: true },
    });
    const r = await tx.percentualDePerdaDaDividaAtiva.create({
      data: { exercicio: d.exercicio, origem: d.origem, percentual: toPercentual(d.percentual).toFixed(6), metodologia: d.metodologia, versao: (vigente?.versao ?? 0) + 1, criadoPor: d.criadoPor },
      select: { versao: true },
    });
    return { versao: r.versao };
  });
}

export const zApurarAjusteDePerdas = z.object({
  origem: zOrigem,
  /** O dia civil do corte, "AAAA-MM-DD". */
  corte: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de corte no formato AAAA-MM-DD."),
  criadoPor: z.string().min(1),
});

export interface ResultadoDaApuracao {
  readonly apuracaoId: string;
  readonly saldoDaDividaAtiva: Dinheiro;
  readonly percentual: string;
  readonly ajusteEsperado: Dinheiro;
  readonly saldoAnterior: Dinheiro;
  readonly diferenca: Dinheiro;
  readonly lancamentoId: string | null;
}

/** A soma do M10, por origem — o saldo de cada crédito, nunca uma segunda conta. */
async function saldoDaOrigem(tx: Tx, origem: OrigemDaDividaAtiva, corte: Date): Promise<Money> {
  let total = toMoney("0.00");
  for (const d of await tx.dividaAtiva.findMany({ where: { origem }, select: { id: true } })) {
    total = toMoney(total.plus(await saldoDaDividaAtivaEm(tx, d.id, corte)));
  }
  return total;
}

export async function apurarAjusteDePerdas(
  prisma: PrismaClient,
  input: z.input<typeof zApurarAjusteDePerdas>
): Promise<ResultadoDaApuracao> {
  const d = zApurarAjusteDePerdas.parse(input);
  const corte = fimDoDiaCivil(d.corte);
  const exercicio = Number(d.corte.slice(0, 4));
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.apurarAjusteDePerdas, "ENTE");

    // Pré-condições antes de qualquer escrita.
    const percentual = await tx.percentualDePerdaDaDividaAtiva.findFirst({
      where: { exercicio, origem: d.origem },
      orderBy: { versao: "desc" },
      select: { id: true, percentual: true },
    });
    if (percentual === null) {
      throw new Error(
        `Não há percentual de perda declarado para a dívida ativa ${d.origem === "TRIBUTARIA" ? "tributária" : "não tributária"} de ${String(exercicio)}. ` +
          `O MCASP deixa a metodologia ao ente: declare o percentual e a metodologia antes de apurar. Nada foi gravado.`
      );
    }
    const constituicao = await roteiroPatrimonialVigente(tx, "PERDAS_DIVIDA_ATIVA", `CONSTITUICAO/${d.origem}`);
    const reversao = await roteiroPatrimonialVigente(tx, "PERDAS_DIVIDA_ATIVA", `REVERSAO/${d.origem}`);
    if (constituicao === null || reversao === null) {
      throw new Error(
        `O roteiro do ajuste para perdas da dívida ativa ${d.origem === "TRIBUTARIA" ? "tributária" : "não tributária"} não está declarado ` +
          `(constituição e reversão). Declare-o em Contabilidade › Roteiros patrimoniais. Nada foi gravado.`
      );
    }
    if (constituicao.contaCredito.id !== reversao.contaDebito.id) {
      throw new Error(
        "A reversão do ajuste debita uma conta diferente da que a constituição credita: a diferença seria lançada numa conta e medida em outra. " +
          "Declare os dois movimentos na mesma retificadora. Nada foi gravado."
      );
    }
    const retificadora = await tx.contaPcasp.findUniqueOrThrow({ where: { id: constituicao.contaCredito.id }, select: { codigo: true } });
    const ja = await tx.apuracaoDoAjusteDePerdas.findUnique({ where: { origem_dataCorte: { origem: d.origem, dataCorte: corte } }, select: { id: true } });
    if (ja !== null) {
      throw new Error(`Já há apuração do ajuste para perdas desta origem com corte em ${d.corte.split("-").reverse().join("/")}. Nada foi gravado.`);
    }

    await travar(tx, "AjusteDePerdasDaDividaAtiva", [d.origem]);

    const saldo = await saldoDaOrigem(tx, d.origem, corte);
    const pct = toPercentual(percentual.percentual.toFixed(6));
    const esperado = toMoney(saldo.times(pct).dividedBy(100));
    const somas = await somasPorConta(tx, { codigos: [retificadora.codigo], ate: corte, campoData: "dataTransacao" });
    const s = somas[0];
    const anterior = s === undefined ? toMoney("0.00") : toMoney(s.credito.minus(s.debito));
    const diferenca = toMoney(esperado.minus(anterior));

    let lancamentoId: string | null = null;
    if (!diferenca.isZero()) {
      const r = diferenca.greaterThan(0) ? constituicao : reversao;
      const valor = toMoney(diferenca.abs()).toFixed(2);
      lancamentoId = await lancarNoRazao(tx, {
        numeroControle: `AJP-${d.origem}-${d.corte}`,
        dataTransacao: corte,
        historico: `${r.historicoPadrao} — ${diaCivil(corte).split("-").reverse().join("/")}: ${pct.toFixed(2)}% de ${saldo.toFixed(2)}`,
        origemTipo: "AJUSTE_PERDAS_DIVIDA_ATIVA",
        criadoPor: d.criadoPor,
        partidas: [
          { contaId: r.contaDebito.id, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor },
          { contaId: r.contaCredito.id, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor },
        ],
      });
    }
    const a = await tx.apuracaoDoAjusteDePerdas.create({
      data: {
        origem: d.origem, dataCorte: corte, saldoDaDividaAtiva: saldo.toFixed(2), percentualId: percentual.id,
        ajusteEsperado: esperado.toFixed(2), saldoAnterior: anterior.toFixed(2), diferenca: diferenca.toFixed(2), lancamentoId, criadoPor: d.criadoPor,
      },
      select: { id: true },
    });
    return {
      apuracaoId: a.id,
      saldoDaDividaAtiva: serializar(saldo),
      percentual: pct.toFixed(6),
      ajusteEsperado: serializar(esperado),
      saldoAnterior: serializar(anterior),
      diferenca: serializar(diferenca),
      lancamentoId,
    };
  });
}

export interface ApuracaoNaLista {
  readonly id: string;
  readonly origem: OrigemDaDividaAtiva;
  readonly corte: string;
  readonly saldoDaDividaAtiva: Dinheiro;
  readonly percentual: string;
  readonly metodologia: string;
  readonly ajusteEsperado: Dinheiro;
  readonly saldoAnterior: Dinheiro;
  readonly diferenca: Dinheiro;
  readonly lancou: boolean;
}

/** As apurações já feitas, a mais recente primeiro, com a metodologia que valeu em cada uma (para as notas). */
export async function apuracoesDoAjusteDePerdas(prisma: Tx): Promise<readonly ApuracaoNaLista[]> {
  const linhas = await prisma.apuracaoDoAjusteDePerdas.findMany({
    orderBy: [{ dataCorte: "desc" }, { origem: "asc" }],
    select: { id: true, origem: true, dataCorte: true, saldoDaDividaAtiva: true, ajusteEsperado: true, saldoAnterior: true, diferenca: true, lancamentoId: true, percentual: { select: { percentual: true, metodologia: true } } },
  });
  return linhas.map((l) => ({
    id: l.id,
    origem: l.origem,
    corte: diaCivil(l.dataCorte),
    saldoDaDividaAtiva: l.saldoDaDividaAtiva.toFixed(2),
    percentual: l.percentual.percentual.toFixed(6),
    metodologia: l.percentual.metodologia,
    ajusteEsperado: l.ajusteEsperado.toFixed(2),
    saldoAnterior: l.saldoAnterior.toFixed(2),
    diferenca: l.diferenca.toFixed(2),
    lancou: l.lancamentoId !== null,
  }));
}
