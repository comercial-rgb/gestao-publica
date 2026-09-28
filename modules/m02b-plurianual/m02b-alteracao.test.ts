import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { toMoney } from "../../packages/contracts/index.js";
import {
  ALVOS_DA_ALTERACAO,
  GRANDEZAS_DO_ALVO,
  MODELO_DO_ALVO,
  PECA_DO_ALVO,
  grandezaPertenceAoAlvo,
  valorVigente,
  violacoesDoAlvo,
  zRegistrarAtoDeAlteracaoInput,
} from "./alteracao.js";
import {
  ROTULO_DA_GRANDEZA,
  atosDaPeca,
  comparativoDaPeca,
  linhasAlteraveisDaPeca,
  metasAnuaisVigentes,
} from "./comparativo.js";
import { metaFiscalDoExercicio } from "./consultas.js";
import {
  acrescentarItemAoAtoDeAlteracao,
  registrarAtoDeAlteracaoDoPlanejamento,
} from "./servico-alteracao.js";
import {
  criarLdo,
  criarMetaAnualLdo,
  criarPlanoPlurianual,
  criarPrevisaoReceitaPpa,
} from "./servico.js";

/**
 * M02b — A ALTERAÇÃO VERSIONADA DO PPA E DA LDO (V18/C13).
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PROVA ═══
 * · t1 — O ROL CONTRA O BANCO INSTALADO. Cada alvo é uma tabela que existe, cada grandeza é
 *   coluna DELA e é `numeric(18,2)`, cada FK referencia a tabela certa, e os quatro CHECKs
 *   estão no lugar. O rol do domínio e o rol dentro do CHECK são duas cópias da mesma
 *   decisão: conferir uma contra a outra passaria com qualquer nome errado escrito de forma
 *   consistente nas duas. O banco é a terceira parte independente — e é ele quem recusa.
 * · t2 — OS PREDICADOS REIMPOSTOS, que são a razão da unidade: o delta ao lado da linha
 *   desliga o CHECK da linha, e o domínio o reimpõe — inclusive a desigualdade que cruza
 *   duas colunas, e inclusive a LIBERDADE de sinal que o banco deixou de propósito.
 * · t3 — AS RECUSAS DE ENTRADA, cada uma nomeando o motivo.
 * · t4 — O COMPARATIVO com FIXTURE N=2, e o total que só soma grandeza igual.
 * · t5 — O GUARD NO SERVIÇO, e que a recusa não deixa ato nem item no banco.
 * · t6 — A PEÇA ERRADA: o que o Zod pega e o que SÓ o serviço pode pegar (cruza tabelas).
 * · t7 — O CORTE POR DATA, que é o que faz "relatório por versão".
 * · t8 — OS DOIS LEITORES EXISTENTES seguem o vigente — e com zero atos o número é o
 *   mesmo de antes, que é o que permitiu mexer debaixo de relatório publicado.
 * · t9 — SEM PERMISSÃO, ESTOURA.
 * · t10 — ACRESCENTAR ITEM depois soma, e o guard vale nele.
 * · t11 — APPEND-ONLY: o ato inverso zera o vigente e os dois atos permanecem.
 */

const prisma = criarPrismaDeTeste();
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

const META = {
  ano: 2026,
  receitaTotal: "10000000.00",
  receitaPrimaria: "9000000.00",
  despesaTotal: "9800000.00",
  despesaPrimaria: "9500000.00",
  resultadoNominal: "-200000.00",
  dividaPublicaConsolidada: "3000000.00",
  dividaConsolidadaLiquida: "2500000.00",
  receitaPrimariaPpp: "0.00",
  despesaPrimariaPpp: "0.00",
  impactoSaldoPpp: "0.00",
  criadoPor: POR,
};

/** O ato mais simples que o Zod aceita — os testes trocam o que lhes interessa. */
const ATO = {
  numero: "27",
  ano: 2027,
  data: new Date("2027-06-10T12:00:00Z"),
  dataPublicacao: new Date("2027-06-12T12:00:00Z"),
  fundamento: "Lei Municipal que revisa o plano no exercício.",
  criadoPor: POR,
};

/** PPA com DUAS previsões de receita — a fixture N=2 que a regra do comparativo pede. */
async function ppaComDuasPrevisoes(): Promise<{
  planoId: string;
  previsaoA: string;
  previsaoB: string;
}> {
  const { planoId } = await criarPlanoPlurianual(prisma, PLANO);
  const iptu = await prisma.naturezaReceita.create({
    data: { codigo: "11130111", descricao: "IPTU" },
    select: { id: true },
  });
  const iss = await prisma.naturezaReceita.create({
    data: { codigo: "11140211", descricao: "ISS" },
    select: { id: true },
  });
  const fonte = await prisma.fonteRecurso.create({
    data: { codigo: "500", descricao: "Livre", codigoTce: "500" },
    select: { id: true },
  });
  const a = await criarPrevisaoReceitaPpa(prisma, {
    planoId,
    naturezaReceitaId: iptu.id,
    fonteId: fonte.id,
    ano: 2027,
    valor: "1000000.00",
    criadoPor: POR,
  });
  const b = await criarPrevisaoReceitaPpa(prisma, {
    planoId,
    naturezaReceitaId: iss.id,
    fonteId: fonte.id,
    ano: 2027,
    valor: "400000.00",
    criadoPor: POR,
  });
  return { planoId, previsaoA: a.previsaoId, previsaoB: b.previsaoId };
}

