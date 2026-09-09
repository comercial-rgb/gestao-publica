import { describe, expect, it } from "vitest";
import { toMoney } from "../../../../packages/contracts/index.js";
import { alfa, data, numerico, valor, zeros } from "./formatadores.js";
import {
  larguraRegistro,
  serializarArquivo,
  serializarRegistro,
  validarLayout,
  type CampoLayout,
  type LayoutArquivo,
} from "./registry.js";
import { nomeArquivo } from "./nomenclatura.js";
import {
  DEPARA_TIPO_RETENCAO_SAGRES,
  LAYOUTS_2026V11,
  LAYOUT_CADASTRO_CONTA,
  LAYOUT_DESPESA_EXTRA,
  LAYOUT_DOTACAO,
  LAYOUT_EMPENHOS,
  LAYOUT_LIQUIDACAO,
  LAYOUT_MOVIMENTACAO,
  LAYOUT_PAGAMENTOS,
  LAYOUT_RECEITA_ORCAMENTARIA,
  LAYOUT_RETENCAO,
  LAYOUT_SALDO_MENSAL,
  codigoDespesaExtraDe,
  tipoRetencaoDe,
  type CadastroContaFato,
  type DespesaExtraFato,
  type DotacaoFato,
  type EmpenhoFato,
  type LiquidacaoFato,
  type MovimentacaoFato,
  type PagamentoFato,
  type ReceitaOrcamentariaFato,
  type RetencaoFato,
  type SaldoMensalFato,
} from "./layout-2026v11.js";

/**
 * S1 — SAGRES TXT 2026 v1.1. Golden byte a byte, montados À MÃO a partir do layout oficial
 * (docs/oficial/tce-pb/…). PATCH §6: golden prova DETERMINISMO LOCAL, não aceitação do TCE.
 * O expected NUNCA é gerado pelo código sob teste — cada campo é um literal derivado do layout.
 */

const ONDE = { arquivo: "teste", campo: "x" };

describe("formatadores de campo (unitário)", () => {
  it("numérico: zeros à esquerda, e ESTOURA quando há dígito significativo demais", () => {
    expect(numerico("12", 7, ONDE)).toBe("0000012");
    expect(numerico(2001, 4, ONDE)).toBe("2001");
    expect(numerico(null, 4, ONDE)).toBe("0000"); // não exigido → zeros
    expect(numerico("12.345-6", 6, ONDE)).toBe("123456"); // só dígitos
    expect(() => numerico("12345678", 7, ONDE)).toThrow(/LONGO DEMAIS/);
  });

  it("valor: 13 int + vírgula + 2 dec; a vírgula ocupa 1 posição", () => {
    expect(valor(toMoney("2547625.21"), 16, ONDE)).toBe("0000002547625,21");
    expect(valor(toMoney("150000.00"), 16, ONDE)).toBe("0000000150000,00");
    expect(valor(null, 16, ONDE)).toBe("0000000000000,00"); // não exigido → zeros com vírgula
    expect(valor(toMoney("0.01"), 16, ONDE)).toBe("0000000000000,01");
    expect(() => valor(toMoney("99999999999999.99"), 16, ONDE)).toThrow(/LONGO DEMAIS/);
  });

  it("data: ddmmaaaa em UTC; nulo → zeros", () => {
    expect(data(new Date(Date.UTC(2019, 0, 12)), ONDE)).toBe("12012019");
    expect(data(new Date(Date.UTC(2026, 6, 5)), ONDE)).toBe("05072026");
    expect(data(null, ONDE)).toBe("00000000");
  });

  it("alfa: espaços à direita; nulo → espaços; ESTOURA se maior que a largura; recusa aspas/controle", () => {
    expect(alfa("ABC", 6, ONDE)).toBe("ABC   ");
    expect(alfa(null, 4, ONDE)).toBe("    ");
    expect(alfa("", 3, ONDE)).toBe("   ");
    expect(() => alfa("ABCDEFG", 4, ONDE)).toThrow(/LONGO DEMAIS/); // não trunca em silêncio
    expect(() => alfa("A'B", 6, ONDE)).toThrow(/APÓSTROFO/);
    expect(() => alfa("A\nB", 6, ONDE)).toThrow(/CONTROLE/);
  });

  it("zeros: reservado ao TCE", () => {
    expect(zeros(6)).toBe("000000");
  });
});

