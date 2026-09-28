import { somarValoresDigitados } from "../../../../lib/format/moeda";

/**
 * O RASCUNHO DO ATO DE REALOCAÇÃO — a forma que o formulário carrega e a action confere.
 *
 * ⚠️ A TELA SUGERE, O DOMÍNIO DECIDE. Estas funções validam FORMA (campo em branco, valor que não é
 * número) e antecipam o fechamento por fonte como AVISO. Quem recusa um ato que não fecha é o
 * domínio (`validarRealocacao`), antes de qualquer gravação — um bloqueio aqui seria um segundo
 * domínio, livre para divergir do primeiro.
 */

export type Papel = "REDUCAO" | "ACRESCIMO";
export type Especie = "REMANEJAMENTO" | "TRANSPOSICAO" | "TRANSFERENCIA";

export const ESPECIES: readonly { readonly valor: Especie; readonly rotulo: string; readonly ajuda: string }[] = [
  {
    valor: "REMANEJAMENTO",
    rotulo: "Remanejamento",
    ajuda: "Entre órgãos ou unidades — em geral por reorganização administrativa.",
  },
  {
    valor: "TRANSPOSICAO",
    rotulo: "Transposição",
    ajuda: "Entre programas de trabalho, dentro do mesmo órgão.",
  },
  {
    valor: "TRANSFERENCIA",
    rotulo: "Transferência",
    ajuda: "Entre categorias econômicas de despesa, dentro do mesmo programa.",
  },
];

export function ehEspecie(v: string): v is Especie {
  return ESPECIES.some((e) => e.valor === v);
}

export interface PernaRascunho {
  readonly fichaId: string;
  readonly papel: Papel;
  /** String decimal crua, como o `CampoValor` a entrega ("1234.56"). Pode vir meio-digitada. */
  readonly valor: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}

export interface RascunhoDoAto {
  readonly especie: string;
  readonly numero: string;
  readonly data: string;
  readonly leiNumero: string;
  readonly leiData: string;
  readonly justificativa: string;
  readonly pernas: readonly PernaRascunho[];
}

export function valorDigitavel(v: string): boolean {
  return /^\d+(\.\d+)?$/.test(v.trim()) && somarValoresDigitados([v]) !== "0.00";
}

export function errosDoRascunho(r: RascunhoDoAto): readonly string[] {
  const erros: string[] = [];
  if (!ehEspecie(r.especie)) erros.push("Escolha a espécie que a lei autorizou.");
  if (r.numero.trim() === "") erros.push("Informe o número do ato.");
  if (r.data.trim() === "") erros.push("Informe a data do ato.");
  if (r.leiNumero.trim() === "") erros.push("Informe o número da lei que autorizou.");
  if (r.leiData.trim() === "") erros.push("Informe a data de publicação da lei.");
  if (r.justificativa.trim().length < 10) erros.push("Escreva a justificativa (ao menos uma frase).");
  if (r.pernas.some((p) => p.fichaId === "")) erros.push("Escolha a ficha de cada linha.");
  if (r.pernas.some((p) => !valorDigitavel(p.valor))) erros.push("Informe um valor maior que zero em cada linha.");
  if (!r.pernas.some((p) => p.papel === "REDUCAO") || !r.pernas.some((p) => p.papel === "ACRESCIMO")) {
    erros.push("Inclua ao menos uma ficha que cede e uma que recebe.");
  }
  return erros;
}

export interface DesequilibrioDaFonte {
  readonly fonteCodigo: string;
  /** Com sinal: positivo = recebe mais do que cede. */
  readonly diferenca: string;
}

export function desequilibrioPorFonte(pernas: readonly PernaRascunho[]): readonly DesequilibrioDaFonte[] {
  const porFonte = new Map<string, string[]>();
  for (const p of pernas) {
    if (!valorDigitavel(p.valor) || p.fonteCodigo === "") continue;
    const parcelas = porFonte.get(p.fonteCodigo) ?? [];
    parcelas.push(p.papel === "ACRESCIMO" ? p.valor.trim() : `-${p.valor.trim()}`);
    porFonte.set(p.fonteCodigo, parcelas);
  }
  const fora: DesequilibrioDaFonte[] = [];
  for (const [fonteCodigo, parcelas] of [...porFonte.entries()].sort()) {
    const diferenca = somarValoresDigitados(parcelas);
    if (diferenca !== "0.00") fora.push({ fonteCodigo, diferenca });
  }
  return fora;
}