async function ldoComMeta(): Promise<{ ldoId: string; metaId: string }> {
  const { ldoId } = await criarLdo(prisma, LDO);
  const { metaAnualId } = await criarMetaAnualLdo(prisma, { ...META, ldoId });
  return { ldoId, metaId: metaAnualId };
}

beforeEach(async () => {
  await limparBanco(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t1 — O ROL CONTRA O BANCO INSTALADO, não contra a própria cópia
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t1 — o rol de alvos e grandezas medido contra o BANCO", () => {
  /**
   * ⚠️ A FONTE DE VERDADE AQUI É O `information_schema`, NÃO UMA CÓPIA DO ROL. O rol em
   * `alteracao.ts` e o rol dentro do CHECK são duas cópias da mesma decisão; conferir uma
   * contra a outra passaria com qualquer nome errado escrito de forma consistente nas duas.
   * O banco instalado é a terceira parte independente — e é ele quem recusa o `INSERT`.
   */
  type ColunaDoBanco = { readonly tabela: string; readonly coluna: string; readonly tipo: string; readonly precisao: number | null; readonly escala: number | null };

  async function colunas(tabela: string): Promise<readonly ColunaDoBanco[]> {
    return prisma.$queryRawUnsafe<readonly ColunaDoBanco[]>(
      `SELECT table_name AS tabela, column_name AS coluna, data_type AS tipo,
              numeric_precision AS precisao, numeric_scale AS escala
         FROM information_schema.columns WHERE table_name = $1`,
      tabela
    );
  }

  it("⚠️ cada grandeza é coluna DA TABELA do alvo, e é numeric(18,2)", async () => {
    for (const alvo of ALVOS_DA_ALTERACAO) {
      const { modelo } = MODELO_DO_ALVO[alvo];
      const doBanco = await colunas(modelo);
      expect(doBanco.length, `a tabela ${modelo} do alvo ${alvo} não existe`).toBeGreaterThan(0);
      for (const g of GRANDEZAS_DO_ALVO[alvo]) {
        const c = doBanco.find((x) => x.coluna === g);
        expect(c, `${modelo}.${g} não existe no banco`).toBeDefined();
        expect(c!.tipo, `${modelo}.${g} não é numeric`).toBe("numeric");
        // ⚠️ A PRECISÃO IMPORTA: o ajuste é `Decimal(18,2)`, e uma grandeza `Decimal(18,6)`
        // (meta física) perderia casas ao ser somada com ele. É por isso que ela não entra.
        expect([c!.precisao, c!.escala], `${modelo}.${g} não é (18,2)`).toEqual([18, 2]);
      }
    }
  });

  it("⚠️ cada FK do rol existe na tabela do item e referencia a tabela do alvo", async () => {
    const doItem = await colunas("AlteracaoDeValorPlanejado");
    const fks = await prisma.$queryRawUnsafe<readonly { readonly coluna: string; readonly alvo: string }[]>(
      `SELECT kcu.column_name AS coluna, ccu.table_name AS alvo
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = tc.constraint_name
         JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'AlteracaoDeValorPlanejado'`
    );
    for (const alvo of ALVOS_DA_ALTERACAO) {
      const { modelo, fk } = MODELO_DO_ALVO[alvo];
      expect(doItem.find((c) => c.coluna === fk), `${fk} não existe`).toBeDefined();
      const ligacao = fks.find((f) => f.coluna === fk);
      expect(ligacao, `${fk} não tem chave estrangeira`).toBeDefined();
      expect(ligacao!.alvo).toBe(modelo);
    }
  });

  /** ⚠️ E OS QUATRO CHECKS DESTA UNIDADE EXISTEM NO BANCO — sem eles o INSERT direto passa. */
  it("⚠️ os CHECKs da alteração estão instalados", async () => {
    const nomes = await prisma.$queryRawUnsafe<readonly { readonly conname: string }[]>(
      `SELECT conname FROM pg_constraint WHERE conname LIKE '%alteracao%'`
    );
    const conjunto = new Set(nomes.map((n) => n.conname));
    for (const c of [
      "ck_ato_alteracao_uma_peca",
      "ck_ato_alteracao_publicacao_nao_antecede",
      "ck_alteracao_valor_ajuste_nao_zero",
      "ck_alteracao_valor_alvo_e_grandeza",
    ]) {
      expect(conjunto.has(c), `${c} não está no banco`).toBe(true);
    }
  });

  it("treze grandezas, e nenhuma sem rótulo em português", () => {
    const todas = ALVOS_DA_ALTERACAO.flatMap((a) => GRANDEZAS_DO_ALVO[a]);
    expect(todas.length).toBe(13);
    for (const g of todas) {
      expect(ROTULO_DA_GRANDEZA[g], `grandeza ${g} sem rótulo`).toBeTruthy();
      // ⚠️ E o rótulo não é o nome da coluna disfarçado: um servidor municipal não lê
      // "dividaConsolidadaLiquida".
      expect(ROTULO_DA_GRANDEZA[g]).not.toBe(g);
    }
  });

  /**
   * ⚠️ A NEGAÇÃO: nome plausível que NÃO é coluna do alvo tem de ser recusado. Sem isto, o
   * rol "aceitaria" qualquer string e o guard leria `undefined`, passando por vacuidade.
   */
  it("⚠️ grandeza plausível mas inexistente é recusada, e grandeza do OUTRO alvo também", () => {
    expect(grandezaPertenceAoAlvo("PREVISAO_RECEITA_PPA", "valor")).toBe(true);
    expect(grandezaPertenceAoAlvo("PREVISAO_RECEITA_PPA", "receitaLiquida")).toBe(false);
    // `receitaTotal` existe — na `MetaAnualLdo`, que é da LDO. Não na previsão do PPA.
    expect(grandezaPertenceAoAlvo("PREVISAO_RECEITA_PPA", "receitaTotal")).toBe(false);
    expect(grandezaPertenceAoAlvo("META_ANUAL_LDO", "receitaTotal")).toBe(true);
    // A meta FÍSICA não entra: ela é Decimal(18,6) e o ajuste é dinheiro.
    expect(grandezaPertenceAoAlvo("ACAO_PPA", "metaFisica")).toBe(false);
  });

  it("os alvos do PPA são três e o da LDO é um — a partição por peça", () => {
    expect(ALVOS_DA_ALTERACAO.filter((a) => PECA_DO_ALVO[a] === "PPA").length).toBe(3);
    expect(ALVOS_DA_ALTERACAO.filter((a) => PECA_DO_ALVO[a] === "LDO")).toEqual([
      "META_ANUAL_LDO",
    ]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t2 — OS PREDICADOS REIMPOSTOS (o delta desliga o CHECK; o domínio o repõe)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t2 — o que o banco recusaria na linha, reimposto sobre o valor derivado", () => {
  it("o vigente é o original mais a soma dos ajustes, na ordem que vier", () => {
    expect(valorVigente(toMoney("1000.00"), []).toFixed(2)).toBe("1000.00");
    expect(
      valorVigente(toMoney("1000.00"), [toMoney("500.00"), toMoney("-200.00")]).toFixed(2)
    ).toBe("1300.00");
    expect(
      valorVigente(toMoney("1000.00"), [toMoney("-200.00"), toMoney("500.00")]).toFixed(2)
    ).toBe("1300.00");
  });

  it("previsão de receita derivada NEGATIVA viola, e a mensagem nomeia a constraint", () => {
    expect(violacoesDoAlvo("PREVISAO_RECEITA_PPA", { valor: toMoney("0.00") })).toEqual([]);
    const ruins = violacoesDoAlvo("PREVISAO_RECEITA_PPA", { valor: toMoney("-0.01") });
    expect(ruins.length).toBe(1);
    expect(ruins[0]).toMatch(/ck_previsao_receita_ppa_nao_negativa/);
  });

  it("programa e ação do PPA: derivado negativo viola", () => {
    expect(
      violacoesDoAlvo("PROGRAMA_PPA", { valorPrevisto: toMoney("-1.00") })[0]
    ).toMatch(/ck_programa_ppa_valor_nao_negativo/);
    expect(
      violacoesDoAlvo("ACAO_PPA", { metaFinanceira: toMoney("-1.00") })[0]
    ).toMatch(/ck_acao_ppa_metas_nao_negativas/);
  });

  /**
   * ⚠️ A DESIGUALDADE QUE CRUZA DUAS COLUNAS. É ela que justifica o guard receber a linha
   * INTEIRA: avaliar ajuste por ajuste aceitaria o caso errado e recusaria o certo.
   */
  it("⚠️ meta anual: a primária não excede a total, nos dois lados", () => {
    const base = {
      receitaTotal: toMoney("100.00"),
      receitaPrimaria: toMoney("100.00"),
      despesaTotal: toMoney("100.00"),
      despesaPrimaria: toMoney("90.00"),
    };
    expect(violacoesDoAlvo("META_ANUAL_LDO", base)).toEqual([]);

    const receitaEstourada = violacoesDoAlvo("META_ANUAL_LDO", {
      ...base,
      receitaPrimaria: toMoney("100.01"),
    });
    expect(receitaEstourada.length).toBe(1);
    expect(receitaEstourada[0]).toMatch(/ck_meta_anual_primaria_nao_excede_total/);

    const despesaEstourada = violacoesDoAlvo("META_ANUAL_LDO", {
      ...base,
      despesaPrimaria: toMoney("100.01"),
    });
    expect(despesaEstourada.length).toBe(1);
    // ⚠️ O RÓTULO EM PORTUGUÊS, e não o nome da coluna: a mensagem é lida por um servidor
    // municipal, e "despesaPrimaria" é o schema vazando para a tela.
    expect(despesaEstourada[0]).toMatch(/Despesa primária/);
  });

  /**
   * ⚠️ A LIBERDADE DE SINAL QUE O BANCO DEIXOU DE PROPÓSITO. Déficit nominal é resultado
   * legítimo, e o impacto do saldo das PPPs pode ser negativo. Reimpor positividade neles
   * inventaria uma regra que o `ck_meta_anual_valores_nao_negativos` recusou incluir.
   */
  it("⚠️ resultado nominal e as colunas de parceria NEGATIVOS não violam nada", () => {
    expect(
      violacoesDoAlvo("META_ANUAL_LDO", {
        receitaTotal: toMoney("100.00"),
        receitaPrimaria: toMoney("90.00"),
        despesaTotal: toMoney("100.00"),
        despesaPrimaria: toMoney("90.00"),
        resultadoNominal: toMoney("-5000000.00"),
        impactoSaldoPpp: toMoney("-1.00"),
        receitaPrimariaPpp: toMoney("-1.00"),
        despesaPrimariaPpp: toMoney("-1.00"),
      })
    ).toEqual([]);
  });

  it("dívida consolidada e líquida negativas violam", () => {
    const ruins = violacoesDoAlvo("META_ANUAL_LDO", {
      dividaPublicaConsolidada: toMoney("-1.00"),
      dividaConsolidadaLiquida: toMoney("-2.00"),
    });
    expect(ruins.length).toBe(2);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t3 — AS RECUSAS DE ENTRADA
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t3 — o que o Zod recusa, nomeando", () => {
  const item = {
    alvo: "PREVISAO_RECEITA_PPA" as const,
    alvoId: "x",
    grandeza: "valor",
    valorAjuste: "100.00",
  };
  const base = { ...ATO, peca: "PPA" as const, pecaId: "p", itens: [item] };

  it("ajuste ZERO é recusado — item que não altera nada", () => {
    const r = zRegistrarAtoDeAlteracaoInput.safeParse({
      ...base,
      itens: [{ ...item, valorAjuste: "0.00" }],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/AJUSTE ZERO/);
  });

  it("grandeza fora do alvo é recusada nomeando as que valem", () => {
    const r = zRegistrarAtoDeAlteracaoInput.safeParse({
      ...base,
      itens: [{ ...item, grandeza: "valorPrevisto" }],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/GRANDEZA FORA DO ALVO/);
  });

  it("alvo de outra peça é recusado sem tocar o banco", () => {
    const r = zRegistrarAtoDeAlteracaoInput.safeParse({
      ...base,
      itens: [{ ...item, alvo: "META_ANUAL_LDO", grandeza: "receitaTotal" }],
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/ALVO DE OUTRA PEÇA/);
  });

  it("publicação antes do ato é recusada", () => {
    const r = zRegistrarAtoDeAlteracaoInput.safeParse({
      ...base,
      dataPublicacao: new Date("2027-06-09T12:00:00Z"),
    });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error?.issues)).toMatch(/PUBLICAÇÃO ANTES DO ATO/);
  });

  it("⚠️ ato SEM item é recusado — lei que altera nada", () => {
    expect(zRegistrarAtoDeAlteracaoInput.safeParse({ ...base, itens: [] }).success).toBe(
      false
    );
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t4 — O COMPARATIVO, FIXTURE N=2
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t4 — o comparativo com DUAS linhas alteradas pelo mesmo ato", () => {
  it("⚠️ N=2: original, ajuste e atual por linha; total só de grandeza igual", async () => {
    const { planoId, previsaoA, previsaoB } = await ppaComDuasPrevisoes();

    const { atoId, itens } = await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      peca: "PPA",
      pecaId: planoId,
      itens: [
        {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "250000.00",
          justificativa: "Reestimativa do IPTU após atualização da planta.",
        },
        {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoB,
          grandeza: "valor",
          valorAjuste: "-100000.00",
        },
      ],
    });
    expect(itens).toBe(2);

    const c = await comparativoDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(c.rotuloDaPeca).toBe("PPA 2026-2029 (Lei Municipal 1.234/2025)");
    expect(c.atos.length).toBe(1);
    expect(c.atos[0]!.id).toBe(atoId);
    expect(c.atos[0]!.itens).toBe(2);
    expect(c.linhas.length).toBe(2);

    const doIptu = c.linhas.find((l) => l.rotulo.startsWith("11130111"))!;
    expect(doIptu.original.toFixed(2)).toBe("1000000.00");
    expect(doIptu.ajuste.toFixed(2)).toBe("250000.00");
    expect(doIptu.atual.toFixed(2)).toBe("1250000.00");
    expect(doIptu.rotuloDaGrandeza).toBe("Previsão de receita");
    expect(doIptu.ajustes[0]!.numeroDoAto).toBe("27");
    expect(doIptu.ajustes[0]!.justificativa).toMatch(/planta/);

    const doIss = c.linhas.find((l) => l.rotulo.startsWith("11140211"))!;
    expect(doIss.atual.toFixed(2)).toBe("300000.00");
    // ⚠️ A justificativa do item é opcional — o fundamento do ato é o motivo comum.
    expect(doIss.ajustes[0]!.justificativa).toBeNull();

    expect(c.totais.length).toBe(1);
    expect(c.totais[0]!.linhas).toBe(2);
    expect(c.totais[0]!.original.toFixed(2)).toBe("1400000.00");
    expect(c.totais[0]!.ajuste.toFixed(2)).toBe("150000.00");
    expect(c.totais[0]!.atual.toFixed(2)).toBe("1550000.00");
  });

  it("peça sem nenhum ato: comparativo vazio, e nada inventado", async () => {
    const { planoId } = await ppaComDuasPrevisoes();
    const c = await comparativoDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(c.atos).toEqual([]);
    expect(c.linhas).toEqual([]);
    expect(c.totais).toEqual([]);
  });

  it("as linhas alteráveis vêm recortadas PELA PEÇA", async () => {
    const { planoId } = await ppaComDuasPrevisoes();
    const { ldoId } = await ldoComMeta();

    const doPpa = await linhasAlteraveisDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(doPpa.length).toBe(2);
    expect(doPpa.every((l) => l.alvo === "PREVISAO_RECEITA_PPA")).toBe(true);

    const daLdo = await linhasAlteraveisDaPeca(prisma, { peca: "LDO", pecaId: ldoId });
    expect(daLdo.length).toBe(1);
    expect(daLdo[0]!.alvo).toBe("META_ANUAL_LDO");
    expect(daLdo[0]!.grandezas.length).toBe(10);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t5 — O GUARD NO SERVIÇO: o CHECK que o delta desligaria
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t5 — o serviço recusa o que o banco recusaria na linha", () => {
  /**
   * ⚠️ ESTE É O TESTE CENTRAL DA UNIDADE. Sem o guard, este ato seria ACEITO: o `INSERT` do
   * item não toca `PrevisaoReceitaPpa`, então `ck_previsao_receita_ppa_nao_negativa` nunca é
   * avaliado — e a peça passaria a exibir previsão de receita negativa.
   */
  it("⚠️ redução MAIOR que a previsão é recusada, e não sobra ato nem item", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();

    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        peca: "PPA",
        pecaId: planoId,
        itens: [
          {
            alvo: "PREVISAO_RECEITA_PPA",
            alvoId: previsaoA,
            grandeza: "valor",
            valorAjuste: "-1500000.00",
          },
        ],
      })
    ).rejects.toThrow(/ALTERAÇÃO RECUSADA.*ck_previsao_receita_ppa_nao_negativa/s);

    expect(await prisma.atoDeAlteracaoDoPlanejamento.count()).toBe(0);
    expect(await prisma.alteracaoDeValorPlanejado.count()).toBe(0);
  });

  it("a redução ATÉ zero é aceita — o limite é fechado, como o CHECK", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    const { atoId } = await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      peca: "PPA",
      pecaId: planoId,
      itens: [
        {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "-1000000.00",
        },
      ],
    });
    expect(atoId).toBeTruthy();
    const c = await comparativoDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(c.linhas[0]!.atual.toFixed(2)).toBe("0.00");
  });

  /**
   * ⚠️ E AQUI ESTÁ A RAZÃO DE OS ITENS DO MESMO ATO SEREM SOMADOS JUNTOS. A primária já é
   * 9.000.000 contra 10.000.000 de total. Um item que suba a primária em 1.500.000 sozinho
   * a faria exceder a total; os DOIS itens juntos (primária e total) são legítimos.
   */
  it("⚠️ meta anual: a primária sozinha estoura; primária E total no MESMO ato passam", async () => {
    const { ldoId, metaId } = await ldoComMeta();
    const so = {
      alvo: "META_ANUAL_LDO" as const,
      alvoId: metaId,
      grandeza: "receitaPrimaria",
      valorAjuste: "1500000.00",
    };

    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        peca: "LDO",
        pecaId: ldoId,
        itens: [so],
      })
    ).rejects.toThrow(/ck_meta_anual_primaria_nao_excede_total/);

    const { itens } = await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      peca: "LDO",
      pecaId: ldoId,
      itens: [so, { ...so, grandeza: "receitaTotal", valorAjuste: "1500000.00" }],
    });
    expect(itens).toBe(2);

    const [vigente] = await metasAnuaisVigentes(prisma, { ldoId });
    expect(vigente!.vigente.receitaPrimaria.toFixed(2)).toBe("10500000.00");
    expect(vigente!.vigente.receitaTotal.toFixed(2)).toBe("11500000.00");
  });

  it("linha planejada inexistente é recusada nomeando", async () => {
    const { planoId } = await ppaComDuasPrevisoes();
    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        peca: "PPA",
        pecaId: planoId,
        itens: [
          {
            alvo: "PREVISAO_RECEITA_PPA",
            alvoId: "nao-existe",
            grandeza: "valor",
            valorAjuste: "1.00",
          },
        ],
      })
    ).rejects.toThrow(/LINHA PLANEJADA NÃO EXISTE/);
  });

  /**
   * ⚠️ O ESTADO INTERMEDIÁRIO. Um ato RETROATIVO pode deixar o vigente positivo e o estado
   * na data dele negativo — e o comparativo sabe cortar por data, então esse estado é
   * exibível. Recusar aqui é o que impede a peça de mostrar, em alguma data, o número que o
   * banco recusa na linha.
   */
  it("⚠️ ato RETROATIVO que deixaria a data intermediária negativa é recusado", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    // Em dezembro, a previsão SOBE 2.000.000 (vai a 3.000.000).
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      numero: "90",
      data: new Date("2027-12-01T12:00:00Z"),
      dataPublicacao: new Date("2027-12-02T12:00:00Z"),
      peca: "PPA",
      pecaId: planoId,
      itens: [
        {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "2000000.00",
        },
      ],
    });

    // Um ato de MARÇO reduzindo 1.500.000 deixa o VIGENTE em 1.500.000 (positivo), mas em
    // março o valor seria −500.000.
    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        numero: "10",
        data: new Date("2027-03-01T12:00:00Z"),
        dataPublicacao: new Date("2027-03-02T12:00:00Z"),
        peca: "PPA",
        pecaId: planoId,
        itens: [
          {
            alvo: "PREVISAO_RECEITA_PPA",
            alvoId: previsaoA,
            grandeza: "valor",
            valorAjuste: "-1500000.00",
          },
        ],
      })
    ).rejects.toThrow(/estado na data do ato/);
    expect(await prisma.atoDeAlteracaoDoPlanejamento.count()).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t6 — A PEÇA ERRADA: o que só o serviço pode pegar
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t6 — um ato não alcança a peça que ele não nomeia", () => {
  /**
   * ⚠️ O ZOD NÃO PEGA ESTE CASO. Os dois são PPA e a grandeza é a certa: o que está errado é
   * que a linha pertence a OUTRO plano — e isso só o banco sabe. É o mesmo motivo pelo qual o
   * ano do quadriênio não pôde ser CHECK.
   */
  it("⚠️ ato do PPA A com linha do PPA B é recusado pelo serviço", async () => {
    const a = await ppaComDuasPrevisoes();
    const outro = await criarPlanoPlurianual(prisma, {
      ...PLANO,
      anoInicio: 2030,
      anoFim: 2033,
      leiRef: "Lei Municipal 2.000/2029",
    });

    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        peca: "PPA",
        pecaId: outro.planoId,
        itens: [
          {
            alvo: "PREVISAO_RECEITA_PPA",
            alvoId: a.previsaoA,
            grandeza: "valor",
            valorAjuste: "1.00",
          },
        ],
      })
    ).rejects.toThrow(/ALVO DE OUTRA PEÇA/);
    expect(await prisma.atoDeAlteracaoDoPlanejamento.count()).toBe(0);
  });

  it("peça inexistente é recusada antes de qualquer item", async () => {
    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        peca: "LDO",
        pecaId: "nao-existe",
        itens: [
          {
            alvo: "META_ANUAL_LDO",
            alvoId: "x",
            grandeza: "receitaTotal",
            valorAjuste: "1.00",
          },
        ],
      })
    ).rejects.toThrow(/LDO nao-existe não existe/);
  });

  /** ⚠️ O BANCO TAMBÉM BARRA — o CHECK existe para o INSERT que dribla o serviço. */
  it("⚠️ INSERT direto com DUAS peças no ato é barrado pelo CHECK", async () => {
    const { planoId } = await ppaComDuasPrevisoes();
    const { ldoId } = await ldoComMeta();
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "AtoDeAlteracaoDoPlanejamento"
           ("id","planoId","ldoId","numero","ano","data","dataPublicacao","fundamento","criadoPor")
         VALUES ('forcado', $1, $2, '1', 2027, now(), now(), 'x', 'y')`,
        planoId,
        ldoId
      )
    ).rejects.toThrow(/ck_ato_alteracao_uma_peca/);
  });

  /** ⚠️ E o par alvo/grandeza impossível também — o que dois CHECKs separados deixariam passar. */
  it("⚠️ INSERT direto com grandeza de outro alvo é barrado pelo CHECK", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    const ato = await prisma.atoDeAlteracaoDoPlanejamento.create({
      data: { ...ATO, planoId },
      select: { id: true },
    });
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "AlteracaoDeValorPlanejado"
           ("id","atoId","previsaoReceitaPpaId","grandeza","valorAjuste","criadoPor")
         VALUES ('forcado', $1, $2, 'receitaPrimaria', 100, 'y')`,
        ato.id,
        previsaoA
      )
    ).rejects.toThrow(/ck_alteracao_valor_alvo_e_grandeza/);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t7 — O CORTE POR DATA (a "versão" da peça)
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t7 — a versão da peça é o estado dela até uma data", () => {
  it("⚠️ o corte exclui o ato posterior, e sem corte os dois somam", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    const item = {
      alvo: "PREVISAO_RECEITA_PPA" as const,
      alvoId: previsaoA,
      grandeza: "valor",
    };

    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      numero: "10",
      data: new Date("2027-03-01T12:00:00Z"),
      dataPublicacao: new Date("2027-03-02T12:00:00Z"),
      peca: "PPA",
      pecaId: planoId,
      itens: [{ ...item, valorAjuste: "100000.00" }],
    });
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      numero: "45",
      data: new Date("2027-09-01T12:00:00Z"),
      dataPublicacao: new Date("2027-09-02T12:00:00Z"),
      peca: "PPA",
      pecaId: planoId,
      itens: [{ ...item, valorAjuste: "30000.00" }],
    });

    const tudo = await comparativoDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(tudo.atos.map((a) => a.numero)).toEqual(["10", "45"]); // cronológico
    expect(tudo.linhas[0]!.atual.toFixed(2)).toBe("1130000.00");
    expect(tudo.linhas[0]!.ajustes.length).toBe(2);

    const ateJunho = await comparativoDaPeca(prisma, {
      peca: "PPA",
      pecaId: planoId,
      ate: new Date("2027-06-30T23:59:59Z"),
    });
    expect(ateJunho.atos.map((a) => a.numero)).toEqual(["10"]);
    expect(ateJunho.linhas[0]!.atual.toFixed(2)).toBe("1100000.00");

    const antesDeTudo = await comparativoDaPeca(prisma, {
      peca: "PPA",
      pecaId: planoId,
      ate: new Date("2027-01-01T00:00:00Z"),
    });
    expect(antesDeTudo.linhas).toEqual([]);

    // A consulta cronológica dos atos aceita o mesmo corte (o histórico "até que data").
    expect((await atosDaPeca(prisma, { peca: "PPA", pecaId: planoId })).length).toBe(2);
    expect(
      (
        await atosDaPeca(prisma, {
          peca: "PPA",
          pecaId: planoId,
          ate: new Date("2027-06-30T23:59:59Z"),
        })
      ).length
    ).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t8 — OS DOIS LEITORES EXISTENTES
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t8 — quem já lia a meta fiscal passou a ler a vigente", () => {
  /**
   * ⚠️ COM ZERO ATOS O NÚMERO NÃO MUDA — e é essa igualdade que permitiu pôr a derivação
   * debaixo de um relatório já publicado (o RREO Anexo 6) sem alterar expectativa nenhuma
   * da suíte que já existia.
   */
  it("sem nenhum ato, vigente é igual a original e a meta do RREO é a de sempre", async () => {
    const { ldoId } = await ldoComMeta();
    const [m] = await metasAnuaisVigentes(prisma, { ldoId });
    expect(m!.ajustes).toBe(0);
    expect(m!.vigente.receitaPrimaria.toFixed(2)).toBe(m!.original.receitaPrimaria.toFixed(2));

    const leitura = await metaFiscalDoExercicio(prisma, 2026);
    // 9.000.000 − 9.500.000 = −500.000
    expect(leitura.meta!.resultadoPrimario.toFixed(2)).toBe("-500000.00");
    expect(leitura.meta!.resultadoNominal.toFixed(2)).toBe("-200000.00");
    expect(leitura.pendencia).toBeNull();
  });

  /**
   * ⚠️ E DEPOIS DO ATO, O RREO 6 CONFRONTA A META ALTERADA. Ler a linha crua faria o anexo
   * confrontar o resultado apurado contra a meta REVOGADA.
   */
  it("⚠️ a lei que reduz a despesa primária muda o resultado primário que o RREO confronta", async () => {
    const { ldoId, metaId } = await ldoComMeta();
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      ano: 2026,
      data: new Date("2026-07-01T12:00:00Z"),
      dataPublicacao: new Date("2026-07-02T12:00:00Z"),
      peca: "LDO",
      pecaId: ldoId,
      itens: [
        {
          alvo: "META_ANUAL_LDO",
          alvoId: metaId,
          grandeza: "despesaPrimaria",
          valorAjuste: "-300000.00",
        },
        {
          alvo: "META_ANUAL_LDO",
          alvoId: metaId,
          grandeza: "resultadoNominal",
          valorAjuste: "50000.00",
        },
      ],
    });

    const leitura = await metaFiscalDoExercicio(prisma, 2026);
    // 9.000.000 − 9.200.000 = −200.000
    expect(leitura.meta!.resultadoPrimario.toFixed(2)).toBe("-200000.00");
    expect(leitura.meta!.resultadoNominal.toFixed(2)).toBe("-150000.00");

    const [m] = await metasAnuaisVigentes(prisma, { ldoId });
    expect(m!.ajustes).toBe(2);
    expect(m!.original.despesaPrimaria.toFixed(2)).toBe("9500000.00"); // o original PRESERVADO
    expect(m!.vigente.despesaPrimaria.toFixed(2)).toBe("9200000.00");
  });

  it("o corte por data também vale para a meta vigente", async () => {
    const { ldoId, metaId } = await ldoComMeta();
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      ano: 2026,
      data: new Date("2026-07-01T12:00:00Z"),
      dataPublicacao: new Date("2026-07-02T12:00:00Z"),
      peca: "LDO",
      pecaId: ldoId,
      itens: [
        {
          alvo: "META_ANUAL_LDO",
          alvoId: metaId,
          grandeza: "despesaPrimaria",
          valorAjuste: "-300000.00",
        },
      ],
    });
    const antes = await metasAnuaisVigentes(prisma, {
      ldoId,
      ate: new Date("2026-06-30T23:59:59Z"),
    });
    expect(antes[0]!.vigente.despesaPrimaria.toFixed(2)).toBe("9500000.00");
    expect(antes[0]!.ajustes).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t9 — AUTORIZAÇÃO
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t9 — sem a ação, o servidor recusa", () => {
  it("⚠️ quem não tem ALTERAR_PLANEJAMENTO não registra ato, e nada é gravado", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    await expect(
      registrarAtoDeAlteracaoDoPlanejamento(prisma, {
        ...ATO,
        criadoPor: SEM_PODER,
        peca: "PPA",
        pecaId: planoId,
        itens: [
          {
            alvo: "PREVISAO_RECEITA_PPA",
            alvoId: previsaoA,
            grandeza: "valor",
            valorAjuste: "1.00",
          },
        ],
      })
    ).rejects.toThrow();
    expect(await prisma.atoDeAlteracaoDoPlanejamento.count()).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t10 — ACRESCENTAR ITEM AO ATO
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t10 — a mesma lei alterando mais uma linha", () => {
  it("o item acrescentado depois entra no ato e soma no comparativo", async () => {
    const { planoId, previsaoA, previsaoB } = await ppaComDuasPrevisoes();
    const { atoId } = await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      peca: "PPA",
      pecaId: planoId,
      itens: [
        {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "100000.00",
        },
      ],
    });

    await acrescentarItemAoAtoDeAlteracao(prisma, {
      atoId,
      criadoPor: POR,
      item: {
        alvo: "PREVISAO_RECEITA_PPA",
        alvoId: previsaoB,
        grandeza: "valor",
        valorAjuste: "-50000.00",
      },
    });

    const c = await comparativoDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(c.atos.length).toBe(1);
    expect(c.atos[0]!.itens).toBe(2);
    expect(c.linhas.length).toBe(2);
    expect(c.totais[0]!.ajuste.toFixed(2)).toBe("50000.00");
  });

  /** ⚠️ O GUARD VALE NO SEGUNDO ITEM: ele soma sobre o primeiro. */
  it("⚠️ o item acrescentado que derrubaria a linha abaixo de zero é recusado", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    const { atoId } = await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      peca: "PPA",
      pecaId: planoId,
      itens: [
        {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "-600000.00",
        },
      ],
    });

    await expect(
      acrescentarItemAoAtoDeAlteracao(prisma, {
        atoId,
        criadoPor: POR,
        item: {
          alvo: "PREVISAO_RECEITA_PPA",
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "-500000.00",
        },
      })
    ).rejects.toThrow(/ck_previsao_receita_ppa_nao_negativa/);
    expect(await prisma.alteracaoDeValorPlanejado.count()).toBe(1);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t11 — APPEND-ONLY
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t11 — o que desfaz um ato é outro ato", () => {
  it("⚠️ o ato inverso zera o vigente e os DOIS atos permanecem no histórico", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    const item = {
      alvo: "PREVISAO_RECEITA_PPA" as const,
      alvoId: previsaoA,
      grandeza: "valor",
    };
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      numero: "10",
      peca: "PPA",
      pecaId: planoId,
      itens: [{ ...item, valorAjuste: "200000.00" }],
    });
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, {
      ...ATO,
      numero: "11",
      data: new Date("2027-08-10T12:00:00Z"),
      dataPublicacao: new Date("2027-08-11T12:00:00Z"),
      fundamento: "Lei que revoga a alteração anterior.",
      peca: "PPA",
      pecaId: planoId,
      itens: [{ ...item, valorAjuste: "-200000.00" }],
    });

    const c = await comparativoDaPeca(prisma, { peca: "PPA", pecaId: planoId });
    expect(c.atos.length).toBe(2);
    expect(c.linhas.length).toBe(1);
    expect(c.linhas[0]!.original.toFixed(2)).toBe("1000000.00");
    expect(c.linhas[0]!.ajuste.toFixed(2)).toBe("0.00");
    expect(c.linhas[0]!.atual.toFixed(2)).toBe("1000000.00");
    // ⚠️ E os dois ajustes continuam VISÍVEIS: o histórico não some porque o saldo voltou.
    expect(c.linhas[0]!.ajustes.length).toBe(2);
  });

  it("dois atos com o mesmo número no mesmo PPA e ano são um duplicado", async () => {
    const { planoId, previsaoA } = await ppaComDuasPrevisoes();
    const um = {
      ...ATO,
      peca: "PPA" as const,
      pecaId: planoId,
      itens: [
        {
          alvo: "PREVISAO_RECEITA_PPA" as const,
          alvoId: previsaoA,
          grandeza: "valor",
          valorAjuste: "1000.00",
        },
      ],
    };
    await registrarAtoDeAlteracaoDoPlanejamento(prisma, um);
    await expect(registrarAtoDeAlteracaoDoPlanejamento(prisma, um)).rejects.toThrow();
  });
});
