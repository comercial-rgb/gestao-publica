import { describe, expect, it } from "vitest";
import * as LEIAUTES from "./layout-2026v11.js";
import { ABRANGENCIA_DO_SAGRES, aplicarAbrangencia, decidirArquivo, posicaoDoCampo, tabelaDoArquivo, type ArquivoDoPacote, type ContextoDasUgs } from "./abrangencia.js";

/**
 * V33 — A ABRANGÊNCIA DE CADA ARQUIVO DIANTE DAS UGS DO DIA.
 *
 * A fonte da lista de tabelas e das posições é o LEIAUTE (as constantes `LAYOUT_*`), não a própria tabela de
 * abrangência: uma tabela nova no leiaute sem abrangência declarada acusa aqui, e uma abrangência para tabela que
 * não existe também. As decisões vêm com N=2 UGs e N=2 unidades — com uma só, "a linha é desta UG" é verdade por
 * vacuidade.
 */

const PREF = "201001";
const CAM = "201002";
const UO_PREF = "02001";
const UO_CAM = "01001";
const VINCULOS: ReadonlyMap<string, string> = new Map([
  [UO_PREF, PREF],
  [UO_CAM, CAM],
]);

const ctx = (c: Partial<ContextoDasUgs>): ContextoDasUgs => ({ operadas: 2, pedidaEhAPrefeitura: true, ugPedida: PREF, ugDaUo: VINCULOS, ...c });
const UMA_PREFEITURA = ctx({ operadas: 1 });
const DUAS_PELA_PREFEITURA = ctx({});
const DUAS_PELA_CAMARA = ctx({ pedidaEhAPrefeitura: false, ugPedida: CAM });
const SO_A_CAMARA = ctx({ operadas: 1, pedidaEhAPrefeitura: false, ugPedida: CAM });

/** Uma linha sintética na largura pedida, com valores nas posições (1-indexadas) do leiaute real. */
function linha(largura: number, campos: Readonly<Record<string, readonly [number, string]>>): string {
  const c = Array.from({ length: largura }, () => "x");
  for (const [, [ini, valor]] of Object.entries(campos)) for (let i = 0; i < valor.length; i++) c[ini - 1 + i] = valor[i] ?? "x";
  return c.join("");
}
const arquivo = (nome: string, linhas: readonly string[]): ArquivoDoPacote => ({ nome, conteudo: Buffer.from(linhas.map((l) => `${l}\r\n`).join(""), "utf8"), registros: linhas.length });
const linhasDe = (a: ArquivoDoPacote): string[] => a.conteudo.toString("utf8").split("\r\n").filter((l) => l !== "");

function entidadesDoLeiaute(): Set<string> {
  const s = new Set<string>();
  for (const v of Object.values(LEIAUTES)) {
    if (typeof v === "object" && v !== null && "entidade" in v && "campos" in v) s.add(String((v as { entidade: string }).entidade));
  }
  return s;
}

/** Empenho da unidade `uo`, credor `doc`, número `n`. */
const empenho = (uo: string, doc: string, n: string): string => linha(700, { ug: [1, PREF], uo: [11, uo], n: [16, n], doc: [597, doc] });

