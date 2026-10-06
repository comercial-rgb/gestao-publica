import { toMoney } from "../../../../packages/contracts/index";
import { diaCivil } from "../../../../packages/datas/index";
import { valorDigitadoEmDecimal } from "../../../../lib/format/moeda";

/**
 * V36 — OS FILTROS E A ORDENAÇÃO DA TELA DA CONCILIAÇÃO (TR 5.10.2.50 e 5.10.2.51): período, texto (histórico,
 * documento ou FITID), valor, tipo do registro interno, e a ordem pela coluna de valor — dos dois lados.
 *
 * ⚠️ É RECORTE DE EXIBIÇÃO, NÃO DE CONTA. O resumo da conciliação (saldos, diferença, somas das pendências) continua
 * o do motor, sobre tudo; a tela mostra, além dele, a soma das linhas que passaram no filtro. Filtrar nunca muda o
 * que fecha.
 *
 * ⚠️ O VALOR SE COMPARA SEM SINAL e em Decimal: quem procura "1.234,56" no extrato procura a saída e a entrada desse
 * valor. Valor ilegível não filtra nada — e a tela diz que foi ignorado, em vez de esvaziar a lista calada.
 */

export type OrdemDaConciliacao = "" | "valor-asc" | "valor-desc";

export interface FiltroDaConciliacao {
  readonly desde: string;
  readonly ate: string;
  readonly texto: string;
  /** Decimal sem sinal ("1234.56"), ou "" quando não há filtro de valor. */
  readonly valor: string;
  /** O que a pessoa digitou no valor e não se leu como número — a tela avisa. */
  readonly valorIgnorado: string;
  readonly tipo: string;
  readonly ordem: OrdemDaConciliacao;
}

const um = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
const ehDia = (v: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(v);

export function filtroDaConciliacao(sp: Record<string, string | string[] | undefined>): FiltroDaConciliacao {
  const valorBruto = um(sp["valor"]);
  const lido = valorBruto === "" ? "" : valorDigitadoEmDecimal(valorBruto);
  const ordem = um(sp["ordem"]);
  return {
    desde: ehDia(um(sp["desde"])) ? um(sp["desde"]) : "",
    ate: ehDia(um(sp["ate"])) ? um(sp["ate"]) : "",
    texto: um(sp["texto"]),
    valor: lido === "" ? "" : lido.replace(/^-/, ""),
    valorIgnorado: valorBruto !== "" && lido === "" ? valorBruto : "",
    tipo: um(sp["tipo"]),
    ordem: ordem === "valor-asc" || ordem === "valor-desc" ? ordem : "",
  };
}

export function filtroAtivo(f: FiltroDaConciliacao): boolean {
  return f.desde !== "" || f.ate !== "" || f.texto !== "" || f.valor !== "" || f.tipo !== "" || f.ordem !== "";
}

const semAcento = (s: string): string => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export interface AcessoDaLinha<T> {
  readonly data: (l: T) => Date;
  readonly texto: (l: T) => string;
  /** Decimal com ou sem sinal. */
  readonly valor: (l: T) => string;
  /** O tipo do registro interno; ausente no lado do extrato (o filtro de tipo não o alcança). */
  readonly tipo?: (l: T) => string;
}

export function filtrarEOrdenar<T>(linhas: readonly T[], f: FiltroDaConciliacao, a: AcessoDaLinha<T>): readonly T[] {
  const termo = semAcento(f.texto);
  const alvo = f.valor === "" ? null : toMoney(f.valor);
  const passam = linhas.filter((l) => {
    const dia = diaCivil(a.data(l));
    if (f.desde !== "" && dia < f.desde) return false;
    if (f.ate !== "" && dia > f.ate) return false;
    if (termo !== "" && !semAcento(a.texto(l)).includes(termo)) return false;
    if (alvo !== null && !toMoney(a.valor(l)).abs().equals(alvo)) return false;
    if (f.tipo !== "" && a.tipo !== undefined && a.tipo(l) !== f.tipo) return false;
    return true;
  });
  if (f.ordem === "") return passam;
  const sinal = f.ordem === "valor-asc" ? 1 : -1;
  // Ordem estável: empate de valor mantém a ordem do motor (por data).
  return passam
    .map((l, i) => ({ l, i }))
    .sort((x, y) => sinal * toMoney(a.valor(x.l)).comparedTo(toMoney(a.valor(y.l))) || x.i - y.i)
    .map((x) => x.l);
}

/** A soma das linhas exibidas (Decimal), para mostrar ao lado da soma do motor quando há filtro. */
export function somaExibida<T>(linhas: readonly T[], valor: (l: T) => string): string {
  return linhas.reduce((s, l) => toMoney(s.plus(valor(l))), toMoney("0.00")).toFixed(2);
}
