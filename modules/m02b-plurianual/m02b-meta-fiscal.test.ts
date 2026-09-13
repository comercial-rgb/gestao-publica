import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { metaFiscalDoExercicio } from "./consultas.js";
import { criarLdo, criarMetaAnualLdo } from "./servico.js";

/**
 * A META FISCAL DA LDO — o insumo do confronto do RREO Anexo 6.
 *
 * ═══ ⚠️ A DÍVIDA QUE ESTE ARQUIVO PAGA ═══
 * `rreo-anexo6.ts` tinha `META_FISCAL_LDO = null` fixo, com um docblock afirmando que *"não
 * existe entidade de meta fiscal neste repositório"*. Deixou de ser verdade quando
 * `MetaAnualLdo` nasceu — e o comentário continuou afirmando a ausência por três commits.
 *
 * Documentação que descreve um buraco já tapado faz quem lê PARAR DE PROCURAR. É a classe
 * de erro que mais custou nesta base, e é por isso que este teste existe: ele falha se
 * alguém voltar a fixar a meta em `null`.
 *
 * ═══ AS TRÊS SAÍDAS ═══
 * · UMA meta para o ano ....... devolve, com o primário DERIVADO
 * · NENHUMA .................. `null` SEM pendência (não ter LDO não é defeito)
 * · MAIS DE UMA .............. `null` COM pendência nomeada
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "planejamento@cg.pb.gov.br";

/** Uma LDO com uma meta anual para `ano`. Os números são os da conta à mão abaixo. */
async function ldoComMeta(
  exercicioDaLdo: number,
  ano: number,
  receitaPrimaria: string,
  despesaPrimaria: string,
  resultadoNominal: string
): Promise<string> {
  const { ldoId } = await criarLdo(prisma, {
    exercicio: exercicioDaLdo,
    inicioVigencia: new Date(`${exercicioDaLdo}-01-01T00:00:00Z`),
    fimVigencia: new Date(`${exercicioDaLdo}-12-31T23:59:59Z`),
    criadoPor: POR,
  });

  await criarMetaAnualLdo(prisma, {
    ldoId,
    ano,
    receitaTotal: "1000000.00",
    receitaPrimaria,
    despesaTotal: "1000000.00",
    despesaPrimaria,
    resultadoNominal,
    dividaPublicaConsolidada: "0.00",
    dividaConsolidadaLiquida: "0.00",
    receitaPrimariaPpp: "0.00",
    despesaPrimariaPpp: "0.00",
    impactoSaldoPpp: "0.00",
    criadoPor: POR,
  });

  return ldoId;
}

beforeEach(async () => {
  await limparBanco(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("meta fiscal da LDO — as três saídas", () => {
  /**
   * ⚠️ A CONTA À MÃO: receita primária 900.000,00 − despesa primária 800.000,00 = 100.000,00.
   * O primário é DERIVADO pela função do domínio; não existe coluna para ele.
   */
  it("UMA meta: devolve, com o resultado primário DERIVADO", async () => {
    await ldoComMeta(2026, 2026, "900000.00", "800000.00", "-20000.00");

    const r = await metaFiscalDoExercicio(prisma, 2026);

    expect(r.pendencia).toBeNull();
    expect(r.meta).not.toBeNull();
    expect(r.meta!.resultadoPrimario.toFixed(2)).toBe("100000.00");
    expect(r.meta!.resultadoNominal.toFixed(2)).toBe("-20000.00");
  });

  it("déficit primário é meta legítima — nenhum guard de sinal", async () => {
    await ldoComMeta(2026, 2026, "800000.00", "950000.00", "-100000.00");

    const r = await metaFiscalDoExercicio(prisma, 2026);
    expect(r.meta!.resultadoPrimario.toFixed(2)).toBe("-150000.00");
  });

  /**
   * ⚠️ SEM PENDÊNCIA. Não ter LDO cadastrada não é defeito do anexo — é ausência de dado, e
   * o Anexo 6 já sabe degradar. Emitir pendência aqui encheria de ruído todo RREO de ente
   * que ainda não cadastrou a LDO.
   */
  it("NENHUMA meta: `null` SEM pendência", async () => {
    const r = await metaFiscalDoExercicio(prisma, 2026);
    expect(r.meta).toBeNull();
    expect(r.pendencia).toBeNull();
  });

  it("meta para OUTRO ano não vale para este", async () => {
    await ldoComMeta(2026, 2027, "900000.00", "800000.00", "0.00");

    const r = await metaFiscalDoExercicio(prisma, 2026);
    expect(r.meta).toBeNull();
    expect(r.pendencia).toBeNull();
  });

  /**
   * ⚠️ O CASO QUE DECIDIU O DESENHO. A LDO projeta o exercício corrente e os DOIS seguintes
   * (LRF art. 4º §1º) — então a LDO de 2025 declara uma meta para 2026, e a de 2026 declara
   * OUTRA para o mesmo 2026. As duas legítimas.
   *
   * Qual vale depende da lei orgânica do ente, que este repositório NÃO modela — o schema
   * registra a ambiguidade ("ela é de N e orienta a LOA de N+1... ou de N"). Escolher "a
   * mais recente" seria uma regra inventada aqui, e o RREO 6 é prestação de contas:
   * confrontar contra a meta ERRADA é pior do que não confrontar.
   */
  it("⚠️ DUAS metas para o mesmo ano: `null` COM pendência que NOMEIA o conflito", async () => {
    await ldoComMeta(2025, 2026, "900000.00", "800000.00", "0.00");
    await ldoComMeta(2026, 2026, "950000.00", "780000.00", "0.00");

    const r = await metaFiscalDoExercicio(prisma, 2026);

    expect(r.meta).toBeNull();
    expect(r.pendencia).not.toBeNull();
    expect(r.pendencia!).toMatch(/META-FISCAL-AMBIGUA/);
    // A pendência diz QUAIS LDOs conflitam — sem isso, quem lê não sabe onde procurar.
    expect(r.pendencia!).toContain("LDO 2025");
    expect(r.pendencia!).toContain("LDO 2026");
  });

  /** ⚠️ O canário da regressão: se alguém voltar a fixar `null`, este teste cai. */
  it("⚠️ a meta NÃO é constante — ela varia com o dado", async () => {
    const semDado = await metaFiscalDoExercicio(prisma, 2026);
    expect(semDado.meta).toBeNull();

    await ldoComMeta(2026, 2026, "900000.00", "800000.00", "-20000.00");

    const comDado = await metaFiscalDoExercicio(prisma, 2026);
    expect(comDado.meta).not.toBeNull();
  });
});
