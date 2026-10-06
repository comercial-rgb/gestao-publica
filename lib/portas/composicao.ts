import { toMoney } from "../../packages/contracts/index";
import { composicaoDaLinha, type LinhaPedida } from "../../modules/m12-relatorios/index";
import { cliente } from "./cliente";
import { gerarBalancoFinanceiro, gerarBalancoOrcamentario } from "./demonstrativos";
import { gerarFluxosDeCaixa } from "./fluxos-de-caixa";

import { mensagemDoErro } from "./mensagem-do-erro";
/**
 * PORTA — V33: DE QUE DOCUMENTOS É FEITA ESTA LINHA DA DEMONSTRAÇÃO?
 *
 * A composição vem do M12 (`composicaoDaLinha`), que lista as MESMAS linhas que o motor soma. A
 * porta busca o valor da linha no próprio motor e confere os dois — e, se divergirem, a tela diz.
 * Zero aritmética de dinheiro aqui: a comparação é `Money.equals`, nunca igualdade de string.
 */

export type { LinhaPedida };

/** O que vem na URL: `?linha=bf-receita:500`, `bo-despesa:3.3`, `dfc-receita:TRANSFERENCIAS_CORRENTES`... */
export function linhaPedidaDaUrl(bruto: string | undefined): LinhaPedida | null {
  if (bruto === undefined) return null;
  const m = /^(bf-receita|bf-despesa|bo-receita|bo-despesa|dfc-receita|dfc-despesa):([0-9A-Z_.]{1,40})$/.exec(bruto);
  if (m === null) return null;
  const [, tipo, valor] = m as unknown as [string, string, string];
  switch (tipo) {
    case "bf-receita":
      return /^\d{1,10}$/.test(valor) ? { tipo: "BF_RECEITA", fonte: valor } : null;
    case "bf-despesa":
      return /^\d{1,10}$/.test(valor) ? { tipo: "BF_DESPESA", fonte: valor } : null;
    case "bo-receita":
      return /^\d(\.\d)?$/.test(valor) ? { tipo: "BO_RECEITA", codigo: valor } : null;
    case "bo-despesa":
      return /^\d(\.\d)?$/.test(valor) ? { tipo: "BO_DESPESA", codigo: valor } : null;
    case "dfc-receita":
      return /^[A-Z_]+$/.test(valor) ? { tipo: "DFC_RECEITA", origem: valor } : null;
    case "dfc-despesa":
      return /^\d$/.test(valor) ? { tipo: "DFC_DESPESA", grupo: valor } : null;
    default:
      return null;
  }
}

/** A chave de URL de uma linha — o inverso de `linhaPedidaDaUrl`, para as telas montarem o link. */
export function chaveDaLinha(l: LinhaPedida): string {
  switch (l.tipo) {
    case "BF_RECEITA":
      return `bf-receita:${l.fonte}`;
    case "BF_DESPESA":
      return `bf-despesa:${l.fonte}`;
    case "BO_RECEITA":
      return `bo-receita:${l.codigo}`;
    case "BO_DESPESA":
      return `bo-despesa:${l.codigo}`;
    case "DFC_RECEITA":
      return `dfc-receita:${l.origem}`;
    case "DFC_DESPESA":
      return `dfc-despesa:${l.grupo}`;
  }
}

/** O link da composição, com o exercício da demonstração. */
export function hrefDaComposicao(l: LinhaPedida, exercicio: number | string): string {
  return `/relatorios/demonstracoes/composicao?linha=${encodeURIComponent(chaveDaLinha(l))}&exercicio=${String(exercicio)}`;
}

/** A linha da DFC traz `receita:<origem>` ou `despesa:<grupo>` (`LinhaDfc.composicao`). */
export function linhaDaDfc(composicao: string): LinhaPedida | null {
  const [lado, chave] = composicao.split(":");
  if (chave === undefined) return null;
  return lado === "receita" ? { tipo: "DFC_RECEITA", origem: chave } : lado === "despesa" ? { tipo: "DFC_DESPESA", grupo: chave } : null;
}

export interface DocumentoDaTela {
  readonly chave: string;
  readonly href: string | null;
  readonly documento: string;
  readonly data: Date | null;
  readonly descricao: string;
  readonly classificacao: string;
  readonly valores: readonly string[];
}

export interface ComposicaoDaTela {
  readonly demonstracao: { readonly nome: string; readonly href: string };
  readonly titulo: string;
  readonly colunas: readonly string[];
  readonly documentos: readonly DocumentoDaTela[];
  readonly totais: readonly string[];
  /** O valor da linha no motor, coluna a coluna; `null` com o motivo quando o motor não emitiu. */
  readonly linha: { readonly rotulo: string; readonly valores: readonly string[] } | { readonly indisponivel: string } | null;
  /** `true` = os documentos somam a linha; `false` = divergem; `null` = sem linha para conferir. */
  readonly confere: boolean | null;
}

