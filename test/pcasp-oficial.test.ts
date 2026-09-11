import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lerEntradasDoZip, ziparEntradas } from "../packages/zip/index.js";
import { lerPlanilha, primeiraAba, indiceDaColuna } from "../packages/planilha/index.js";
import {
  ARQUIVO,
  carregarPlanoOficial,
  codigoOficialDoPai,
  ehRetificadora,
  formatarCodigo,
  linhasDoExercicio,
  naturezaDe,
  nivelDe,
  planoOficial,
} from "../prisma/seed/oficial/pcasp-oficial.js";
import {
  lerOficial,
  manifesto,
  PASTA_OFICIAL,
  procedenciaDe,
} from "../prisma/seed/oficial/procedencia.js";
import {
  CONTAS_FIXTURE_A_CONFIRMAR,
  CONTAS_PCASP_STN,
} from "../prisma/seed/pcasp.js";

/**
 * ═══ O PLANO DE CONTAS OFICIAL — LIDO, CONFERIDO E DERIVADO ═══
 *
 * ⚠️ POR QUE ESTE ARQUIVO É EXTENSO. O que ele vigia vira LANÇAMENTO CONTÁBIL. Um erro de
 * leitura aqui não aparece como exceção: aparece como uma conta com o nome de outra, ou uma
 * depreciação somando onde deveria subtrair — e só no balanço, meses depois.
 *
 * ⚠️ E ELE MEDE AS DUAS ARMADILHAS DO ARQUIVO OFICIAL, em vez de acreditar nelas:
 * descrições quebradas em duas linhas e contas repetidas. As duas estão no `Pcasp_2025.xlsx`
 * publicado pelo TCE-PB, e as duas produzem dado errado quando lidas ingenuamente.
 */

describe("o contêiner: ler o que se escreveu", () => {
  it("ida e volta — o que `ziparEntradas` escreve, `lerEntradasDoZip` devolve igual", () => {
    // ⚠️ A IDA E VOLTA É A PROVA MAIS FORTE DISPONÍVEL AQUI: as duas pontas do formato são
    // escritas neste repositório, e um erro de deslocamento de bytes numa delas só não
    // apareceria se a outra tivesse o MESMO erro na direção oposta — o que a comparação
    // contra bytes conhecidos abaixo descarta.
    const conteudo = Buffer.from("linha 1\nlinha 2 com acento: ção\n", "utf8");
    const zip = ziparEntradas([
      { nome: "a/b.txt", conteudo },
      { nome: "vazio.txt", conteudo: Buffer.alloc(0) },
    ]);
    const lido = lerEntradasDoZip(zip);
    expect([...lido.keys()].sort()).toEqual(["a/b.txt", "vazio.txt"]);
    expect(lido.get("a/b.txt")?.toString("utf8")).toBe(conteudo.toString("utf8"));
    expect(lido.get("vazio.txt")?.length).toBe(0);
  });

  it("recusa, com nome, o que não é zip", () => {
    expect(() => lerEntradasDoZip(Buffer.from("isto nao e um zip"))).toThrow(/EOCD|zip/i);
  });
});

describe("a planilha: as colunas ausentes não deslocam a linha", () => {
  it("a célula vazia vira coluna vazia, e não some", () => {
    // ⚠️ ESTE É O DEFEITO QUE MATA UM IMPORTADOR DE PLANILHA. O XML de uma linha só traz as
    // células ESCRITAS; quem empilha por ordem de chegada põe o valor de C na coluna B.
    const conteudo = montarXlsx([
      ["A1", "primeira"],
      ["C1", "terceira"],
    ]);
    const linhas = primeiraAba(conteudo);
    expect(linhas[0]).toEqual(["primeira", "", "terceira"]);
  });

  it("a referência da coluna é base-26 sem zero", () => {
    expect(indiceDaColuna("A1")).toBe(0);
    expect(indiceDaColuna("Z9")).toBe(25);
    expect(indiceDaColuna("AA1")).toBe(26);
    expect(indiceDaColuna("BC7")).toBe(54);
  });

  it("o arquivo oficial tem UMA aba e o cabeçalho que o importador espera", () => {
    const { conteudo } = lerOficial(ARQUIVO);
    const abas = lerPlanilha(conteudo);
    expect(abas.size).toBe(1);
    expect(primeiraAba(conteudo)[0]).toEqual([
      "ano_conta",
      "codigo_conta_contabil",
      "descricao_conta_contabil",
      "exige_retencao",
      "exige_receita_extra",
    ]);
  });
});

