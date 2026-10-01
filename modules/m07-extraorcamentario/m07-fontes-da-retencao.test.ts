import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Decimal } from "../../packages/contracts/index.js";
import {
  conferirRegrasDoISS,
  lerAliquotaEMinimoDaIN2110,
  lerAnexoIDaIN1234,
  lerBasesMinimasDaIN2110,
  lerServicosDaIN2110,
  montarListaDoISS,
  normalizarSubitem,
  REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA,
} from "./fontes-da-retencao.js";

/**
 * V24 — os leitores das fontes oficiais, conferidos por caminhos INDEPENDENTES do próprio leitor:
 * a aritmética das colunas, a extração em modo tabela registrada no relatório de fontes, a sequência dos
 * numerais romanos, o percentual por extenso e a extração em texto corrido do PDF da lei municipal.
 */

const ler = (p: string): string => readFileSync(p, "utf8");
const RF = "docs/oficial/receita-federal/";
const ESP = "docs/oficial/esperanca-pb/";

describe("V24 — Anexo I da IN RFB 1.234/2012", () => {
  const linhas = lerAnexoIDaIN1234(ler(`${RF}in-rfb-1234-anexo-I.txt`));

  it("tem as 9 naturezas, e cada uma fecha: IR + CSLL + COFINS + PIS = percentual aplicado (coluna 06)", () => {
    expect(linhas).toHaveLength(9);
    for (const l of linhas) expect(l.ir.plus(l.csll).plus(l.cofins).plus(l.pis).equals(l.total), l.codigoReceita).toBe(true);
  });

  it("coluna 02 (IR) por código é a da extração em modo tabela registrada no relatório de fontes", () => {
    // V23-RELATORIO-DE-FONTES §1.12 (pdftotext -table, outro modo de extração).
    const esperado: Record<string, string> = { "6147": "1.2", "9060": "0.24", "8739": "0.24", "8767": "1.2", "6175": "2.4", "8850": "2.4", "8863": "0", "6188": "2.4", "6190": "4.8" };
    expect(Object.fromEntries(linhas.map((l) => [l.codigoReceita, l.ir.toString()]))).toEqual(esperado);
  });

  it("a natureza vem inteira: começa e termina onde a do relatório começa e termina", () => {
    const n = (c: string): string => linhas.find((l) => l.codigoReceita === c)!.natureza;
    expect(n("6147")).toMatch(/^● Alimentação;.*● Mercadorias e bens em geral\.$/);
    expect(n("6190")).toMatch(/^● Serviços de abastecimento de água;.*● Demais serviços\.$/);
  });
});

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };
const deRomano = (r: string): number => [...r].reduce((s, c, i, a) => (ROMANOS[c]! < (ROMANOS[a[i + 1] ?? ""] ?? 0) ? s - ROMANOS[c]! : s + ROMANOS[c]!), 0);

