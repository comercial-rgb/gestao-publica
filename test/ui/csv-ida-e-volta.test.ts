import { describe, expect, it } from "vitest";
import { paraCsv } from "../../lib/csv/csv";

/**
 * V33 — O CSV LIDO DE VOLTA POR UM LEITOR INDEPENDENTE. O leitor abaixo é uma máquina de estados RFC 4180 escrita
 * aqui (separador `;`), e não usa nada de `lib/csv`: conferir o escritor com ele mesmo passaria com qualquer
 * interpretação errada consistente. O que se afirma é o que a planilha vai ver: o mesmo número de colunas em toda
 * linha, as células como estavam (a fórmula neutralizada com o apóstrofo, o negativo intacto) e a contagem de linhas.
 */
function lerCsv(texto: string): string[][] {
  const t = texto.startsWith("﻿") ? texto.slice(1) : texto;
  const linhas: string[][] = [];
  let linha: string[] = [];
  let celula = "";
  let aspas = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i] as string;
    if (aspas) {
      if (c === '"' && t[i + 1] === '"') {
        celula += '"';
        i++;
      } else if (c === '"') aspas = false;
      else celula += c;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === ";") {
      linha.push(celula);
      celula = "";
    } else if (c === "\r" && t[i + 1] === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
      i++;
    } else celula += c;
  }
  if (celula !== "" || linha.length > 0) linhas.push([...linha, celula]);
  return linhas;
}

describe("CSV de ida e volta", () => {
  it("células difíceis voltam iguais, a fórmula volta neutralizada, e toda linha tem as mesmas colunas", () => {
    const colunas = ["Credor", "Histórico", "Valor", "Documento"];
    const linhas = [
      ["Fornecedor; Filial Norte", 'Serviço "especial"\r\ncom quebra', "-1.234,56", "12.345.678/0001-95"],
      ["=HYPERLINK(\"http://x\")", "", "0,00", "123.456.789-09"],
      ["Ação e Saúde ÇÃO", "+cmd", "1.000.000,00", ""],
      // Quebra de linha SEM aspas nem ponto e vírgula: só a regra da quebra a põe entre aspas.
      ["Credor C", "primeira linha\r\nsegunda linha", "10,00", "1"],
    ];
    const lido = lerCsv(paraCsv(colunas, linhas));
    expect(lido).toHaveLength(1 + linhas.length);
    expect(lido.every((l) => l.length === colunas.length)).toBe(true);
    expect(lido[0]).toEqual(colunas);
    expect(lido[1]).toEqual(linhas[0]);
    expect(lido[2]?.[0]).toBe("'=HYPERLINK(\"http://x\")");
    expect(lido[2]?.slice(1)).toEqual(["", "0,00", "123.456.789-09"]);
    expect(lido[3]?.[1]).toBe("'+cmd");
    expect(lido[3]?.[2]).toBe("1.000.000,00");
    expect(lido[4]).toEqual(linhas[3]);
  });
});