describe("abrangência do SAGRES por unidade gestora", () => {
  it("t1: toda tabela do leiaute tem abrangência declarada, e nenhuma abrangência sobra", () => {
    const doLeiaute = entidadesDoLeiaute();
    expect(doLeiaute.size).toBe(58);
    const declaradas = new Set(Object.keys(ABRANGENCIA_DO_SAGRES));
    expect([...doLeiaute].filter((e) => !declaradas.has(e)), "tabelas sem abrangência").toEqual([]);
    expect([...declaradas].filter((e) => !doLeiaute.has(e)), "abrangência de tabela inexistente").toEqual([]);
  });

  it("t2: todo campo que o recorte lê existe no leiaute da tabela (senão a recusa seria a única saída)", () => {
    const faltam: string[] = [];
    for (const [tabela, a] of Object.entries(ABRANGENCIA_DO_SAGRES)) {
      const r = a.recorte;
      if (r.tipo === "POR_UO_NA_LINHA" && posicaoDoCampo(tabela, r.campo) === null) faltam.push(`${tabela}.${r.campo}`);
      if (r.tipo === "CONSOLIDADO_UG_NA_LINHA" && (posicaoDoCampo(tabela, r.campoUo) === null || posicaoDoCampo(tabela, "codUnidadeGestora") === null)) faltam.push(`${tabela}.${r.campoUo}`);
      if (r.tipo === "DERIVADO" && (posicaoDoCampo(tabela, r.campo) === null || posicaoDoCampo(r.de, r.campoDe) === null)) faltam.push(`${tabela}.${r.campo}`);
    }
    expect(faltam).toEqual([]);
    expect(posicaoDoCampo("Empenhos", "codUnidadeOrcamentaria")).toEqual({ ini: 11, fim: 15 });
  });

  it("t3: com uma UG operada (a Prefeitura), tudo entra — byte a byte o mesmo conteúdo", () => {
    for (const tabela of Object.keys(ABRANGENCIA_DO_SAGRES)) expect(decidirArquivo(tabela, UMA_PREFEITURA), tabela).toEqual({ incluir: true });
    const e = arquivo("20100114092026Empenhos.txt", [empenho(UO_PREF, "11111111000111", "1"), empenho("09999", "22222222000122", "2")]);
    const r = aplicarAbrangencia([e], UMA_PREFEITURA);
    expect(r.fora).toEqual([]);
    expect(r.arquivos[0]?.conteudo.equals(e.conteudo)).toBe(true);
  });

  it("t4: duas UGs — as linhas de empenho se repartem pela unidade da linha, sem sobra e sem repetição", () => {
    const linhas = [empenho(UO_PREF, "11111111000111", "1"), empenho(UO_CAM, "22222222000122", "2"), empenho(UO_PREF, "33333333000133", "3")];
    const e = arquivo("20100114092026Empenhos.txt", linhas);
    const daPref = aplicarAbrangencia([e], DUAS_PELA_PREFEITURA).arquivos[0];
    const daCam = aplicarAbrangencia([e], DUAS_PELA_CAMARA).arquivos[0];
    if (daPref === undefined || daCam === undefined) throw new Error("um dos lados não saiu");
    expect(linhasDe(daPref).map((l) => l.slice(10, 15))).toEqual([UO_PREF, UO_PREF]);
    expect(linhasDe(daCam).map((l) => l.slice(10, 15))).toEqual([UO_CAM]);
    expect(daPref.registros + daCam.registros).toBe(linhas.length);
    expect([...linhasDe(daPref), ...linhasDe(daCam)].sort()).toEqual([...linhas].sort());
  });

  it("t5: unidade sem UG declarada recusa o arquivo inteiro, nomeando o código — e quem o cita sai junto", () => {
    const e = arquivo("20100114092026Empenhos.txt", [empenho(UO_PREF, "11111111000111", "1"), empenho("07007", "22222222000122", "2")]);
    const l = arquivo("20100114092026Liquidacao.txt", [linha(300, { uo: [11, UO_PREF] })]);
    const r = aplicarAbrangencia([l, e], DUAS_PELA_PREFEITURA);
    expect(r.arquivos).toEqual([]);
    const fora = new Map(r.fora.map((f) => [f.arquivo, f]));
    expect(fora.get("Empenhos")?.regra).toBe("UNIDADE_SEM_UG_DECLARADA");
    expect(fora.get("Empenhos")?.detalhe).toMatch(/07007/);
    expect(fora.get("Liquidacao")?.detalhe).toMatch(/cita registros de Empenhos/);
  });

  it("t6: a dotação vai pela Prefeitura com a UG DONA da unidade em cada linha; a Câmara não a remete", () => {
    const d = arquivo("201001092026Dotacao.txt", [linha(200, { ug: [1, PREF], uo: [11, UO_PREF] }), linha(200, { ug: [1, PREF], uo: [11, UO_CAM] })]);
    const pela = aplicarAbrangencia([d], DUAS_PELA_PREFEITURA).arquivos[0];
    if (pela === undefined) throw new Error("a dotação não saiu");
    expect(linhasDe(pela).map((l) => `${l.slice(0, 6)}|${l.slice(10, 15)}`)).toEqual([`${PREF}|${UO_PREF}`, `${CAM}|${UO_CAM}`]);
    expect(linhasDe(pela).every((l) => l.length === 200)).toBe(true);
    const r = aplicarAbrangencia([d], DUAS_PELA_CAMARA);
    expect(r.arquivos).toEqual([]);
    expect(r.fora[0]?.regra).toBe("ARQUIVO_SO_DA_PREFEITURA");
  });

  it("t7: o fornecedor fica no arquivo da UG cujo empenho o cita", () => {
    const e = arquivo("20100114092026Empenhos.txt", [empenho(UO_PREF, "11111111000111", "1"), empenho(UO_CAM, "22222222000122", "2")]);
    const forn = arquivo("20100114092026Fornecedores.txt", [linha(107, { doc: [7, "11111111000111"] }), linha(107, { doc: [7, "22222222000122"] })]);
    const daCam = aplicarAbrangencia([forn, e], DUAS_PELA_CAMARA).arquivos.find((a) => a.nome.endsWith("Fornecedores.txt"));
    expect(daCam !== undefined ? linhasDe(daCam).map((l) => l.slice(6, 20)) : null).toEqual(["22222222000122"]);
  });

  it("t8: duas UGs — sem vínculo (contas, extras) fica fora; o que cita a conta sai junto; o filtrado no modelo entra", () => {
    const fora = (t: string): string | null => {
      const d = decidirArquivo(t, DUAS_PELA_PREFEITURA);
      return d.incluir ? null : d.regra;
    };
    expect(fora("CadastroContaBancaria")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("DespesaExtra")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("TransfConcedida")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("Veiculos")).toBeNull();
    expect(fora("NormasOrcamentarias")).toBeNull();
  });

  it("t9: a Câmara não remete o arquivo do ente — com uma ou com duas UGs", () => {
    for (const c of [SO_A_CAMARA, DUAS_PELA_CAMARA]) {
      const d = decidirArquivo("Dotacao", c);
      expect(d).toMatchObject({ incluir: false, regra: "ARQUIVO_SO_DA_PREFEITURA" });
      if (!d.incluir) expect(d.detalhe).toMatch(/regra do leiaute/);
    }
    expect(decidirArquivo("Empenhos", SO_A_CAMARA)).toEqual({ incluir: true });
  });

  it("t10: tabela sem abrangência declarada fica fora, nomeada; a tabela sai do nome nas três periodicidades e no PDF", () => {
    expect(decidirArquivo("TabelaNova", UMA_PREFEITURA)).toMatchObject({ incluir: false, regra: "TABELA_SEM_ABRANGENCIA" });
    expect(tabelaDoArquivo("20107814092026Empenhos.txt")).toBe("Empenhos");
    expect(tabelaDoArquivo("201078092026SaldoMensal.txt")).toBe("SaldoMensal");
    expect(tabelaDoArquivo("2010782026Programas.txt")).toBe("Programas");
    expect(tabelaDoArquivo("Decreto201078000012026.pdf")).toBe("DecretoseOficios");
  });
});
