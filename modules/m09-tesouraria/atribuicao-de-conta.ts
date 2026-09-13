import { z } from "zod";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";

/**
 * ═══ V6 P1.2 — ATRIBUIR A CONTA BANCÁRIA A UMA ARRECADAÇÃO DO LEGADO ═══
 *
 * Uma guia anterior à obrigatoriedade da conta (ou importada) não diz em que conta entrou. O
 * razão não se corrige com UPDATE: o tesoureiro ATRIBUI a conta por um ato próprio, com motivo
 * e autor, e o serviço só aceita quando a escrituração da guia de fato DEBITOU a conta contábil
 * daquela conta bancária — senão a atribuição "fecharia" o lado interno contra um razão que não
 * a tem, e a conciliação continuaria sem sair.
 *
 * Controles: guia existe e é ARRECADACAO (não anulação); não anulada; sem conta declarada nem
 * atribuída; conta bancária com conta contábil mapeada; fonte igual; a perna de disponibilidade
 * do lançamento da guia é a conta contábil da conta. UMA atribuição por guia (@unique): duas
 * concorrentes → a segunda cai na constraint e é recusada nomeando.
 */

export const zAtribuirContaInput = z.object({
  receitaArrecadadaId: z.string().min(1),
  contaBancariaId: z.string().min(1),
  motivo: z.string().trim().min(5, "motivo com ao menos 5 caracteres"),
  criadoPor: z.string().min(1),
});
export type AtribuirContaInput = z.input<typeof zAtribuirContaInput>;

export async function atribuirContaAArrecadacao(
  prisma: PrismaClient,
  input: AtribuirContaInput
): Promise<{ readonly atribuicaoId: string }> {
  const d = zAtribuirContaInput.parse(input);
  return prisma.$transaction(async (tx) => {
    // A arrecadação é do ENTE (art. 167, IV): a atribuição também.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.atribuirContaAArrecadacao, "ENTE");

    const guia = await tx.receitaArrecadada.findUnique({
      where: { id: d.receitaArrecadadaId },
      select: {
        id: true, numeroReceita: true, tipo: true, contaBancariaId: true, fonteId: true,
        fonte: { select: { codigo: true } },
        estornos: { select: { id: true } },
        atribuicaoDeConta: { select: { id: true, contaBancaria: { select: { codigo: true } } } },
        lancamento: { select: { partidas: { where: { tipo: "DEBITO", subsistema: "PATRIMONIAL" }, select: { contaId: true, conta: { select: { codigo: true } } } } } },
      },
    });
    if (guia === null) throw new Error(`Arrecadação ${d.receitaArrecadadaId} não existe. Nada foi gravado.`);
    if (guia.tipo !== "ARRECADACAO") throw new Error(`A guia ${guia.numeroReceita} é uma ${guia.tipo}: só a arrecadação recebe conta. Nada foi gravado.`);
    if (guia.estornos.length > 0) throw new Error(`A guia ${guia.numeroReceita} está ANULADA: não há entrada a atribuir. Nada foi gravado.`);
    if (guia.contaBancariaId !== null) throw new Error(`A guia ${guia.numeroReceita} já declara a conta bancária em que entrou; não é legado. Nada foi gravado.`);
    if (guia.atribuicaoDeConta !== null) {
      throw new Error(`A guia ${guia.numeroReceita} já foi atribuída à conta ${guia.atribuicaoDeConta.contaBancaria.codigo}. Nada foi gravado.`);
    }

    const conta = await tx.contaBancaria.findUnique({
      where: { id: d.contaBancariaId },
      select: { id: true, codigo: true, fonteId: true, fonte: { select: { codigo: true } }, contaContabilId: true, contaContabil: { select: { codigo: true } } },
    });
    if (conta === null) throw new Error(`Conta bancária ${d.contaBancariaId} não cadastrada. Nada foi gravado.`);
    if (conta.contaContabilId === null || conta.contaContabil === null) {
      throw new Error(`A conta bancária ${conta.codigo} não tem conta contábil mapeada; parametrize antes de atribuir. Nada foi gravado.`);
    }
    if (conta.fonteId !== guia.fonteId) {
      throw new Error(`A guia ${guia.numeroReceita} é da fonte ${guia.fonte.codigo} e a conta ${conta.codigo} é da fonte ${conta.fonte.codigo}. Nada foi gravado.`);
    }
    const debitada = guia.lancamento.partidas[0];
    if (debitada === undefined || debitada.contaId !== conta.contaContabilId) {
      throw new Error(
        `ESCRITURAÇÃO NÃO CONFERE: a guia ${guia.numeroReceita} debitou ${debitada?.conta.codigo ?? "nenhuma conta de disponibilidade"} no razão, ` +
          `e a conta ${conta.codigo} é a contábil ${conta.contaContabil.codigo}. Atribuí-la não fecharia a conciliação — o dinheiro, no razão, entrou em outra conta. ` +
          `Se a escrituração está errada, corrija-a por lançamento próprio antes. Nada foi gravado.`
      );
    }

    try {
      const a = await tx.atribuicaoDeContaDaArrecadacao.create({
        data: { receitaArrecadadaId: guia.id, contaBancariaId: conta.id, motivo: d.motivo, criadoPor: d.criadoPor },
        select: { id: true },
      });
      return { atribuicaoId: a.id };
    } catch (e) {
      if (e instanceof Error && /Unique constraint/i.test(e.message)) {
        throw new Error(`CONCORRÊNCIA: a guia ${guia.numeroReceita} acabou de receber outra atribuição. Recarregue a conciliação. Nada foi gravado.`);
      }
      throw e;
    }
  });
}
