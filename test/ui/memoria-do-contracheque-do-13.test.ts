import { describe, expect, it } from "vitest";
import { Decimal, toMoney } from "../../packages/contracts/index.js";
import { avosDoExercicio, calcularContrachequeDoDecimoTerceiro, type EntradaDoDecimoTerceiro, type ParametroLidoDoDecimoTerceiro } from "../../modules/m33-folha/decimo-terceiro.js";
import { calcularContracheque, type EntradaDoContracheque, type RubricaLida, type TabelaDeContribuicaoLida, type TabelaIrrfLida, type VidaFuncionalNaCompetencia } from "../../modules/m33-folha/dominio.js";
import { lerMemoriaDoContracheque } from "../../modules/m33-folha/memoria-do-contracheque.js";
import { calcularContrachequeComplementar } from "../../modules/m33-folha/complementar.js";

/**
 * ═══ A MEMÓRIA DO 13º É LEGÍVEL PELA MESMA LEITURA DA MENSAL (V11 V9.2) ═══
 *
 * ⚠️ ESTE ARQUIVO EXISTE POR UM DEFEITO QUE PASSOU POR TUDO. A tela do contracheque respondia
 * **500 em todo contracheque de 13º**, nas duas parcelas, e nada acusava: os três typechecks
 * verdes (o `as MemoriaDoContracheque` da página desligava o compilador), os 262 testes verdes
 * (todos de domínio puro — nenhum LIA a memória como a tela lê), o build verde.
 *
 * O buraco era esse: **ninguém exercitava a leitura da memória**. O motor gravava, a tela lia, e
 * as duas formas divergiram sem que existisse um lugar onde a divergência doesse.
 *
 * ⚠️ E O QUE SE AFIRMA AQUI É A LEITURA, NÃO A PINTURA. Montar o React inteiro para conferir
 * `<li>` seria medir o Tailwind; o que quebrou foi o CONTRATO entre o que o motor grava e o que a
 * tela consegue ler, e é ele que está sob teste. Os dois motores — mensal e 13º — passam pela
 * MESMA `lerMemoriaDoContracheque` que a porta usa, e as asserções são sobre o que a tela
 * precisa para renderizar: bloco PRESENTE, com faixas e cenários dentro.
 */

const ATO = {
  esfera: "MUNICIPAL",
  tipo: "ESTATUTO_DOS_SERVIDORES",
  numero: "1.234",
  ano: 2010,
  dispositivo: "art. 78, § 2º",
  ementa: "Dispoe sobre a gratificacao natalina dos servidores do Municipio",
} as const;

function parametro(over: Partial<ParametroLidoDoDecimoTerceiro> = {}): ParametroLidoDoDecimoTerceiro {
  return {
    id: "par-1", exercicio: 2026, versao: 1, diasMinimosDoAvo: 15, avosNoExercicio: 12,
    percentualDaPrimeiraParcela: new Decimal("0.5"), baseDosAvosDoAdiantamento: "EXERCICIO_INTEIRO",
    // ⚠️ V11 V9.3 — A FIXTURE NASCE **NÃO DECLARADA**, de propósito: é o estado real de um ente
    // que ainda não levantou a norma, e é o que os casos abaixo que NÃO o sobrescrevem exercitam.
    // Pôr "FECHADO" aqui faria o padrão do teste esconder o caminho da simulação.
    estadoMinimoDoAdiantamentoParaAbater: null,
    decimoTerceiroSofreContribuicao: true, decimoTerceiroSofreIrrf: false, ato: ATO, ...over,
  };
}

function rubrica(over: Partial<RubricaLida> & Pick<RubricaLida, "id" | "codigo" | "tipo" | "natureza">): RubricaLida {
  return {
    descricao: over.codigo, percentual: null, incideContribuicao: false, incideIrrf: false,
    proporcionalAosDias: false, ordem: 1, fundamentacaoLegal: "fixture sintetica", versao: 1,
    formula: null, casasDecimais: 2, ...over,
  } as RubricaLida;
}

