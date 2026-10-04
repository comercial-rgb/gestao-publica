import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { conferirAtoDeclarado, zAtoDeclarado, type AncoradouroDoAto } from "../m01-core-contabil/ato-declarado.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * ═══ V34 — ATRIBUIR A ENTIDADE A UM MOVIMENTO EXTRAORÇAMENTÁRIO QUE NADA DIZ ═══
 *
 * De quem é um movimento extraorçamentário sai de vínculo comprovado, nesta ordem (`ugDoMovimentoExtra`, no
 * adaptador do SAGRES):
 *   · a RETENÇÃO (ingresso nascido num pagamento) é da unidade orçamentária do empenho que reteve;
 *   · o ESTORNO é de quem é o movimento que ele desfaz;
 *   · o ingresso AVULSO e o RECOLHIMENTO são do titular declarado da conta em que o dinheiro passou.
 * Este ato serve só ao último caso, e só quando a conta não tem titular declarado: aí o movimento não diz de quem é,
 * e o SAGRES de um ente com várias UGs o nomeia como omitido. Alguém ATRIBUI, por ato próprio, com motivo, autor e o
 * ato do ente que fundamenta. Espelho de `atribuirEntidadeAArrecadacao` (M04), sob a MESMA ação: dizer de quem é o
 * dinheiro que entrou ou saiu é o mesmo poder, e um crachá à parte inventaria uma segregação que o ente não tem.
 *
 * ⚠️ NADA SE ATRIBUI POR CIMA DE UM VÍNCULO QUE JÁ EXISTE. Retenção e estorno são recusados nomeando de onde a unidade
 * deles vem; o movimento numa conta COM titular declarado também — trocar o titular é declarar na conta, e a
 * atribuição avulsa faria a mesma base afirmar duas coisas sobre o mesmo dinheiro.
 */

export const zAtribuirEntidadeAoMovimentoExtraInput = zAtoDeclarado.extend({
  movimentoId: z.string().min(1),
  entidadeId: z.string().min(1),
  motivo: z.string().trim().min(5, "O motivo precisa de ao menos 5 caracteres."),
  criadoPor: z.string().min(1),
});
export type AtribuirEntidadeAoMovimentoExtraInput = z.input<typeof zAtribuirEntidadeAoMovimentoExtraInput>;

export async function atribuirEntidadeAoMovimentoExtra(
  prisma: PrismaClient,
  input: AtribuirEntidadeAoMovimentoExtraInput,
  agora: Date
): Promise<{ readonly atribuicaoId: string }> {
  const d = zAtribuirEntidadeAoMovimentoExtraInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.atribuirEntidadeAoMovimentoExtra, "ENTE");

    const m = await tx.movimentoExtraorcamentario.findUnique({
      where: { id: d.movimentoId },
      select: {
        id: true,
        tipo: true,
        valor: true,
        pagamentoId: true,
        contaBancaria: { select: { codigo: true, declaracoesDeTitular: { select: { id: true }, take: 1 } } },
        atribuicaoDeEntidade: { select: { entidade: { select: { codigo: true } } } },
      },
    });

    // ⚠️ TODAS AS PRÉ-CONDIÇÕES ANTES DE QUALQUER ESCRITA.
    if (m === null) throw new Error(`Movimento extraorçamentário ${d.movimentoId} não existe. Nada foi gravado.`);
    if (m.tipo === "ESTORNO_INGRESSO" || m.tipo === "ESTORNO_DISPENDIO") {
      throw new Error("Este movimento é um ESTORNO: a entidade dele é a do movimento que ele desfaz, HERDADA e não atribuída. Regularize o movimento original. Nada foi gravado.");
    }
    if (m.pagamentoId !== null) {
      throw new Error("Este ingresso é uma RETENÇÃO: a unidade dele é a da unidade orçamentária do empenho que reteve. Se ela não tem unidade gestora, declare o vínculo em Contabilidade › Unidades gestoras. Nada foi gravado.");
    }
    if (m.atribuicaoDeEntidade !== null) {
      throw new Error(`Este movimento já foi atribuído à entidade ${m.atribuicaoDeEntidade.entidade.codigo}. Nada foi gravado.`);
    }
    if (m.contaBancaria.declaracoesDeTitular.length > 0) {
      throw new Error(
        `O movimento passou pela conta ${m.contaBancaria.codigo}, que tem titular declarado: a entidade dele é a do titular. ` +
          `Se o titular está errado, declare a mudança na conta. Nada foi gravado.`
      );
    }

    const entidade = await tx.entidadeContabil.findUnique({
      where: { id: d.entidadeId },
      select: { id: true, codigo: true, versoes: { orderBy: { versao: "desc" }, take: 1, select: { nome: true, cnpj: true } } },
    });
    const vigente = entidade?.versoes[0];
    if (entidade === null || entidade === undefined || vigente === undefined) {
      throw new Error(`A entidade ${d.entidadeId} não existe. Nada foi gravado.`);
    }

    const ancoradouros: readonly AncoradouroDoAto[] = [
      { rotulo: `o nome da entidade ("${vigente.nome}")`, termos: [vigente.nome] },
      ...(vigente.cnpj !== null ? [{ rotulo: `o CNPJ dela (${vigente.cnpj})`, termos: [vigente.cnpj] }] : []),
    ];
    conferirAtoDeclarado(
      { atoTipo: d.atoTipo, atoNumero: d.atoNumero, atoAno: d.atoAno, atoDispositivo: d.atoDispositivo, atoCitacao: d.atoCitacao },
      { hoje: agora, ancoradouros }
    );

    try {
      const a = await tx.atribuicaoDeEntidadeDoMovimentoExtra.create({
        data: {
          movimentoId: m.id,
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
        throw new Error("CONCORRÊNCIA: este movimento acabou de receber outra atribuição de entidade. Recarregue a lista. Nada foi gravado.");
      }
      throw erro;
    }
  });
}