describe("a procedência é cobrada, não prometida", () => {
  it("todo arquivo oficial em disco confere com o sha256 do MANIFEST", () => {
    const divergentes: string[] = [];
    for (const a of manifesto()) {
      let bytes: Buffer;
      try {
        bytes = readFileSync(join(PASTA_OFICIAL, a.arquivo));
      } catch {
        continue; // arquivo não baixado ainda — o `lerOficial` cobra na hora de usar
      }
      const hash = createHash("sha256").update(bytes).digest("hex");
      if (hash !== a.sha256) divergentes.push(`${a.arquivo}: ${hash} != ${a.sha256}`);
    }
    expect(
      divergentes,
      "um arquivo oficial editado é uma tabela de contas adulterada com aparência de " +
        "procedência. Versão nova do TCE entra como ARQUIVO NOVO, nunca sobrescrevendo."
    ).toEqual([]);
  });

  it("a procedência carrega versão e vigência, não só a URL", () => {
    const p = procedenciaDe(ARQUIVO);
    expect(p.versao).toBeTruthy();
    expect(p.dataPublicacao).toMatch(/^\d{4}(-\d{2})?(-\d{2})?$/);
    expect(p.url).toMatch(/^https:\/\//);
    expect(p.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("arquivo sem entrada no MANIFEST é RECUSADO", () => {
    expect(() => procedenciaDe("planilha-que-alguem-colocou.xlsx")).toThrow(/MANIFEST/);
  });
});

describe("a derivação: o que o arquivo não diz, e como se deduz", () => {
  it("o código de 9 dígitos vira o formato do sistema", () => {
    expect(formatarCodigo("111120000")).toBe("1.1.1.1.2.00.00");
    expect(formatarCodigo("218810103")).toBe("2.1.8.8.1.01.03");
    expect(() => formatarCodigo("1234")).toThrow(/9 dígitos/);
  });

  it("o nível é a posição do último segmento significativo", () => {
    expect(nivelDe("100000000")).toBe(1);
    expect(nivelDe("110000000")).toBe(2);
    expect(nivelDe("111120000")).toBe(5);
    // Os dois últimos grupos são de DOIS dígitos: "111112000" é 1.1.1.1.1.20.00, nível 6.
    expect(nivelDe("111112000")).toBe(6);
    expect(nivelDe("218810103")).toBe(7);
  });

  it("o pai é o ancestral imediato", () => {
    expect(codigoOficialDoPai("218810103")).toBe("218810100");
    expect(codigoOficialDoPai("110000000")).toBe("100000000");
    expect(codigoOficialDoPai("100000000")).toBeNull();
  });

  it("⚠️ A RETIFICADORA INVERTE O SALDO DA CLASSE — e é por isso que o `(-)` importa", () => {
    // Ativo: devedora. Mas a depreciação acumulada é conta do ativo com saldo CREDOR.
    expect(naturezaDe("123810100", "BENS MÓVEIS")).toBe("DEVEDORA");
    expect(naturezaDe("123810100", "(-) DEPRECIAÇÃO ACUMULADA - BENS MÓVEIS")).toBe("CREDORA");
    // Passivo: credora, e a retificadora dele é devedora.
    expect(naturezaDe("222110102", "(-) DESÁGIO DE TÍTULOS")).toBe("DEVEDORA");
    expect(ehRetificadora("(-) AJUSTE DE PERDAS")).toBe(true);
    expect(ehRetificadora("AJUSTE DE PERDAS")).toBe(false);
  });

  it("⚠️ ARMADILHA 1 — a descrição quebrada em duas linhas é COSTURADA de volta", () => {
    // Reproduz o formato exato do arquivo: a continuação vem sem ano na coluna A, e os dois
    // indicadores escorregam para B e C.
    const grade = [
      ["ano_conta", "codigo_conta_contabil", "descricao_conta_contabil", "exige_retencao", "exige_receita_extra"],
      ["2025", "352159900", "OUTRAS DISTRIBUIÇÕES CONSTITUCIONAL OU"],
      ["LEGAL DE RECEITAS", "0", "0"],
      ["2025", "352200000", "TRANSFERÊNCIAS AO FUNDEB", "0", "0"],
    ];
    const linhas = linhasDoExercicio(grade, "2025");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]?.nome).toBe("OUTRAS DISTRIBUIÇÕES CONSTITUCIONAL OU LEGAL DE RECEITAS");
    // E a linha de continuação NÃO virou uma conta fantasma de código "0".
    expect(linhas.map((l) => l.codigo)).toEqual(["352159900", "352200000"]);
  });

  it("⚠️ ARMADILHA 2 — a conta repetida é deduplicada, e a repetição DIVERGENTE estoura", () => {
    const base = ["2025", "100000000", "ATIVO", "0", "0"];
    expect(linhasDoExercicio([base, [...base]], "2025")).toHaveLength(1);
    expect(() =>
      linhasDoExercicio([base, ["2025", "100000000", "ATIVO (OUTRO NOME)", "0", "0"]], "2025")
    ).toThrow(/descrições\s+DIFERENTES/);
  });

  it("analítica é FOLHA — decidida pelo conjunto, não pelo código isolado", () => {
    const grade = [
      ["2025", "100000000", "ATIVO", "0", "0"],
      ["2025", "110000000", "ATIVO CIRCULANTE", "0", "0"],
      ["2025", "111000000", "CAIXA", "0", "0"],
    ];
    const plano = planoOficial(grade, "2025");
    const por = new Map(plano.map((c) => [c.codigo, c]));
    expect(por.get("1.0.0.0.0.00.00")?.analitica).toBe(false);
    expect(por.get("1.1.0.0.0.00.00")?.analitica).toBe(false);
    expect(por.get("1.1.1.0.0.00.00")?.analitica).toBe(true);
    expect(por.get("1.1.1.0.0.00.00")?.codigoPai).toBe("1.1.0.0.0.00.00");
  });
});

describe("o plano oficial de verdade, contra o plano feito à mão", () => {
  const { contas } = carregarPlanoOficial();

  it("traz o plano inteiro de 2025, e a hierarquia fecha", () => {
    expect(contas.length).toBeGreaterThan(7000);
    const codigos = new Set(contas.map((c) => c.codigo));
    const orfas = contas.filter(
      (c) => c.codigoPai !== null && !codigos.has(c.codigoPai)
    );
    expect(orfas.map((c) => c.codigo), "conta com pai inexistente não agrega em balancete").toEqual([]);
    // As oito classes do PCASP, nenhuma a mais nem a menos.
    expect(
      [...new Set(contas.map((c) => c.codigo[0]))].sort()
    ).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
  });

  it("⚠️ NENHUM CÓDIGO USADO PELO PLANO MÍNIMO É INVENTADO — todos existem no oficial", () => {
    const oficial = new Set(contas.map((c) => c.codigo));
    const inventadas = [...CONTAS_PCASP_STN, ...CONTAS_FIXTURE_A_CONFIRMAR]
      .map((c) => c.codigo)
      .filter((c) => !oficial.has(c));
    expect(
      inventadas,
      "estes códigos estão no seed mínimo e NÃO existem no PCASP publicado pelo TCE-PB. " +
        "Um código de conta inventado vira lançamento que o tribunal rejeita."
    ).toEqual([]);
  });

  it("a natureza do saldo derivada bate com a conferida à mão, EXCETO onde o seed errou", () => {
    // ⚠️ A EXCEÇÃO É NOMEADA E ÚNICA. O seed mínimo marcou `6.2.1.2.0.00.00` (RECEITA
    // REALIZADA) como DEVEDORA; a classe 6 é credora e a conta não é retificadora. O
    // `seed:pcasp-oficial` corrige, e esta linha existe para que a correção não passe
    // despercebida — se aparecer uma SEGUNDA divergência, o teste falha nomeando.
    const oficial = new Map(contas.map((c) => [c.codigo, c]));
    const divergentes = [...CONTAS_PCASP_STN, ...CONTAS_FIXTURE_A_CONFIRMAR]
      .filter((h) => {
        const o = oficial.get(h.codigo);
        return o !== undefined && o.naturezaSaldo !== h.naturezaSaldo;
      })
      .map((h) => h.codigo);
    expect(divergentes).toEqual(["6.2.1.2.0.00.00"]);
  });
});

// ── auxiliar ──────────────────────────────────────────────────────────────────

/** Um `.xlsx` mínimo de uma aba, com as células nas referências dadas. */
function montarXlsx(celulas: readonly (readonly [string, string])[]): Buffer {
  const porLinha = new Map<string, string[]>();
  for (const [ref, valor] of celulas) {
    const linha = /\d+$/.exec(ref)?.[0] ?? "1";
    const lista = porLinha.get(linha) ?? [];
    lista.push(`<c r="${ref}" t="inlineStr"><is><t>${valor}</t></is></c>`);
    porLinha.set(linha, lista);
  }
  const linhas = [...porLinha]
    .map(([n, cs]) => `<row r="${n}">${cs.join("")}</row>`)
    .join("");
  const texto = (s: string): Buffer => Buffer.from(s, "utf8");
  return ziparEntradas([
    {
      nome: "xl/workbook.xml",
      conteudo: texto(
        `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
          `<sheets><sheet name="Planilha1" sheetId="1" r:id="rId1"/></sheets></workbook>`
      ),
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      conteudo: texto(
        `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`
      ),
    },
    {
      nome: "xl/worksheets/sheet1.xml",
      conteudo: texto(`<worksheet><sheetData>${linhas}</sheetData></worksheet>`),
    },
  ]);
}
