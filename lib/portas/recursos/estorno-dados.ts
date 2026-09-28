import { diaCivilBr, inicioDoDiaCivil } from "../../../packages/datas/index.js";
import {
  analisarEstornoDeGestao,
  analisarEstornoPatrimonial,
  type MovimentoDaAnalise,
  type MovimentoDeGestaoDaAnalise,
  type PorqueDepende,
} from "../../../modules/m10-patrimonial/estorno.js";
import { estornarMovimentoDeGestao } from "../../../modules/m10-patrimonial/gestao-do-bem.js";
import { estornarMovimentoPatrimonial } from "../../../modules/m10-patrimonial/patrimonio.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import { rotuloDoTipoPatrimonial } from "./roteiros.js";

/**
 * ═══ O ESTORNO COM ANÁLISE DE DEPENDÊNCIAS — M10, V3 pacote 2 ═══
 *
 * Uma leitura (a análise, nos dois eixos) e uma escrita (o estorno, pelo serviço do eixo,
 * que refaz a análise DENTRO da transação e recusa pelos mesmos bloqueios). A tela mostra o
 * que o ato desfaz (o movimento, os arrastados da operação, o resultado), quem depende
 * (bloqueia) e quem vem depois (informação), e só oferece o botão quando nada bloqueia.
 */

export { PortaSemBancoError };

export type EixoDoEstorno = "valor" | "gestao";
export const ACAO_DO_EIXO: Readonly<Record<EixoDoEstorno, "ESTORNAR_MOVIMENTO_PATRIMONIAL" | "ESTORNAR_MOVIMENTO_DE_GESTAO">> = {
  valor: "ESTORNAR_MOVIMENTO_PATRIMONIAL",
  gestao: "ESTORNAR_MOVIMENTO_DE_GESTAO",
};

export function ehEixo(x: string): x is EixoDoEstorno {
  return x === "valor" || x === "gestao";
}

/** A rota da análise de um movimento — uma fonte só para os links do histórico. */
export function rotaDoEstorno(eixo: EixoDoEstorno, movimentoId: string): string {
  return `/patrimonio/estornos/${eixo}/${movimentoId}`;
}

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const ROTULO_DO_PORQUE: Readonly<Record<PorqueDepende, string>> = {
  COMPETENCIA_POSTERIOR: "a parcela desta competência foi calculada sobre uma base que incluía este movimento",
  REDUCAO_POSTERIOR: "sem este movimento a redução ficaria acima do que o alvo valia (impacto verificado)",
  BAIXA_DA_ACUMULADA_POSTERIOR: "sem este movimento a acumulada não cobriria a baixa (impacto verificado)",
};

export interface ItemDaAnalise {
  readonly id: string;
  readonly rotulo: string;
  readonly quando: string;
  readonly registradoEm: string;
  readonly por: string;
  readonly motivo: string | null;
  readonly valor: string | null;
  readonly porque: string | null;
  readonly href: string;
}

export interface AnaliseLida {
  readonly eixo: EixoDoEstorno;
  readonly movimentoId: string;
  readonly titulo: string;
  readonly subtitulo: string;
  readonly bemId: string | null;
  readonly numeroTombamento: string | null;
  readonly classe: string | null;
  readonly temMemoria: boolean;
  /** V4: o movimento é item de uma execução mensal — o estorno desfaz A EXECUÇÃO da classe, não a virada. */
  readonly execucao: { readonly competencia: string; readonly escopo: string; readonly itens: number } | null;
  readonly arrastados: readonly ItemDaAnalise[];
  readonly resultados: readonly string[];
  readonly dependentes: readonly ItemDaAnalise[];
  readonly informativos: readonly ItemDaAnalise[];
  readonly bloqueios: readonly string[];
  readonly podeEstornar: boolean;
}

function itemDeValor(m: MovimentoDaAnalise, porque: PorqueDepende | null, impacto?: string): ItemDaAnalise {
  return {
    id: m.id,
    rotulo:
      `${rotuloDoTipoPatrimonial(m.tipo)}` +
      (m.competencia !== null ? ` (competência ${diaCivilBr(m.competencia).slice(3)})` : "") +
      (m.numeroTombamento !== null ? ` · bem ${m.numeroTombamento}` : " · da classe"),
    quando: diaCivilBr(m.dataMovimento),
    registradoEm: diaCivilBr(m.criadoEm),
    por: m.criadoPor,
    motivo: m.motivo,
    valor: m.valor,
    porque: porque === null ? null : impacto !== undefined ? `${ROTULO_DO_PORQUE[porque]}: ${impacto}` : ROTULO_DO_PORQUE[porque],
    href: rotaDoEstorno("valor", m.id),
  };
}

