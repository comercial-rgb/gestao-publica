import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  conferirAtoDeclarado,
  zAtoDeclarado,
  type AncoradouroDoAto,
} from "../m01-core-contabil/ato-declarado.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ V11 V9 — ATRIBUIR A ENTIDADE TITULAR A UMA ARRECADAÇÃO DO LEGADO ═══
 *
 * Uma guia anterior ao carimbo (ou vinda de um caminho que ainda não declara entidade) não diz
 * de quem é o dinheiro que entrou. O fato não se corrige com `UPDATE`: alguém ATRIBUI, por ato
 * próprio, com motivo, autor e o ato do ente que fundamenta.
 *
 * ⚠️ ESPELHO DE `atribuirContaAArrecadacao` (M09), e de propósito — mesma forma, mesma
 * disciplina: pré-condições antes de gravar, UMA atribuição por guia (`@unique`), concorrência
 * recusada nomeando o que aconteceu.
 *
 * ⚠️ MAS A AÇÃO É OUTRA, e isso foi decidido e não herdado. `ATRIBUIR_CONTA_A_ARRECADACAO` diz
 * EM QUE CONTA o dinheiro entrou — erra, e a conciliação não fecha, e alguém percebe.
 * `ATRIBUIR_ENTIDADE_A_ARRECADACAO` diz DE QUEM ele é — erra, e o caixa da autarquia vira caixa
 * da prefeitura numa consulta que ninguém confere contra extrato nenhum. Por isso a v27 NÃO
 * deriva uma da outra.
 *
 * ⚠️ E ELA NÃO INVENTA NADA POR CONVENIÊNCIA. Não há rateio, não há "o órgão da despesa", não há
 * "tributo é da direta". Sem ato que fundamente, a guia continua NÃO ATRIBUÍDA — e continuar não
 * atribuída é um estado honesto, que a consulta mostra em linha própria.
 */

export const zAtribuirEntidadeInput = zAtoDeclarado.extend({
  receitaArrecadadaId: z.string().min(1),
  entidadeId: z.string().min(1),
  motivo: z.string().trim().min(5, "O motivo precisa de ao menos 5 caracteres."),
  criadoPor: z.string().min(1),
});
export type AtribuirEntidadeInput = z.input<typeof zAtribuirEntidadeInput>;