describe("V24 — IN RFB 2.110/2022 (retenção previdenciária)", () => {
  const texto = ler(`${RF}in-rfb-2110-2022-compilado.txt`);

  it("os arts. 111 e 112 têm 6 e 24 incisos, em sequência; só o 111-III é construção civil", () => {
    const s = lerServicosDaIN2110(texto);
    for (const [art, n] of [[111, 6], [112, 24]] as const) {
      const doArt = s.filter((x) => x.artigo === art);
      expect(doArt.map((x) => deRomano(x.inciso))).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
    expect(s.filter((x) => x.construcaoCivil).map((x) => x.codigo)).toEqual(["111-III"]);
    expect(s.filter((x) => x.somenteCessaoDeMaoDeObra)).toHaveLength(24);
  });

  it("os nomes conferem com o resumo do relatório de fontes (§2.2)", () => {
    const s = lerServicosDaIN2110(texto);
    const nome = (c: string): string => s.find((x) => x.codigo === c)!.descricao;
    expect(nome("111-I")).toBe("limpeza, conservação ou zeladoria");
    expect(nome("111-II")).toBe("vigilância ou segurança");
    expect(nome("112-XIV")).toBe("manutenção de instalações, de máquinas ou de equipamentos");
    expect(nome("112-XXIV")).toBe("telefonia ou de telemarketing");
  });

  it("bases mínimas: 4 do art. 117 e 6 do art. 118, II — e o número bate com o escrito por extenso", () => {
    const b = lerBasesMinimasDaIN2110(texto);
    expect(b.map((x) => x.codigo)).toEqual(["117-I", "117-II", "117-III", "117-IV", "118-II-a", "118-II-b-1", "118-II-b-2", "118-II-b-3", "118-II-b-4", "118-II-b-5"]);
    const UNIDADES: Record<string, number> = { dez: 10, quinze: 15, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, oitenta: 80, cinco: 5 };
    const porExtenso = (s: string): number => s.split(" e ").reduce((t, p) => t + UNIDADES[p.trim()]!, 0);
    for (const x of b) expect(x.percentual.times(100).toNumber(), x.codigo).toBe(porExtenso(x.extenso));
    expect(b.find((x) => x.codigo === "117-II")!.descricao).toBe("limpeza hospitalar");
  });

  it("alíquota de 11% (art. 110) e mínimo de R$ 10,00 (art. 238)", () => {
    const p = lerAliquotaEMinimoDaIN2110(texto);
    expect(p.aliquota.toString()).toBe("0.11");
    expect(p.valorMinimo.toFixed(2)).toBe("10.00");
  });
});

describe("V24 — lista de serviços do ISS de Esperança (LC 80/2017 com a LC 132/2025)", () => {
  const lei = ler(`${ESP}esperanca-alteracao.txt`);
  const descricoes = ler(`${ESP}esperanca-lc132-2025-anexoI-descricoes-DERIVADO.csv`);
  const marcas = ler(`${ESP}esperanca-lc132-2025-anexoI-colunas-DERIVADO.csv`);

  it("cada alínea do art. 62, I está no texto da lei com o percentual da regra — e um trecho alterado é recusado", () => {
    expect(() => conferirRegrasDoISS(lei, REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA)).not.toThrow();
    const adulterada = REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA.map((r, i) => (i === 3 ? { ...r, aliquota: new Decimal("0.035") } : r));
    expect(() => conferirRegrasDoISS(lei, adulterada)).toThrow(/percentual do trecho/);
    const inventada = [...REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA, { itens: ["9"], subitens: [], aliquota: new Decimal("0.01"), trecho: "g) 1% (um por cento) para hospedagem" }];
    expect(() => conferirRegrasDoISS(lei, inventada)).toThrow(/não encontrado/);
  });

  it("os subitens das descrições (extração por texto) são os mesmos das marcas (extração por posição das marcas)", () => {
    const daDescricao = descricoes.split(/\r?\n/).slice(1).filter((l) => l !== "" && !/;VETADO\.?$/.test(l)).map((l) => l.split(";")[0]);
    const codigos = marcas.split(/\r?\n/).slice(1).filter((l) => l !== "").map((l) => l.split(";")[0]!);
    const dasMarcas = codigos.map(normalizarSubitem).filter((c) => c !== null);
    expect([...daDescricao].sort()).toEqual([...dasMarcas].sort());
    // As duas marcas sem código ficam nas linhas de cabeçalho do item 3 (pág. 8) e do item 17 (pág. 10,
    // y = 322, a altura do código "17" na extração por posição).
    expect(codigos.filter((c) => normalizarSubitem(c) === null)).toEqual(["SEM_CODIGO_p8_y716", "SEM_CODIGO_p10_y322"]);
  });

  it("cada descrição contém o trecho que a extração em texto corrido pôs na linha do código", () => {
    const secao = lei.slice(lei.indexOf("ANEXO I – LISTA DE SERVIÇOS"), lei.indexOf("ANEXO II TAXA"));
    const norm = (s: string): string => s.replace(/\s+/g, " ").replace(/-/g, "").trim();
    let conferidas = 0;
    for (const linha of descricoes.split(/\r?\n/).slice(1).filter((l) => l !== "")) {
      const [sub, desc] = linha.split(";") as [string, string];
      const [i, s] = sub.split(".");
      const formas = [sub, `${i}.${Number(s)}`];
      const naLei = secao.split(/\r?\n/).find((l) => formas.some((f) => l.startsWith(`${f} `)));
      if (naLei === undefined) continue;
      // A linha do código pode repetir o código ("16.02 16.02 - Outros...") e termina com as marcas "x".
      const cauda = norm(
        naLei
          .replace(/^\S+\s+/, "")
          .replace(/^\d{1,2}\.\d{1,2}\s*/, "")
          .replace(/^[-–]\s*/, "")
          .replace(/(\s+x)+\s*$/, "")
      );
      if (cauda.length < 4) continue;
      expect(norm(desc).replace(/,/g, ""), sub).toContain(cauda.replace(/,/g, "").replace(/;/g, ""));
      conferidas++;
    }
    expect(conferidas).toBeGreaterThan(150);
  });

  it("monta 200 subitens (205 menos 5 vetados) com a alíquota do art. 62 e um único local de incidência cada", () => {
    const l = montarListaDoISS(descricoes, marcas, REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA);
    expect(l).toHaveLength(200);
    const de = (s: string) => l.find((x) => x.subitem === s)!;
    expect(de("1.03").aliquota.toString()).toBe("0.02");
    expect(de("10.05").aliquota.toString()).toBe("0.02");
    expect(de("10.01").aliquota.toString()).toBe("0.05");
    expect(de("4.01").aliquota.toString()).toBe("0.02");
    expect(de("8.02").aliquota.toString()).toBe("0.03");
    expect(de("21.01").aliquota.toString()).toBe("0.036");
    expect(de("7.10").aliquota.toString()).toBe("0.05");
    // Locais conferidos à vista nas páginas 8 e 9 do Quinzenário nº 206.
    expect(de("7.02").localDeIncidencia).toBe("LOCAL_DA_PRESTACAO");
    expect(de("10.04").localDeIncidencia).toBe("ESTABELECIMENTO_DO_TOMADOR");
    expect(de("17.05").localDeIncidencia).toBe("ESTABELECIMENTO_DO_TOMADOR");
    expect(de("12.13").localDeIncidencia).toBe("ESTABELECIMENTO_DO_PRESTADOR");
    expect(de("11.02").marcadoRetencaoNaFonte).toBe(true);
    expect(de("11.01").marcadoRetencaoNaFonte).toBe(false);
  });

  it("subitem com duas marcas de domicílio é recusado, não escolhido", () => {
    const dupla = marcas.replace(/^1\.01;x;;;$/m, "1.01;x;x;;");
    expect(() => montarListaDoISS(descricoes, dupla, REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA)).toThrow(/1\.01: 2 marcas/);
  });
});
