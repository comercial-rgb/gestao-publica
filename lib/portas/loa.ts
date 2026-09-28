import { serializar } from "../../packages/contracts/index.js";
import { loaDoExercicio } from "../../modules/m02b-plurianual/consultas-loa.js";
import {
  ConferenciaDaLoaError,
  type AnexoIndisponivel,
  type NivelDaLinha,
  type SituacaoDoEquilibrio,
} from "../../modules/m02b-plurianual/anexos/loa.js";
import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";

/**
 * PORTA — A LEI ORÇAMENTÁRIA ANUAL CONSOLIDADA (M02b): o resumo e os anexos da Lei 4.320/64 do
 * exercício, a partir das fichas (dotação inicial) e da receita prevista.
 *
 * ⚠️ LEITURA DO ENTE: a receita prevista não tem unidade orçamentária e a LOA é uma lei só; a
 * leitura exige `CONSULTAR_PLANEJAMENTO` no escopo global, como a programação financeira.
 *
 * ⚠️ A PORTA NÃO SOMA: converte `Decimal` em texto decimal na borda. Toda aritmética e a
 * conferência dos anexos são do módulo.
 */
export { PortaSemBancoError, ConferenciaDaLoaError };
export type { AnexoIndisponivel, NivelDaLinha, SituacaoDoEquilibrio };

export interface LinhaDoQuadroDaTela {
  readonly codigo: string;
  readonly especificacao: string;
  readonly nivel: NivelDaLinha;
  readonly profundidade: number;
  readonly valores: readonly string[];
}

export interface QuadroDaTela {
  readonly titulo: string;
  readonly colunas: readonly string[];
  readonly linhas: readonly LinhaDoQuadroDaTela[];
}

export interface AnexoDaTela {
  readonly numero: string;
  readonly titulo: string;
  readonly fundamento: string;
  readonly quadros: readonly QuadroDaTela[];
  readonly notas: readonly string[];
}

export interface LoaDaTela {
  readonly exercicio: number;
  readonly resumo: {
    readonly receitaPrevista: string;
    readonly despesaFixada: string;
    readonly diferenca: string;
    readonly situacao: SituacaoDoEquilibrio;
    readonly fichas: number;
    readonly naturezasDeReceita: number;
  };
  readonly anexos: readonly AnexoDaTela[];
  readonly indisponiveis: readonly AnexoIndisponivel[];
}

export async function lerLoa(p: { readonly exercicio: number }): Promise<LoaDaTela> {
  await exigirLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const l = await loaDoExercicio(cliente(), { exercicio: p.exercicio });
  return {
    exercicio: l.exercicio,
    resumo: {
      receitaPrevista: serializar(l.resumo.receitaPrevista),
      despesaFixada: serializar(l.resumo.despesaFixada),
      diferenca: serializar(l.resumo.diferenca),
      situacao: l.resumo.situacao,
      fichas: l.resumo.fichas,
      naturezasDeReceita: l.resumo.naturezasDeReceita,
    },
    anexos: l.anexos.map((a) => ({
      numero: a.numero,
      titulo: a.titulo,
      fundamento: a.fundamento,
      notas: a.notas,
      quadros: a.quadros.map((q) => ({
        titulo: q.titulo,
        colunas: q.colunas,
        linhas: q.linhas.map((ln) => ({
          codigo: ln.codigo,
          especificacao: ln.especificacao,
          nivel: ln.nivel,
          profundidade: ln.profundidade,
          valores: ln.valores.map(serializar),
        })),
      })),
    })),
    indisponiveis: l.indisponiveis,
  };
}
