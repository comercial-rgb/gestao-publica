import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import {
  anoNoQuadrienio,
  dividaLiquida,
  duracaoValidaDoQuadrienio,
  margemDeExpansao,
  resultadoPrimario,
  CODIGOS_PASSIVO_CONTINGENTE,
} from "./dominio.js";
import {
  criarAlienacaoBemLdo,
  criarAplicacaoAlienacaoLdo,
  criarDividaConsolidadaLdo,
  criarLdo,
  criarMetaAnualLdo,
  criarPlanoPlurianual,
  criarPrevisaoReceitaPpa,
  criarProjecaoAtuarialRpps,
  criarReceitaAnteriorPpa,
  criarRiscoFiscal,
} from "./servico.js";

/**
 * M02b — PPA e LDO. O planejamento PLURIANUAL.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROVA ═══
 * · t1 — O QUADRIÊNIO. A regra que define o que é um PPA, e o erro de intervalo fechado
 *   que produziria um plano de cinco anos com todos os valores certos.
 * · t2 — AS DERIVAÇÕES. Resultado primário, dívida líquida e margem — os três que NÃO
 *   são coluna, e os três que podem ser negativos.
 * · t3 — SEM PERMISSÃO, ESTOURA.
 * · t4 — OS DOMÍNIOS TABELADOS e as regras de coerência.
 * · t5 — O CANÁRIO DO `unidadeOrcId`.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO **NÃO** PROVA, E POR QUÊ ═══
 * "Toda criação grava `RegistroDeOperacao`" (teste 2 do enunciado) NÃO se aplica aqui.
 * O registro do TR 6.3 é gravado por `comEscritaAutenticada` (`lib/portas/sessao.ts:98`),
 * que é camada de PORTA — e este PR não tem porta nem tela, por decisão de escopo. Os
 * serviços de domínio AUTORIZAM (t3 prova) mas não registram operação; nenhum serviço de
 * domínio do repositório o faz. Quando a UI do M02b existir, o guard é o mesmo grep de
 * `test/ui/contratos-escrita.test.ts`.
 */

const prisma = criarPrismaDeTeste();

// ⚠️ FAIL-HARD: banco indisponível DERRUBA este arquivo — nunca o pula.
await exigirBanco(prisma);

const POR = "planejamento@cg.pb.gov.br";
const SEM_PODER = "estagiario-plan@cg.pb.gov.br";

const PLANO = {
  anoInicio: 2026,
  anoFim: 2029,
  leiRef: "Lei Municipal 1.234/2025",
  dataPublicacao: new Date("2025-12-20T12:00:00Z"),
  criadoPor: POR,
};

const LDO = {
  exercicio: 2026,
  inicioVigencia: new Date("2026-01-01T00:00:00Z"),
  fimVigencia: new Date("2026-12-31T23:59:59Z"),
  criadoPor: POR,
};