const NOME: Record<LinhaPedida["tipo"], { nome: string; rota: string }> = {
  BF_RECEITA: { nome: "Balanço Financeiro", rota: "balanco-financeiro" },
  BF_DESPESA: { nome: "Balanço Financeiro", rota: "balanco-financeiro" },
  BO_RECEITA: { nome: "Balanço Orçamentário", rota: "balanco-orcamentario" },
  BO_DESPESA: { nome: "Balanço Orçamentário", rota: "balanco-orcamentario" },
  DFC_RECEITA: { nome: "Demonstração dos Fluxos de Caixa", rota: "fluxos-de-caixa" },
  DFC_DESPESA: { nome: "Demonstração dos Fluxos de Caixa", rota: "fluxos-de-caixa" },
};

function tituloDa(l: LinhaPedida): string {
  switch (l.tipo) {
    case "BF_RECEITA":
      return `Ingressos orçamentários da fonte ${l.fonte}`;
    case "BF_DESPESA":
      return `Dispêndios orçamentários (empenhado) da fonte ${l.fonte}`;
    case "BO_RECEITA":
      return `Receita realizada ${l.codigo.includes(".") ? "da origem" : "da categoria"} ${l.codigo}`;
    case "BO_DESPESA":
      return `Despesa ${l.codigo.includes(".") ? "do grupo" : "da categoria"} ${l.codigo}`;
    case "DFC_RECEITA":
      return "Ingressos de receita da linha";
    case "DFC_DESPESA":
      return `Desembolsos do grupo ${l.grupo} (pago no exercício e restos a pagar pagos)`;
  }
}

/** O valor da linha no próprio motor. */
async function valorDaLinha(
  exercicio: number,
  l: LinhaPedida
): Promise<{ readonly rotulo: string; readonly valores: readonly string[] } | null> {
  if (l.tipo === "BF_RECEITA" || l.tipo === "BF_DESPESA") {
    const b = await gerarBalancoFinanceiro({ exercicio });
    const lado = l.tipo === "BF_RECEITA" ? b.ingressos : b.dispendios;
    const linha = lado.find((x) => x.nivel === "FONTE" && x.codigo === l.fonte);
    return linha === undefined ? null : { rotulo: `${linha.codigo ?? ""} ${linha.rotulo}`.trim(), valores: [linha.valor] };
  }
  if (l.tipo === "BO_RECEITA") {
    const b = await gerarBalancoOrcamentario({ exercicio });
    const linha = b.receitas.find((x) => x.codigo === l.codigo && (x.nivel === "CATEGORIA" || x.nivel === "ORIGEM"));
    return linha === undefined ? null : { rotulo: `${linha.codigo ?? ""} ${linha.rotulo ?? ""}`.trim(), valores: [linha.realizadas] };
  }
  if (l.tipo === "BO_DESPESA") {
    const b = await gerarBalancoOrcamentario({ exercicio });
    const linha = b.despesas.find((x) => x.codigo === l.codigo && (x.nivel === "CATEGORIA" || x.nivel === "GRUPO"));
    return linha === undefined ? null : { rotulo: `${linha.codigo ?? ""} ${linha.rotulo}`.trim(), valores: [linha.empenhadas, linha.liquidadas, linha.pagas] };
  }
  const chave = l.tipo === "DFC_RECEITA" ? `receita:${l.origem}` : `despesa:${l.grupo}`;
  const d = await gerarFluxosDeCaixa({ exercicio });
  for (const f of d.fluxos) {
    const linha = [...f.ingressos, ...f.desembolsos].find((x) => x.composicao === chave);
    if (linha !== undefined) return { rotulo: linha.rotulo, valores: [linha.valor] };
  }
  return null;
}

function hrefDoDocumento(destino: { readonly tipo: "ARRECADACAO" | "EMPENHO"; readonly id: string } | null): string | null {
  if (destino === null) return null;
  return destino.tipo === "ARRECADACAO" ? `/receita/arrecadacoes/${destino.id}` : `/despesa/empenhos/${destino.id}`;
}

export async function lerComposicao(p: { readonly exercicio: number; readonly linha: LinhaPedida }): Promise<ComposicaoDaTela> {
  const c = await composicaoDaLinha(cliente(), p.exercicio, p.linha);
  const totais = c.totais.map((t) => t.toFixed(2));

  // O motor pode recusar (sem rol de caixa, DFC que não fecha, item sem atividade): a composição
  // continua de pé — ela não depende da conferência de caixa — e a tela diz por que não há linha.
  let linha: ComposicaoDaTela["linha"];
  try {
    linha = await valorDaLinha(p.exercicio, p.linha);
  } catch (erro) {
    linha = { indisponivel: erro instanceof Error ? mensagemDoErro(erro, "") : "a demonstração não foi emitida" };
  }
  const confere =
    linha === null || "indisponivel" in linha
      ? null
      : linha.valores.length === totais.length && linha.valores.every((v, i) => toMoney(v).equals(toMoney(totais[i]!)));

  const n = NOME[p.linha.tipo];
  return {
    demonstracao: { nome: n.nome, href: `/relatorios/demonstracoes/${n.rota}?exercicio=${String(p.exercicio)}` },
    titulo: tituloDa(p.linha),
    colunas: c.colunas,
    documentos: c.documentos.map((d) => ({
      chave: d.chave,
      href: hrefDoDocumento(d.destino),
      documento: d.documento,
      data: d.data,
      descricao: d.descricao,
      classificacao: d.classificacao,
      valores: d.valores.map((v) => v.toFixed(2)),
    })),
    totais,
    linha,
    confere,
  };
}
