import { z } from "zod";
import { serializar, toMoney, type Dinheiro } from "../../packages/contracts/index.js";
import { fimDoDiaCivil } from "../../packages/datas/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { somasPorConta } from "../m01-core-contabil/adapter-prisma.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * V35 — A BAIXA DO ADIANTAMENTO DA 1ª PARCELA DO 13º (MCASP 11ª ed., Parte II, 18.1).
 *
 * ═══ O ROTEIRO DO MANUAL ═══
 *   1ª parcela, liquidação ....... D 1.1.3.1.1 Adiantamentos concedidos - 13º (P) / C 13º a pagar (F)
 *   2ª parcela, folha bruta ...... D 13º a pagar (P) / C 13º a pagar (F)
 *   baixa do adiantamento ........ D 13º a pagar (F) / C 1.1.3.1.1 Adiantamentos concedidos - 13º (P)
 *
 * Aqui a folha do 13º empenha e liquida o bruto MENOS o abatimento (`parcelasDoCalculo`): a 1ª parcela já foi
 * empenhada no adiantamento, e empenhá-la de novo a contaria duas vezes. O efeito líquido do manual é o mesmo com
 * UM lançamento a mais, que este serviço faz: D a conta que a liquidação do 13º debita / C o adiantamento concedido,
 * pelo total abatido. Com a apropriação mensal (B5), a conta debitada é o 13º apropriado (P), que assim fecha no
 * bruto; sem ela, é a VPD do 13º, que assim reconhece também a 1ª parcela.
 *
 * NENHUMA CONTA NO CÓDIGO: as duas são as que os grupos de empenho já declaram — a debitada pelo grupo da rubrica do
 * 13º e a debitada pelo grupo da rubrica do adiantamento. A segunda tem de ser do ramo 1.1.3.1 (adiantamentos
 * concedidos): liquidada contra outra conta, a 1ª parcela já é despesa e não há adiantamento a baixar.
 *
 * Fail-closed: folha do 13º não fechada, sem abatimento, grupos ausentes ou ambíguos, adiantamento fora do ramo, ou
 * saldo do adiantamento menor que o abatido (a 1ª parcela não foi liquidada) recusam sem gravar. Um por exercício.
 */

export const RAMO_DO_ADIANTAMENTO_CONCEDIDO = "1.1.3.1.";

export const zBaixarAdiantamentoDoDecimoTerceiro = z.object({
  exercicio: z.number().int().min(2000).max(2100),
  /** O dia civil da baixa, "AAAA-MM-DD", no exercício. */
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD."),
  criadoPor: z.string().min(1),
});