const R_13 = rubrica({ id: "r13", codigo: "13", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", ordem: 10, incideContribuicao: true });
const R_ABAT = rubrica({ id: "rabat", codigo: "13ABAT", tipo: "DESCONTO", natureza: "ABATIMENTO_DO_ADIANTAMENTO_DO_13", ordem: 90 });
const R_VENC = rubrica({ id: "rv", codigo: "VENC", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", ordem: 1, incideContribuicao: true, incideIrrf: true, proporcionalAosDias: true });
const R_CONTRIB = rubrica({ id: "rc", codigo: "INSS", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", ordem: 50 });
const R_IRRF = rubrica({ id: "rir", codigo: "IRRF", tipo: "DESCONTO", natureza: "IMPOSTO_DE_RENDA", ordem: 60 });

/** Duas faixas de propósito: uma faixa só não distinguiria "percorreu" de "aplicou o total". */
const TAB_CONTRIB: TabelaDeContribuicaoLida = {
  id: "tc", regime: "RGPS", competenciaInicio: "1900-01", competenciaFim: null, teto: null,
  fundamentacaoLegal: "fixture sintetica",
  faixas: [
    { ordem: 1, ate: toMoney(1000), aliquota: new Decimal("0.075") },
    { ordem: 2, ate: null, aliquota: new Decimal("0.09") },
  ],
};

const TAB_IRRF: TabelaIrrfLida = {
  id: "ti", competenciaInicio: "1900-01", competenciaFim: null,
  deducaoPorDependente: toMoney(0), descontoSimplificado: toMoney(500), isencaoMaior65: null,
  redutorBase: null, redutorFator: null, redutorRendaMaxima: null,
  fundamentacaoLegal: "fixture sintetica",
  faixas: [{ ordem: 1, ate: toMoney(2000), aliquota: new Decimal("0") }, { ordem: 2, ate: null, aliquota: new Decimal("0.075") }],
};

const d = (iso: string): Date => new Date(`${iso}T12:00:00-03:00`);
const vida = (adm: string): VidaFuncionalNaCompetencia => ({ dataAdmissao: d(adm), dataDesligamento: null, afastamentos: [] });

function entradaDo13(over: Partial<EntradaDoDecimoTerceiro> = {}): EntradaDoDecimoTerceiro {
  const p = over.parametro ?? parametro();
  return {
    parcela: "DECIMO_TERCEIRO",
    competencia: "2026-12",
    parametro: p,
    vinculo: { id: "v1", matricula: "M-1", regime: "RGPS", dataNascimento: d("1990-05-05") },
    avos: avosDoExercicio(vida("2020-01-01"), { exercicio: 2026, ultimoMes: "2026-12", diasMinimos: p.diasMinimosDoAvo }),
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

describe("a memória do 13º é legível pela mesma leitura da folha mensal", () => {
  /**
   * ⚠️ O CASO EXATO DO 500 Nº 1. Na 1ª parcela o motor grava `contribuicao: null` (ela não incide,
   * por limite declarado). A tela guardava com `=== undefined`; `null` passava pela guarda e o
   * acesso seguinte estourava. A leitura honesta devolve AUSENTE **com o motivo gravado**, que é a
   * diferença entre "não incide, e aqui está o porquê" e "a tela não achou nada".
   */
  it("1ª parcela: contribuição e imposto AUSENTES, com o motivo declarado — e não ilegíveis", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entradaDo13({ parcela: "ADIANTAMENTO" }));
    const m = lerMemoriaDoContracheque(c.memoria);
    expect(m.contribuicao.situacao).toBe("AUSENTE");
    expect(m.irrf.situacao).toBe("AUSENTE");
    if (m.contribuicao.situacao !== "AUSENTE") throw new Error("ramo impossível");
    expect(m.contribuicao.motivo).toMatch(/INCIDENCIA-NA-PRIMEIRA-PARCELA/);
    expect(m.contribuicao.motivo).toMatch(/Não incide contribuição/);
    // e a medida da folha é o AVO, não o dia — a tela anunciava "0/30 dias" a quem trabalhou o ano
    expect(m.avos.situacao).toBe("PRESENTE");
    expect(m.dias.situacao).toBe("AUSENTE");
  });

  /**
   * ⚠️ O CASO EXATO DO 500 Nº 2. Com incidência, o motor gravava um objeto SEM `faixas` e SEM
   * `cenarios`, e a tela fazia `.faixas.length` / `.cenarios.map`. Agora as faixas efetivamente
   * percorridas e os cenários avaliados vão à memória — e o teste exige o CONTEÚDO, não só a
   * presença da chave: duas faixas, somando exatamente a contribuição do total.
   */
  it("2ª parcela: contribuição PRESENTE com as faixas que o motor percorreu, e elas somam o total", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entradaDo13());
    const m = lerMemoriaDoContracheque(c.memoria);
    expect(m.contribuicao.situacao).toBe("PRESENTE");
    if (m.contribuicao.situacao !== "PRESENTE") throw new Error("ramo impossível");
    // 13º = 3.000,00 (12/12). Faixas: 1.000,00 x 7,5% = 75,00 ; 2.000,00 x 9% = 180,00 → 255,00
    expect(m.contribuicao.dados.faixas.length).toBe(2);
    expect(m.contribuicao.dados.faixas.map((f) => f.valor)).toEqual(["75.00", "180.00"]);
    expect(m.contribuicao.dados.aplicada).toBe("255.00");
    const somaDasFaixas = m.contribuicao.dados.faixas.reduce((acc, f) => acc.plus(new Decimal(f.valor)), new Decimal(0));
    expect(somaDasFaixas.toFixed(2)).toBe(m.contribuicao.dados.aplicada);
    expect(m.contribuicao.dados.fundamentacao).toBe("fixture sintetica");
  });

  it("2ª parcela com IRRF: os cenários avaliados vão à memória, com o escolhido entre eles", () => {
    const c = calcularContrachequeDoDecimoTerceiro(entradaDo13({ parametro: parametro({ decimoTerceiroSofreIrrf: true }) }));
    const m = lerMemoriaDoContracheque(c.memoria);
    expect(m.irrf.situacao).toBe("PRESENTE");
    if (m.irrf.situacao !== "PRESENTE") throw new Error("ramo impossível");
    expect(m.irrf.dados.cenarios.length).toBeGreaterThan(0);
    // o cenário escolhido tem de estar ENTRE os avaliados — senão a memória cita um que não mostra
    expect(m.irrf.dados.cenarios.map((x) => x.nome)).toContain(m.irrf.dados.cenario);
  });

  /**
   * ⚠️ A MESMA LEITURA SERVE OS DOIS MOTORES — é isto que impede a divergência de voltar. Se
   * alguém mudar a forma de um dos lados, um destes dois casos cai.
   */
  it("a folha MENSAL passa pela mesma leitura, com faixas e cenários presentes", () => {
    const e: EntradaDoContracheque = {
      competencia: "2026-05",
      vinculo: { id: "v1", matricula: "M-1", regime: "RGPS", dataNascimento: d("1990-05-05") },
      vencimentoBase: toMoney(3000),
      gratificacoes: [],
      dias: { dias: 30, explicacao: "30/30 dias" },
      lancamentos: [],
      dependentesSalarioFamilia: [],
      dependentesIr: 0,
      pensaoAlimenticia: toMoney(0),
      rubricas: [R_VENC, R_CONTRIB, R_IRRF],
      tabelas: { contribuicao: TAB_CONTRIB, irrf: TAB_IRRF, salarioFamilia: null },
    };
    const m = lerMemoriaDoContracheque(calcularContracheque(e).memoria);
    expect(m.contribuicao.situacao).toBe("PRESENTE");
    expect(m.irrf.situacao).toBe("PRESENTE");
    expect(m.dias.situacao).toBe("PRESENTE");
    expect(m.avos.situacao).toBe("AUSENTE");
  });

  /**
   * ⚠️ O RAMO QUE O CAST COMIA. Uma memória com a forma POBRE — contribuição sem `faixas`, que é
   * exatamente o que o 13º gravava antes desta rodada — não pode passar como se estivesse boa nem
   * derrubar a página: ela é ILEGÍVEL, com o motivo, e a tela mostra isso.
   *
   * Este caso é o que impede a regressão silenciosa: se alguém voltar a gravar a forma pobre, ela
   * não vira 500 nem vira branco — vira um aviso nomeando o campo que faltou.
   */
  it("a forma POBRE (sem faixas) é ILEGÍVEL com o motivo — nem passa, nem derruba", () => {
    const m = lerMemoriaDoContracheque({
      contribuicao: { regime: "RGPS", base: "3000.00", calculada: "255.00", tabela: "tc", fundamentacao: "x" },
    });
    expect(m.contribuicao.situacao).toBe("ILEGIVEL");
    if (m.contribuicao.situacao !== "ILEGIVEL") throw new Error("ramo impossível");
    expect(m.contribuicao.motivo).toMatch(/faixas/);
  });

  it("memória que não é objeto não derruba: todos os blocos ILEGÍVEIS, com o motivo", () => {
    for (const bruta of ["texto solto", 42, [1, 2, 3]]) {
      const m = lerMemoriaDoContracheque(bruta);
      expect(m.contribuicao.situacao).toBe("ILEGIVEL");
      expect(m.avos.situacao).toBe("ILEGIVEL");
    }
  });

  /** A procedência do abatimento chega tipada — é o que a tela mostra em "De onde veio o abatimento". */
  it("a procedência do abatimento é legível, com a versão do parâmetro do adiantamento", () => {
    const c = calcularContrachequeDoDecimoTerceiro(
      entradaDo13({
        adiantamentoApuradoEmFolhaFechada: toMoney(1500),
        procedenciaDoAbatimento: { competencia: "2026-06", calculoNumero: 2, situacaoDaCertificacao: "PENDENTE", versaoDoParametro: 1, estadoExigido: null, estadoVerificado: "FECHADO" },
      })
    );
    const m = lerMemoriaDoContracheque(c.memoria);
    expect(m.procedenciaDoAbatimento.situacao).toBe("PRESENTE");
    if (m.procedenciaDoAbatimento.situacao !== "PRESENTE") throw new Error("ramo impossível");
    expect(m.procedenciaDoAbatimento.dados.folhaDeAdiantamento).toBe("2026-06");
    expect(m.procedenciaDoAbatimento.dados.versaoDoParametroDoAdiantamento).toBe(1);
    expect(m.procedenciaDoAbatimento.dados.motivo).toMatch(/FECHAMENTO/);
  });
});

/**
 * ═══ A MEMÓRIA DA COMPLEMENTAR TEM DE SER LEGÍVEL PELA MESMA LEITURA (V11 V9.4b) ═══
 *
 * ⚠️ MESMO BURACO DO 13º, TIPO SEGUINTE. O motor da complementar gravava `natureza`,
 * `regimeDeTributacao` e o `recalculoIntegral` DENTRO do sha256, e a leitura da tela não tinha
 * campo para nenhum dos três. Consequências medidas no percurso de navegador, não supostas:
 *   · o documento NÃO dizia que era uma diferença — o servidor lia 450,00 e concluía que ganhara
 *     450,00 no mês;
 *   · o bloco da contribuição dizia "a memória deste cálculo não traz o detalhamento" enquanto a
 *     linha retinha 50,00 dele. Silêncio é pior que número errado: um número se questiona, um
 *     silêncio se lê como "não houve";
 *   · o cabeçalho anunciava "30/30 dias" num documento que não mede tempo trabalhado.
 *
 * "O motor grava, a tela lê, e as duas formas divergem sem que exista um lugar onde a divergência
 * doa" — é o mesmo diagnóstico do cabeçalho deste arquivo. O lugar é aqui.
 */
describe("a memória da mensal COMPLEMENTAR é legível pela mesma leitura", () => {
  const entradaCorreta = (venc: string): EntradaDoContracheque => ({
    competencia: "2026-05",
    vida: vida("2020-01-01"),
    vinculo: { id: "v9", matricula: "M-9", regime: "RGPS", dataNascimento: d("1990-05-05") },
    vencimentoBase: toMoney(venc),
    gratificacoes: [],
    dias: { dias: 30, explicacao: "30/30 dias" },
    lancamentos: [],
    dependentesSalarioFamilia: [],
    dependentesIr: 0,
    pensaoAlimenticia: toMoney(0),
    rubricas: [R_VENC, R_CONTRIB, R_IRRF],
    tabelas: { contribuicao: TAB_CONTRIB, irrf: TAB_IRRF, salarioFamilia: null },
  });

  /** O correto de hoje (3.500) contra o que a mensal fechada apurou (3.000): delta de 500. */
  const complementar = (): ReturnType<typeof calcularContrachequeComplementar> => {
    const correto = calcularContracheque(entradaCorreta("3500"));
    const apuradoDoVenc = calcularContracheque(entradaCorreta("3000"));
    const linhaVenc = apuradoDoVenc.linhas.find((l) => l.rubricaId === "rv");
    const linhaInss = apuradoDoVenc.linhas.find((l) => l.rubricaId === "rc");
    if (linhaVenc === undefined || linhaInss === undefined) throw new Error("fixture: a mensal apurada não trouxe as duas linhas");
    return calcularContrachequeComplementar({
      competencia: "2026-05",
      matricula: "M-9",
      correto,
      jaApurado: new Map([
        ["rv", { total: linhaVenc.valor, parcelas: [{ folhaTipo: "MENSAL", competencia: "2026-05", calculoNumero: 1, valor: linhaVenc.valor }] }],
        ["rc", { total: linhaInss.valor, parcelas: [{ folhaTipo: "MENSAL", competencia: "2026-05", calculoNumero: 1, valor: linhaInss.valor }] }],
      ]),
      identidadeDaRubrica: new Map([
        ["rv", { id: "rv", codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO" as const, natureza: "VENCIMENTO_BASE" as const, ordem: 1 }],
        ["rc", { id: "rc", codigo: "INSS", descricao: "Contribuição", tipo: "DESCONTO" as const, natureza: "CONTRIBUICAO_PREVIDENCIARIA" as const, ordem: 50 }],
        ["rir", { id: "rir", codigo: "IRRF", descricao: "IRRF", tipo: "DESCONTO" as const, natureza: "IMPOSTO_DE_RENDA" as const, ordem: 60 }],
      ]),
    });
  };

  it("declara a GRANDEZA que mede, e ela não é dias — a tela deixa de precisar chutar", () => {
    const c = complementar();
    if (c === null) throw new Error("fixture: era para haver diferença");
    const m = lerMemoriaDoContracheque(c.memoria);
    expect(m.medida.situacao).toBe("PRESENTE");
    if (m.medida.situacao !== "PRESENTE") throw new Error("ramo impossível");
    expect(m.medida.dados.unidade).toBe("DIFERENCA");
    // ⚠️ O QUE ESTE CASO IMPEDE: o ramo final da tela anunciava "30/30 dias" aqui. A memória da
    // mensal declara `dias`; a da complementar NÃO — e agora diz por quê, em vez de calar.
    expect(m.dias.situacao).toBe("AUSENTE");
    expect(m.avos.situacao).toBe("AUSENTE");
  });

  it("declara o que o documento É e sob que regime reteve — as duas frases que a tela não mostrava", () => {
    const c = complementar();
    if (c === null) throw new Error("fixture: era para haver diferença");
    const m = lerMemoriaDoContracheque(c.memoria);
    expect(m.natureza.situacao).toBe("PRESENTE");
    if (m.natureza.situacao !== "PRESENTE") throw new Error("ramo impossível");
    expect(m.natureza.dados).toMatch(/DIFERENCA/);
    expect(m.natureza.dados).toMatch(/NAO e a remuneracao da competencia/);
    expect(m.regimeDeTributacao.situacao).toBe("PRESENTE");
    if (m.regimeDeTributacao.situacao !== "PRESENTE") throw new Error("ramo impossível");
    expect(m.regimeDeTributacao.dados).toMatch(/REGIME DE COMPETENCIA/);
  });

  /**
   * ⚠️ QUEM RETÉM EXPLICA A RETENÇÃO. A folha retém o DELTA (na linha) e a conta que o produziu é
   * a do recálculo INTEGRAL. Sem leitor para ela a tela emudecia — e emudecer sobre um desconto
   * que se aplica é o defeito mais grave desta rodada.
   */
  it("a conta da contribuição chega pela via do recálculo INTEGRAL, com as faixas", () => {
    const c = complementar();
    if (c === null) throw new Error("fixture: era para haver diferença");
    const m = lerMemoriaDoContracheque(c.memoria);
    // o bloco do TOPO não existe num contracheque de diferença — e é isso que fazia a tela calar
    expect(m.contribuicao.situacao).toBe("AUSENTE");
    expect(m.contribuicaoDoRecalculoIntegral.situacao).toBe("PRESENTE");
    if (m.contribuicaoDoRecalculoIntegral.situacao !== "PRESENTE") throw new Error("ramo impossível");
    expect(m.contribuicaoDoRecalculoIntegral.dados.faixas.length).toBeGreaterThan(0);
    // ⚠️ E O INTEGRAL NÃO É O DELTA: a linha desconta a diferença, o bloco explica a conta cheia.
    // Se os dois fossem iguais, este caso passaria sem distinguir nada.
    const deltaDaLinha = c.linhas.find((l) => l.rubricaId === "rc")?.valor.toFixed(2);
    expect(deltaDaLinha).toBeDefined();
    expect(m.contribuicaoDoRecalculoIntegral.dados.aplicada).not.toBe(deltaDaLinha);
  });

  it("uma memória SEM declaração de medida continua legível — a ausência não vira ilegível", () => {
    // ⚠️ MIGRATION ADITIVA APLICADA À LEITURA: todo contracheque gravado antes desta rodada não
    // tem `medida`, `natureza` nem `regimeDeTributacao`. Exigi-los faria cada um deles virar
    // ILEGÍVEL — o sistema deixando de ler os próprios fatos passados por causa de um campo novo.
    const m = lerMemoriaDoContracheque(calcularContracheque(entradaCorreta("3000")).memoria);
    expect(m.medida.situacao).toBe("AUSENTE");
    expect(m.natureza.situacao).toBe("AUSENTE");
    expect(m.regimeDeTributacao.situacao).toBe("AUSENTE");
    expect(m.dias.situacao).toBe("PRESENTE");
  });
});
