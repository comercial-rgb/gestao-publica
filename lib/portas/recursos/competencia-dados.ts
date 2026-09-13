import { diaCivil, diaCivilBr } from "../../../packages/datas/index.js";
import { parametroVigente } from "../../../modules/m10-patrimonial/parametros.js";
import {
  atualizarCompetencia,
  conciliacaoDaClasse,
  preverCompetencia,
  type ResultadoAtualizacao,
  type SituacaoDaCompetencia,
  type SituacaoDoItem,
} from "../../../modules/m10-patrimonial/patrimonio.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import { residualEmPorcento } from "./parametros-dados.js";
import { OPCOES_DE_METODO } from "./parametros.js";
import { rotuloDoTipoPatrimonial } from "./roteiros.js";

/**
 * ═══ O PROCESSAMENTO POR COMPETÊNCIA — M10, V3 pacote 2; V4 §4 (por bem, com corte e execução) ═══
 *
 * Leituras e uma escrita:
 *   - as classes que TÊM parâmetro (o seletor da tela);
 *   - a PRÉVIA de uma competência, ITEM A ITEM (cada bem elegível e o acervo sem individualização),
 *     com o corte, a versão vigente NA competência e os totais — a mesma conta que a execução faz,
 *     sem escrever (`preverCompetencia`);
 *   - o HISTÓRICO das execuções da classe, com a memória de cada item;
 *   - a CONCILIAÇÃO item → classe → razão;
 *   - processar: `atualizarCompetencia`, com o crachá `ATUALIZAR_COMPETENCIA_PATRIMONIAL`, no escopo
 *     que a tela declara (a classe, ou um bem).
 *
 * ⚠️ `GET` não produz transição de estado: a prévia é lida pela URL; processar é POST.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const ROTULO_DO_METODO: Readonly<Record<string, string>> = Object.fromEntries(
  OPCOES_DE_METODO.map((o) => [o.valor, o.rotulo])
);

export interface ClasseParametrizada {
  readonly id: string;
  readonly rotulo: string;
  readonly metodo: string;
}

export async function classesComParametro(): Promise<readonly ClasseParametrizada[]> {
  const prisma = cliente();
  const classes = await prisma.classeDeBens.findMany({
    where: { ativa: true },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
    take: 500,
  });
  const saida: ClasseParametrizada[] = [];
  for (const c of classes) {
    const p = await parametroVigente(prisma, c.id);
    if (p === null || !p.ativo) continue;
    saida.push({ id: c.id, rotulo: `${c.codigo} — ${c.descricao}`, metodo: ROTULO_DO_METODO[p.metodo] ?? p.metodo });
  }
  return saida;
}

export const ROTULO_DA_SITUACAO_DO_ITEM: Readonly<Record<SituacaoDoItem, string>> = {
  PRONTO: "pronto",
  JA_ATUALIZADO: "já atualizado",
  TOTALMENTE_ATUALIZADO: "totalmente atualizado",
  NAO_ELEGIVEL: "não elegível",
  SEM_VALOR: "sem valor",
};

export interface ItemDaPreviaLido {
  readonly chave: string;
  readonly bemId: string | null;
  readonly alvo: string;
  readonly entradaEm: string;
  readonly base: string;
  readonly valorContabil: string;
  readonly valorResidual: string;
  readonly parcelaCheia: string;
  readonly teto: string;
  readonly valorDaParcela: string;
  readonly situacao: SituacaoDoItem;
  readonly situacaoRotulo: string;
  readonly nota: string;
}

export interface PreviaLida {
  readonly classe: { readonly id: string; readonly rotulo: string };
  readonly competencia: string;
  readonly corte: string;
  readonly escopo: "CLASSE" | "BEM";
  readonly bemId: string | null;
  readonly situacao: SituacaoDaCompetencia;
  readonly recusa: string | null;
  readonly parametro: {
    readonly versao: string;
    readonly vigenteDesde: string;
    readonly metodo: string;
    readonly vidaUtilMeses: number;
    readonly residual: string;
  } | null;
  readonly tipo: string | null;
  readonly base: string;
  readonly valorContabil: string;
  readonly jaAplicado: string;
  readonly calculo: {
    readonly valorResidual: string;
    readonly parcelaCheia: string;
    readonly teto: string;
    readonly valorDaParcela: string;
  } | null;
  readonly itens: readonly ItemDaPreviaLido[];
  readonly prontos: number;
}

/** A prévia — `null` quando a classe não existe. Competência malformada ESTOURA nomeando. */
export async function previaDaCompetencia(classeId: string, competencia: string, bemId?: string): Promise<PreviaLida | null> {
  const prisma = cliente();
  const classe = await prisma.classeDeBens.findUnique({ where: { id: classeId }, select: { codigo: true, descricao: true } });
  if (classe === null) return null;
  const p = await preverCompetencia(prisma, { classeDeBensId: classeId, competencia, bemId: bemId === undefined || bemId === "" ? undefined : bemId });
  return {
    classe: { id: classeId, rotulo: `${classe.codigo} — ${classe.descricao}` },
    competencia,
    corte: diaCivilBr(p.corte),
    escopo: p.escopo,
    bemId: p.bemId,
    situacao: p.situacao,
    recusa: p.recusa,
    parametro:
      p.parametro === null
        ? null
        : {
            versao: p.parametro.origem === "LEGADO" ? "parâmetro de origem (sem versão)" : `versão ${p.parametro.numero}`,
            vigenteDesde: p.parametro.vigenteDesde === null ? "desde o início" : `desde ${diaCivil(p.parametro.vigenteDesde).slice(0, 7)}`,
            metodo: ROTULO_DO_METODO[p.parametro.metodo] ?? p.parametro.metodo,
            vidaUtilMeses: p.parametro.vidaUtilMeses,
            residual: residualEmPorcento(p.parametro.percentualResidual),
          },
    tipo: p.tipo === null ? null : rotuloDoTipoPatrimonial(p.tipo),
    base: p.base.toFixed(2),
    valorContabil: p.valorContabil.toFixed(2),
    jaAplicado: p.jaAplicado.toFixed(2),
    calculo:
      p.calculo === null
        ? null
        : {
            valorResidual: p.calculo.valorResidual.toFixed(2),
            parcelaCheia: p.calculo.parcelaCheia.toFixed(2),
            teto: p.calculo.teto.toFixed(2),
            valorDaParcela: p.calculo.valorDaParcela.toFixed(2),
          },
    itens: p.itens.map((i) => ({
      chave: i.bemId ?? "acervo",
      bemId: i.bemId,
      alvo: i.bemId === null ? "Acervo sem individualização" : `${i.numeroTombamento ?? ""} — ${i.descricao ?? ""}`,
      entradaEm: i.entradaEm === null ? "—" : diaCivilBr(i.entradaEm),
      base: i.base.toFixed(2),
      valorContabil: i.valorContabil.toFixed(2),
      valorResidual: i.calculo === null ? "—" : i.calculo.valorResidual.toFixed(2),
      parcelaCheia: i.calculo === null ? "—" : i.calculo.parcelaCheia.toFixed(2),
      teto: i.calculo === null ? "—" : i.calculo.teto.toFixed(2),
      valorDaParcela: i.situacao === "PRONTO" && i.calculo !== null ? i.calculo.valorDaParcela.toFixed(2) : "—",
      situacao: i.situacao,
      situacaoRotulo: ROTULO_DA_SITUACAO_DO_ITEM[i.situacao],
      nota: i.nota ?? "",
    })),
    prontos: p.itens.filter((i) => i.situacao === "PRONTO").length,
  };
}

