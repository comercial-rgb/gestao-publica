import { janelaCivilDoAno } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { atribuirEntidadeAoMovimentoExtra } from "../../modules/m07-extraorcamentario/atribuicao-de-entidade";
import type { AtoDoFormulario } from "./entidades-contabeis";

/**
 * V34 — A FILA DOS MOVIMENTOS EXTRAORÇAMENTÁRIOS QUE NÃO DIZEM DE QUEM SÃO.
 *
 * São os ingressos avulsos e os recolhimentos gravados numa conta SEM titular declarado, e sem atribuição. A retenção
 * (pela unidade do empenho) e o estorno (pelo movimento que desfaz) não entram: o vínculo deles já existe. Com várias
 * unidades gestoras, o SAGRES omite estes movimentos e os nomeia; aqui está o que regulariza cada um.
 */
export interface MovimentoSemTitularNaTela {
  readonly id: string;
  readonly tipo: "INGRESSO" | "DISPENDIO";
  readonly data: Date;
  readonly valor: string;
  readonly contaCodigo: string;
  readonly credor: string;
  readonly historico: string;
}

export async function lerMovimentosSemTitular(p: { readonly exercicio: number }): Promise<readonly MovimentoSemTitularNaTela[]> {
  const movs = await cliente().movimentoExtraorcamentario.findMany({
    where: {
      tipo: { in: ["INGRESSO", "DISPENDIO"] },
      pagamentoId: null,
      atribuicaoDeEntidade: null,
      contaBancaria: { declaracoesDeTitular: { none: {} } },
      data: { gte: janelaCivilDoAno(p.exercicio).inicio, lte: janelaCivilDoAno(p.exercicio).fim },
    },
    orderBy: [{ data: "asc" }, { criadoEm: "asc" }],
    select: { id: true, tipo: true, data: true, valor: true, credorConsignatario: true, historico: true, contaBancaria: { select: { codigo: true } } },
  });
  return movs.map((m) => ({
    id: m.id,
    tipo: m.tipo as "INGRESSO" | "DISPENDIO",
    data: m.data,
    valor: m.valor.toFixed(2),
    contaCodigo: m.contaBancaria.codigo,
    credor: m.credorConsignatario,
    historico: m.historico,
  }));
}

/** ATRIBUIR a entidade a um movimento sem titular — escrita autenticada, ato conferido no domínio. */
export async function atribuirEntidadeAoMovimento(input: {
  readonly movimentoId: string;
  readonly entidadeId: string;
  readonly motivo: string;
  readonly ato: AtoDoFormulario;
}): Promise<string> {
  return comEscritaAutenticada("ATRIBUIR_ENTIDADE_A_ARRECADACAO", async (criadoPor) => {
    const r = await atribuirEntidadeAoMovimentoExtra(cliente(), { movimentoId: input.movimentoId, entidadeId: input.entidadeId, motivo: input.motivo, ...input.ato, criadoPor }, new Date());
    return r.atribuicaoId;
  });
}
