import { describe, expect, it } from "vitest";
import {
  codigoDaAncoraDeConsolidacao,
  ehIntraOfss,
  nivelDeclaradoNoNome,
  nivelDeConsolidacao,
  ROTULO_DO_NIVEL,
} from "./consolidacao.js";
import {
  CONTA_CREDITO_ADICIONAL_SUPLEMENTAR,
  CONTA_DDR_COMPROMETIDA_EMPENHO,
  CONTA_CONTROLE_DDR_POR_NATUREZA,
} from "./roteiros.js";

/**
 * ═══ O NÍVEL DE CONSOLIDAÇÃO — E O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ═══
 *
 * A classificação decide o que o demonstrativo consolidado ELIMINA. Errar para mais apaga do
 * consolidado dinheiro que é do ente; errar para menos deixa a transação entre unidades contada
 * duas vezes. As duas formas de errar são plausíveis, e as duas foram medidas no plano oficial
 * (`docs/varreduras/varredura-v17-eliminacoes-intragovernamentais.md`) — então os casos aqui NÃO
 * são amostras bonitas: são as três contas que este sistema escreve todo dia e que a regra do
 * dígito classificaria como intragovernamentais.
 */
describe("o nível de consolidação da conta PCASP", () => {
  // ── t1: a âncora ──────────────────────────────────────────────────────────
  it("t1 a âncora é o 5º nível, e conta acima do 5º nível não tem âncora", () => {
    expect(codigoDaAncoraDeConsolidacao("1.1.1.1.2.01.00")).toBe("1.1.1.1.2.00.00");
    expect(codigoDaAncoraDeConsolidacao("1.1.1.1.2.00.00")).toBe("1.1.1.1.2.00.00");
    // 5º dígito zero: a conta é sintética acima do nível de consolidação. Somá-la ao
    // consolidado contaria o mesmo dinheiro duas vezes.
    expect(codigoDaAncoraDeConsolidacao("1.1.1.0.0.00.00")).toBeNull();
    expect(codigoDaAncoraDeConsolidacao("3.5.1.0.0.00.00")).toBeNull();
  });

  it("t2 código fora da forma do PCASP ESTOURA — não se classifica no escuro", () => {
    expect(() => codigoDaAncoraDeConsolidacao("1.1.1.1.2.01")).toThrow(/fora do formato/i);
    expect(() => codigoDaAncoraDeConsolidacao("111112010 0")).toThrow(/fora do formato/i);
  });

  // ── t3: o nome da âncora, com as grafias REAIS do arquivo do TCE ──────────
  it("t3 o nome declara o nível — nas oito grafias que o arquivo oficial tem", () => {
    expect(nivelDeclaradoNoNome("CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - CONSOLIDAÇÃO")).toBe("CONSOLIDACAO");
    expect(nivelDeclaradoNoNome("CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS")).toBe("INTRA_OFSS");
    // 3 contas do plano: "INTRA - OFSS"
    expect(nivelDeclaradoNoNome("OUTROS BENEFÍCIOS PREVIDENCIÁRIOS E ASSISTENCIAIS - SERVIDOR CIVIL - INTRA - OFSS")).toBe("INTRA_OFSS");
    // 2 contas do plano: "INTRA" sem o OFSS
    expect(nivelDeclaradoNoNome("JUROS E ENCARGOS DA DÍVIDA CONTRATUAL INTERNA - INTRA")).toBe("INTRA_OFSS");
    expect(nivelDeclaradoNoNome("CRÉDITOS TRIBUTÁRIOS A RECEBER - INTER OFSS - UNIÃO")).toBe("INTER_OFSS_UNIAO");
    expect(nivelDeclaradoNoNome("BENEFÍCIOS PREVIDENCIÁRIOS A PAGAR- INTER OFSS - ESTADO")).toBe("INTER_OFSS_ESTADO");
    expect(nivelDeclaradoNoNome("TRANSFERÊNCIAS VOLUNTÁRIAS - INTER-OFSS - MUNICÍPIO")).toBe("INTER_OFSS_MUNICIPIO");
    // Sem o "OFSS" no meio — 3 contas do plano (4.3.3.1.3/4/5)
    expect(nivelDeclaradoNoNome("VALOR BRUTO DE EXPLORAÇÃO DE BENS, DIREITOS E PRESTAÇÃO DE SERVIÇOS - INTER UNIÃO")).toBe("INTER_OFSS_UNIAO");
  });

  it("t4 'INTERNA' não é 'INTER', e 'CONSOLIDADA' não é 'CONSOLIDAÇÃO'", () => {
    // Âncoras REAIS do plano. Uma busca por substring classificaria a primeira como transação
    // com a União, e a segunda como parcela a eliminar do consolidado.
    expect(nivelDeclaradoNoNome("DESCENTRALIZAÇÃO INTERNA DE CRÉDITOS - PROVISÃO")).toBe("NAO_CLASSIFICADO");
    expect(nivelDeclaradoNoNome("OPERAÇÕES CONTRATUAIS INTERNAS SUJEITAS AO LIMITE")).toBe("NAO_CLASSIFICADO");
    expect(nivelDeclaradoNoNome("OUTRAS OPERAÇÕES QUE INTEGRAM A DÍVIDA CONSOLIDADA")).toBe("NAO_CLASSIFICADO");
  });

  // ── t5: O CASO QUE PAGA O ARQUIVO — as contas que o sistema escreve ──────
  it("t5 as três contas de dígito 2 que este sistema escreve NÃO são intragovernamentais", () => {
    // Nenhuma delas tem âncora que declare nível: nas classes 5/6 o 5º nível não é nível de
    // consolidação, e em 7.2/8.2 (a DDR) também não.
    expect(nivelDeConsolidacao(CONTA_CREDITO_ADICIONAL_SUPLEMENTAR, "DOTAÇÃO ADICIONAL POR TIPO DE CREDITO")).toBe("NAO_CLASSIFICADO");
    expect(nivelDeConsolidacao(CONTA_DDR_COMPROMETIDA_EMPENHO, "DISPONIBILIDADE POR DESTINAÇÃO DE RECURSOS COMPROMETIDA POR EMPENHO")).toBe("NAO_CLASSIFICADO");
    expect(nivelDeConsolidacao(CONTA_CONTROLE_DDR_POR_NATUREZA.VINCULADOS, "RECURSOS VINCULADOS")).toBe("NAO_CLASSIFICADO");
    expect(nivelDeConsolidacao("6.2.2.1.2.00.00", "CREDITO INDISPONÍVEL")).toBe("NAO_CLASSIFICADO");

    // E as três TERMINAM em dígito 2 — a prova de que o dígito, sozinho, as pegaria.
    for (const c of [CONTA_CREDITO_ADICIONAL_SUPLEMENTAR, CONTA_DDR_COMPROMETIDA_EMPENHO, CONTA_CONTROLE_DDR_POR_NATUREZA.VINCULADOS]) {
      expect(c.replace(/\./g, "")[4]).toBe("2");
    }
  });

  // ── t6: a HERANÇA — item e subitem não repetem o nome ────────────────────
  it("t6 o item herda o nível da âncora — é aqui que a regra do NOME perde 699 contas", () => {
    const ancora = "CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS";
    expect(nivelDeConsolidacao("1.1.1.1.2.00.00", ancora)).toBe("INTRA_OFSS");
    // O item e o subitem NÃO dizem "INTRA" no nome deles, e são intra do mesmo jeito.
    expect(nivelDeConsolidacao("1.1.1.1.2.01.00", ancora)).toBe("INTRA_OFSS");
    expect(nivelDeConsolidacao("1.1.1.1.2.01.99", ancora)).toBe("INTRA_OFSS");
    expect(ehIntraOfss("1.1.1.1.2.01.99", ancora)).toBe(true);
  });

  it("t7 transferência intragovernamental é intra SEM ter irmã CONSOLIDAÇÃO", () => {
    // `3.5.1.x` e `4.5.1.x` não têm `.1` — uma transferência intragovernamental só pode ser
    // intra. Uma regra escrita como "tem irmã CONSOLIDAÇÃO" perderia as 93 contas de VPD/VPA
    // de transferência intragovernamental, as mais relevantes de um município.
    expect(nivelDeConsolidacao("3.5.1.3.2.00.00", "TRANSFERÊNCIAS CONCEDIDAS PARA APORTES DE RECURSOS PARA O RPPS - INTRA OFSS")).toBe("INTRA_OFSS");
    expect(nivelDeConsolidacao("4.5.1.3.2.01.00", "TRANSFERÊNCIAS RECEBIDAS PARA APORTES DE RECURSOS PARA O RPPS - INTRA OFSS")).toBe("INTRA_OFSS");
  });

  // ── t8: FAIL-CLOSED nas duas direções ───────────────────────────────────
  it("t8 dígito e nome têm de CONCORDAR — discordância não escolhe um lado", () => {
    // Dígito 2 (intra) com âncora que declara INTER: ninguém decide aqui.
    expect(nivelDeConsolidacao("1.1.2.1.2.00.00", "CRÉDITOS TRIBUTÁRIOS A RECEBER - INTER OFSS - UNIÃO")).toBe("NAO_CLASSIFICADO");
    // Dígito 3 (inter União) com âncora que declara INTRA.
    expect(nivelDeConsolidacao("1.1.2.1.3.00.00", "CRÉDITOS TRIBUTÁRIOS A RECEBER - INTRA OFSS")).toBe("NAO_CLASSIFICADO");
  });

  it("t9 âncora ausente do plano instalado devolve NÃO CLASSIFICADO, não INTRA", () => {
    // Instalação com o plano MÍNIMO: a âncora de nível 5 não existe no banco. O demonstrativo
    // tem de dizer "não classificado" — nunca eliminar por suposição.
    expect(nivelDeConsolidacao("1.1.1.1.2.01.00", null)).toBe("NAO_CLASSIFICADO");
    expect(ehIntraOfss("1.1.1.1.2.01.00", null)).toBe(false);
  });

  it("t10 os cinco níveis, e o dígito de cada um", () => {
    const casos: readonly [string, string, string][] = [
      ["1.1.1.1.1.01.00", "CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - CONSOLIDAÇÃO", "CONSOLIDACAO"],
      ["1.1.1.1.2.01.00", "CAIXA E EQUIVALENTES DE CAIXA EM MOEDA NACIONAL - INTRA OFSS", "INTRA_OFSS"],
      ["1.1.2.1.3.01.00", "CRÉDITOS TRIBUTÁRIOS A RECEBER - INTER OFSS - UNIÃO", "INTER_OFSS_UNIAO"],
      ["1.1.2.1.4.01.00", "CRÉDITOS TRIBUTÁRIOS A RECEBER - INTER OFSS - ESTADO", "INTER_OFSS_ESTADO"],
      ["1.1.2.1.5.01.00", "CRÉDITOS TRIBUTÁRIOS A RECEBER - INTER OFSS - MUNICÍPIO", "INTER_OFSS_MUNICIPIO"],
    ];
    for (const [codigo, ancora, esperado] of casos) {
      expect(nivelDeConsolidacao(codigo, ancora)).toBe(esperado);
      // Só o INTRA se elimina — inter OFSS é dinheiro que veio de fora do ente.
      expect(ehIntraOfss(codigo, ancora)).toBe(esperado === "INTRA_OFSS");
    }
    // Todo nível tem rótulo, e nenhum rótulo cita cláusula nem percentual.
    for (const [, , esperado] of casos) {
      expect(ROTULO_DO_NIVEL[esperado as keyof typeof ROTULO_DO_NIVEL]).toMatch(/\S/);
    }
  });
});