describe("registry — auto-validação das posições", () => {
  it("os 10 layouts da versão 2026 v1.1 têm posições contíguas a partir de 1", () => {
    expect(LAYOUTS_2026V11).toHaveLength(10);
    for (const l of LAYOUTS_2026V11) expect(() => validarLayout(l as LayoutArquivo<unknown>)).not.toThrow();
  });

  it("larguras oficiais: Dotacao 66, Liquidacao 166, Empenhos 638, CadastroConta 104, SaldoMensal 59, Movimentacao 84, Pagamentos 133, ReceitaOrcamentaria 92, Retencao 52, DespesaExtra 637", () => {
    expect(larguraRegistro(LAYOUT_DOTACAO)).toBe(66);
    expect(larguraRegistro(LAYOUT_LIQUIDACAO)).toBe(166);
    expect(larguraRegistro(LAYOUT_EMPENHOS)).toBe(638);
    expect(larguraRegistro(LAYOUT_CADASTRO_CONTA)).toBe(104);
    expect(larguraRegistro(LAYOUT_SALDO_MENSAL)).toBe(59);
    expect(larguraRegistro(LAYOUT_MOVIMENTACAO)).toBe(84);
    expect(larguraRegistro(LAYOUT_PAGAMENTOS)).toBe(133);
    expect(larguraRegistro(LAYOUT_RECEITA_ORCAMENTARIA)).toBe(92);
    expect(larguraRegistro(LAYOUT_RETENCAO)).toBe(52);
    expect(larguraRegistro(LAYOUT_DESPESA_EXTRA)).toBe(637);
  });

  it("um layout com BURACO de posição é recusado, nomeando o campo", () => {
    const torto: LayoutArquivo<{ a: string }> = {
      entidade: "Torto",
      periodicidade: "DIARIO",
      versao: "x",
      campos: [
        { nome: "a", posInicial: 1, posFinal: 3, tipo: "NUMERICO", obrigatorio: true, origem: "x", extrair: (f) => f.a },
        // buraco: deveria começar em 4, começa em 6
        { nome: "b", posInicial: 6, posFinal: 8, tipo: "NUMERICO", obrigatorio: true, origem: "x", extrair: (f) => f.a } as CampoLayout<{ a: string }>,
      ],
    };
    expect(() => validarLayout(torto)).toThrow(/Buraco ou sobreposição/);
  });
});

