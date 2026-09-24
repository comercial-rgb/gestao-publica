import { describe, expect, it } from "vitest";
import { Decimal, toMoney, type Money } from "../../packages/contracts/index.js";
import { sha256Canonico, type ContrachequeCalculado, type LinhaCalculada } from "./dominio.js";
import {
  calcularContrachequeComplementar,
  DiferencaNegativaNaComplementarError,
  REGIME_DE_TRIBUTACAO_DA_COMPLEMENTAR,
  type ApuracaoAnteriorDaRubrica,
  type IdentidadeDaRubrica,
} from "./complementar.js";

/**
 * ═══ M33 / V11 V9.4 — A DIFERENÇA DA FOLHA MENSAL COMPLEMENTAR, DOMÍNIO PURO ═══
 *
 * ⚠️ TODO ESPERADO ESTÁ CALCULADO À MÃO no comentário do caso. Produzir o esperado chamando o
 * próprio motor faria a suíte concordar com qualquer regra errada desde que consistente — é a
 * regra do "parser se testa contra implementação independente", aplicada a uma subtração.
 *
 * ⚠️ N=2 EM TODOS OS CASOS POSITIVOS, COM DELTAS DIFERENTES ENTRE SI. Com um vínculo só, "aplicar
 * um valor fixo" e "aplicar o delta do vínculo errado" passam os dois; com dois vínculos cujos
 * deltas coincidissem, o segundo ainda passaria. MAT-A e MAT-B têm deltas diferentes em TODAS as
 * rubricas e líquidos diferentes.
 */

const REGIME = "RPPS" as const;

const RUBRICAS: Readonly<Record<string, IdentidadeDaRubrica>> = {
  VENC: { id: "r-venc", codigo: "VENC", descricao: "Vencimento", tipo: "PROVENTO", natureza: "VENCIMENTO_BASE", ordem: 1 },
  HEXT: { id: "r-hext", codigo: "HEXT", descricao: "Horas extras", tipo: "PROVENTO", natureza: "VALOR_INFORMADO", ordem: 3 },
  PREV: { id: "r-prev", codigo: "PREV", descricao: "Contribuicao", tipo: "DESCONTO", natureza: "CONTRIBUICAO_PREVIDENCIARIA", ordem: 90 },
};
const IDENTIDADE: ReadonlyMap<string, IdentidadeDaRubrica> = new Map(Object.values(RUBRICAS).map((r) => [r.id, r]));

function linha(r: IdentidadeDaRubrica, valor: string): LinhaCalculada {
  return {
    rubricaId: r.id, codigo: r.codigo, descricao: r.descricao, tipo: r.tipo, natureza: r.natureza, ordem: r.ordem,
    valorBase: toMoney(valor), fator: new Decimal(1), valor: toMoney(valor),
    incideContribuicao: r.tipo === "PROVENTO", incideIrrf: r.tipo === "PROVENTO",
    memoria: `fixture: ${r.codigo} = ${valor}`,
  };
}

/**
 * Um contracheque CORRETO de fixture. Os totais são somados aqui a partir das linhas, e não
 * copiados de nenhum motor: o que este arquivo testa é a SUBTRAÇÃO, e o minuendo tem de ser um
 * dado de entrada conferível à mão.
 */
function correto(vinculoId: string, linhas: readonly LinhaCalculada[], baseContribuicao: string, baseIrrf: string): ContrachequeCalculado {
  const soma = (t: "PROVENTO" | "DESCONTO"): Money =>
    linhas.filter((l) => l.tipo === t).reduce((a, l) => toMoney(a.plus(l.valor)), toMoney(0));
  const proventos = soma("PROVENTO");
  const descontos = soma("DESCONTO");
  const contribuicao = linhas.filter((l) => l.natureza === "CONTRIBUICAO_PREVIDENCIARIA").reduce((a, l) => toMoney(a.plus(l.valor)), toMoney(0));
  const memoria = { fixture: "recalculo integral", vinculoId, linhas: linhas.map((l) => `${l.codigo}=${l.valor.toFixed(2)}`) };
  return {
    vinculoId,
    regime: REGIME,
    diasComputados: 30,
    linhas,
    totais: {
      proventos, descontos, liquido: toMoney(proventos.minus(descontos)),
      baseContribuicao: toMoney(baseContribuicao), contribuicao,
      baseIrrf: toMoney(baseIrrf), irrf: toMoney(0),
    },
    contribuicao: { regime: REGIME, base: toMoney(baseContribuicao), baseAntesDoTeto: toMoney(baseContribuicao), tetoAplicado: false, valor: contribuicao, faixas: [], tabelaId: "t-prev", fundamentacao: "fixture" },
    irrf: { rendaTributavel: toMoney(baseIrrf), base: toMoney(baseIrrf), valor: toMoney(0), cenario: "DEDUCOES_LEGAIS", cenarios: [], tabelaId: "t-irrf", fundamentacao: "fixture" },
    salarioFamilia: null,
    memoria,
    sha256: sha256Canonico(memoria),
  };
}