beforeEach(async () => {
  await limparBanco(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t1 — O QUADRIÊNIO
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t1 — o quadriênio define o que é um PPA (CF art. 165 §1º)", () => {
  /**
   * ⚠️ O ERRO QUE ESTE TESTE EXISTE PARA PEGAR é `anoFim − anoInicio == 4`. Ele produziria
   * um "PPA" de CINCO exercícios (2026 a 2030) com todos os valores corretos — nenhum
   * teste de dinheiro o pegaria, e o TCE recusaria a peça inteira.
   */
  it("⚠️ quatro exercícios significam diferença TRÊS — as bordas são inclusivas", () => {
    expect(duracaoValidaDoQuadrienio(2026, 2029)).toBe(true); // 26,27,28,29 = quatro
    expect(duracaoValidaDoQuadrienio(2026, 2030)).toBe(false); // cinco
    expect(duracaoValidaDoQuadrienio(2026, 2028)).toBe(false); // três
    expect(duracaoValidaDoQuadrienio(2026, 2026)).toBe(false); // um
  });

  it("o ano dentro do quadriênio, com as duas bordas inclusivas", () => {
    expect(anoNoQuadrienio(2026, 2029, 2026)).toBe(true);
    expect(anoNoQuadrienio(2026, 2029, 2029)).toBe(true);
    expect(anoNoQuadrienio(2026, 2029, 2025)).toBe(false);
    expect(anoNoQuadrienio(2026, 2029, 2030)).toBe(false);
  });

  it("cria o plano de quatro anos", async () => {
    const { planoId } = await criarPlanoPlurianual(prisma, PLANO);
    const p = await prisma.planoPlurianual.findUniqueOrThrow({
      where: { id: planoId },
      select: { anoInicio: true, anoFim: true, leiRef: true },
    });
    expect(p.anoInicio).toBe(2026);
    expect(p.anoFim).toBe(2029);
    expect(p.leiRef).toBe("Lei Municipal 1.234/2025");
  });

  it("anoFim <= anoInicio é RECUSADO nomeando", async () => {
    await expect(
      criarPlanoPlurianual(prisma, { ...PLANO, anoFim: 2025 })
    ).rejects.toThrow(/QUADRIÊNIO INVERTIDO/i);
    await expect(
      criarPlanoPlurianual(prisma, { ...PLANO, anoFim: 2026 })
    ).rejects.toThrow(/QUADRIÊNIO INVERTIDO/i);
  });

  it("⚠️ duração diferente de quatro é RECUSADA — três e cinco", async () => {
    await expect(
      criarPlanoPlurianual(prisma, { ...PLANO, anoFim: 2028 })
    ).rejects.toThrow(/DURAÇÃO INVÁLIDA/i);
    await expect(
      criarPlanoPlurianual(prisma, { ...PLANO, anoFim: 2030 })
    ).rejects.toThrow(/DURAÇÃO INVÁLIDA/i);
    expect(await prisma.planoPlurianual.count()).toBe(0);
  });

  it("previsão FORA do quadriênio é recusada; dentro, aceita", async () => {
    const { planoId } = await criarPlanoPlurianual(prisma, PLANO);
    const natureza = await prisma.naturezaReceita.create({
      data: { codigo: "11130111", descricao: "IPTU" },
      select: { id: true },
    });
    const fonte = await prisma.fonteRecurso.create({
      data: { codigo: "500", descricao: "Livre", codigoTce: "500" },
      select: { id: true },
    });

    const base = {
      planoId,
      naturezaReceitaId: natureza.id,
      fonteId: fonte.id,
      valor: "1000000.00",
      criadoPor: POR,
    };

    await expect(
      criarPrevisaoReceitaPpa(prisma, { ...base, ano: 2030 })
    ).rejects.toThrow(/ANO FORA DO QUADRIÊNIO/i);

    const { previsaoId } = await criarPrevisaoReceitaPpa(prisma, { ...base, ano: 2027 });
    expect(previsaoId).toBeTruthy();
  });

  /**
   * ⚠️ A SÉRIE HISTÓRICA TEM DE PRECEDER O PLANO. Um "histórico" dentro do próprio
   * quadriênio seria a previsão se justificando com ela mesma.
   */
  it("⚠️ receita anterior DENTRO do quadriênio é recusada", async () => {
    const { planoId } = await criarPlanoPlurianual(prisma, PLANO);
    const natureza = await prisma.naturezaReceita.create({
      data: { codigo: "11130111", descricao: "IPTU" },
      select: { id: true },
    });

    await expect(
      criarReceitaAnteriorPpa(prisma, {
        planoId,
        naturezaReceitaId: natureza.id,
        ano: 2026,
        valor: "900000.00",
        criadoPor: POR,
      })
    ).rejects.toThrow(/ANO NÃO É ANTERIOR AO PLANO/i);

    const { receitaAnteriorId } = await criarReceitaAnteriorPpa(prisma, {
      planoId,
      naturezaReceitaId: natureza.id,
      ano: 2025,
      valor: "900000.00",
      criadoPor: POR,
    });
    expect(receitaAnteriorId).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t2 — AS DERIVAÇÕES (o que NÃO é coluna)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t2 — as derivações, e o sinal que elas podem ter", () => {
  it("resultado primário = receita primária − despesa primária", () => {
    expect(resultadoPrimario(toMoney("1000.00"), toMoney("800.00")).toFixed(2)).toBe(
      "200.00"
    );
  });

  /** ⚠️ DÉFICIT PRIMÁRIO É RESULTADO LEGÍTIMO — nenhum guard de sinal. */
  it("⚠️ o resultado primário pode ser NEGATIVO", () => {
    expect(resultadoPrimario(toMoney("800.00"), toMoney("1000.00")).toFixed(2)).toBe(
      "-200.00"
    );
  });

  it("⚠️ ele NÃO é coluna — a tabela guarda as parcelas, não a diferença", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    await criarMetaAnualLdo(prisma, {
      ldoId,
      ano: 2026,
      receitaTotal: "1000.00",
      receitaPrimaria: "900.00",
      despesaTotal: "950.00",
      despesaPrimaria: "800.00",
      resultadoNominal: "-50.00",
      dividaPublicaConsolidada: "0.00",
      dividaConsolidadaLiquida: "0.00",
      receitaPrimariaPpp: "0.00",
      despesaPrimariaPpp: "0.00",
      impactoSaldoPpp: "0.00",
      criadoPor: POR,
    });

    const colunas = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'MetaAnualLdo'`
    );
    const nomes = colunas.map((c) => c.column_name);
    // Guardar a diferença seria cache de dinheiro — o bug do TR 5.9.
    expect(nomes).not.toContain("resultadoPrimario");
    // As parcelas ESTÃO lá, e é delas que a derivação sai.
    expect(nomes).toContain("receitaPrimaria");
    expect(nomes).toContain("despesaPrimaria");

    const meta = await prisma.metaAnualLdo.findFirstOrThrow({
      select: { receitaPrimaria: true, despesaPrimaria: true },
    });
    expect(
      resultadoPrimario(
        toMoney(meta.receitaPrimaria.toFixed(2)),
        toMoney(meta.despesaPrimaria.toFixed(2))
      ).toFixed(2)
    ).toBe("100.00");
  });

  it("dívida líquida = consolidada − deduções", () => {
    expect(dividaLiquida(toMoney("5000.00"), toMoney("1200.00")).toFixed(2)).toBe("3800.00");
  });

  /** ⚠️ MARGEM NEGATIVA É INFORMAÇÃO: o ente assumiu mais gasto continuado do que cabe. */
  it("⚠️ a margem de expansão pode ser NEGATIVA", () => {
    expect(
      margemDeExpansao(toMoney("100.00"), toMoney("50.00"), toMoney("400.00")).toFixed(2)
    ).toBe("-250.00");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t3 — SEM PERMISSÃO, ESTOURA
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t3 — criação sem permissão ESTOURA (TR 6.4)", () => {
  beforeEach(async () => {
    await prisma.usuario.create({
      data: { identificador: SEM_PODER, nome: "Estagiário", criadoPor: "TESTE" },
    });
  });

  it("criarPlanoPlurianual estoura e NADA é gravado", async () => {
    await expect(
      criarPlanoPlurianual(prisma, { ...PLANO, criadoPor: SEM_PODER })
    ).rejects.toThrow();
    expect(await prisma.planoPlurianual.count()).toBe(0);
  });

  it("criarLdo estoura e NADA é gravado", async () => {
    await expect(criarLdo(prisma, { ...LDO, criadoPor: SEM_PODER })).rejects.toThrow();
    expect(await prisma.leiDiretrizesOrcamentarias.count()).toBe(0);
  });

  it("criarRiscoFiscal estoura", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    await expect(
      criarRiscoFiscal(prisma, {
        ldoId,
        codigoPassivo: "1",
        descricaoPassivo: "Demandas judiciais trabalhistas",
        valorPassivo: "500000.00",
        descricaoProvidencia: "Reserva de contingência",
        valorProvidencia: "500000.00",
        criadoPor: SEM_PODER,
      })
    ).rejects.toThrow();
    expect(await prisma.riscoFiscal.count()).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t4 — OS DOMÍNIOS TABELADOS E A COERÊNCIA
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t4 — domínios e coerência dos anexos da LRF", () => {
  it("o rol do passivo contingente é 1 a 8 mais 99 (outros)", () => {
    expect([...CODIGOS_PASSIVO_CONTINGENTE]).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "99",
    ]);
  });

  it("⚠️ codigoPassivo fora do domínio é RECUSADO", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    const base = {
      ldoId,
      descricaoPassivo: "Passivo qualquer",
      valorPassivo: "1000.00",
      descricaoProvidencia: "Providência qualquer",
      valorProvidencia: "1000.00",
      criadoPor: POR,
    };

    for (const codigo of ["0", "9", "10", "ABC"]) {
      await expect(
        criarRiscoFiscal(prisma, { ...base, codigoPassivo: codigo })
      ).rejects.toThrow(/domínio/i);
    }
    expect(await prisma.riscoFiscal.count()).toBe(0);

    // O 99 ("outros") PASSA — ele existe justamente para o que não se encaixa nos oito.
    const { riscoId } = await criarRiscoFiscal(prisma, { ...base, codigoPassivo: "99" });
    expect(riscoId).toBeTruthy();
  });

  it("⚠️ aplicação SEM alienação pai é recusada nomeando", async () => {
    await expect(
      criarAplicacaoAlienacaoLdo(prisma, {
        alienacaoId: "nao-existe",
        tipoAplicacao: "1",
        anoAplicacao: 2026,
        descricao: "Aplicação órfã",
        valor: "1000.00",
        criadoPor: POR,
      })
    ).rejects.toThrow(/Alienação nao-existe não existe/);
  });

  it("aplicação COM alienação pai é aceita; tipo fora do domínio é recusado", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    const { alienacaoId } = await criarAlienacaoBemLdo(prisma, {
      ldoId,
      descricaoBem: "Terreno na Av. Central",
      valorAlienacao: "800000.00",
      numeroLaudo: "LAUDO-2025/17",
      criadoPor: POR,
    });

    const base = {
      alienacaoId,
      anoAplicacao: 2026,
      descricao: "Investimento em obras de infraestrutura",
      valor: "800000.00",
      criadoPor: POR,
    };

    await expect(
      criarAplicacaoAlienacaoLdo(prisma, { ...base, tipoAplicacao: "9" })
    ).rejects.toThrow(/domínio/i);

    const { aplicacaoId } = await criarAplicacaoAlienacaoLdo(prisma, {
      ...base,
      tipoAplicacao: "1",
    });
    expect(aplicacaoId).toBeTruthy();
  });

  /**
   * ⚠️ A PRIMÁRIA NÃO EXCEDE A TOTAL — ela é a total MENOS as financeiras. Uma primária
   * maior denuncia colunas trocadas no preenchimento, que é o erro que ninguém revê.
   */
  it("⚠️ receita/despesa primária maior que a total é RECUSADA", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    const base = {
      ldoId,
      ano: 2026,
      receitaTotal: "1000.00",
      receitaPrimaria: "900.00",
      despesaTotal: "950.00",
      despesaPrimaria: "800.00",
      resultadoNominal: "0.00",
      dividaPublicaConsolidada: "0.00",
      dividaConsolidadaLiquida: "0.00",
      receitaPrimariaPpp: "0.00",
      despesaPrimariaPpp: "0.00",
      impactoSaldoPpp: "0.00",
      criadoPor: POR,
    };

    await expect(
      criarMetaAnualLdo(prisma, { ...base, receitaPrimaria: "1100.00" })
    ).rejects.toThrow(/RECEITA PRIMÁRIA.*MAIOR QUE A TOTAL/i);
    await expect(
      criarMetaAnualLdo(prisma, { ...base, despesaPrimaria: "1000.00" })
    ).rejects.toThrow(/DESPESA PRIMÁRIA.*MAIOR QUE A TOTAL/i);
  });

  it("deduções maiores que a dívida consolidada são recusadas", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    await expect(
      criarDividaConsolidadaLdo(prisma, {
        ldoId,
        ano: 2026,
        dividaConsolidada: "1000.00",
        deducoes: "1500.00",
        receitaCorrenteLiquida: "50000.00",
        percentualRcl: "0.020000",
        criadoPor: POR,
      })
    ).rejects.toThrow(/DEDUÇÕES.*MAIORES QUE A DÍVIDA/i);
  });

  /**
   * ⚠️ O RPPS DEFICITÁRIO TEM DE CABER. Um CHECK de positividade no resultado impediria o
   * ente de declarar o rombo — que é exatamente o que a projeção atuarial existe para
   * revelar (LRF art. 4º §2º, IV, "a").
   */
  it("⚠️ projeção atuarial com resultado NEGATIVO é aceita", async () => {
    const { ldoId } = await criarLdo(prisma, LDO);
    const { projecaoId } = await criarProjecaoAtuarialRpps(prisma, {
      ldoId,
      ano: 2026,
      receitasPrevidenciarias: "1000000.00",
      despesasPrevidenciarias: "1800000.00",
      resultadoPrevidenciario: "-800000.00",
      saldoFinanceiro: "-2500000.00",
      criadoPor: POR,
    });

    const p = await prisma.projecaoAtuarialRpps.findUniqueOrThrow({
      where: { id: projecaoId },
      select: { resultadoPrevidenciario: true, saldoFinanceiro: true },
    });
    expect(p.resultadoPrevidenciario.toFixed(2)).toBe("-800000.00");
    expect(p.saldoFinanceiro.toFixed(2)).toBe("-2500000.00");
  });

  it("o trâmite da LDO tem ordem — sancionada antes de devolvida é recusada", async () => {
    await expect(
      criarLdo(prisma, {
        ...LDO,
        dataEnvioLegislativo: new Date("2025-08-15T12:00:00Z"),
        dataDevolucaoExecutivo: new Date("2025-11-30T12:00:00Z"),
        dataSancao: new Date("2025-10-01T12:00:00Z"),
      })
    ).rejects.toThrow(/TRÂMITE FORA DE ORDEM/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t5 — O CANÁRIO DO `unidadeOrcId`
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t5 — nenhuma entidade do M02b tem unidade gestora", () => {
  /**
   * ⚠️ SE ESTE TESTE QUEBRAR, A DECISÃO DE `escopo.ts:8-15` MUDOU e precisa ser reescrita
   * — não é para "consertar" acrescentando a tabela à lista de exceções.
   *
   * `unidadeOrcId` existe em UMA entidade do sistema (`FichaOrcamentaria`), e toda a
   * segregação do TR 6.5 é construída sobre isso: "ou a UG do fato vem de uma ficha, ou o
   * fato não tem UG, e é ato do ENTE. Não existe terceira via". Planejamento plurianual é
   * ato do ente por natureza — o PPA é lei municipal, não peça de unidade.
   */
  it("⚠️ nenhuma das 20 tabelas do M02b tem coluna `unidadeOrcId`", async () => {
    const TABELAS_M02B = [
      "PlanoPlurianual",
      "EixoEstruturante",
      "AreaTematica",
      "PublicoAlvo",
      "Macroacao",
      "ProgramaPpa",
      "IndicadorPrograma",
      "AcaoPpa",
      "PrevisaoReceitaPpa",
      "ReceitaAnteriorPpa",
      "LeiDiretrizesOrcamentarias",
      "PrioridadeLdo",
      "MetaAnualLdo",
      "RiscoFiscal",
      "RenunciaReceitaLdo",
      "AlienacaoBemLdo",
      "AplicacaoAlienacaoLdo",
      "DividaConsolidadaLdo",
      "ProjecaoAtuarialRpps",
      "MargemExpansaoLdo",
    ];

    const linhas = await prisma.$queryRawUnsafe<
      { table_name: string; column_name: string }[]
    >(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE column_name = 'unidadeOrcId'`
    );

    const comUg = linhas
      .map((l) => l.table_name)
      .filter((t) => TABELAS_M02B.includes(t));

    expect(
      comUg,
      "\n\n⚠️ Uma entidade do M02b ganhou `unidadeOrcId`.\n\n" +
        "Isso cria a SEGUNDA entidade com unidade no sistema e torna FALSO o docblock de " +
        "`modules/m16-travamento/escopo.ts:8-15`, sobre o qual toda a segregação do TR 6.5 " +
        "está construída.\n\nNão é para consertar este teste: é para reescrever aquela " +
        "decisão, conscientemente.\n\nCom UG:\n"
    ).toEqual([]);

    // Canário do canário: a consulta ACHA a coluna onde ela legitimamente existe.
    expect(linhas.map((l) => l.table_name)).toContain("FichaOrcamentaria");
  });

  it("as 20 tabelas do M02b existem no banco", async () => {
    const linhas = await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`
    );
    const nomes = new Set(linhas.map((l) => l.table_name));
    for (const t of ["PlanoPlurianual", "LeiDiretrizesOrcamentarias", "MetaAnualLdo"]) {
      expect(nomes.has(t), `tabela ${t} não existe`).toBe(true);
    }
  });
});
