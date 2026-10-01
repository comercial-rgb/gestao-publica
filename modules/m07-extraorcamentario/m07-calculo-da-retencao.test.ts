import { describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import {
  calcularRetencoes,
  exigirRetencoesFechadas,
  valorRetido,
  type Avaliacao,
  type OperacaoDaRetencao,
  type PerfilFiscal,
  type TabelasDaRetencao,
  type Tributo,
} from "./calculo-da-retencao.js";

/**
 * V24 — o cálculo da retenção na fonte. As tabelas aqui reproduzem linhas das fontes oficiais
 * (Anexo I da IN RFB 1.234/2012, coluna 02; IN RFB 2.110/2022, arts. 110, 111, 112, 117, 118 e 238;
 * LC 80/2017 com a LC 132/2025 de Esperança). Os valores esperados são feitos à mão, não pelo motor.
 */

const ESPERANCA = "2506004";
const OUTRO = "2504009";

const TABELAS: TabelasDaRetencao = {
  naturezasIR: [
    { codigoReceita: "6147", natureza: "Mercadorias e bens em geral", aliquota: new Decimal("0.012"), fonte: "Anexo I" },
    { codigoReceita: "6190", natureza: "Demais serviços", aliquota: new Decimal("0.048"), fonte: "Anexo I" },
    { codigoReceita: "8863", natureza: "Cooperativas", aliquota: new Decimal("0"), fonte: "Anexo I" },
  ],
  servicosINSS: [
    { codigo: "111-I", descricao: "limpeza, conservação ou zeladoria", somenteCessaoDeMaoDeObra: false, construcaoCivil: false, fonte: "art. 111" },
    { codigo: "111-III", descricao: "construção civil", somenteCessaoDeMaoDeObra: false, construcaoCivil: true, fonte: "art. 111" },
    { codigo: "112-XIX", descricao: "portaria, recepção ou ascensorista", somenteCessaoDeMaoDeObra: true, construcaoCivil: false, fonte: "art. 112" },
  ],
  parametroINSS: { aliquota: new Decimal("0.11"), valorMinimo: new Decimal("10.00"), fonte: "arts. 110 e 238" },
  basesMinimasINSS: [
    { codigo: "117-III", descricao: "limpeza não hospitalar", percentual: new Decimal("0.80"), fonte: "art. 117" },
    { codigo: "117-IV", descricao: "demais casos", percentual: new Decimal("0.50"), fonte: "art. 117" },
    { codigo: "118-II-a", descricao: "serviços em geral", percentual: new Decimal("0.50"), fonte: "art. 118" },
  ],
  itensISS: [
    { subitem: "1.01", descricao: "Análise e desenvolvimento de sistemas", aliquota: new Decimal("0.02"), localDeIncidencia: "ESTABELECIMENTO_DO_PRESTADOR", fonte: "LC 132/2025" },
    { subitem: "7.10", descricao: "Limpeza de vias", aliquota: new Decimal("0.05"), localDeIncidencia: "LOCAL_DA_PRESTACAO", fonte: "LC 132/2025" },
    { subitem: "7.02", descricao: "Obras", aliquota: new Decimal("0.05"), localDeIncidencia: "LOCAL_DA_PRESTACAO", fonte: "LC 132/2025" },
    { subitem: "17.05", descricao: "Fornecimento de mão de obra", aliquota: new Decimal("0.05"), localDeIncidencia: "ESTABELECIMENTO_DO_TOMADOR", fonte: "LC 132/2025" },
  ],
  municipioDoEnte: ESPERANCA,
};

const PJ = "11222333000181";
const PERFIL: PerfilFiscal = {
  optanteSimplesNacional: false,
  tributadoNoAnexoIVDoSimples: false,
  contribuiSobreReceitaBruta: false,
  dispensaDoIR: null,
  municipioDoEstabelecimento: ESPERANCA,
  fundamento: "consulta ao Portal do Simples em 30/09/2026",
};

function op(p: Partial<OperacaoDaRetencao> & { inss?: Partial<OperacaoDaRetencao["inss"]>; iss?: Partial<OperacaoDaRetencao["iss"]> } = {}): OperacaoDaRetencao {
  return {
    documentoDoFornecedor: p.documentoDoFornecedor ?? PJ,
    valorDoPagamento: p.valorDoPagamento ?? toMoney("1000.00"),
    valorDoDocumentoFiscal: p.valorDoDocumentoFiscal ?? toMoney("1000.00"),
    pagamentoComGlosa: p.pagamentoComGlosa ?? false,
    naturezaIR: p.naturezaIR === undefined ? "6190" : p.naturezaIR,
    inss: { servico: null, modalidade: null, enquadramento: "VALOR_BRUTO", valorMateriais: toMoney(0), baseMinima: null, deducoes: toMoney(0), dispensa: null, ...p.inss },
    iss: { subitem: null, municipioDaPrestacao: null, aliquotaDoSimplesNoDocumento: null, ...p.iss },
    informados: p.informados ?? {},
  };
}

const de = (av: readonly Avaliacao[], t: Tributo): Avaliacao => {
  const a = av.find((x) => x.tributo === t);
  if (a === undefined) throw new Error(`sem ${t}`);
  return a;
};
const retido = (a: Avaliacao): string => valorRetido(a).toFixed(2);

describe("V24 — IR retido pelo município (IN RFB 1.234/2012, art. 3º-A)", () => {
  it("aplica a coluna 02 sobre o valor pago: 4,8% de 1.000,00 = 48,00; e 1,2% de 2.345,67 = 28,15 (N=2, naturezas distintas)", () => {
    const a = calcularRetencoes(op(), PERFIL, TABELAS);
    expect(de(a, "IRRF").resultado).toBe("RETIDO");
    expect(retido(de(a, "IRRF"))).toBe("48.00");
    const b = calcularRetencoes(op({ naturezaIR: "6147", valorDoPagamento: toMoney("2345.67"), valorDoDocumentoFiscal: toMoney("2345.67") }), PERFIL, TABELAS);
    // 2345.67 × 0.012 = 28.14804 → 28.15
    expect(retido(de(b, "IRRF"))).toBe("28.15");
  });

  it("com glosa sem nota nova, a base é o valor original da nota (art. 2º, § 10)", () => {
    const a = de(calcularRetencoes(op({ valorDoPagamento: toMoney("800.00"), valorDoDocumentoFiscal: toMoney("1000.00"), pagamentoComGlosa: true }), PERFIL, TABELAS), "IRRF");
    expect(retido(a)).toBe("48.00");
    const b = de(calcularRetencoes(op({ valorDoPagamento: toMoney("800.00"), valorDoDocumentoFiscal: toMoney("1000.00") }), PERFIL, TABELAS), "IRRF");
    expect(retido(b)).toBe("38.40");
  });

  it("retém mesmo abaixo de R$ 10,00: a dispensa do art. 3º, § 6º não alcança o município", () => {
    const a = de(calcularRetencoes(op({ valorDoPagamento: toMoney("100.00"), valorDoDocumentoFiscal: toMoney("100.00") }), PERFIL, TABELAS), "IRRF");
    expect(retido(a)).toBe("4.80");
  });

  it("não retém do optante do Simples, e diz o inciso e a comprovação", () => {
    const a = de(calcularRetencoes(op(), { ...PERFIL, optanteSimplesNacional: true }, TABELAS), "IRRF");
    expect(a.resultado).toBe("NAO_RETIDO");
    expect(a.resultado === "NAO_RETIDO" && a.fundamento).toMatch(/art\. 4º, XI.*Portal do Simples/);
  });

  it("não retém com dispensa declarada, nomeando o inciso", () => {
    const a = de(calcularRetencoes(op(), { ...PERFIL, dispensaDoIR: "III" }, TABELAS), "IRRF");
    expect(a.resultado === "NAO_RETIDO" && a.fundamento).toMatch(/inciso III/);
  });

  it("alíquota zero (cooperativa, 8863) não retém, e diz por quê", () => {
    const a = de(calcularRetencoes(op({ naturezaIR: "8863" }), PERFIL, TABELAS), "IRRF");
    expect(a.resultado === "NAO_RETIDO" && a.fundamento).toMatch(/alíquota do IR igual a zero/);
  });

  it("pessoa física e natureza ausente não são calculadas, com o motivo", () => {
    const pf = de(calcularRetencoes(op({ documentoDoFornecedor: "52998224725" }), PERFIL, TABELAS), "IRRF");
    expect(pf.resultado === "NAO_CALCULAVEL" && pf.motivo).toMatch(/tabela progressiva/);
    const sem = de(calcularRetencoes(op({ naturezaIR: null }), PERFIL, TABELAS), "IRRF");
    expect(sem.resultado === "NAO_CALCULAVEL" && sem.motivo).toMatch(/Informe a natureza/);
    const fora = de(calcularRetencoes(op({ naturezaIR: "9999" }), PERFIL, TABELAS), "IRRF");
    expect(fora.resultado === "NAO_CALCULAVEL" && fora.motivo).toMatch(/não está na tabela do IR vigente/);
  });
});

describe("V24 — retenção previdenciária (IN RFB 2.110/2022)", () => {
  const limpeza = { servico: "111-I", modalidade: "CESSAO_DE_MAO_DE_OBRA" as const };

  it("11% do valor bruto: 1.000,00 → 110,00; e 3.333,33 → 366,67 (N=2)", () => {
    expect(retido(de(calcularRetencoes(op({ inss: limpeza }), PERFIL, TABELAS), "INSS"))).toBe("110.00");
    // 3333.33 × 0.11 = 366.6663 → 366.67
    expect(retido(de(calcularRetencoes(op({ inss: limpeza, valorDoPagamento: toMoney("3333.33"), valorDoDocumentoFiscal: toMoney("3333.33") }), PERFIL, TABELAS), "INSS"))).toBe("366.67");
  });

  it("deduz materiais discriminados (art. 116) e alimentação/vale-transporte (art. 120)", () => {
    const a = de(calcularRetencoes(op({ inss: { ...limpeza, enquadramento: "MATERIAIS_DISCRIMINADOS", valorMateriais: toMoney("300.00"), deducoes: toMoney("100.00") } }), PERFIL, TABELAS), "INSS");
    // (1000 − 300 − 100) × 11% = 66.00
    expect(retido(a)).toBe("66.00");
    expect(a.resultado === "RETIDO" && a.base.toFixed(2)).toBe("600.00");
  });

  it("previsto em contrato sem valor: o maior entre o discriminado e a base mínima (art. 117)", () => {
    // limpeza (80%): discriminado 1000 − 400 = 600; piso 800 → base 800 → 88,00
    const piso = de(calcularRetencoes(op({ inss: { ...limpeza, enquadramento: "PREVISTO_SEM_VALOR_NO_CONTRATO", valorMateriais: toMoney("400.00"), baseMinima: "117-III" } }), PERFIL, TABELAS), "INSS");
    expect(retido(piso)).toBe("88.00");
    // demais (50%): discriminado 1000 − 100 = 900; piso 500 → base 900 → 99,00
    const disc = de(calcularRetencoes(op({ inss: { ...limpeza, enquadramento: "PREVISTO_SEM_VALOR_NO_CONTRATO", valorMateriais: toMoney("100.00"), baseMinima: "117-IV" } }), PERFIL, TABELAS), "INSS");
    expect(retido(disc)).toBe("99.00");
  });

  it("equipamento inerente sem discriminação: percentual do art. 118, II; hipótese de outro artigo é recusada", () => {
    expect(retido(de(calcularRetencoes(op({ inss: { ...limpeza, enquadramento: "EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO", baseMinima: "118-II-a" } }), PERFIL, TABELAS), "INSS"))).toBe("55.00");
    const errada = de(calcularRetencoes(op({ inss: { ...limpeza, enquadramento: "EQUIPAMENTO_INERENTE_SEM_DISCRIMINACAO", baseMinima: "117-IV" } }), PERFIL, TABELAS), "INSS");
    expect(errada.resultado === "NAO_CALCULAVEL" && errada.motivo).toMatch(/art\. 118/);
  });

  it("abaixo de R$ 10,00 por documento é dispensada (art. 115, I): 90,90 × 11% = 10,00 retém; 90,00 → 9,90 não", () => {
    const retem = de(calcularRetencoes(op({ inss: limpeza, valorDoPagamento: toMoney("90.90"), valorDoDocumentoFiscal: toMoney("90.90") }), PERFIL, TABELAS), "INSS");
    expect(retido(retem)).toBe("10.00");
    const dispensa = de(calcularRetencoes(op({ inss: limpeza, valorDoPagamento: toMoney("90.00"), valorDoDocumentoFiscal: toMoney("90.00") }), PERFIL, TABELAS), "INSS");
    expect(dispensa.resultado === "NAO_RETIDO" && dispensa.fundamento).toMatch(/R\$ 9,90.*art\. 115, I/);
  });

  it("serviço fora do rol, art. 112 por empreitada e construção por empreitada total não retêm — cada um com o seu artigo", () => {
    const fora = de(calcularRetencoes(op(), PERFIL, TABELAS), "INSS");
    expect(fora.resultado === "NAO_RETIDO" && fora.fundamento).toMatch(/art\. 113/);
    const portaria = de(calcularRetencoes(op({ inss: { servico: "112-XIX", modalidade: "EMPREITADA_PARCIAL" } }), PERFIL, TABELAS), "INSS");
    expect(portaria.resultado === "NAO_RETIDO" && portaria.fundamento).toMatch(/art\. 112/);
    const obra = de(calcularRetencoes(op({ inss: { servico: "111-III", modalidade: "EMPREITADA_TOTAL" } }), PERFIL, TABELAS), "INSS");
    expect(obra.resultado === "NAO_RETIDO" && obra.fundamento).toMatch(/art\. 114, VII/);
    const parcial = de(calcularRetencoes(op({ inss: { servico: "111-III", modalidade: "EMPREITADA_PARCIAL" } }), PERFIL, TABELAS), "INSS");
    expect(retido(parcial)).toBe("110.00");
  });

  it("Simples: fora do Anexo IV não retém (art. 167); no Anexo IV retém (art. 166)", () => {
    const fora = de(calcularRetencoes(op({ inss: limpeza }), { ...PERFIL, optanteSimplesNacional: true }, TABELAS), "INSS");
    expect(fora.resultado === "NAO_RETIDO" && fora.fundamento).toMatch(/art\. 167/);
    const anexo4 = de(calcularRetencoes(op({ inss: limpeza }), { ...PERFIL, optanteSimplesNacional: true, tributadoNoAnexoIVDoSimples: true }, TABELAS), "INSS");
    expect(retido(anexo4)).toBe("110.00");
  });

  it("contribuinte sobre a receita bruta, modalidade ausente e parâmetro ausente não são calculados", () => {
    const cprb = de(calcularRetencoes(op({ inss: limpeza }), { ...PERFIL, contribuiSobreReceitaBruta: true }, TABELAS), "INSS");
    expect(cprb.resultado === "NAO_CALCULAVEL" && cprb.motivo).toMatch(/receita bruta/);
    const sem = de(calcularRetencoes(op({ inss: { servico: "111-I" } }), PERFIL, TABELAS), "INSS");
    expect(sem.resultado === "NAO_CALCULAVEL" && sem.motivo).toMatch(/cessão de mão de obra, empreitada parcial ou empreitada total/);
    const semTabela = de(calcularRetencoes(op({ inss: limpeza }), PERFIL, { ...TABELAS, parametroINSS: null }), "INSS");
    expect(semTabela.resultado === "NAO_CALCULAVEL" && semTabela.motivo).toMatch(/não está carregada/);
  });

  it("dispensa declarada do art. 115, II não retém e grava a declaração", () => {
    const a = de(calcularRetencoes(op({ inss: { ...limpeza, dispensa: { inciso: "II", declaracao: "declaração de 01/09/2026 anexa ao processo" } } }), PERFIL, TABELAS), "INSS");
    expect(a.resultado === "NAO_RETIDO" && a.fundamento).toMatch(/art\. 115, II.*01\/09\/2026/);
  });
});

describe("V24 — ISS retido pelo órgão público (LC 80/2017 com a LC 132/2025, Esperança)", () => {
  it("2% para informática com prestador estabelecido no município: 1.000,00 → 20,00; 5% para mão de obra (tomador): 1.234,56 → 61,73 (N=2)", () => {
    expect(retido(de(calcularRetencoes(op({ iss: { subitem: "1.01" } }), PERFIL, TABELAS), "ISS"))).toBe("20.00");
    // 1234.56 × 0.05 = 61.728 → 61.73; o prestador é de OUTRO município, mas 17.05 é devido no tomador
    const t = de(calcularRetencoes(op({ valorDoPagamento: toMoney("1234.56"), valorDoDocumentoFiscal: toMoney("1234.56"), iss: { subitem: "17.05" } }), { ...PERFIL, municipioDoEstabelecimento: OUTRO }, TABELAS), "ISS");
    expect(retido(t)).toBe("61.73");
  });

  it("devido em outro município não é calculado: o motivo nomeia o município e o art. 56", () => {
    const prest = de(calcularRetencoes(op({ iss: { subitem: "1.01" } }), { ...PERFIL, municipioDoEstabelecimento: OUTRO }, TABELAS), "ISS");
    expect(prest.resultado === "NAO_CALCULAVEL" && prest.motivo).toMatch(new RegExp(`${OUTRO}.*art\\. 56`));
    const local = de(calcularRetencoes(op({ iss: { subitem: "7.10", municipioDaPrestacao: OUTRO } }), PERFIL, TABELAS), "ISS");
    expect(local.resultado).toBe("NAO_CALCULAVEL");
    const aqui = de(calcularRetencoes(op({ iss: { subitem: "7.10", municipioDaPrestacao: ESPERANCA } }), PERFIL, TABELAS), "ISS");
    expect(retido(aqui)).toBe("50.00");
  });

  it("construção civil (7.02) não é calculada enquanto a base estiver em conflito entre as duas leis", () => {
    const a = de(calcularRetencoes(op({ iss: { subitem: "7.02", municipioDaPrestacao: ESPERANCA } }), PERFIL, TABELAS), "ISS");
    expect(a.resultado === "NAO_CALCULAVEL" && a.motivo).toMatch(/LC 132\/2025.*40%/);
  });

  it("Simples: usa a alíquota do documento; sem ela não calcula", () => {
    const s = { ...PERFIL, optanteSimplesNacional: true };
    const com = de(calcularRetencoes(op({ iss: { subitem: "1.01", aliquotaDoSimplesNoDocumento: new Decimal("0.0301") } }), s, TABELAS), "ISS");
    expect(retido(com)).toBe("30.10");
    const sem = de(calcularRetencoes(op({ iss: { subitem: "1.01" } }), s, TABELAS), "ISS");
    expect(sem.resultado === "NAO_CALCULAVEL" && sem.motivo).toMatch(/alíquota do ISS declarada no documento/);
  });

  it("fornecimento de bens não tem ISS; lista não carregada e ente sem município não calculam", () => {
    expect(de(calcularRetencoes(op(), PERFIL, TABELAS), "ISS").resultado).toBe("NAO_RETIDO");
    const vazia = de(calcularRetencoes(op({ iss: { subitem: "1.01" } }), PERFIL, { ...TABELAS, itensISS: [] }), "ISS");
    expect(vazia.resultado === "NAO_CALCULAVEL" && vazia.motivo).toMatch(/não está carregada/);
    const semEnte = de(calcularRetencoes(op({ iss: { subitem: "1.01" } }), PERFIL, { ...TABELAS, municipioDoEnte: null }), "ISS");
    expect(semEnte.resultado === "NAO_CALCULAVEL" && semEnte.motivo).toMatch(/município do ente/);
  });
});

describe("V24 — o pagamento só segue com todas as respostas", () => {
  it("sem perfil fiscal, os três ficam sem cálculo e o pagamento é recusado nomeando cada um", () => {
    const a = calcularRetencoes(op(), null, TABELAS);
    expect(a.every((x) => x.resultado === "NAO_CALCULAVEL")).toBe(true);
    expect(() => exigirRetencoesFechadas(a, toMoney("1000.00"))).toThrow(/IRRF — .*perfil fiscal.*INSS — .*ISS — /);
  });

  it("o valor informado com justificativa fecha o que o cálculo não cobre — e só isso", () => {
    const informado = calcularRetencoes(op({ iss: { subitem: "7.02", municipioDaPrestacao: ESPERANCA }, informados: { ISS: { valor: toMoney("30.00"), justificativa: "Orientação do fisco municipal: base de 60% conforme ofício 12/2026" } } }), PERFIL, TABELAS);
    const iss = de(informado, "ISS");
    expect(iss.resultado).toBe("INFORMADO");
    expect(retido(iss)).toBe("30.00");
    expect(iss.resultado === "INFORMADO" && iss.fundamento).toMatch(/ofício 12\/2026.*LC 132/);
    expect(() => exigirRetencoesFechadas(informado, toMoney("1000.00"))).not.toThrow();

    expect(() => calcularRetencoes(op({ informados: { IRRF: { valor: toMoney("1.00"), justificativa: "quero reter um valor diferente do calculado" } } }), PERFIL, TABELAS)).toThrow(/foi calculado pelas tabelas/);
    expect(() => calcularRetencoes(op({ iss: { subitem: "7.02", municipioDaPrestacao: ESPERANCA }, informados: { ISS: { valor: toMoney("0"), justificativa: "curta" } } }), PERFIL, TABELAS)).toThrow(/20 caracteres/);
  });

  it("retenção acima do valor pago é recusada", () => {
    const a = calcularRetencoes(op({ valorDoPagamento: toMoney("50.00"), valorDoDocumentoFiscal: toMoney("1000.00"), inss: { servico: "111-I", modalidade: "CESSAO_DE_MAO_DE_OBRA" } }), PERFIL, TABELAS);
    expect(() => exigirRetencoesFechadas(a, toMoney("50.00"))).toThrow(/mais que o valor pago/);
  });
});