function apurado(pares: readonly (readonly [IdentidadeDaRubrica, string])[]): ReadonlyMap<string, ApuracaoAnteriorDaRubrica> {
  return new Map(
    pares.map(([r, v]) => [
      r.id,
      { total: toMoney(v), parcelas: [{ folhaTipo: "MENSAL", competencia: "2026-05", calculoNumero: 1, valor: toMoney(v) }] },
    ])
  );
}

describe("a diferença, rubrica a rubrica (N=2, deltas diferentes entre si)", () => {
  /**
   * MAT-A — a remuneração de maio foi corrigida para cima (o vencimento certo era 3.000,00 e
   * pagou-se 2.800,00).
   *
   *   VENC  correto 3.000,00 − apurado 2.800,00 = 200,00
   *   PREV  correto   300,00 − apurado   280,00 =  20,00   (10% sobre a base corrigida)
   *   líquido da diferença = 200,00 − 20,00 = 180,00
   *
   * MAT-B — o vencimento estava certo; faltou lançar a hora extra.
   *
   *   VENC  correto 2.000,00 − apurado 2.000,00 =   0,00  → NÃO vira linha
   *   HEXT  correto   150,00 − apurado     0,00 = 150,00
   *   PREV  correto   215,00 − apurado   200,00 =  15,00
   *   líquido da diferença = 150,00 − 15,00 = 135,00
   *
   * ⚠️ 180,00 ≠ 135,00 e 200,00 ≠ 150,00 e 20,00 ≠ 15,00 — nenhum valor de um serve para o outro.
   */
  const a = calcularContrachequeComplementar({
    competencia: "2026-05",
    matricula: "MAT-A",
    correto: correto("v-a", [linha(RUBRICAS["VENC"]!, "3000.00"), linha(RUBRICAS["PREV"]!, "300.00")], "3000.00", "2700.00"),
    jaApurado: apurado([[RUBRICAS["VENC"]!, "2800.00"], [RUBRICAS["PREV"]!, "280.00"]]),
    identidadeDaRubrica: IDENTIDADE,
  });
  const b = calcularContrachequeComplementar({
    competencia: "2026-05",
    matricula: "MAT-B",
    correto: correto("v-b", [linha(RUBRICAS["VENC"]!, "2000.00"), linha(RUBRICAS["HEXT"]!, "150.00"), linha(RUBRICAS["PREV"]!, "215.00")], "2150.00", "1935.00"),
    jaApurado: apurado([[RUBRICAS["VENC"]!, "2000.00"], [RUBRICAS["PREV"]!, "200.00"]]),
    identidadeDaRubrica: IDENTIDADE,
  });

  it("MAT-A paga 200,00 de vencimento e retém 20,00 — líquido 180,00", () => {
    expect(a).not.toBeNull();
    expect(a!.totais.proventos.toFixed(2)).toBe("200.00");
    expect(a!.totais.descontos.toFixed(2)).toBe("20.00");
    expect(a!.totais.liquido.toFixed(2)).toBe("180.00");
    expect(a!.linhas.map((l) => `${l.codigo}=${l.valor.toFixed(2)}`)).toEqual(["VENC=200.00", "PREV=20.00"]);
  });

  it("MAT-B paga 150,00 de hora extra e retém 15,00 — líquido 135,00, e o vencimento NÃO vira linha", () => {
    expect(b).not.toBeNull();
    expect(b!.totais.proventos.toFixed(2)).toBe("150.00");
    expect(b!.totais.descontos.toFixed(2)).toBe("15.00");
    expect(b!.totais.liquido.toFixed(2)).toBe("135.00");
    // ⚠️ VENC NÃO APARECE: uma linha de 0,00 diria "esta rubrica foi paga agora, no valor de
    // zero", que é falso — ela foi paga em maio, por inteiro.
    expect(b!.linhas.map((l) => l.codigo)).toEqual(["HEXT", "PREV"]);
  });

  it("os dois têm líquidos DIFERENTES — sem isto, 'aplicar valor fixo' passaria", () => {
    expect(a!.totais.liquido.toFixed(2)).not.toBe(b!.totais.liquido.toFixed(2));
    expect(a!.sha256).not.toBe(b!.sha256);
  });

  it("a memória diz DE ONDE veio cada delta: a folha, o cálculo e o valor anterior", () => {
    const rubricas = (a!.memoria["rubricas"] as readonly Record<string, unknown>[]);
    const venc = rubricas.find((r) => r["codigo"] === "VENC")!;
    expect(venc["correto"]).toBe("3000.00");
    expect(venc["jaApurado"]).toBe("2800.00");
    expect(venc["diferenca"]).toBe("200.00");
    expect(venc["procedencia"]).toEqual([{ folha: "MENSAL", competencia: "2026-05", calculo: 1, valor: "2800.00" }]);
    // ⚠️ E A LINHA DO CONTRACHEQUE DIZ O MESMO — é ela que o servidor lê, não o JSON.
    const linhaVenc = a!.linhas.find((l) => l.codigo === "VENC")!;
    expect(linhaVenc.memoria).toContain("correto recalculado 3.000,00 − já apurado 2.800,00");
    expect(linhaVenc.memoria).toContain("MENSAL de 2026-05, cálculo nº 1: 2.800,00");
  });

  it("a memória declara que isto é DIFERENÇA e sob que regime tributário — não deixa deduzir", () => {
    expect(String(a!.memoria["natureza"])).toContain("DIFERENCA");
    expect(String(a!.memoria["natureza"])).toContain("NAO foi reaberta");
    expect(a!.memoria["regimeDeTributacao"]).toBe(REGIME_DE_TRIBUTACAO_DA_COMPLEMENTAR);
    expect(String(a!.memoria["regimeDeTributacao"])).toContain("REGIME DE COMPETENCIA");
  });

  it("as bases são as do recálculo INTEGRAL e os valores são os deltas — e o recálculo vai junto", () => {
    // Sem esta distinção, quem somasse `baseContribuicao` acharia a base da diferença, que nenhuma
    // tabela produziu; e quem somasse `contribuicao` acharia a do mês inteiro.
    expect(a!.totais.baseContribuicao.toFixed(2)).toBe("3000.00");
    expect(a!.totais.contribuicao.toFixed(2)).toBe("20.00");
    expect(a!.memoria["recalculoIntegral"]).toBeDefined();
  });
});

