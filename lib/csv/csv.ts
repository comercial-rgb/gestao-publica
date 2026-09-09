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

function celula(valor: string): string {
  if (/[;"\r\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
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
