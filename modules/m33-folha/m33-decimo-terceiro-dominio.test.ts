import { describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import {
  avosDoExercicio,
  calcularContrachequeDoDecimoTerceiro,
  conferirReferenciaNormativa,
  AbatimentoMaiorQueODecimoTerceiroError,
  BaseDoDecimoTerceiroVaziaError,
  ReferenciaNormativaIncoerenteError,
  RubricaDoAbatimentoAusenteError,
  type EntradaDoDecimoTerceiro,
  type ParametroLidoDoDecimoTerceiro,
  type ReferenciaNormativa,
} from "./decimo-terceiro.js";
import type { RubricaLida, TabelaDeContribuicaoLida, TabelaIrrfLida, VidaFuncionalNaCompetencia } from "./dominio.js";

/**
 * ═══ M33 V11 V9.1 — O 13º, DOMÍNIO PURO ═══
 *
 * ⚠️ TODO NÚMERO ESPERADO AQUI FOI CALCULADO À MÃO, mês a mês, e está escrito no comentário de
 * cada caso. Isto não é preciosismo de teste: conferir o avo chamando `avosDoExercicio` para
 * produzir o esperado faria a suíte concordar com qualquer regra errada desde que consistente —
 * é a regra "parser se testa contra implementação independente" aplicada a uma contagem.
 *
 * ⚠️ E TODO CASO É N=2. A regra do avo só se manifesta em conjunto: com um servidor só, "9 avos"
 * passa por vacuidade — o mesmo número sairia de uma implementação que conta meses do calendário
 * e ignora a vida funcional. Cada par abaixo tem DOIS servidores que o mesmo defeito separaria.
 *
 * ⚠️ OS VALORES DAS TABELAS SÃO FIXTURES SINTÉTICAS, redondas para conferir de cabeça. Não
 * afirmam alíquota oficial de nada — o repositório não semeia tabela federal.
 */

const ATO: ReferenciaNormativa = {
  esfera: "MUNICIPAL",
  tipo: "ESTATUTO_DOS_SERVIDORES",
  numero: "1.234",
  ano: 2010,
  dispositivo: "art. 78, § 2º",
  ementa: "Dispoe sobre a gratificacao natalina dos servidores do Municipio",
};

function parametro(over: Partial<ParametroLidoDoDecimoTerceiro> = {}): ParametroLidoDoDecimoTerceiro {
  return {
    id: "par-1",
    exercicio: 2026,
    versao: 1,
    diasMinimosDoAvo: 15,
    avosNoExercicio: 12,
    percentualDaPrimeiraParcela: new Decimal("0.5"),
    baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO",
    // ⚠️ V11 V9.3 — A FIXTURE NASCE **NÃO DECLARADA**, de propósito: é o estado real de um ente
    // que ainda não levantou a norma, e é o que os casos abaixo que NÃO o sobrescrevem exercitam.
    // Pôr "FECHADO" aqui faria o padrão do teste esconder o caminho da simulação.
    estadoMinimoDoAdiantamentoParaAbater: null,
    decimoTerceiroSofreContribuicao: true,
    decimoTerceiroSofreIrrf: false,
    ato: ATO,
    ...over,
  };
}

function rubrica(over: Partial<RubricaLida> & Pick<RubricaLida, "id" | "codigo" | "tipo" | "natureza">): RubricaLida {
  return {
    descricao: over.codigo,
    percentual: null,
    incideContribuicao: false,
    incideIrrf: false,
    proporcionalAosDias: false,
    ordem: 1,
    fundamentacaoLegal: "fixture sintetica",
    versao: 1,
    formula: null,
    casasDecimais: 2,
    ...over,
  } as RubricaLida;
}

const R_13 = rubrica({ id: "r13", codigo: "13", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", ordem: 10, incideContribuicao: true });
const R_ADI = rubrica({ id: "radi", codigo: "13ADI", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", ordem: 10 });
const R_ABAT = rubrica({ id: "rabat", codigo: "13ABAT", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", ordem: 90 });
const R_CONTRIB = rubrica({ id: "rc", codigo: "INSS", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", ordem: 50 });
const R_IRRF = rubrica({ id: "rir", codigo: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", ordem: 60 });

/** Alíquota única de 10% sem teto — redonda de propósito. */
const TAB_CONTRIB: TabelaDeContribuicaoLida = {
  id: "tc", regime: "RGPS", competenciaInicio: "1900-01", competenciaFim: null, teto: null,
  fundamentacaoLegal: "fixture sintetica", faixas: [{ ordem: 1, ate: null, aliquota: new Decimal("0.10") }],
};

const TAB_IRRF: TabelaIrrfLida = {
  id: "ti", competenciaInicio: "1900-01", competenciaFim: null,
  deducaoPorDependente: toMoney(0), descontoSimplificado: null, isencaoMaior65: null,
  redutorBase: null, redutorFator: null, redutorRendaMaxima: null,
  fundamentacaoLegal: "fixture sintetica", faixas: [{ ordem: 1, ate: null, aliquota: new Decimal("0") }],
};

const d = (iso: string): Date => new Date(`${iso}T12:00:00-03:00`);

function vida(over: Partial<VidaFuncionalNaCompetencia> & Pick<VidaFuncionalNaCompetencia, "dataAdmissao">): VidaFuncionalNaCompetencia {
  return { dataDesligamento: null, afastamentos: [], ...over };
}

function entrada(over: Partial<EntradaDoDecimoTerceiro> = {}): EntradaDoDecimoTerceiro {
  const p = over.parametro ?? parametro();
  return {
    parcela: "DECIMO_TERCEIRO",
    competencia: "2026-12",
    parametro: p,
    vinculo: { id: "v1", matricula: "M-1", regime: "RGPS", dataNascimento: d("1990-05-05"), tipo: "EFETIVO" },
    avos: avosDoExercicio(vida({ dataAdmissao: d("2020-01-01") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: p.diasMinimosDoAvo }),
    base: [{ codigo: "VENC", descricao: "Vencimento", natureza: "VENCIMENTO_BASE", valor: toMoney(3000), memoria: "vencimento-base 3000.00" }],
    rubricaDaParcela: R_13,
    rubricaDoAbatimento: R_ABAT,
    adiantamentoApuradoEmFolhaFechada: toMoney(0),
    procedenciaDoAbatimento: null,
    rubricaDaContribuicao: R_CONTRIB,
    rubricaDoIrrf: R_IRRF,
    dependentesIr: 0,
    pensaoAlimenticia: toMoney(0),
    tabelas: { contribuicao: TAB_CONTRIB, irrf: TAB_IRRF },
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// t1 · OS AVOS — N=2 em cada regra, e o esperado escrito à mão
// ═══════════════════════════════════════════════════════════════════════════════

describe("t1 · avos do exercício", () => {
  /**
   * PAR 1 — A ADMISSÃO NO MEIO DO ANO.
   * · A1 admitido em 2020: os doze meses do ano têm 30 dias computados → 12 avos.
   * · A2 admitido em 20/03/2026: março rende 30−20+1 = 11 dias, ABAIXO do mínimo de 15 → não
   *   conta; janeiro e fevereiro são anteriores à admissão → 0 dias; abril a dezembro são nove
   *   meses cheios → 9 avos.
   * O defeito que este par separa: contar "meses do calendário desde a admissão" daria 10 a A2.
   */
  it("admissão no meio do ano: 12 e 9 avos, com o mês da admissão abaixo do mínimo", () => {
    const a1 = avosDoExercicio(vida({ dataAdmissao: d("2020-01-01") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 });
    const a2 = avosDoExercicio(vida({ dataAdmissao: d("2026-03-20") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 });
    expect(a1.avos).toBe(12);
    expect(a2.avos).toBe(9);
    // e o mês recusado diz POR QUE, não só que não contou
    const marco = a2.meses.find((x) => x.mes === "2026-03");
    expect(marco?.dias).toBe(11);
    expect(marco?.conta).toBe(false);
    expect(marco?.explicacao).toMatch(/abaixo do mínimo de 15/);
  });

  /**
   * PAR 2 — O AFASTAMENTO E O DESLIGAMENTO.
   * · B1 afastado de 10/05 a 05/08 (o RETORNO é o primeiro dia trabalhado, então o afastamento
   *   vai até a véspera):
   *     maio    → afastado 10..30 = 21 dias → 30−21 = 9 dias  → abaixo de 15 → não conta
   *     junho   → mês inteiro afastado       → 0 dias          → não conta
   *     julho   → mês inteiro afastado       → 0 dias          → não conta
   *     agosto  → afastado 1..4 = 4 dias     → 26 dias         → conta
   *   jan–abr (4) + ago (1) + set–dez (4) = 9 avos.
   * · B2 desligado em 10/08/2026:
   *     jan–jul = 7 meses cheios → 7 avos
   *     agosto  → 10 dias → abaixo de 15 → não conta
   *     set–dez → posteriores ao desligamento → 0 dias → não contam
   *   = 7 avos.
   * O defeito que este par separa: ignorar o afastamento daria 12 a B1 e continuaria dando 7 a
   * B2 — um servidor só não acusaria.
   */
  it("afastamento e desligamento: 9 e 7 avos", () => {
    const b1 = avosDoExercicio(
      vida({ dataAdmissao: d("2024-01-01"), afastamentos: [{ inicio: d("2026-05-10"), fim: d("2026-08-05") }] }),
      { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 }
    );
    const b2 = avosDoExercicio(
      vida({ dataAdmissao: d("2024-01-01"), dataDesligamento: d("2026-08-10") }),
      { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 }
    );
    expect(b1.avos).toBe(9);
    expect(b2.avos).toBe(7);
    expect(b1.meses.find((x) => x.mes === "2026-06")?.dias).toBe(0);
    expect(b1.meses.find((x) => x.mes === "2026-08")?.dias).toBe(26);
    expect(b2.meses.find((x) => x.mes === "2026-08")?.dias).toBe(10);
    expect(b2.meses.find((x) => x.mes === "2026-09")?.dias).toBe(0);
  });

  /**
   * ⚠️ O MÍNIMO É PARÂMETRO, E MUDÁ-LO MUDA O RESULTADO — é o que prova que o "15" não está
   * cravado em lugar nenhum. O mesmo servidor de 11 dias em março: com mínimo 15 não conta; com
   * mínimo 10 (que é o que algum estatuto pode dizer) conta, e o total sobe de 9 para 10.
   */
  it("o mínimo do avo vem do parâmetro: 11 dias contam com mínimo 10 e não contam com 15", () => {
    const com15 = avosDoExercicio(vida({ dataAdmissao: d("2026-03-20") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 });
    const com10 = avosDoExercicio(vida({ dataAdmissao: d("2026-03-20") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 10 });
    expect(com15.avos).toBe(9);
    expect(com10.avos).toBe(10);
  });

  it("o corte do adiantamento ATE_A_COMPETENCIA para em junho, e o do exercício inteiro projeta", () => {
    const ate = avosDoExercicio(vida({ dataAdmissao: d("2020-01-01") }), { exercicio: 2026, ultimoMes: "2026-06", diasMinimos: 15 });
    const inteiro = avosDoExercicio(vida({ dataAdmissao: d("2020-01-01") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 });
    expect(ate.avos).toBe(6);
    expect(ate.meses).toHaveLength(6);
    expect(inteiro.avos).toBe(12);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// t2 · O CONTRACHEQUE — e nenhum número normativo sai do motor
// ═══════════════════════════════════════════════════════════════════════════════

describe("t2 · contracheque do 13º", () => {
  it("13º integral de quem tem 12 avos: 3000, contribuição 10% pela tabela, sem IRRF", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entrada());
    expect(c.totais.proventos.toFixed(2)).toBe("3000.00");
    expect(c.totais.contribuicao.toFixed(2)).toBe("300.00");
    expect(c.totais.liquido.toFixed(2)).toBe("2700.00");
    expect(c.avosComputados).toBe(12);
    // ⚠️ a medida desta folha é o avo, e o zero de dias é DECLARADO (o CHECK do banco o exige)
    expect(c.diasComputados).toBe(0);
  });

  /**
   * N=2 SOBRE A PROPORÇÃO: dois servidores com avos diferentes sobre a MESMA base. Com um só,
   * um motor que ignorasse os avos e pagasse a base inteira passaria.
   */
  it("a proporção é avos/avosNoExercicio: 9/12 e 7/12 sobre a mesma base de 3000", () => {
    const nove = calcularContrachequeDoDecimoTerceiro(entrada({
      avos: avosDoExercicio(vida({ dataAdmissao: d("2026-03-20") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 }),
    }));
    const sete = calcularContrachequeDoDecimoTerceiro(entrada({
      avos: avosDoExercicio(vida({ dataAdmissao: d("2024-01-01"), dataDesligamento: d("2026-08-10") }), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 }),
    }));
    expect(nove.totais.proventos.toFixed(2)).toBe("2250.00"); // 9/12 × 3000
    expect(sete.totais.proventos.toFixed(2)).toBe("1750.00"); // 7/12 × 3000
  });

  it("o percentual da 1ª parcela vem do parâmetro, e ela não sofre contribuição nem IRRF", () => {
    const meio = calcularContrachequeDoDecimoTerceiro(entrada({ parcela: "ADIANTAMENTO", rubricaDaParcela: R_ADI }));
    expect(meio.totais.proventos.toFixed(2)).toBe("1500.00"); // 50% × 3000
    expect(meio.totais.descontos.toFixed(2)).toBe("0.00");

    // trocar SÓ o percentual muda SÓ o valor — prova de que os 50% não estão no motor
    const umTerco = calcularContrachequeDoDecimoTerceiro(entrada({
      parcela: "ADIANTAMENTO", rubricaDaParcela: R_ADI,
      parametro: parametro({ percentualDaPrimeiraParcela: new Decimal("0.3333") }),
    }));
    expect(umTerco.totais.proventos.toFixed(2)).toBe("999.90");
  });

  it("a memória do adiantamento DECLARA que não há incidência, em vez de calar", () => {
    const meio = calcularContrachequeDoDecimoTerceiro(entrada({ parcela: "ADIANTAMENTO", rubricaDaParcela: R_ADI }));
    const inc = (meio.memoria as { incidencias: { contribuicao: boolean; motivo: string } }).incidencias;
    expect(inc.contribuicao).toBe(false);
    expect(inc.motivo).toMatch(/limite declarado/);
    expect(inc.motivo).toMatch(/INCIDENCIA-NA-PRIMEIRA-PARCELA/);
  });

  it("a 2ª parcela abate o adiantamento apurado, e o líquido é a diferença", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entrada({ adiantamentoApuradoEmFolhaFechada: toMoney(1500) }));
    expect(c.totais.proventos.toFixed(2)).toBe("3000.00");
    // 300 de contribuição + 1500 de abatimento
    expect(c.totais.descontos.toFixed(2)).toBe("1800.00");
    expect(c.totais.liquido.toFixed(2)).toBe("1200.00");
    const abat = c.linhas.find((l) => l.codigo === "13ABAT");
    expect(abat?.memoria).toMatch(/1ª parcela APURADA na folha de adiantamento FECHADA/);
    // ⚠️ E DIZ O QUE **NÃO** FOI VERIFICADO. Até a V11 V9.2 esta linha dizia "1ª parcela já PAGA",
    // e pagamento é o que este cálculo nunca conferiu: a única guarda é o FECHAMENTO da folha de
    // adiantamento. A asserção negativa é o ponto — sem ela, alguém "encurta" o texto de volta.
    expect(abat?.memoria).not.toMatch(/já paga/);
    /**
     * ⚠️ V11 V9.3 — A FRASE MUDOU PORQUE A AFIRMAÇÃO MUDOU. A fixture não declara critério, então
     * a linha tem de se identificar como SIMULAÇÃO e nomear o bloqueio da efetivação. Antes ela
     * dizia só "não são consultados aqui", que descrevia o limite sem dizer a consequência.
     */
    expect(abat?.memoria).toMatch(/SIMULAÇÃO — NÃO É APURAÇÃO APROVADA/);
    expect(abat?.memoria).toMatch(/ABATIMENTO-SEM-CRITERIO-DECLARADO/);
    expect(abat?.memoria).toMatch(/NÃO foram consultados/);
  });

  /**
   * ⚠️ A PROCEDÊNCIA É FATO, NÃO CONDIÇÃO — e o teste afirma as duas coisas.
   *
   * Um adiantamento FECHADO e DEVOLVIDO para correção nunca será liquidado nem pago, e mesmo
   * assim é abatido: o cálculo NÃO consulta a certificação para decidir. Esse é o comportamento
   * de hoje, e ele está documentado aqui de propósito — mudá-lo exige a norma que
   * `ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE` declara ausente. O que a V11 V9.2 acrescentou é o
   * REGISTRO: o contracheque passa a dizer de onde veio o desconto e em que situação estava a
   * folha de origem.
   */
  it("a procedência vai à memória e a certificação DEVOLVIDA não impede o abatimento (fato, não condição)", () => {
    const c = calcularContrachequeDoDecimoTerceiro(
      entrada({
        adiantamentoApuradoEmFolhaFechada: toMoney(1500),
        procedenciaDoAbatimento: { competencia: "2026-06", calculoNumero: 2, situacaoDaCertificacao: "DEVOLVIDA", versaoDoParametro: 1, estadoExigido: null, estadoVerificado: "FECHADO" },
      })
    );
    // O abatimento ACONTECEU, apesar de DEVOLVIDA — é isto que o registro torna visível.
    expect(c.totais.liquido.toFixed(2)).toBe("1200.00");
    const abat = c.linhas.find((l) => l.codigo === "13ABAT");
    expect(abat?.memoria).toMatch(/de 2026-06 \(cálculo nº 2; certificação DEVOLVIDA\)/);
    const proc = (c.memoria as Record<string, unknown>)["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["folhaDeAdiantamento"]).toBe("2026-06");
    expect(proc["calculoNumero"]).toBe(2);
    expect(proc["situacaoDaCertificacao"]).toBe("DEVOLVIDA");
    expect(proc["fatoVerificado"]).toBe("FECHAMENTO_DA_FOLHA_DE_ADIANTAMENTO");
    expect(proc["versaoDoParametroDoAdiantamento"]).toBe(1);
    expect(String(proc["motivo"])).toMatch(/ESTADO-EXIGIDO-DO-ADIANTAMENTO-SEM-FONTE/);
  });

  /**
   * ⚠️ V11 V9.3 — A CONTRAPARTIDA DO CASO ACIMA, E SEM ELA O ANTERIOR PASSARIA POR VACUIDADE.
   *
   * Com o critério DECLARADO pelo ente, a mesma conta produz o mesmo centavo e uma AFIRMAÇÃO
   * diferente: `natureza: "APURACAO"`, o estado exigido, o estado verificado, e nenhuma palavra
   * de simulação. Um motor que gravasse "SIMULACAO" sempre passaria no teste da lacuna; é este
   * caso que o derruba.
   */
  it("com o critério DECLARADO, o mesmo abatimento vira APURACAO e a linha cita o ato do ente", () => {
    const c = calcularContrachequeDoDecimoTerceiro(
      entrada({
        parametro: parametro({ estadoMinimoDoAdiantamentoParaAbater: "CERTIFICADO" }),
        adiantamentoApuradoEmFolhaFechada: toMoney(1500),
        procedenciaDoAbatimento: { competencia: "2026-06", calculoNumero: 1, situacaoDaCertificacao: "CERTIFICADA", versaoDoParametro: 1, estadoExigido: "CERTIFICADO", estadoVerificado: "CERTIFICADO" },
      })
    );
    // ⚠️ NEM UM CENTAVO MUDA — o critério decide SE abate, não QUANTO.
    expect(c.totais.liquido.toFixed(2)).toBe("1200.00");
    const abat = c.linhas.find((l) => l.codigo === "13ABAT");
    expect(abat?.valor.toFixed(2)).toBe("1500.00");
    expect(abat?.memoria).toMatch(/Critério DECLARADO pelo ente: o adiantamento tem de estar ao menos CERTIFICADO/);
    expect(abat?.memoria).toMatch(/ESTATUTO_DOS_SERVIDORES 1\.234\/2010, art\. 78, § 2º/);
    expect(abat?.memoria).not.toMatch(/SIMULAÇÃO/);

    const proc = (c.memoria as Record<string, unknown>)["procedenciaDoAbatimento"] as Record<string, unknown>;
    expect(proc["natureza"]).toBe("APURACAO");
    expect(proc["criterioDeclaradoPeloEnte"]).toBe(true);
    expect(proc["estadoExigidoPeloEnte"]).toBe("CERTIFICADO");
    expect(proc["estadoVerificado"]).toBe("CERTIFICADO");
    expect(proc["fatoVerificado"]).toBe("CERTIFICACAO_DO_CALCULO_DO_ADIANTAMENTO");
    expect(String(proc["motivo"])).not.toMatch(/ABATIMENTO-SEM-CRITERIO-DECLARADO/);
  });

  it("no ADIANTAMENTO a procedência é nula — não há 1ª parcela anterior de onde proceder", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entrada({ parcela: "ADIANTAMENTO" }));
    expect((c.memoria as Record<string, unknown>)["procedenciaDoAbatimento"]).toBeNull();
  });

  /**
   * ⚠️ O CASO REAL: adiantado em junho sobre o ano projetado, desligado em abril do mesmo ano não
   * dá — mas adiantado em junho e desligado em agosto, sim. Aqui o extremo: 3 avos de 13º (750)
   * contra 1500 já pagos. Pagar negativo não existe; repor ao erário é outro ato, que não há.
   */
  it("abatimento MAIOR que o 13º recusa nomeando a matrícula, em vez de pagar negativo", () => {
    const tresAvos = avosDoExercicio(
      vida({ dataAdmissao: d("2024-01-01"), dataDesligamento: d("2026-04-10") }),
      { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: 15 }
    );
    expect(tresAvos.avos).toBe(3); // jan, fev, mar — abril tem 10 dias, abaixo de 15
    expect(() =>
      calcularContrachequeDoDecimoTerceiro(entrada({ avos: tresAvos, adiantamentoApuradoEmFolhaFechada: toMoney(1500) }))
    ).toThrow(AbatimentoMaiorQueODecimoTerceiroError);
  });

  it("sem rubrica de abatimento, quem já recebeu adiantamento faz o cálculo RECUSAR", () => {
    expect(() =>
      calcularContrachequeDoDecimoTerceiro(entrada({ adiantamentoApuradoEmFolhaFechada: toMoney(1000), rubricaDoAbatimento: null }))
    ).toThrow(RubricaDoAbatimentoAusenteError);
  });

  it("base vazia recusa: um 13º de zero é indistinguível de um zero devido", () => {
    expect(() => calcularContrachequeDoDecimoTerceiro(entrada({ base: [] }))).toThrow(BaseDoDecimoTerceiroVaziaError);
  });

  it("a memória cita o parâmetro, a versão, o ato e os doze meses — sem isso o 13º não se explica", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entrada());
    const mem = c.memoria as {
      parametro: { id: string; versao: number; ato: { numero: string; dispositivo: string } };
      avos: { computados: number; de: number; meses: readonly unknown[] };
    };
    expect(mem.parametro.id).toBe("par-1");
    expect(mem.parametro.versao).toBe(1);
    expect(mem.parametro.ato.numero).toBe("1.234");
    expect(mem.parametro.ato.dispositivo).toBe("art. 78, § 2º");
    expect(mem.avos.computados).toBe(12);
    expect(mem.avos.de).toBe(12);
    expect(mem.avos.meses).toHaveLength(12);
  });

  it("mesma entrada, mesmo sha256; um centavo diferente, sha256 diferente", () => {
    const a = calcularContrachequeDoDecimoTerceiro(entrada());
    const b = calcularContrachequeDoDecimoTerceiro(entrada());
    const c = calcularContrachequeDoDecimoTerceiro(entrada({
      base: [{ codigo: "VENC", descricao: "Vencimento", natureza: "VENCIMENTO_BASE", valor: toMoney("3000.01"), memoria: "vencimento-base 3000.01" }],
    }));
    expect(a.sha256).toBe(b.sha256);
    expect(a.sha256).not.toBe(c.sha256);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// t2b · A REDUÇÃO DO IRRF NO 13º — Lei 9.250/1995 art. 3º-A § 3º (Lei 15.270/2025):
// "A redução do imposto de que trata este artigo também será aplicada no cálculo do imposto
// cobrado exclusivamente na fonte no pagamento do décimo terceiro salário"
// https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15270.htm
// ═══════════════════════════════════════════════════════════════════════════════

describe("t2b · redução do IRRF sobre o 13º", () => {
  /** A tabela mensal de 2026 como a lei a publica (Lei 11.482/2007 art. 1º; Lei 9.250/1995 art. 3º-A). */
  const IRRF_2026: TabelaIrrfLida = {
    id: "irrf-2026", competenciaInicio: "2026-01", competenciaFim: null,
    deducaoPorDependente: toMoney("189.59"), descontoSimplificado: toMoney("607.20"), isencaoMaior65: toMoney("1903.98"),
    redutorBase: toMoney("978.62"), redutorFator: new Decimal("0.133145"), redutorRendaMaxima: toMoney("7350.00"),
    redutorRendaDaFaixaIsenta: toMoney("5000.00"), redutorMaximoNaFaixaIsenta: toMoney("312.89"),
    fundamentacaoLegal: "fixture de teste com os valores publicados",
    faixas: [
      { ordem: 1, ate: toMoney("2428.80"), aliquota: new Decimal("0"), parcelaADeduzir: toMoney(0) },
      { ordem: 2, ate: toMoney("2826.65"), aliquota: new Decimal("0.075"), parcelaADeduzir: toMoney("182.16") },
      { ordem: 3, ate: toMoney("3751.05"), aliquota: new Decimal("0.15"), parcelaADeduzir: toMoney("394.16") },
      { ordem: 4, ate: toMoney("4664.68"), aliquota: new Decimal("0.225"), parcelaADeduzir: toMoney("675.49") },
      { ordem: 5, ate: null, aliquota: new Decimal("0.275"), parcelaADeduzir: toMoney("908.73") },
    ],
  };
  const SEM_REDUTOR: TabelaIrrfLida = { ...IRRF_2026, redutorBase: null, redutorFator: null, redutorRendaMaxima: null, redutorRendaDaFaixaIsenta: null, redutorMaximoNaFaixaIsenta: null };
  const R_13_IR = rubrica({ id: "r13", codigo: "13", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", ordem: 10, incideContribuicao: true, incideIrrf: true });
  const com = (vencimento: string, irrf: TabelaIrrfLida, over: Partial<EntradaDoDecimoTerceiro> = {}) =>
    calcularContrachequeDoDecimoTerceiro(entrada({
      rubricaDaParcela: R_13_IR,
      base: [{ codigo: "VENC", descricao: "Vencimento", natureza: "VENCIMENTO_BASE", valor: toMoney(vencimento), memoria: `vencimento-base ${vencimento}` }],
      tabelas: { contribuicao: TAB_CONTRIB, irrf },
      parametro: parametro({ decimoTerceiroSofreIrrf: true }),
      ...over,
    }));

  /** N=2: um 13º dentro da faixa isenta da redução e outro na faixa decrescente. */
  it("13º de 4.000: sem a redução seria 114,76 (simplificado); com ela, zero", () => {
    // contribuição 10% = 400. C: 4000 − 607,20 = 3392,80 × 15% − 394,16 = 114,76. Redução até 312,89, limitada → 0.
    expect(com("4000.00", SEM_REDUTOR).irrf.valor.toFixed(2)).toBe("114.76");
    const r = com("4000.00", IRRF_2026);
    expect(r.irrf.valor.toFixed(2)).toBe("0.00");
    expect(r.totais.irrf.toFixed(2)).toBe("0.00");
  });
  it("13º de 6.000: redução 978,62 − 0,133145 × 6.000 = 179,75 sobre o simplificado (574,29) → 394,54", () => {
    // contribuição 600. A: 5400 × 27,5% − 908,73 = 576,27; C: 5392,80 × 27,5% − 908,73 = 574,29.
    // B = 576,27 − 179,75 = 396,52; D = 574,29 − 179,75 = 394,54 → vence D.
    expect(com("6000.00", SEM_REDUTOR).irrf.valor.toFixed(2)).toBe("574.29");
    const r = com("6000.00", IRRF_2026);
    expect(r.irrf.cenario).toBe("DESCONTO_SIMPLIFICADO_COM_REDUTOR");
    expect(r.irrf.valor.toFixed(2)).toBe("394.54");
  });
  it("servidor ATIVO com 70 anos: o 13º dele não tem a parcela isenta dos 65 anos (ela é só de aposentadoria e pensão)", () => {
    const ativo = com("6000.00", IRRF_2026, { vinculo: { id: "v1", matricula: "M-1", regime: "RGPS", dataNascimento: d("1956-01-10"), tipo: "EFETIVO" } });
    expect(ativo.irrf.cenarios.flatMap((c) => c.deducoes.map((x) => x.tipo))).not.toContain("PARCELA_ISENTA_65_ANOS");
    expect(ativo.irrf.valor.toFixed(2)).toBe("394.54");
    const aposentado = com("6000.00", IRRF_2026, { vinculo: { id: "v1", matricula: "M-1", regime: "RGPS", dataNascimento: d("1956-01-10"), tipo: "APOSENTADO" } });
    expect(aposentado.irrf.cenarios[0]!.deducoes.map((x) => x.tipo)).toContain("PARCELA_ISENTA_65_ANOS");
    expect(aposentado.irrf.valor.lt(ativo.irrf.valor)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// t3 · O ATO — coerência, não comprimento, e o ano pela data civil DO ENTE
// ═══════════════════════════════════════════════════════════════════════════════

describe("t3 · referência do ato", () => {
  const agora = d("2026-06-15");

  it("aceita um ato identificado e citado", () => {
    expect(() => conferirReferenciaNormativa(ATO, agora)).not.toThrow();
  });

  /**
   * ⚠️ O TESTE QUE JUSTIFICA O CAMPO ESTRUTURADO. "conforme a legislacao vigente" tem 29
   * caracteres: passa por qualquer CHECK de comprimento que alguém escolhesse. Aqui ele é
   * recusado porque NÃO É UM ATO — não tem número.
   */
  it("recusa a frase que passaria por qualquer piso de comprimento", () => {
    expect(() => conferirReferenciaNormativa({ ...ATO, numero: "conforme a legislacao vigente" }, agora))
      .toThrow(/não tem nenhum dígito/);
  });

  it("recusa dispositivo ausente e ementa de uma palavra", () => {
    expect(() => conferirReferenciaNormativa({ ...ATO, dispositivo: "-" }, agora)).toThrow(/não identifica onde no ato/);
    expect(() => conferirReferenciaNormativa({ ...ATO, ementa: "natalina" }, agora)).toThrow(/menos de três palavras/);
  });

  /**
   * ⚠️ A HORA DE BORDA, E É ELA QUE SEPARA `anoCivil` DE `getUTCFullYear`.
   * 31/12/2026 às 23h30 no fuso do ente já é 01/01/2027 em UTC. Um ato de 2027 tem de ser
   * recusado — e seria ACEITO por meia hora todo ano se a régua fosse UTC.
   */
  it("o ano se compara pela data civil do ente: às 23h30 de 31/12 um ato de 2027 ainda é do futuro", () => {
    const bordaNoEnte = new Date("2026-12-31T23:30:00-03:00");
    expect(bordaNoEnte.getUTCFullYear()).toBe(2027); // em UTC já virou — e é isso que não pode mandar
    expect(() => conferirReferenciaNormativa({ ...ATO, ano: 2027 }, bordaNoEnte)).toThrow(/ainda é 2026/);
    expect(() => conferirReferenciaNormativa({ ...ATO, ano: 2026 }, bordaNoEnte)).not.toThrow();
  });

  it("recusa ano implausível", () => {
    expect(() => conferirReferenciaNormativa({ ...ATO, ano: 1500 }, agora)).toThrow(ReferenciaNormativaIncoerenteError);
  });
});