function itemDeGestao(m: MovimentoDeGestaoDaAnalise): ItemDaAnalise {
  return {
    id: m.id,
    rotulo: m.tipo.replace(/_/g, " ").toLowerCase(),
    quando: diaCivilBr(m.dataMovimento),
    registradoEm: diaCivilBr(m.criadoEm),
    por: m.criadoPor,
    motivo: m.motivo,
    valor: null,
    porque: null,
    href: rotaDoEstorno("gestao", m.id),
  };
}

/** A análise para a tela — `null` quando o movimento não existe. */
export async function analiseDoEstorno(eixo: EixoDoEstorno, movimentoId: string): Promise<AnaliseLida | null> {
  const prisma = cliente();
  try {
    if (eixo === "valor") {
      const a = await analisarEstornoPatrimonial(prisma, movimentoId);
      const m = a.movimento;
      return {
        eixo,
        movimentoId,
        titulo: `${rotuloDoTipoPatrimonial(m.tipo)} de ${m.valor}` + (m.numeroTombamento !== null ? ` — bem ${m.numeroTombamento}` : " — da classe"),
        subtitulo: `${m.classe} · fato em ${diaCivilBr(m.dataMovimento)} · registrado ${diaCivilBr(m.criadoEm)} por ${m.criadoPor}`,
        bemId: m.bemId,
        numeroTombamento: m.numeroTombamento,
        classe: m.classe,
        temMemoria: m.temMemoria,
        execucao: a.execucao === null ? null : { competencia: a.execucao.competencia, escopo: a.execucao.escopo === "BEM" ? "um bem" : "a classe", itens: a.execucao.itens },
        arrastados: a.arrastados.map((x) => itemDeValor(x, null)),
        resultados: a.resultados.map((r) => (r.origemTipo === "PATRIMONIAL_GANHO_ALIENACAO" ? "o lançamento do ganho na alienação" : "o lançamento da perda na alienação")),
        dependentes: a.dependentes.map((d) => itemDeValor(d, d.porque, d.impacto)),
        informativos: a.posterioresDoBem.map((x) => itemDeValor(x, null)),
        bloqueios: a.bloqueios,
        podeEstornar: a.podeEstornar,
      };
    }
    const a = await analisarEstornoDeGestao(prisma, movimentoId);
    const m = a.movimento;
    return {
      eixo,
      movimentoId,
      titulo: `${m.tipo.replace(/_/g, " ").toLowerCase()} — bem ${m.numeroTombamento}`,
      subtitulo: `fato em ${diaCivilBr(m.dataMovimento)} · registrado ${diaCivilBr(m.criadoEm)} por ${m.criadoPor}`,
      bemId: m.bemId,
      numeroTombamento: m.numeroTombamento,
      classe: null,
      temMemoria: false,
      execucao: null,
      arrastados: a.arrastados.map(itemDeGestao),
      resultados: [],
      dependentes: [],
      informativos: a.posterioresDoEixo.map(itemDeGestao),
      bloqueios: a.bloqueios,
      podeEstornar: a.podeEstornar,
    };
  } catch (e) {
    if (e instanceof Error && /não encontrado/.test(e.message)) return null;
    throw e;
  }
}

/** O estorno — o serviço do eixo refaz a análise na transação; a recusa sobe como veio. */
export async function estornarPorAnalise(eixo: EixoDoEstorno, c: Campos): Promise<{ readonly movimentos: number }> {
  const movimentoId = t(c, "movimentoId");
  const dataMovimento = inicioDoDiaCivil(t(c, "dataMovimento"));
  const motivo = t(c, "motivo");
  if (eixo === "valor") {
    const r = await comEscritaAutenticada("ESTORNAR_MOVIMENTO_PATRIMONIAL", (criadoPor) =>
      estornarMovimentoPatrimonial(cliente(), { movimentoId, dataMovimento, motivo, criadoPor })
    );
    return { movimentos: r.movimentos.length };
  }
  const r = await comEscritaAutenticada("ESTORNAR_MOVIMENTO_DE_GESTAO", (criadoPor) =>
    estornarMovimentoDeGestao(cliente(), { movimentoId, dataMovimento, motivo, criadoPor })
  );
  return { movimentos: r.movimentosId.length };
}
