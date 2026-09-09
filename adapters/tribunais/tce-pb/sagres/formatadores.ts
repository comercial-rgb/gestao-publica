import type { Money } from "../../../../packages/contracts/index.js";

/**
 * FORMATADORES DE CAMPO — SAGRES Contabilidade TCE-PB (layout 2026 v1.1).
 *
 * ═══ POR QUE NÃO SE REAPROVEITA O MANAD DIRETO ═══
 * O MANAD (M14) é DELIMITADO por pipe e ISO-8859-1. O SAGRES é LARGURA FIXA (posicional) e
 * UTF-8 (layout §, "formato texto ASCII, formato UTF-8, sem marcadores"). Então a doutrina é a
 * mesma (fronteira num só lugar, fail-closed nomeando registro+campo, zeros à esquerda sobrevivem
 * porque isto é TEXTO), mas o preenchimento é outro: cada campo ocupa EXATAMENTE a sua largura, e
 * a linha é a concatenação sem separador. O erro que o MANAD teme é "pipe no meio"; o que o SAGRES
 * teme é "largura errada" — um caractere a mais desloca TODAS as colunas seguintes, em silêncio.
 *
 * Regras de preenchimento (layout §4, conferidas contra o arquivo local):
 *  · Numérico inteiro: da direita p/ esquerda, zeros à esquerda, SEM ponto decimal.
 *  · Numérico valor (2 decimais): a VÍRGULA é 1 posição — 16 pos = 13 int + "," + 2 dec
 *    (ex.: `0000002547625,21`).
 *  · Data: ddmmaaaa (8 posições numéricas).
 *  · Caractere: da esquerda p/ direita, ESPAÇOS (ASCII 32) à direita; sem apóstrofo/aspas.
 *  · Campo não exigido: zeros (numérico) ou espaços (caractere).
 */

/** Onde estamos — para que TODO erro de formatação nomeie o arquivo e o campo. */
export interface Onde {
  readonly arquivo: string;
  readonly campo: string;
}

/**
 * ⚠️ UTF-8 aceita qualquer caractere — então NÃO há o fail-close de charset do MANAD (Latin-1).
 * O que o posicional NÃO tolera é caractere de controle (\n, \r, \t): ele não "não cabe", ele
 * PARTE ou desalinha a linha. E, no SAGRES, o próprio layout proíbe apóstrofo e aspas nos campos
 * caractere. Os dois viram erro nomeado — nunca substituição silenciosa.
 */
function exigirCaractereLimpo(valor: string, onde: Onde): void {
  const controle = [...valor].find((c) => c.codePointAt(0)! < 0x20);
  if (controle !== undefined) {
    throw new Error(
      `SAGRES — CARACTERE DE CONTROLE no arquivo ${onde.arquivo}, campo ${onde.campo}: ` +
        `U+${controle.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}. Um \\n/\\r/\\t ` +
        `dentro de um campo posicional PARTE a linha e desalinha o arquivo inteiro. Corrija o cadastro.`
    );
  }
  if (valor.includes("'") || valor.includes('"')) {
    throw new Error(
      `SAGRES — APÓSTROFO OU ASPAS no arquivo ${onde.arquivo}, campo ${onde.campo}: "${valor}". ` +
        `O layout (§ tipo caractere) proíbe apóstrofo e aspas nos campos caractere.`
    );
  }
}

/**
 * Campo CARACTERE de largura fixa: esquerda→direita, espaços (ASCII 32) à direita.
 *
 * ⚠️ TRUNCAMENTO É FAIL-CLOSED, NÃO SILENCIOSO. Um nome maior que a largura não é "corta e segue":
 * cortar o histórico ou o nome do credor no meio produz um dado fiscal falso. O gerador PARA e nomeia
 * o campo — quem corta é uma decisão de cadastro, não do serializador.
 */
export function alfa(valor: string | null | undefined, tamanho: number, onde: Onde): string {
  if (valor === null || valor === undefined) return " ".repeat(tamanho);
  const v = valor.trim();
  if (v === "") return " ".repeat(tamanho);
  exigirCaractereLimpo(v, onde);
  if (v.length > tamanho) {
    throw new Error(
      `SAGRES — campo caractere LONGO DEMAIS no arquivo ${onde.arquivo}, campo ${onde.campo}: ` +
        `"${v}" tem ${v.length} caracteres e o leiaute reserva ${tamanho}. O gerador não trunca ` +
        `em silêncio (cortaria um dado fiscal). Corrija o cadastro.`
    );
  }
  return v.padEnd(tamanho, " ");
}

/**
 * Campo NUMÉRICO inteiro de largura fixa: só dígitos, zeros à esquerda.
 * `null`/vazio → tudo zeros (campo numérico não exigido, layout §).
 */
export function numerico(valor: string | number | null | undefined, tamanho: number, onde: Onde): string {
  if (valor === null || valor === undefined) return "0".repeat(tamanho);
  const so = String(valor).replace(/\D/g, "");
  if (so === "") return "0".repeat(tamanho);
  if (so.length > tamanho) {
    throw new Error(
      `SAGRES — número LONGO DEMAIS no arquivo ${onde.arquivo}, campo ${onde.campo}: "${valor}" ` +
        `tem ${so.length} dígitos e o leiaute reserva ${tamanho}. Zeros à esquerda sobrevivem porque ` +
        `isto é TEXTO — mas dígito significativo a mais é dado errado, não formatação.`
    );
  }
  return so.padStart(tamanho, "0");
}

/**
 * Campo VALOR (monetário) de largura fixa: `13 int + "," + 2 dec` num campo de 16.
 * A VÍRGULA ocupa 1 posição. A conversão de borda (ponto→vírgula) acontece SÓ AQUI — o `Money` é
 * compartilhado com o resto do razão (que usa PONTO) e nunca muda.
 */
export function valor(v: Money | null | undefined, tamanho: number, onde: Onde): string {
  // null/vazio → zeros com a vírgula no lugar (ex.: 16 → "0000000000000,00").
  const comVirgula = v === null || v === undefined ? "0,00" : v.toFixed(2).replace(".", ","); // "2547625.21" → "2547625,21"
  if (comVirgula.length > tamanho) {
    throw new Error(
      `SAGRES — valor LONGO DEMAIS no arquivo ${onde.arquivo}, campo ${onde.campo}: "${comVirgula}" ` +
        `ocupa ${comVirgula.length} posições e o leiaute reserva ${tamanho} (${tamanho - 3} inteiros + ` +
        `vírgula + 2 decimais).`
    );
  }
  return comVirgula.padStart(tamanho, "0");
}

/** Data ddmmaaaa (8 posições). Sempre UTC — a data do FATO, nunca o fuso de quem gera. */
export function data(d: Date | null | undefined, onde: Onde): string {
  if (d === null || d === undefined) return "0".repeat(8);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`SAGRES — DATA inválida no arquivo ${onde.arquivo}, campo ${onde.campo}.`);
  }
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const aaaa = String(d.getUTCFullYear()).padStart(4, "0");
  return `${dd}${mm}${aaaa}`;
}

/** RESERVADO AO TCE = zeros (layout: "= ZEROS"). */
export function zeros(tamanho: number): string {
  return "0".repeat(tamanho);
}
