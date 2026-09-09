import { describe, expect, it } from "vitest";
import { toMoney } from "../../../../packages/contracts/index.js";
import { LAYOUT_DOTACAO, type DotacaoFato, type EmpenhoFato, type LiquidacaoFato } from "./layout-2026v11.js";
import {
  descreverViolacao,
  validarDominioEmpenhos,
  validarLiquidacaoReferenciaEmpenho,
  validarObrigatorios,
} from "./validacao.js";

/** Uma Dotacao completa e válida. */
const dotacao = (over: Partial<DotacaoFato> = {}): DotacaoFato => ({
  codUnidadeGestora: "999001", competencia: 2026, codUnidadeOrcamentaria: "02001",
  codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
  codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90", codElementoDespesa: "30",
  exercicioFonteRecurso: 1, codFonteRecurso: "500", valor: toMoney("150000.00"), ...over,
});

/** Um Empenho com domínios OFICIALMENTE válidos: elemento 39 × subelemento 040, fonte 500 × CO 1001. */
const empenho = (over: Partial<EmpenhoFato> = {}): EmpenhoFato => ({
  codUnidadeGestora: "999001", anoEmissao: 2026, codUnidadeOrcamentaria: "02001",
  codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
  codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90", codElementoDespesa: "39",
  codSubelemento: "040", modalidadeLicitacao: "9", numLicitacao: null, numEmpenho: "12",
  tipoEmpenho: "ORDINARIO", data: new Date(Date.UTC(2026, 6, 10)), valor: toMoney("50000.00"),
  historico: "Material", complementacaoHistorico: null, credorCpfCnpj: "12345678000199",
  naturezaContratacao: "FORNECIMENTO_BENS", numObra: null, exercicioFonteRecurso: 1, codFonteRecurso: "500",
  cpfOrdenador: "11122233344", co: "1001", ...over,
});

const liquidacao = (over: Partial<LiquidacaoFato> = {}): LiquidacaoFato => ({
  codUnidadeGestora: "999001", anoEmissaoEmpenho: 2026, codUnidadeOrcamentaria: "02001",
  numEmpenho: "12", numero: "1", data: new Date(Date.UTC(2026, 6, 15)),
  notaFiscal: null, valor: toMoney("6000.00"), codAgrupamentoFolha: null, ...over,
});

describe("F2 — obrigatoriedade (guiada pela registry)", () => {
  it("Dotacao completa não tem violação", () => {
    expect(validarObrigatorios(LAYOUT_DOTACAO, [dotacao()])).toEqual([]);
  });
  it("Dotacao com fonte vazia → 1 violação nomeando o campo e a linha", () => {
    const vs = validarObrigatorios(LAYOUT_DOTACAO, [dotacao(), dotacao({ codFonteRecurso: "" })]);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ arquivo: "Dotacao", linha: 2, campo: "codFonteRecurso", regra: "OBRIGATORIEDADE" });
  });
});

describe("F2 — domínio contra os xlsx oficiais (Empenhos)", () => {
  it("empenho com domínios válidos não tem violação", () => {
    expect(validarDominioEmpenhos([empenho()])).toEqual([]);
  });
  it("subelemento inexistente → violação DOMINIO", () => {
    const vs = validarDominioEmpenhos([empenho({ codSubelemento: "999" })]);
    expect(vs.some((v) => v.campo === "codSubelementoDespesa" && /não consta/.test(v.detalhe))).toBe(true);
  });
  it("par elemento×subelemento inválido (30×099) → violação DOMINIO", () => {
    // 099 É subelemento válido, mas o par (30,099) não existe na tabela oficial.
    const vs = validarDominioEmpenhos([empenho({ codElementoDespesa: "30", codSubelemento: "099" })]);
    expect(vs.some((v) => /par elemento 30 × subelemento 099/.test(v.detalhe))).toBe(true);
  });
  it("par fonte×CO inválido → violação DOMINIO", () => {
    const vs = validarDominioEmpenhos([empenho({ codFonteRecurso: "500", co: "9999" })]);
    expect(vs.some((v) => v.campo === "co" && /fonte 500 × CO 9999/.test(v.detalhe))).toBe(true);
  });
});

describe("F2 — integridade referencial entre arquivos do pacote", () => {
  it("liquidação cujo empenho ESTÁ no pacote → sem violação", () => {
    expect(validarLiquidacaoReferenciaEmpenho([empenho({ numEmpenho: "12" })], [liquidacao({ numEmpenho: "12" })])).toEqual([]);
  });
  it("liquidação ÓRFÃ (empenho ausente do pacote) → violação nomeada", () => {
    const vs = validarLiquidacaoReferenciaEmpenho([empenho({ numEmpenho: "12" })], [liquidacao({ numEmpenho: "99" })]);
    expect(vs).toHaveLength(1);
    expect(vs[0]).toMatchObject({ regra: "INTEGRIDADE_REFERENCIAL", campo: "numEmpenho" });
    expect(descreverViolacao(vs[0]!)).toContain("não está no arquivo de Empenhos");
  });
});