// ── GOLDEN: DOTACAO (Mensal, 66) ────────────────────────────────────────────────
describe("golden byte a byte — Dotacao (§4.4)", () => {
  const fato: DotacaoFato = {
    codUnidadeGestora: "999001",
    competencia: 2026,
    codUnidadeOrcamentaria: "02001",
    codFuncao: "04",
    codSubfuncao: "122",
    codPrograma: "0001",
    codAcao: "2001",
    codCategoriaEconomica: "3",
    codNaturezaDespesa: "3",
    codModalidadeDespesa: "90",
    codElementoDespesa: "30",
    exercicioFonteRecurso: 1,
    codFonteRecurso: "500",
    valor: toMoney("150000.00"),
  };
  // Montado à mão, campo a campo, a partir do layout §4.4.
  const esperado = [
    "999001", // codUnidadeGestora   1-6
    "2026", //   competencia         7-10
    "02001", //  codUnidadeOrc       11-15
    "04", //     codFuncao           16-17
    "122", //    codSubfuncao        18-20
    "0001", //   codPrograma         21-24
    "2001", //   codAcao             25-28
    "000000", // reservado           29-34
    "3", //      codCategoria        35
    "3", //      codNatureza         36
    "90", //     codModalidade       37-38
    "30", //     codElemento         39-40
    "1", //      exercicioFonte      41
    "500", //    codFonteRecurso     42-44
    "0000000150000,00", // valor     45-60
    "000000", // reservado           61-66
  ].join("");

  it("serializa exatamente o registro esperado (66 posições)", () => {
    const linha = serializarRegistro(LAYOUT_DOTACAO, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(66);
  });
});

// ── GOLDEN: LIQUIDACAO (Diário, 166) — sem NF e com NF ──────────────────────────
describe("golden byte a byte — Liquidacao (§4.10)", () => {
  const base = {
    codUnidadeGestora: "999001",
    anoEmissaoEmpenho: 2026,
    codUnidadeOrcamentaria: "02001",
    numEmpenho: "12",
    numero: "1",
    data: new Date(Date.UTC(2026, 6, 15)),
    valor: toMoney("6000.00"),
    codAgrupamentoFolha: null,
  };

  it("SEM nota fiscal: tipoNF=00, numéricos zerados, alfas em branco", () => {
    const fato: LiquidacaoFato = { ...base, notaFiscal: null };
    const esperado = [
      "999001", "2026", "02001", "0000012", "0000001", "15072026",
      "00", //           tipoNotaFiscal      38-39
      "0".repeat(44), // numChaveNotaFiscal  40-83
      " ".repeat(15), // numNotaFiscal       84-98
      " ".repeat(12), // serieNotaFiscal     99-110
      "00000000", //     dataNotaFiscal      111-118
      "0000000000000,00", // valorNotaFiscal 119-134
      "0000000006000,00", // valor           135-150
      " ".repeat(10), // codAgrupamentoFolha 151-160
      "000000", //       reservado           161-166
    ].join("");
    const linha = serializarRegistro(LAYOUT_LIQUIDACAO, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(166);
  });

  it("COM nota fiscal (NF-e): tipo, chave, número, série, data e valor preenchidos", () => {
    const fato: LiquidacaoFato = {
      ...base,
      notaFiscal: {
        tipo: "02",
        chave: "35190712345678000199550010000000011000000017",
        numero: "1",
        serie: "1",
        data: new Date(Date.UTC(2026, 6, 14)),
        valor: toMoney("6000.00"),
      },
    };
    const esperado = [
      "999001", "2026", "02001", "0000012", "0000001", "15072026",
      "02", //                                                    tipoNotaFiscal
      "35190712345678000199550010000000011000000017", // chave 44
      "1".padEnd(15, " "), // numNotaFiscal
      "1".padEnd(12, " "), // serieNotaFiscal
      "14072026", //         dataNotaFiscal
      "0000000006000,00", // valorNotaFiscal
      "0000000006000,00", // valor
      " ".repeat(10), //     codAgrupamentoFolha
      "000000",
    ].join("");
    expect(serializarRegistro(LAYOUT_LIQUIDACAO, fato)).toBe(esperado);
  });
});

// ── GOLDEN: EMPENHOS (Diário, 638) ──────────────────────────────────────────────
describe("golden byte a byte — Empenhos (§4.8)", () => {
  const fato: EmpenhoFato = {
    codUnidadeGestora: "999001",
    anoEmissao: 2026,
    codUnidadeOrcamentaria: "02001",
    codFuncao: "04",
    codSubfuncao: "122",
    codPrograma: "0001",
    codAcao: "2001",
    codCategoriaEconomica: "3",
    codNaturezaDespesa: "3",
    codModalidadeDespesa: "90",
    codElementoDespesa: "30",
    codSubelemento: null,
    modalidadeLicitacao: "9",
    numLicitacao: null,
    numEmpenho: "12",
    tipoEmpenho: "ORDINARIO",
    data: new Date(Date.UTC(2026, 6, 10)),
    valor: toMoney("50000.00"),
    historico: "Aquisicao de material de consumo",
    complementacaoHistorico: null,
    credorCpfCnpj: "12345678000199",
    naturezaContratacao: "FORNECIMENTO_BENS",
    numObra: null,
    exercicioFonteRecurso: 1,
    codFonteRecurso: "500",
    cpfOrdenador: "11122233344",
    co: null,
  };
  const esperado = [
    "999001", //  1-6
    "2026", //    7-10
    "02001", //   11-15
    "04", //      16-17
    "122", //     18-20
    "0001", //    21-24
    "2001", //    25-28
    "000000", //  reservado 29-34
    "3", //       35
    "3", //       36
    "90", //      37-38
    "30", //      39-40
    "000", //     codSubelemento (null→zeros) 41-43
    "09", //      modalidadeLicitacao "9"→09  44-45
    "000000000", //numLicitacao (null→zeros)  46-54
    "0000012", // numEmpenho 55-61
    "1", //       tipo ORDINARIO→1 62
    "10072026", //data 63-70
    "0000000050000,00", // valor 71-86
    "Aquisicao de material de consumo".padEnd(255, " "), // historico 87-341
    " ".repeat(255), // complementacaoHistorico (null→espaços) 342-596
    "12345678000199", // cpfCnpjFornecedor 597-610
    "1", //       NaturezaContratacao FORNECIMENTO_BENS→1  611
    "00000000", //numObra (null→zeros) 612-619
    "1", //       exercicioFonteRecurso 620
    "500", //     codFonteRecurso 621-623
    "11122233344", // cpfOrdenador 624-634
    "0000", //    co (null→zeros) 635-638
  ].join("");

  it("serializa exatamente o registro esperado (638 posições)", () => {
    const linha = serializarRegistro(LAYOUT_EMPENHOS, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(638);
  });
});

// ── GOLDEN: CADASTROCONTABANCARIA (Diário, 104) ─────────────────────────────────
describe("golden byte a byte — CadastroContaBancaria (§4.23)", () => {
  const fato: CadastroContaFato = {
    codUnidadeGestora: "999001",
    numeroConta: "123456", // conta 12345 + dígito 6
    situacao: "1",
    banco: "001",
    numeroAgencia: "12340", // agência 1234 + dígito 0
    descricao: "Conta Movimento POC",
    tipo: "1",
    cnpjGerencia: "12345678000199",
  };
  const esperado = [
    "999001", //                             1-6
    "123456".padEnd(13, " "), //             7-19
    "1", //                                  20
    "001", //                                21-23
    "12340".padEnd(6, " "), //               24-29
    "Conta Movimento POC".padEnd(60, " "), //30-89
    "1", //                                  90
    "12345678000199", //                     91-104
  ].join("");
  it("serializa exatamente o registro esperado (104 posições)", () => {
    const linha = serializarRegistro(LAYOUT_CADASTRO_CONTA, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(104);
  });
});

// ── GOLDEN: SALDOMENSAL (Mensal, 59) ────────────────────────────────────────────
describe("golden byte a byte — SaldoMensal (§4.26)", () => {
  const fato: SaldoMensalFato = {
    codUnidadeGestora: "999001",
    numeroConta: "123456",
    numeroAgencia: "12340",
    banco: "001",
    valor: toMoney("5000.00"),
    tipo: "1",
    cnpjGerencia: "12345678000199",
  };
  const esperado = [
    "999001", //                    1-6
    "123456".padEnd(13, " "), //    7-19
    "12340".padEnd(6, " "), //      20-25
    "001", //                       26-28
    "0000000005000,00", //          29-44
    "1", //                         45
    "12345678000199", //            46-59
  ].join("");
  it("serializa exatamente o registro esperado (59 posições)", () => {
    const linha = serializarRegistro(LAYOUT_SALDO_MENSAL, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(59);
  });
});

// ── GOLDEN: MOVIMENTACAOENTRECONTAS (Diário, 84) — larguras assimétricas do layout ──
describe("golden byte a byte — MovimentacaoEntreContasBancarias (§4.59)", () => {
  const fato: MovimentacaoFato = {
    codUnidadeGestora: "999001",
    codBancoOrigem: "001", numAgenciaOrigem: "12340", numeroCtaOrigem: "123456", tipoCtaOrigem: "1",
    codBancoDestino: "001", numAgenciaDestino: "56780", numeroCtaDestino: "987654", tipoCtaDestino: "1",
    valor: toMoney("2500.00"), data: new Date(Date.UTC(2026, 6, 15)), codigo: "TRF0001",
  };
  const esperado = [
    "999001", //                  1-6
    "001", //                     7-9
    "12340".padEnd(6, " "), //    10-15
    "123456".padEnd(14, " "), //  16-29  (14 posições — a origem é mais larga que o destino)
    "1", //                       30
    "001", //                     31-33
    "56780".padEnd(6, " "), //    34-39
    "987654".padEnd(13, " "), //  40-52  (13 posições)
    "1", //                       53
    "0000000002500,00", //        54-69
    "15072026", //                70-77
    "TRF0001", //                 78-84
  ].join("");
  it("serializa exatamente o registro esperado (84 posições)", () => {
    const linha = serializarRegistro(LAYOUT_MOVIMENTACAO, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(84);
  });
});

// ── GOLDEN: PAGAMENTOS (Diário, 133) — os 5 campos do crédito ao credor sem origem → espaços ──
describe("golden byte a byte — Pagamentos (§4.12)", () => {
  const fato: PagamentoFato = {
    codUnidadeGestora: "999001",
    anoEmissaoEmpenho: 2026,
    codUnidadeOrcamentaria: "99001",
    numEmpenho: "1",
    numero: "1",
    data: new Date(Date.UTC(2026, 6, 14)),
    valor: toMoney("50000.00"),
    numeroContaDebito: "111111", // conta 11111 + dígito 1
    numeroAgenciaDebito: "12340", // agência 1234 + dígito 0
    codBancoDebito: "001",
    exercicioFonteRecurso: 1,
    codFonteRecurso: "500",
    tipoContaBancaria: "1",
    cnpjGerencia: "12345678000199",
  };
  const esperado = [
    "999001", //                     1-6
    "2026", //                       7-10
    "99001", //                      11-15
    "0000001", //                    16-22
    "0000001", //                    23-29
    "14072026", //                   30-37
    "0000000050000,00", //           38-53
    "111111".padEnd(13, " "), //     54-66
    "12340".padEnd(6, " "), //       67-72
    "001", //                        73-75
    " ".repeat(6), //                76-81  numCheque (sem origem)
    " ".repeat(11), //               82-92  numDocDebito (sem origem)
    " ".repeat(3), //                93-95  codBancoCred (sem origem)
    " ".repeat(6), //                96-101 numAgenciaCred (sem origem)
    " ".repeat(13), //               102-114 numContaBancariaCred (sem origem)
    "1", //                          115
    "500", //                        116-118
    "1", //                          119
    "12345678000199", //             120-133
  ].join("");
  it("serializa exatamente o registro esperado (133 posições)", () => {
    const linha = serializarRegistro(LAYOUT_PAGAMENTOS, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(133);
  });
});

// ── GOLDEN: RECEITAORCAMENTARIA (Diária, 92) — conta arrecadadora é parâmetro de exportação ──
describe("golden byte a byte — ReceitaOrcamentaria (§4.16)", () => {
  const fato: ReceitaOrcamentariaFato = {
    codUnidadeGestora: "999001",
    numeroReceita: "7",
    codReceitaOrcamentaria: "11130211",
    tipoLancamento: "ARRECADACAO",
    exercicioFonteRecurso: 1,
    codFonteRecurso: "500",
    valor: toMoney("80000.00"),
    data: new Date(Date.UTC(2026, 6, 5)),
    co: "0001",
    numeroConta: "111111", // conta arrecadadora (param export)
    codBanco: "001",
    numeroAgencia: "12340",
    tipoContaBancaria: "1",
    cnpjGerencia: "12345678000199",
  };
  const esperado = [
    "999001", //                     1-6
    "0000007", //                    7-13
    "11130211", //                   14-21
    "1", //                          22   tipoLancamento (ARRECADACAO → 1 Ordinário)
    "1", //                          23   exercicioFonteRecurso
    "500", //                        24-26
    "1", //                          27   tipoReceita (1 = Lançamento de Receita)
    "0000000080000,00", //           28-43
    "05072026", //                   44-51
    "0001", //                       52-55 co
    "111111".padEnd(13, " "), //     56-68
    "001", //                        69-71
    "12340".padEnd(6, " "), //       72-77
    "1", //                          78
    "12345678000199", //             79-92
  ].join("");
  it("serializa exatamente o registro esperado (92 posições)", () => {
    const linha = serializarRegistro(LAYOUT_RECEITA_ORCAMENTARIA, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(92);
  });

  it("ANULACAO vira tipoLancamento 2 (Estorno), §5.18", () => {
    const linha = serializarRegistro(LAYOUT_RECEITA_ORCAMENTARIA, { ...fato, tipoLancamento: "ANULACAO" });
    expect(linha.charAt(21)).toBe("2"); // posição 22 (0-indexada 21)
  });
});

describe("golden byte a byte — Retencao (§4.14)", () => {
  const fato: RetencaoFato = {
    codUnidadeGestora: "999001",
    anoEmissaoEmpenho: 2026,
    codUnidadeOrcamentaria: "02001",
    numEmpenho: "3",
    numPagamento: "3",
    valor: toMoney("500.00"),
    tipoConsignacaoCodigo: "ISS",
  };
  // Montado à mão, campo a campo, a partir do layout §4.14 (largura 52).
  const esperado = [
    "999001", //                     1-6   codUnidadeGestora
    "2026", //                       7-10  anoEmissaoEmpenho
    "02001", //                      11-15 codUnidadeOrcamentaria
    "0000003", //                    16-22 numEmpenho
    "0000003", //                    23-29 numPagamento
    "0000000000500,00", //           30-45 valor
    "1", //                          46    tipo (ISS → §5.24 código 1)
    "000000", //                     47-52 reservado (= ZEROS)
  ].join("");

  it("serializa exatamente o registro esperado (52 posições)", () => {
    const linha = serializarRegistro(LAYOUT_RETENCAO, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(52);
  });

  it("o tipo sai do DE-PARA §5.24, não do código do m07", () => {
    // INSS é o 3 do layout — se alguém trocasse o de-para por um parseInt, isto quebraria.
    expect(serializarRegistro(LAYOUT_RETENCAO, { ...fato, tipoConsignacaoCodigo: "INSS" }).charAt(45)).toBe("3");
    expect(serializarRegistro(LAYOUT_RETENCAO, { ...fato, tipoConsignacaoCodigo: "IRRF" }).charAt(45)).toBe("2");
    expect(serializarRegistro(LAYOUT_RETENCAO, { ...fato, tipoConsignacaoCodigo: "PENSAO_ALIMENTICIA" }).charAt(45)).toBe("7");
  });
});

// ── DE-PARA §5.24: o teste que IMPORTA a tabela (lição 7.9) ─────────────────────
// O de-para não é conferido "de olho" no código: o teste IMPORTA `DEPARA_TIPO_RETENCAO_SAGRES` e
// `tipoRetencaoDe` e confere cada par contra o domínio do layout, transcrito aqui à mão. Se alguém
// mexer no de-para sem mexer no layout (ou vice-versa), isto falha nomeando.
describe("de-para TipoConsignacao (m07) → TipoRetencao (§5.24)", () => {
  /** §5.24 do layout local, transcrito à mão — a fonte da verdade deste teste. */
  const DOMINIO_5_24: Readonly<Record<string, string>> = {
    "1": "ISS",
    "2": "IRRF",
    "3": "INSS",
    "4": "Previdência Própria",
    "5": "Outras Consignações",
    "6": "Consignação de empréstimos consignados",
    "7": "Consignação pensão alimentícia",
    "8": "Consignação em favor de Regime Próprio de previdência de outro Ente da Federação",
  };

  it("todo código produzido pelo de-para existe no domínio §5.24", () => {
    for (const [tipoM07, codigo] of Object.entries(DEPARA_TIPO_RETENCAO_SAGRES)) {
      expect(DOMINIO_5_24[codigo], `tipo "${tipoM07}" mapeia para "${codigo}", fora do §5.24`).toBeDefined();
    }
  });

  it("cada par do de-para é o esperado (conferência campo a campo)", () => {
    expect(DEPARA_TIPO_RETENCAO_SAGRES).toEqual({
      ISS: "1",
      IRRF: "2",
      INSS: "3",
      CAUCAO: "5",
      RETENCAO_CONTRATUAL: "5",
      CONSIGNACAO_EMPRESTIMO: "6",
      PENSAO_ALIMENTICIA: "7",
    });
  });

  it("TODO tipo do seed do m07 tem de-para — nenhum fica de fora do SAGRES", () => {
    // O rol do seed (prisma/seed/dados/tipos-consignacao.ts). Um tipo novo no seed sem de-para
    // derrubaria a exportação em runtime; este teste pega antes.
    for (const codigo of ["INSS", "IRRF", "ISS", "PENSAO_ALIMENTICIA", "CONSIGNACAO_EMPRESTIMO", "CAUCAO", "RETENCAO_CONTRATUAL"]) {
      expect(() => tipoRetencaoDe(codigo), `o tipo "${codigo}" do seed não tem de-para`).not.toThrow();
    }
  });

  it("tipo próprio do ente SEM de-para falha nomeando — nunca cai em '5' por omissão", () => {
    // O rol do m07 é ABERTO: o ente cria "PLANO_SAUDE". Sem mapeamento, tem de FALHAR.
    expect(() => tipoRetencaoDe("PLANO_SAUDE")).toThrowError(/PLANO_SAUDE.*não tem de-para/s);
  });

  it("CAUCAO é DEPÓSITO (§5.3 20000018), não consignação", () => {
    expect(codigoDespesaExtraDe("CAUCAO")).toBe("20000018");
    expect(codigoDespesaExtraDe("ISS")).toBe("20000017");
    expect(() => codigoDespesaExtraDe("PLANO_SAUDE")).toThrow();
  });
});

describe("golden byte a byte — DespesaExtra (§4.20)", () => {
  const fato: DespesaExtraFato = {
    codUnidadeGestora: "999001",
    numero: "1",
    codContaContabil: "218810200", // PCASP 2.1.8.8.1.02.00 sem pontos
    data: new Date(Date.UTC(2026, 8, 20)),
    exercicioFonteRecurso: 1,
    codFonteRecursoExtra: "869",
    numeroConta: "111111",
    numeroAgencia: "12340",
    codBanco: "001",
    tipoContaBancaria: "1",
    valor: toMoney("300.00"),
    historico: "Recolhimento parcial de ISS - POC (setembro)",
    tipoConsignacaoCodigo: "ISS",
    exercicio: 2026,
    codFonteRecursoPagamento: "500",
    cnpjGerencia: "12345678000199",
  };
  // Montado à mão, campo a campo, a partir do layout §4.20 (largura 637).
  const esperado = [
    "999001", //                                            1-6    codUnidadeGestora
    "0000001", //                                           7-13   numero
    "218810200", //                                         14-22  codContaContabil
    "20092026", //                                          23-30  data
    "00000000000000", //                                    31-44  cpfCnpjFornecedor (GAP → zeros)
    "1", //                                                 45     exercicioFonteRecurso (Atual)
    "869", //                                               46-48  codFonteRecurso (STN extra)
    "111111".padEnd(13, " "), //                            49-61  numContaBancaria
    "12340".padEnd(6, " "), //                              62-67  numAgencia
    "001", //                                               68-70  codBanco
    "1", //                                                 71     tipoContaBancaria
    "0000000000300,00", //                                  72-87  valor
    "Recolhimento parcial de ISS - POC (setembro)".padEnd(500, " "), // 88-587 historico
    "20000017", //                                          588-595 codDespesaExtra (Consignações)
    "2026", //                                              596-599 exercicio
    "500", //                                               600-602 codFonteRecursoPagamento
    "0000", //                                              603-606 co (GAP → zeros)
    "      ", //                                            607-612 codUGReceitaExtra (não exigido → espaços)
    "    ", //                                              613-616 exercicioReceitaExtra (espaços)
    "       ", //                                           617-623 numReceitaExtra (espaços)
    "12345678000199", //                                    624-637 cnpjGerenciaContaBancaria
  ].join("");

  it("serializa exatamente o registro esperado (637 posições)", () => {
    const linha = serializarRegistro(LAYOUT_DESPESA_EXTRA, fato);
    expect(linha).toBe(esperado);
    expect(linha).toHaveLength(637);
  });

  it("o vínculo com ReceitaExtra não exigido sai em ESPAÇOS (ASCII 32), como o layout manda", () => {
    const linha = serializarRegistro(LAYOUT_DESPESA_EXTRA, fato);
    expect(linha.slice(606, 623)).toBe(" ".repeat(17)); // 607-623, 0-indexado
  });
});

// ── ENCODING: UTF-8 sem BOM, CRLF ───────────────────────────────────────────────
describe("serialização do arquivo — UTF-8 sem BOM, CRLF", () => {
  const fato: DotacaoFato = {
    codUnidadeGestora: "999001", competencia: 2026, codUnidadeOrcamentaria: "02001",
    codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001",
    codCategoriaEconomica: "3", codNaturezaDespesa: "3", codModalidadeDespesa: "90",
    codElementoDespesa: "30", exercicioFonteRecurso: 1, codFonteRecurso: "500", valor: toMoney("150000.00"),
  };

  it("cada registro termina em CRLF e o arquivo NÃO tem BOM", () => {
    const buf = serializarArquivo(LAYOUT_DOTACAO, [fato, fato]);
    // sem BOM UTF-8 (EF BB BF)
    expect(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf).toBe(false);
    // 2 registros de 66 + CRLF cada = (66+2)*2 = 136 bytes (ASCII → byte==char)
    expect(buf.length).toBe(136);
    expect(buf[66]).toBe(0x0d); // CR
    expect(buf[67]).toBe(0x0a); // LF
  });

  it("acento é UTF-8 (ç = C3 A7), NUNCA Latin-1 (E7) — a diferença do MANAD", () => {
    // Um layout mínimo de 1 campo alfa para provar o encoding sem depender de posições.
    const layoutAcento: LayoutArquivo<{ nome: string }> = {
      entidade: "T", periodicidade: "DIARIO", versao: "x",
      campos: [{ nome: "nome", posInicial: 1, posFinal: 10, tipo: "ALFA", obrigatorio: true, origem: "x", extrair: (f) => f.nome }],
    };
    const buf = serializarArquivo(layoutAcento, [{ nome: "acao" }]); // sem acento: baseline
    expect(buf.length).toBe(12); // 10 + CRLF
    const bufC = serializarArquivo(layoutAcento, [{ nome: "coração" }]); // ç + ã = +2 bytes
    expect(bufC.includes(Buffer.from([0xc3, 0xa7]))).toBe(true); // "ç" em UTF-8
    expect(bufC.includes(Buffer.from([0xe7]))).toBe(false); //     "ç" em Latin-1 NÃO aparece
  });
});

// ── NOMENCLATURA: os próprios exemplos do layout §3 ─────────────────────────────
describe("nomenclatura oficial (§3) — os exemplos do layout são o golden", () => {
  it("DIÁRIA: [codUG][ddmmaaaa][Nome].txt", () => {
    expect(nomeArquivo({ codUnidadeGestora: "201001", periodicidade: "DIARIO", entidade: "Empenhos", competencia: new Date(Date.UTC(2019, 0, 1)) }))
      .toBe("20100101012019Empenhos.txt");
  });
  it("MENSAL: [codUG][mmaaaa][Nome].txt", () => {
    expect(nomeArquivo({ codUnidadeGestora: "201001", periodicidade: "MENSAL", entidade: "SaldoMensal", competencia: new Date(Date.UTC(2019, 0, 15)) }))
      .toBe("201001012019SaldoMensal.txt");
  });
  it("ANUAL: [codUG][aaaa][Nome].txt", () => {
    expect(nomeArquivo({ codUnidadeGestora: "201001", periodicidade: "ANUAL", entidade: "PloaAcao", competencia: new Date(Date.UTC(2020, 5, 1)) }))
      .toBe("2010012020PloaAcao.txt");
  });
});