describe("delta zero — não há contracheque", () => {
  it("correto igual ao apurado em todas as rubricas devolve null", () => {
    const r = calcularContrachequeComplementar({
      competencia: "2026-05",
      matricula: "MAT-C",
      correto: correto("v-c", [linha(RUBRICAS["VENC"]!, "2500.00"), linha(RUBRICAS["PREV"]!, "250.00")], "2500.00", "2250.00"),
      jaApurado: apurado([[RUBRICAS["VENC"]!, "2500.00"], [RUBRICAS["PREV"]!, "250.00"]]),
      identidadeDaRubrica: IDENTIDADE,
    });
    // Contracheque de zero não é contracheque: é contracheque que não existe. Gravá-lo faria a
    // lista de quem recebeu complementar mentir sobre quem recebeu.
    expect(r).toBeNull();
  });
});

describe("delta negativo — RECUSA nomeando a matrícula, nunca clamp a zero", () => {
  it("provento a menor: reposição ao erário, e a recusa diz isso", () => {
    let erro: unknown = null;
    try {
      calcularContrachequeComplementar({
        competencia: "2026-05",
        matricula: "MAT-D",
        correto: correto("v-d", [linha(RUBRICAS["VENC"]!, "2000.00"), linha(RUBRICAS["PREV"]!, "200.00")], "2000.00", "1800.00"),
        jaApurado: apurado([[RUBRICAS["VENC"]!, "2100.00"], [RUBRICAS["PREV"]!, "200.00"]]),
        identidadeDaRubrica: IDENTIDADE,
      });
    } catch (e) {
      erro = e;
    }
    // ⚠️ A NEGAÇÃO AFIRMA O MOTIVO, não só "falhou": "não calculou" é compatível com o motor tendo
    // caído por qualquer outra razão.
    expect(erro).toBeInstanceOf(DiferencaNegativaNaComplementarError);
    const msg = (erro as Error).message;
    expect(msg).toContain("COMPLEMENTAR-COM-DIFERENCA-NEGATIVA");
    expect(msg).toContain("MAT-D");
    expect(msg).toContain("VENC");
    // V12 U2 — a prosa da recusa passou a ser pt-BR; o VALOR não mudou, a redação sim.
    expect(msg).toContain("2.000,00");
    expect(msg).toContain("2.100,00");
    /**
     * ⚠️ V11 V9.4b — A RECUSA DIZ O FATO VERIFICADO, E O FATO É "APURADO EM FOLHA FECHADA".
     *
     * Antes ela afirmava "O servidor RECEBEU A MAIS". O cálculo NÃO consulta certificação,
     * empenho, liquidação nem pagamento — só `fechamento !== null` —, então o recebimento é fato
     * que o sistema não tem como conhecer: uma folha fechada e DEVOLVIDA para correção nunca será
     * liquidada nem paga. É a mesma doença que a V11 V9.2 corrigiu quando a memória dizia "1ª
     * parcela já PAGA" sobre um cálculo que só verificara o fechamento.
     */
    expect(msg).toContain("APURADOS A MAIS");
    expect(msg).toContain("em folha já fechada");
    // ⚠️ A NEGATIVA É A METADE QUE IMPORTA: a mensagem não pode AFIRMAR pagamento ou recebimento.
    expect(msg).not.toMatch(/RECEBEU A MAIS|RETEVE A MAIS|já pag/i);
    // e continua ORIENTANDO — recusa sem próximo passo empurra o operador para a adivinhação
    expect(msg).toContain("O QUE FAZER");
  });

  it("desconto a menor: devolução de retenção indevida, e a recusa diz O OUTRO motivo", () => {
    // ⚠️ ESTE CASO NÃO É REDUNDANTE COM O ANTERIOR: são dois atos diferentes, e uma mensagem só
    // para os dois mandaria o operador procurar o rito errado.
    let erro: unknown = null;
    try {
      calcularContrachequeComplementar({
        competencia: "2026-05",
        matricula: "MAT-E",
        correto: correto("v-e", [linha(RUBRICAS["VENC"]!, "2000.00"), linha(RUBRICAS["PREV"]!, "200.00")], "2000.00", "1800.00"),
        jaApurado: apurado([[RUBRICAS["VENC"]!, "2000.00"], [RUBRICAS["PREV"]!, "210.00"]]),
        identidadeDaRubrica: IDENTIDADE,
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DiferencaNegativaNaComplementarError);
    expect((erro as Error).message).toContain("MAT-E");
    expect((erro as Error).message).toContain("PREV");
    // O OUTRO motivo, e ele também passa a falar de APURAÇÃO: reter a mais em folha fechada não
    // prova que a retenção foi recolhida — o recolhimento é ato próprio, com guia e pagamento.
    expect((erro as Error).message).toContain("RETIDOS A MAIS");
    expect((erro as Error).message).toContain("em folha já fechada");
    expect((erro as Error).message).not.toMatch(/RECEBEU A MAIS|RETEVE A MAIS|já pag/i);
  });

  it("rubrica que só o PASSADO tem também é recusa — iterar só pelo correto a perderia", () => {
    /**
     * ⚠️ ESTE É O CASO QUE A ITERAÇÃO INGÊNUA PERDE. HEXT foi paga em maio e o recálculo de hoje
     * não a produz (o lançamento foi excluído). Percorrendo só `correto.linhas`, ela nunca seria
     * olhada: a complementar sairia com os outros deltas e calaria sobre 100,00 pagos a mais.
     */
    let erro: unknown = null;
    try {
      calcularContrachequeComplementar({
        competencia: "2026-05",
        matricula: "MAT-F",
        correto: correto("v-f", [linha(RUBRICAS["VENC"]!, "2100.00"), linha(RUBRICAS["PREV"]!, "210.00")], "2100.00", "1890.00"),
        jaApurado: apurado([[RUBRICAS["VENC"]!, "2000.00"], [RUBRICAS["HEXT"]!, "100.00"], [RUBRICAS["PREV"]!, "210.00"]]),
        identidadeDaRubrica: IDENTIDADE,
      });
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(DiferencaNegativaNaComplementarError);
    expect((erro as Error).message).toContain("HEXT");
    expect((erro as Error).message).toContain("MAT-F");
  });
});

describe("rubrica sem identidade — fail-closed, nunca 'pula esta'", () => {
  it("recusa nomeando a rubrica em vez de produzir um complementar a menos", () => {
    expect(() =>
      calcularContrachequeComplementar({
        competencia: "2026-05",
        matricula: "MAT-G",
        correto: correto("v-g", [linha(RUBRICAS["VENC"]!, "2000.00")], "2000.00", "2000.00"),
        jaApurado: apurado([[RUBRICAS["VENC"]!, "1900.00"]]),
        identidadeDaRubrica: new Map(),
      })
    ).toThrow(/COMPLEMENTAR-RUBRICA-SEM-IDENTIDADE/);
  });
});