export async function atribuirEntidadeAArrecadacao(
  prisma: PrismaClient,
  input: AtribuirEntidadeInput,
  agora: Date
): Promise<{ readonly atribuicaoId: string }> {
  const d = zAtribuirEntidadeInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // A arrecadação é do ENTE (art. 167, IV): a atribuição também. Mesmo escopo do espelho.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.atribuirEntidadeAArrecadacao, "ENTE");

    const guia = await tx.receitaArrecadada.findUnique({
      where: { id: d.receitaArrecadadaId },
      select: {
        id: true,
        numeroReceita: true,
        tipo: true,
        entidadeTitularId: true,
        contaBancariaId: true,
        estornos: { select: { id: true } },
        atribuicaoDeEntidade: {
          select: { id: true, entidade: { select: { codigo: true } } },
        },
      },
    });

    // ⚠️ TODAS AS PRÉ-CONDIÇÕES ANTES DE QUALQUER ESCRITA. Gravar primeiro e conferir depois é o
    // que deixa um registro impossível de processar para sempre — a regra já custou um defeito.
    if (guia === null) {
      throw new Error(`Arrecadação ${d.receitaArrecadadaId} não existe. Nada foi gravado.`);
    }
    if (guia.tipo !== "ARRECADACAO") {
      throw new Error(
        `A guia ${guia.numeroReceita} é uma ${guia.tipo}: a entidade titular de uma anulação é a ` +
          `da guia que ela desfaz, e ela é HERDADA, não atribuída. Corrija a guia original. ` +
          `Nada foi gravado.`
      );
    }
    if (guia.estornos.length > 0) {
      throw new Error(
        `A guia ${guia.numeroReceita} está ANULADA: não há entrada a atribuir. Nada foi gravado.`
      );
    }
    if (guia.entidadeTitularId !== null) {
      throw new Error(
        `A guia ${guia.numeroReceita} já declara a entidade titular; ela não é legado. Trocar a ` +
          `titularidade de um fato já carimbado exigiria reescrever o fato. Nada foi gravado.`
      );
    }
    if (guia.atribuicaoDeEntidade !== null) {
      throw new Error(
        `A guia ${guia.numeroReceita} já foi atribuída à entidade ` +
          `${guia.atribuicaoDeEntidade.entidade.codigo}. Nada foi gravado.`
      );
    }

    const entidade = await tx.entidadeContabil.findUnique({
      where: { id: d.entidadeId },
      select: {
        id: true,
        codigo: true,
        versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true, cnpj: true } },
      },
    });
    const vigente = entidade?.versoes[0];
    if (entidade === null || entidade === undefined || vigente === undefined) {
      throw new Error(`A entidade ${d.entidadeId} não existe. Nada foi gravado.`);
    }

    /**
     * ⚠️ A DIVERGÊNCIA CONTRA A CONTA, E ELA RECUSA NOMEANDO OS DOIS LADOS. Se a guia declara uma
     * conta bancária cujo titular VIGENTE é outra entidade, atribuir uma terceira faria a mesma
     * base afirmar duas coisas sobre o mesmo dinheiro. Não é o sistema escolhendo por ninguém: é
     * o sistema recusando escrever a contradição, e dizendo qual é.
     *
     * A guia SEM conta não cai aqui — é o legado puro, e é exatamente para ela que este ato existe.
     */
    if (guia.contaBancariaId !== null) {
      const declaracao = await tx.declaracaoDeTitularDaConta.findFirst({
        where: { contaBancariaId: guia.contaBancariaId },
        orderBy: { versao: "desc" },
        select: { entidadeId: true, entidade: { select: { codigo: true } } },
      });
      if (declaracao !== null && declaracao.entidadeId !== d.entidadeId) {
        throw new Error(
          `DIVERGÊNCIA DE TITULARIDADE: a guia ${guia.numeroReceita} entrou numa conta cujo ` +
            `titular declarado é a entidade ${declaracao.entidade.codigo}, e você está ` +
            `atribuindo a guia à entidade ${entidade.codigo}. Uma das duas afirmações está ` +
            `errada. Se o titular da conta mudou, declare a mudança na conta antes; se a guia ` +
            `é mesmo de outra entidade, corrija a conta da guia primeiro. Nada foi gravado.`
        );
      }
    }

    const ancoradouros: readonly AncoradouroDoAto[] = [
      { rotulo: `o nome da entidade ("${vigente.nome}")`, termos: [vigente.nome] },
      ...(vigente.cnpj !== null
        ? [{ rotulo: `o CNPJ dela (${vigente.cnpj})`, termos: [vigente.cnpj] }]
        : []),
    ];
    conferirAtoDeclarado(
      {
        atoTipo: d.atoTipo,
        atoNumero: d.atoNumero,
        atoAno: d.atoAno,
        atoDispositivo: d.atoDispositivo,
        atoCitacao: d.atoCitacao,
      },
      { hoje: agora, ancoradouros }
    );

    try {
      const a = await tx.atribuicaoDeEntidadeDaArrecadacao.create({
        data: {
          receitaArrecadadaId: guia.id,
          entidadeId: entidade.id,
          motivo: d.motivo,
          atoTipo: d.atoTipo,
          atoNumero: d.atoNumero,
          atoAno: d.atoAno,
          atoDispositivo: d.atoDispositivo,
          atoCitacao: d.atoCitacao,
          criadoPor: d.criadoPor,
        },
        select: { id: true },
      });
      return { atribuicaoId: a.id };
    } catch (erro) {
      if (erro instanceof Error && /Unique constraint/iu.test(erro.message)) {
        throw new Error(
          `CONCORRÊNCIA: a guia ${guia.numeroReceita} acabou de receber outra atribuição de ` +
            `entidade. Recarregue a lista. Nada foi gravado.`
        );
      }
      throw erro;
    }
  });
}
