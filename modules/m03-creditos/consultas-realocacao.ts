import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney } from "../../packages/contracts/index.js";
import type { EspecieDeRealocacao, TipoPernaDeRealocacao } from "./realocacao.js";

/**
 * A LEITURA dos atos de realocação de um exercício, com as pernas ORIGINAIS de cada um.
 *
 * ⚠️ AS PERNAS DE ESTORNO NÃO APARECEM COMO LINHAS PRÓPRIAS: o ato anulado mostra a anulação (data,
 * motivo, autor) e as mesmas pernas que teve. Listar as invertidas ao lado faria um ato de dois
 * movimentos parecer um de quatro. O efeito delas está no QDD e no razão, onde é conferível.
 *
 * LEITURA PURA — nenhuma escrita, nenhum `groupBy`.
 */
export interface PernaNaLista {
  readonly id: string;
  readonly tipo: TipoPernaDeRealocacao;
  readonly valor: string;
  readonly fichaNumero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly programaCodigo: string;
  readonly naturezaCodigo: string;
  readonly fonteCodigo: string;
}

export interface AtoDeRealocacaoNaLista {
  readonly id: string;
  readonly especie: EspecieDeRealocacao;
  readonly numero: string;
  readonly ano: number;
  readonly data: Date;
  readonly leiNumero: string;
  readonly leiDataPublicacao: Date;
  readonly justificativa: string;
  readonly criadoPor: string;
  /** Σ das pernas que recebem — igual à Σ das que cedem, porque o ato só nasce fechando. */
  readonly total: string;
  readonly anulacao: {
    readonly data: Date;
    readonly motivo: string;
    readonly criadoPor: string;
  } | null;
  readonly pernas: readonly PernaNaLista[];
}

export async function listarRealocacoes(
  prisma: PrismaClient,
  p: { readonly exercicio: number }
): Promise<readonly AtoDeRealocacaoNaLista[]> {
  const atos = await prisma.atoDeRealocacao.findMany({
    where: { ano: p.exercicio },
    orderBy: [{ data: "desc" }, { numero: "desc" }],
    select: {
      id: true,
      especie: true,
      numero: true,
      ano: true,
      data: true,
      leiNumero: true,
      leiDataPublicacao: true,
      justificativa: true,
      criadoPor: true,
      anulacao: { select: { data: true, motivo: true, criadoPor: true } },
      itens: {
        where: { estornoDeId: null },
        orderBy: [{ tipo: "desc" }, { id: "asc" }],
        select: {
          id: true,
          tipo: true,
          valor: true,
          ficha: {
            select: {
              numero: true,
              unidadeOrc: { select: { codigo: true, descricao: true } },
              programa: { select: { codigo: true } },
              naturezaDespesa: { select: { codigoCompleto: true } },
              fonte: { select: { codigo: true } },
            },
          },
        },
      },
    },
  });

  return atos.map((a) => {
    const total = a.itens
      .filter((i) => i.tipo === "ACRESCIMO")
      .reduce((acc, i) => toMoney(acc.plus(i.valor.toFixed(2))), toMoney("0.00"));
    return {
      id: a.id,
      especie: a.especie,
      numero: a.numero,
      ano: a.ano,
      data: a.data,
      leiNumero: a.leiNumero,
      leiDataPublicacao: a.leiDataPublicacao,
      justificativa: a.justificativa,
      criadoPor: a.criadoPor,
      total: total.toFixed(2),
      anulacao: a.anulacao,
      pernas: a.itens.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        valor: i.valor.toFixed(2),
        fichaNumero: i.ficha.numero,
        unidadeCodigo: i.ficha.unidadeOrc.codigo,
        unidadeNome: i.ficha.unidadeOrc.descricao,
        programaCodigo: i.ficha.programa.codigo,
        naturezaCodigo: i.ficha.naturezaDespesa.codigoCompleto,
        fonteCodigo: i.ficha.fonte.codigo,
      })),
    };
  });
}