export interface ExecucaoProcessada {
  readonly execucaoId: string;
  readonly competencia: string;
  readonly escopo: string;
  readonly tipo: string;
  readonly itens: number;
  readonly base: string;
  readonly valor: string;
  readonly versao: string;
  readonly lancadaEm: string;
  readonly por: string;
  readonly estornada: boolean;
  /** O primeiro item vivo — a porta de entrada da análise de estorno (que arrasta a execução). */
  readonly movimentoId: string | null;
  readonly detalhes: readonly {
    readonly alvo: string;
    readonly valor: string;
    readonly base: string;
    readonly valorContabilAntes: string;
    readonly valorResidual: string;
    readonly parcelaCheia: string;
    readonly teto: string;
  }[];
}

/** O que já foi executado na classe, da competência mais recente à mais antiga — inclusive as execuções antigas (um movimento da classe, sem execução). */
export async function competenciasProcessadas(classeId: string): Promise<readonly ExecucaoProcessada[]> {
  const prisma = cliente();
  const execucoes = await prisma.execucaoDeAtualizacao.findMany({
    where: { classeDeBensId: classeId },
    orderBy: [{ competencia: "desc" }, { criadoEm: "desc" }],
    take: 120,
    select: {
      id: true, competencia: true, escopo: true, metodo: true, quantidadeDeItens: true, base: true, valorDaParcela: true, criadoEm: true, criadoPor: true,
      versaoDeParametro: { select: { numero: true } },
      memorias: {
        select: {
          base: true, valorContabilAntes: true, valorResidual: true, parcelaCheia: true, teto: true, valorDaParcela: true,
          movimento: { select: { id: true, bemId: true, bem: { select: { numeroTombamento: true } }, estornos: { select: { id: true } } } },
        },
      },
    },
  });
  const lidas: ExecucaoProcessada[] = execucoes.map((e) => {
    const vivos = e.memorias.filter((m) => m.movimento.estornos.length === 0);
    return {
      execucaoId: e.id,
      competencia: diaCivil(e.competencia).slice(0, 7),
      escopo: e.escopo === "BEM" ? "um bem" : "a classe",
      tipo: rotuloDoTipoPatrimonial(e.metodo),
      itens: e.quantidadeDeItens,
      base: e.base.toFixed(2),
      valor: e.valorDaParcela.toFixed(2),
      versao: e.versaoDeParametro === null ? "parâmetro de origem (sem versão)" : `versão ${e.versaoDeParametro.numero}`,
      lancadaEm: diaCivilBr(e.criadoEm),
      por: e.criadoPor,
      estornada: vivos.length === 0,
      movimentoId: vivos[0]?.movimento.id ?? null,
      detalhes: e.memorias.map((m) => ({
        alvo: m.movimento.bemId === null ? "acervo sem individualização" : `bem ${m.movimento.bem?.numeroTombamento ?? m.movimento.bemId}`,
        valor: m.valorDaParcela.toFixed(2),
        base: m.base.toFixed(2),
        valorContabilAntes: m.valorContabilAntes.toFixed(2),
        valorResidual: m.valorResidual.toFixed(2),
        parcelaCheia: m.parcelaCheia.toFixed(2),
        teto: m.teto.toFixed(2),
      })),
    };
  });
  // As atualizações ANTERIORES à execução (um movimento da classe, sem `operacaoId`): continuam no histórico.
  const antigas = await prisma.movimentoPatrimonial.findMany({
    where: { classeDeBensId: classeId, competencia: { not: null }, operacaoId: null, tipo: { in: ["DEPRECIACAO", "AMORTIZACAO", "EXAUSTAO"] } },
    orderBy: [{ competencia: "desc" }, { criadoEm: "desc" }],
    take: 120,
    select: { id: true, tipo: true, valor: true, competencia: true, criadoEm: true, criadoPor: true, estornos: { select: { id: true } }, memoriaDeAtualizacao: { select: { versaoDeParametro: { select: { numero: true } }, base: true, valorContabilAntes: true, valorResidual: true, parcelaCheia: true, teto: true } } },
  });
  for (const m of antigas) {
    lidas.push({
      execucaoId: m.id,
      competencia: m.competencia === null ? "—" : diaCivil(m.competencia).slice(0, 7),
      escopo: "a classe inteira (anterior ao item por bem)",
      tipo: rotuloDoTipoPatrimonial(m.tipo),
      itens: 1,
      base: m.memoriaDeAtualizacao?.base.toFixed(2) ?? "—",
      valor: m.valor.toFixed(2),
      versao: m.memoriaDeAtualizacao === null ? "sem memória" : m.memoriaDeAtualizacao.versaoDeParametro === null ? "parâmetro de origem (sem versão)" : `versão ${m.memoriaDeAtualizacao.versaoDeParametro.numero}`,
      lancadaEm: diaCivilBr(m.criadoEm),
      por: m.criadoPor,
      estornada: m.estornos.length > 0,
      movimentoId: m.estornos.length > 0 ? null : m.id,
      detalhes: m.memoriaDeAtualizacao === null ? [] : [{ alvo: "a classe", valor: m.valor.toFixed(2), base: m.memoriaDeAtualizacao.base.toFixed(2), valorContabilAntes: m.memoriaDeAtualizacao.valorContabilAntes.toFixed(2), valorResidual: m.memoriaDeAtualizacao.valorResidual.toFixed(2), parcelaCheia: m.memoriaDeAtualizacao.parcelaCheia.toFixed(2), teto: m.memoriaDeAtualizacao.teto.toFixed(2) }],
    });
  }
  return lidas.sort((a, b) => (a.competencia < b.competencia ? 1 : a.competencia > b.competencia ? -1 : 0));
}

export interface ConciliacaoLida {
  readonly classe: string;
  readonly somaDosBens: string;
  readonly semIndividualizacao: string;
  readonly diferenca: string;
  readonly acumuladaHistoricaSemBem: string;
  readonly bens: number;
}

export async function conciliacao(classeId: string): Promise<ConciliacaoLida> {
  const c = await conciliacaoDaClasse(cliente(), classeId);
  return {
    classe: c.classe.toFixed(2),
    somaDosBens: c.somaDosBens.toFixed(2),
    semIndividualizacao: c.semIndividualizacao.toFixed(2),
    diferenca: c.diferenca.toFixed(2),
    acumuladaHistoricaSemBem: c.acumuladaHistoricaSemBem.toFixed(2),
    bens: c.bens,
  };
}

export async function processarCompetencia(c: Campos): Promise<ResultadoAtualizacao> {
  const bemId = t(c, "bemId");
  return comEscritaAutenticada("ATUALIZAR_COMPETENCIA_PATRIMONIAL", (criadoPor) =>
    atualizarCompetencia(cliente(), {
      classeDeBensId: t(c, "classeDeBensId"),
      competencia: t(c, "competencia"),
      ...(bemId !== "" ? { bemId } : {}),
      criadoPor,
    })
  );
}
