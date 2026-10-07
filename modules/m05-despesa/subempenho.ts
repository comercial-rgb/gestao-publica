import { z } from "zod";
import { toMoney, zMoney } from "../../packages/contracts/index.js";
import { formatarMoeda } from "../../packages/contracts/moeda.js";
import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { exigirCompetenciaEmExercicioAberto, exigirExercicioDaFichaAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { travarFichas } from "./adapter-prisma.js";
import { quadroDoEmpenhoRepartido, rotuloDoSubempenho, type QuadroDoEmpenhoRepartido } from "./subempenho-saldo.js";

/**
 * V36 (TR 5.10.1.7) — O SUBEMPENHO SOBRE O EMPENHO GLOBAL OU ESTIMATIVO. Ver `prisma/schema/m05-subempenho.prisma`.
 *
 * ═══ O QUE ELE É ═══
 * Uma repartição do empenho: reserva parte do saldo a liquidar do empenho (o pai) para uma parcela. Não lança no razão
 * nem toca a ficha — o crédito empenhado já foi lançado no pai, e lançá-lo de novo duplicaria a despesa empenhada. A
 * liquidação que informa o subempenho é a liquidação do pai (o mesmo roteiro), abatida também do saldo do subempenho.
 *
 * ═══ AS REGRAS ═══
 *   - só sobre empenho GLOBAL ou ESTIMATIVO, original (não a linha de anulação) e não anulado;
 *   - "não permitindo que seja gerado um subempenho sobre um empenho global que já possua liquidação": o GLOBAL com
 *     liquidação feita direto nele (sem subempenho) não aceita subempenho. A liquidação de um subempenho não o impede,
 *     senão o segundo subempenho nunca existiria. O ESTIMATIVO não tem essa restrição;
 *   - o valor cabe no livre do empenho (empenhado − liquidado direto − repartido);
 *   - data no exercício aberto e não anterior ao empenho;
 *   - a anulação do subempenho devolve ao livre do empenho só o que ele ainda não liquidou.
 *
 * ═══ A TRAVA ═══
 * A da ficha do empenho — a mesma da liquidação e da anulação do empenho, que leem o mesmo quadro. Duas emissões
 * concorrentes, ou uma emissão e uma liquidação direta, se enfileiram e a segunda lê o que a primeira gravou.
 */

const zEmitirSubempenhoInput = z.object({
  empenhoId: z.string().min(1),
  valor: zMoney.refine((v) => v.greaterThan(0), { message: "O valor do subempenho tem de ser maior que zero." }),
  data: z.coerce.date(),
  historico: z.string().trim().min(5, "Descreva a parcela do subempenho (ao menos 5 caracteres)."),
  criadoPor: z.string().min(1),
});
export type EmitirSubempenhoInput = z.input<typeof zEmitirSubempenhoInput>;

const zAnularSubempenhoInput = z.object({
  subempenhoId: z.string().min(1),
  valor: zMoney.refine((v) => v.greaterThan(0), { message: "O valor da anulação tem de ser maior que zero." }),
  data: z.coerce.date(),
  motivo: z.string().trim().min(5, "Informe o motivo da anulação (ao menos 5 caracteres)."),
  criadoPor: z.string().min(1),
});
export type AnularSubempenhoInput = z.input<typeof zAnularSubempenhoInput>;

const reais = (v: { toFixed(n: number): string }): string => `R$ ${formatarMoeda(v.toFixed(2)).texto}`;

export async function emitirSubempenho(
  prisma: PrismaClient,
  input: EmitirSubempenhoInput
): Promise<{ readonly subempenhoId: string; readonly numero: number; readonly rotulo: string }> {
  const d = zEmitirSubempenhoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    // A autorização vem antes de ler o empenho: quem não empenha na unidade dele não fica sabendo o que ele é.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.emitirSubempenho, { empenho: d.empenhoId });
    const e = await tx.empenho.findUnique({
      where: { id: d.empenhoId },
      select: { numero: true, tipo: true, fichaId: true, data: true, estornoDeId: true, anulacaoParcialDeId: true, estornos: { select: { id: true } } },
    });
    if (e === null) throw new Error("Empenho não encontrado.");
    if (e.estornoDeId !== null || e.anulacaoParcialDeId !== null) throw new Error(`O documento ${e.numero} é uma anulação de empenho, não um empenho: não se subempenha. Nada foi gravado.`);
    if (e.tipo === "ORDINARIO") {
      throw new Error(`O empenho ${e.numero} é ORDINÁRIO: o subempenho reparte só o empenho GLOBAL ou o ESTIMATIVO. Nada foi gravado.`);
    }
    if (e.estornos.length > 0) throw new Error(`O empenho ${e.numero} está anulado: não se subempenha. Nada foi gravado.`);

    await travarFichas(tx, [e.fichaId]);
    await exigirExercicioDaFichaAberto(tx, e.fichaId, "subempenho");
    await exigirCompetenciaEmExercicioAberto(tx, d.data, "subempenho");
    if (diaCivil(d.data) < diaCivil(e.data)) {
      throw new Error(`A data do subempenho (${diaCivilBr(d.data)}) é anterior à do empenho ${e.numero} (${diaCivilBr(e.data)}). Nada foi gravado.`);
    }

    const q = await quadroDoEmpenhoRepartido(tx, d.empenhoId);
    if (e.tipo === "GLOBAL" && q.liquidadoDireto.greaterThan(0)) {
      throw new Error(
        `O empenho global ${e.numero} já tem liquidação de ${reais(q.liquidadoDireto)} feita direto nele: o empenho global que já possui ` +
          "liquidação não aceita subempenho. Continue liquidando o próprio empenho; se a liquidação está errada, estorne-a primeiro. Nada foi gravado."
      );
    }
    if (d.valor.greaterThan(q.livre)) {
      throw new Error(
        `O subempenho de ${reais(d.valor)} não cabe no saldo livre do empenho ${e.numero}: empenhado ${reais(q.empenhado)}, ` +
          `liquidado direto ${reais(q.liquidadoDireto)}, já repartido em subempenhos ${reais(q.repartido)}, livre ${reais(q.livre)}. Nada foi gravado.`
      );
    }
    const ultimo = q.subempenhos.reduce((m, s) => Math.max(m, s.numero), 0);
    const numero = ultimo + 1;
    const s = await tx.subempenho.create({
      data: { empenhoId: d.empenhoId, numero, valor: d.valor.toFixed(2), data: d.data, historico: d.historico, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { subempenhoId: s.id, numero, rotulo: rotuloDoSubempenho(e.numero, numero) };
  });
}

export async function anularSaldoDoSubempenho(prisma: PrismaClient, input: AnularSubempenhoInput): Promise<{ readonly anulacaoId: string; readonly saldo: string }> {
  const d = zAnularSubempenhoInput.parse(input);
  return prisma.$transaction(async (tx) => {
    const alvo = await tx.subempenho.findUnique({ where: { id: d.subempenhoId }, select: { empenhoId: true } });
    // Autoriza sobre o empenho do subempenho (ou sobre o ente, se ele não existe) antes de revelar qualquer coisa.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.anularSaldoDoSubempenho, alvo === null ? "ENTE" : { empenho: alvo.empenhoId });
    if (alvo === null) throw new Error("Subempenho não encontrado.");
    const e = await tx.empenho.findUniqueOrThrow({ where: { id: alvo.empenhoId }, select: { numero: true, fichaId: true } });

    await travarFichas(tx, [e.fichaId]);
    await exigirExercicioDaFichaAberto(tx, e.fichaId, "anulação de subempenho");
    await exigirCompetenciaEmExercicioAberto(tx, d.data, "anulação de subempenho");
    const q = await quadroDoEmpenhoRepartido(tx, alvo.empenhoId);
    const s = q.subempenhos.find((x) => x.id === d.subempenhoId);
    if (s === undefined) throw new Error("Subempenho não encontrado.");
    const rotulo = rotuloDoSubempenho(e.numero, s.numero);
    if (diaCivil(d.data) < diaCivil(s.data)) {
      throw new Error(`A data da anulação (${diaCivilBr(d.data)}) é anterior à do subempenho ${rotulo} (${diaCivilBr(s.data)}). Nada foi gravado.`);
    }
    if (d.valor.greaterThan(s.saldo)) {
      throw new Error(
        `A anulação de ${reais(d.valor)} passa do saldo não liquidado do subempenho ${rotulo}: valor ${reais(s.valor)}, ` +
          `já anulado ${reais(s.anulado)}, liquidado ${reais(s.liquidado)}, saldo ${reais(s.saldo)}. O que já foi liquidado se desfaz ` +
          "pela anulação da liquidação. Nada foi gravado."
      );
    }
    const a = await tx.anulacaoDeSubempenho.create({
      data: { subempenhoId: d.subempenhoId, valor: d.valor.toFixed(2), data: d.data, motivo: d.motivo, criadoPor: d.criadoPor },
      select: { id: true },
    });
    return { anulacaoId: a.id, saldo: toMoney(s.saldo.minus(d.valor)).toFixed(2) };
  });
}

/** O quadro do empenho com os subempenhos, para a tela. Leitura: quem chama já conferiu o acesso ao empenho. */
export async function lerSubempenhosDoEmpenho(prisma: PrismaClient, empenhoId: string): Promise<QuadroDoEmpenhoRepartido> {
  return prisma.$transaction((tx) => quadroDoEmpenhoRepartido(tx, empenhoId));
}