export async function baixarAdiantamentoDoDecimoTerceiro(
  prisma: PrismaClient,
  input: z.input<typeof zBaixarAdiantamentoDoDecimoTerceiro>
): Promise<{ readonly total: Dinheiro; readonly lancamentoId: string }> {
  const d = zBaixarAdiantamentoDoDecimoTerceiro.parse(input);
  if (Number(d.data.slice(0, 4)) !== d.exercicio) throw new Error(`A baixa do adiantamento de ${String(d.exercicio)} tem de ser datada no próprio exercício. Nada foi gravado.`);
  const quando = fimDoDiaCivil(d.data);
  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.baixarAdiantamentoDoDecimoTerceiro, "ENTE");
    if ((await tx.baixaDoAdiantamentoDoDecimoTerceiro.findUnique({ where: { exercicio: d.exercicio }, select: { id: true } })) !== null) {
      throw new Error(`O adiantamento do 13º de ${String(d.exercicio)} já foi baixado. Nada foi gravado.`);
    }
    const folha = await tx.folhaDePagamento.findFirst({ where: { exercicio: d.exercicio, tipo: "DECIMO_TERCEIRO" }, select: { fechamento: { select: { calculoId: true } } } });
    if (folha?.fechamento == null) throw new Error(`A folha do 13º de ${String(d.exercicio)} não está fechada: o abatimento só é fato depois dela. Nada foi gravado.`);
    const linhas = await tx.linhaDoContracheque.findMany({
      where: { contracheque: { calculoId: folha.fechamento.calculoId }, tipo: "DESCONTO", rubrica: { natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13" } },
      select: { valor: true },
    });
    const total = linhas.reduce((a, l) => toMoney(a.plus(toMoney(l.valor))), toMoney("0.00"));
    if (total.isZero()) throw new Error(`A folha do 13º de ${String(d.exercicio)} não abateu adiantamento nenhum: não há o que baixar. Nada foi gravado.`);

    const parametros = await tx.parametroDoDecimoTerceiro.findMany({ where: { exercicio: d.exercicio }, select: { rubricaDoDecimoTerceiroId: true, rubricaDoAdiantamentoId: true } });
    const contaDebitadaPelosGrupos = async (rubricas: readonly string[], papel: string) => {
      const grupos = await tx.grupoDeEmpenhoDaFolha.findMany({
        where: { rubricas: { some: { rubricaId: { in: [...new Set(rubricas)] } } } },
        select: { codigo: true, contaVariacao: { select: { id: true, codigo: true } } },
      });
      const semConta = grupos.filter((g) => g.contaVariacao === null).map((g) => g.codigo);
      if (semConta.length > 0) {
        throw new Error(`O grupo de empenho ${semConta.join(", ")} (rubrica ${papel}) não declara a conta debitada na liquidação: a baixa não tem conta. Nada foi gravado.`);
      }
      const contas = [...new Map(grupos.flatMap((g) => (g.contaVariacao === null ? [] : [[g.contaVariacao.id, g.contaVariacao] as const]))).values()];
      if (contas.length !== 1) {
        throw new Error(
          contas.length === 0
            ? `A rubrica ${papel} de ${String(d.exercicio)} não está em grupo de empenho: não há conta declarada para a baixa. Nada foi gravado.`
            : `Os grupos da rubrica ${papel} (${grupos.map((g) => g.codigo).join(", ")}) declaram contas diferentes: a baixa não sabe qual usar. Nada foi gravado.`
        );
      }
      return contas[0]!;
    };
    const debito = await contaDebitadaPelosGrupos(parametros.map((p) => p.rubricaDoDecimoTerceiroId), "do 13º");
    const adiantamento = await contaDebitadaPelosGrupos(parametros.map((p) => p.rubricaDoAdiantamentoId), "do adiantamento");
    if (!adiantamento.codigo.startsWith(RAMO_DO_ADIANTAMENTO_CONCEDIDO)) {
      throw new Error(
        `A 1ª parcela do 13º é liquidada contra ${adiantamento.codigo}, que não é adiantamento concedido (${RAMO_DO_ADIANTAMENTO_CONCEDIDO}x). ` +
          "O MCASP (Parte II, 18.1) manda liquidá-la contra o adiantamento, e baixá-lo quando a 2ª parcela abate; liquidada contra outra conta, " +
          "ela já é despesa e não há adiantamento a baixar. Corrija a conta do grupo do adiantamento. Nada foi gravado."
      );
    }
    const s = (await somasPorConta(tx, { codigos: [adiantamento.codigo], ate: quando, campoData: "dataTransacao" }))[0];
    const saldo = s === undefined ? toMoney("0.00") : toMoney(s.debito.minus(s.credito));
    if (saldo.lt(total)) {
      throw new Error(
        `O adiantamento concedido ${adiantamento.codigo} tem saldo de ${saldo.toFixed(2)} em ${d.data.split("-").reverse().join("/")}, menor que o abatido ` +
          `na folha do 13º (${total.toFixed(2)}): a 1ª parcela não foi liquidada contra ele por inteiro. Nada foi gravado.`
      );
    }
    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `BX-ADI13-${String(d.exercicio)}`,
      dataTransacao: quando,
      historico: `Baixa do adiantamento da 1ª parcela do 13º salário de ${String(d.exercicio)}, abatida na folha do 13º`,
      origemTipo: "BAIXA_DO_ADIANTAMENTO_DO_13",
      criadoPor: d.criadoPor,
      partidas: [
        { contaId: debito.id, tipo: "DEBITO", subsistema: "PATRIMONIAL", valor: total.toFixed(2) },
        { contaId: adiantamento.id, tipo: "CREDITO", subsistema: "PATRIMONIAL", valor: total.toFixed(2) },
      ],
    });
    await tx.baixaDoAdiantamentoDoDecimoTerceiro.create({ data: { exercicio: d.exercicio, total: total.toFixed(2), lancamentoId, criadoPor: d.criadoPor } });
    return { total: serializar(total), lancamentoId };
  });
}
