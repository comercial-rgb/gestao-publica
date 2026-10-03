import { describe, expect, it } from "vitest";
import * as LEIAUTES from "./layout-2026v11.js";
import { ABRANGENCIA_DO_SAGRES, aplicarAbrangencia, chaveDaConta, decidirArquivo, posicaoDoCampo, tabelaDoArquivo, type ArquivoDoPacote, type ContextoDasUgs } from "./abrangencia.js";

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

const ctx = (c: Partial<ContextoDasUgs>): ContextoDasUgs => ({ operadas: 2, pedidaEhAPrefeitura: true, ugPedida: PREF, ugDaUo: VINCULOS, ugDaConta: new Map(), ...c });
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

  it("t8: duas UGs — sem vínculo (extras, receita, ordenador) fica fora; contas e transferências entram para recortar", () => {
    const fora = (t: string): string | null => {
      const d = decidirArquivo(t, DUAS_PELA_PREFEITURA);
      return d.incluir ? null : d.regra;
    };
    expect(fora("DespesaExtra")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("ReceitaOrcamentaria")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("CadastroContaBancaria")).toBeNull();
    expect(fora("TransfConcedida")).toBeNull();
    expect(fora("Veiculos")).toBeNull();
    expect(fora("NormasOrcamentarias")).toBeNull();
  });

  // ── V33 — as contas bancárias pela conta da linha (titular declarado) ──
  const CONTA_PREF = chaveDaConta("001", "12340", "111111");
  const CONTA_CAM = chaveDaConta("104", "05678", "222222");
  const comContas = (c: Partial<ContextoDasUgs>): ContextoDasUgs => ({ ...ctx(c), ugDaConta: new Map([[CONTA_PREF, PREF], [CONTA_CAM, CAM]]) });
  /** Uma linha de saldo mensal: conta @7-19, agência @20-25, banco @26-28 (posições do leiaute real). */
  const saldo = (conta: string, agencia: string, banco: string): string => linha(70, { conta: [7, conta.padStart(13, "0")], ag: [20, agencia.padStart(6, "0")], banco: [26, banco] });

  it("t11: o saldo das contas se reparte pela conta da linha — zeros à esquerda não mudam a conta", () => {
    expect(posicaoDoCampo("SaldoMensal", "numContaBancaria")).toEqual({ ini: 7, fim: 19 });
    const s = arquivo("201001092026SaldoMensal.txt", [saldo("111111", "12340", "001"), saldo("222222", "5678", "104")]);
    const daPref = aplicarAbrangencia([s], comContas({})).arquivos[0];
    const daCam = aplicarAbrangencia([s], comContas({ pedidaEhAPrefeitura: false, ugPedida: CAM })).arquivos[0];
    expect(daPref?.registros).toBe(1);
    expect(daCam?.registros).toBe(1);
    expect(linhasDe(daPref ?? arquivo("x", [])).map((l) => l.slice(6, 19))).toEqual(["0000000111111"]);
  });

  it("t12: conta sem titular declarado recusa o arquivo, nomeando a conta; e a transferência que a cita sai junto", () => {
    const s = arquivo("201001092026CadastroContaBancaria.txt", [linha(120, { conta: [7, "0000000999999"], banco: [21, "237"], ag: [24, "000001"] })]);
    const t = arquivo("201001092026TransfConcedida.txt", [linha(80, {})]);
    const r = aplicarAbrangencia([t, s], comContas({}));
    expect(r.arquivos).toEqual([]);
    const fora = new Map(r.fora.map((f) => [f.arquivo, f]));
    expect(fora.get("CadastroContaBancaria")?.regra).toBe("CONTA_SEM_TITULAR_DECLARADO");
    expect(fora.get("CadastroContaBancaria")?.detalhe).toMatch(/237\/1\/999999/);
    expect(fora.get("TransfConcedida")?.detalhe).toMatch(/cita registros de CadastroContaBancaria/);
  });

  it("t13: movimentação entre contas de UGs diferentes recusa o arquivo (o leiaute exige a mesma UG)", () => {
    const m = arquivo("201001092026MovimentacaoEntreContasBancarias.txt", [
      linha(80, { b1: [7, "001"], a1: [10, "012340"], c1: [16, "00000000111111"], b2: [31, "104"], a2: [34, "005678"], c2: [40, "0000000222222"] }),
    ]);
    const r = aplicarAbrangencia([m], comContas({}));
    expect(r.arquivos).toEqual([]);
    expect(r.fora[0]?.detalhe).toMatch(/unidades gestoras diferentes/);
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
