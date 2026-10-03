import { describe, expect, it } from "vitest";
import * as LEIAUTES from "./layout-2026v11.js";
import { ABRANGENCIA_DO_SAGRES, aplicarAbrangencia, decidirArquivo, tabelaDoArquivo, type ContextoDasUgs } from "./abrangencia.js";

/**
 * V33 — A ABRANGÊNCIA DE CADA ARQUIVO DIANTE DAS UGS DO DIA.
 *
 * A fonte da lista de tabelas é o LEIAUTE (as constantes `LAYOUT_*`), não a própria tabela de abrangência: uma
 * tabela nova no leiaute sem abrangência declarada acusa aqui, e uma abrangência para tabela que não existe também.
 * As decisões vêm com N=2 UGs — com uma só, "o arquivo é desta UG" é verdade por vacuidade.
 */

const UMA_PREFEITURA: ContextoDasUgs = { operadas: 1, pedidaEhAPrefeitura: true };
const DUAS_PELA_PREFEITURA: ContextoDasUgs = { operadas: 2, pedidaEhAPrefeitura: true };
const DUAS_PELA_CAMARA: ContextoDasUgs = { operadas: 2, pedidaEhAPrefeitura: false };
const SO_A_CAMARA: ContextoDasUgs = { operadas: 1, pedidaEhAPrefeitura: false };

function entidadesDoLeiaute(): Set<string> {
  const s = new Set<string>();
  for (const v of Object.values(LEIAUTES)) {
    if (typeof v === "object" && v !== null && "entidade" in v && "campos" in v) s.add(String((v as { entidade: string }).entidade));
  }
  return s;
}

describe("abrangência do SAGRES por unidade gestora", () => {
  it("t1: toda tabela do leiaute tem abrangência declarada, e nenhuma abrangência sobra", () => {
    const doLeiaute = entidadesDoLeiaute();
    expect(doLeiaute.size).toBe(58);
    const declaradas = new Set(Object.keys(ABRANGENCIA_DO_SAGRES));
    expect([...doLeiaute].filter((e) => !declaradas.has(e)), "tabelas sem abrangência").toEqual([]);
    expect([...declaradas].filter((e) => !doLeiaute.has(e)), "abrangência de tabela inexistente").toEqual([]);
  });

  it("t2: com uma UG operada (a Prefeitura), tudo entra — o comportamento anterior", () => {
    for (const tabela of Object.keys(ABRANGENCIA_DO_SAGRES)) expect(decidirArquivo(tabela, UMA_PREFEITURA), tabela).toEqual({ incluir: true });
  });

  it("t3: duas UGs, pela Prefeitura — sai o que não tem vínculo; fica o filtrado e o consolidado do ente", () => {
    const fora = (t: string): string | null => {
      const d = decidirArquivo(t, DUAS_PELA_PREFEITURA);
      return d.incluir ? null : d.regra;
    };
    expect(fora("Empenhos")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("Pagamentos")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("CadastroContaBancaria")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    // A dotação vai pela Prefeitura, mas cada linha leva a UG dona — sem o vínculo, fora.
    expect(fora("Dotacao")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    expect(fora("AtualizacaoOrcamentaria")).toBe("RECORTE_POR_UG_INDISPONIVEL");
    // O consolidado com o código de quem envia entra.
    expect(fora("NormasOrcamentarias")).toBeNull();
    expect(fora("Programas")).toBeNull();
    // O que tem a UG no modelo entra.
    expect(fora("Veiculos")).toBeNull();
    expect(fora("EstoqueFarmacia")).toBeNull();
  });

  it("t4: o que cita um arquivo que ficou fora fica junto, com o motivo nomeando o citado", () => {
    const d = decidirArquivo("TransfConcedida", DUAS_PELA_PREFEITURA);
    expect(d.incluir).toBe(false);
    if (!d.incluir) expect(d.detalhe).toMatch(/cita registros de CadastroContaBancaria/);
    const f = decidirArquivo("RelacionamentoLiquidacaoCodigoAgrupamentoFolhaPagamento", DUAS_PELA_PREFEITURA);
    expect(f.incluir).toBe(false);
    if (!f.incluir) expect(f.detalhe).toMatch(/cita registros de Empenhos/);
    // Com uma UG, a mesma transferência entra (a conta entra).
    expect(decidirArquivo("TransfConcedida", UMA_PREFEITURA)).toEqual({ incluir: true });
  });

  it("t5: a Câmara não remete o arquivo do ente — com uma ou com duas UGs", () => {
    for (const ctx of [SO_A_CAMARA, DUAS_PELA_CAMARA]) {
      const d = decidirArquivo("Dotacao", ctx);
      expect(d.incluir).toBe(false);
      if (!d.incluir) {
        expect(d.regra).toBe("ARQUIVO_SO_DA_PREFEITURA");
        expect(d.detalhe).toMatch(/regra do leiaute/);
      }
      expect(decidirArquivo("NormasOrcamentarias", ctx).incluir).toBe(false);
    }
    // Só a Câmara escriturada: a base é dela, e os empenhos entram.
    expect(decidirArquivo("Empenhos", SO_A_CAMARA)).toEqual({ incluir: true });
    // Com duas, os da Câmara saem por falta de vínculo, e a frota dela entra.
    expect(decidirArquivo("Veiculos", DUAS_PELA_CAMARA)).toEqual({ incluir: true });
  });

  it("t6: tabela sem abrangência declarada fica fora, nomeada", () => {
    const d = decidirArquivo("TabelaNova", UMA_PREFEITURA);
    expect(d).toMatchObject({ incluir: false, regra: "TABELA_SEM_ABRANGENCIA" });
  });

  it("t7: a tabela sai do nome do arquivo nas três periodicidades e no PDF do decreto", () => {
    expect(tabelaDoArquivo("20107814092026Empenhos.txt")).toBe("Empenhos");
    expect(tabelaDoArquivo("201078092026SaldoMensal.txt")).toBe("SaldoMensal");
    expect(tabelaDoArquivo("2010782026Programas.txt")).toBe("Programas");
    expect(tabelaDoArquivo("Decreto201078000012026.pdf")).toBe("DecretoseOficios");
  });

  it("t8: dois arquivos da mesma tabela saem os dois, com UMA recusa; os demais ficam", () => {
    const r = aplicarAbrangencia(
      [{ nome: "20107814092026Empenhos.txt" }, { nome: "20107815092026Empenhos.txt" }, { nome: "201078092026Veiculos.txt" }],
      DUAS_PELA_PREFEITURA
    );
    expect(r.arquivos.map((a) => a.nome)).toEqual(["201078092026Veiculos.txt"]);
    expect(r.fora.map((f) => f.arquivo)).toEqual(["Empenhos"]);
  });
});
