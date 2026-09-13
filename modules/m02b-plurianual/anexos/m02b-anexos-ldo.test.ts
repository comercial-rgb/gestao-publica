import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toMoney } from "../../../packages/contracts/index.js";
import { resultadoPrimario } from "../dominio.js";
import {
  ANEXOS_DA_LDO,
  anexoAlienacaoBens,
  anexoDividaConsolidada,
  anexoMargemExpansao,
  anexoMetasAnuais,
  anexoPrioridades,
  anexoProjecaoRpps,
  anexoRenunciaReceita,
  anexoRiscosFiscais,
  ehChaveDeAnexo,
  type MetaAnualDto,
} from "./ldo.js";
import { somarColuna, type AnexoLdo } from "./tipos.js";

/**
 * OS ANEXOS TABELARES DA LDO.
 *
 * ⚠️ ESTE ARQUIVO NÃO TOCA O BANCO, e é o desenho que permite: os geradores são funções
 * PURAS sobre DTO. A mesma função gera o anexo do teste e o do TCE — e é por isso que o
 * fechamento pode ser conferido sobre `Money`, não sobre string formatada.
 *
 * ⚠️ AS CONTAS ESTÃO FEITAS À MÃO, ANTES DO CÓDIGO:
 *
 *   RISCOS: 500.000,00 + 1.250.000,50 = 1.750.000,50 (passivo)
 *            300.000,00 +   150.000,25 =   450.000,25 (providência)
 *
 *   RENÚNCIA: 80.000,10 + 19.999,90 = 100.000,00
 *             compensação: 80.000,10 + 0,00 = 80.000,10
 *
 *   ALIENAÇÃO: bem A 800.000,00 com aplicações 500.000,00 + 300.000,00 = 800.000,00
 *              bem B 200.000,00 sem aplicação
 *              total alienado = 1.000.000,00 · total aplicado = 800.000,00
 *              ⚠️ aplicado < alienado É LEGÍTIMO (produto ainda não destinado)
 *
 *   METAS 2026: receita primária 900.000,00 − despesa primária 800.000,00 = 100.000,00
 *   METAS 2027: 950.000,00 − 1.000.000,00 = −50.000,00  (déficit — resultado legítimo)
 */

const M = (s: string) => toMoney(s);

const METAS: readonly MetaAnualDto[] = [
  {
    ano: 2026,
    receitaTotal: M("1000000.00"),
    receitaPrimaria: M("900000.00"),
    despesaTotal: M("980000.00"),
    despesaPrimaria: M("800000.00"),
    resultadoNominal: M("-20000.00"),
    dividaPublicaConsolidada: M("5000000.00"),
    dividaConsolidadaLiquida: M("3800000.00"),
  },
  {
    ano: 2027,
    receitaTotal: M("1050000.00"),
    receitaPrimaria: M("950000.00"),
    despesaTotal: M("1100000.00"),
    despesaPrimaria: M("1000000.00"),
    resultadoNominal: M("-50000.00"),
    dividaPublicaConsolidada: M("5200000.00"),
    dividaConsolidadaLiquida: M("4000000.00"),
  },
];

/* ══════════════════════════════════════════════════════════════════════════════
 * t1 — FECHAMENTO: o total é a soma das linhas
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t1 — fechamento dos anexos que somam", () => {
  it("riscos fiscais: passivo e providência fecham", () => {
    const a = anexoRiscosFiscais(2026, [
      {
        codigoPassivo: "1",
        descricaoPassivo: "Demandas trabalhistas",
        valorPassivo: M("500000.00"),
        descricaoProvidencia: "Reserva de contingência",
        valorProvidencia: M("300000.00"),
      },
      {
        codigoPassivo: "99",
        descricaoPassivo: "Outros passivos",
        valorPassivo: M("1250000.50"),
        descricaoProvidencia: "Superávit financeiro",
        valorProvidencia: M("150000.25"),
      },
    ]);

    expect(a.totais["valorPassivo"]!.toFixed(2)).toBe("1750000.50");
    expect(a.totais["valorProvidencia"]!.toFixed(2)).toBe("450000.25");
    // E o total É a soma das linhas — não um número guardado à parte.
    expect(a.totais["valorPassivo"]!.toFixed(2)).toBe(
      somarColuna(a.linhas, "valorPassivo").toFixed(2)
    );
  });

  it("renúncia: valor e compensação fecham, e compensação ZERO é legítima", () => {
    const a = anexoRenunciaReceita(2026, [
      {
        descricao: "ISS de entidades culturais",
        valor: M("80000.10"),
        descricaoCompensacao: "Aumento da base do IPTU",
        valorCompensacao: M("80000.10"),
      },
      {
        descricao: "IPTU de imóveis tombados",
        valor: M("19999.90"),
        descricaoCompensacao: "Compensada pelo crescimento natural da base",
        // ⚠️ ZERO é declaração, diferente de ausente.
        valorCompensacao: M("0.00"),
      },
    ]);

    expect(a.totais["valor"]!.toFixed(2)).toBe("100000.00");
    expect(a.totais["valorCompensacao"]!.toFixed(2)).toBe("80000.10");
  });

  /**
   * ⚠️ O FECHAMENTO DA ALIENAÇÃO É UMA DESIGUALDADE, não uma igualdade. Igualdade seria
   * mais bonita e estaria errada: o ente pode declarar a alienação e ainda não ter
   * destinado todo o produto — e essa diferença é informação, não erro.
   */
  it("⚠️ alienação: total aplicado pode ser MENOR que o alienado", () => {
    const a = anexoAlienacaoBens(2026, [
      {
        descricaoBem: "Terreno na Av. Central",
        valorAlienacao: M("800000.00"),
        numeroLaudo: "LAUDO-17/2025",
        aplicacoes: [
          { tipoAplicacao: "1", anoAplicacao: 2026, descricao: "Obras de drenagem", valor: M("500000.00") },
          { tipoAplicacao: "1", anoAplicacao: 2027, descricao: "Pavimentação", valor: M("300000.00") },
        ],
      },
      {
        descricaoBem: "Veículo leve inservível",
        valorAlienacao: M("200000.00"),
        numeroLaudo: null,
        aplicacoes: [],
      },
    ]);

    expect(a.totais["valorAlienacao"]!.toFixed(2)).toBe("1000000.00");
    expect(a.totais["valorAplicacao"]!.toFixed(2)).toBe("800000.00");
    // A designaldade do art. 44: aplicado <= alienado.
    expect(
      a.totais["valorAplicacao"]!.lessThanOrEqualTo(a.totais["valorAlienacao"]!)
    ).toBe(true);
  });

  /**
   * ⚠️ A LINHA DA APLICAÇÃO NÃO REPETE O VALOR DO BEM. Se repetisse, o total da coluna
   * contaria o mesmo terreno três vezes — e o anexo declararia 2,4 milhões de alienação
   * onde há 800 mil.
   */
  it("⚠️ o valor do bem aparece UMA vez, mesmo com várias aplicações", () => {
    const a = anexoAlienacaoBens(2026, [
      {
        descricaoBem: "Terreno",
        valorAlienacao: M("800000.00"),
        numeroLaudo: null,
        aplicacoes: [
          { tipoAplicacao: "1", anoAplicacao: 2026, descricao: "A", valor: M("400000.00") },
          { tipoAplicacao: "2", anoAplicacao: 2026, descricao: "B", valor: M("400000.00") },
        ],
      },
    ]);
    expect(a.linhas.length).toBe(3); // 1 do bem + 2 aplicações
    expect(a.totais["valorAlienacao"]!.toFixed(2)).toBe("800000.00");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t2 — OS ANEXOS QUE **NÃO** SOMAM, e por quê
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t2 — onde somar não significa nada, não há total", () => {
  it("⚠️ metas anuais: série por exercício — somar 2026 com 2027 não é total de nada", () => {
    const a = anexoMetasAnuais(2026, METAS);
    expect(Object.keys(a.totais)).toEqual([]);
    expect(a.notas.some((n) => n.includes("somar anos"))).toBe(true);
  });

  it("⚠️ prioridades: meta FÍSICA de unidades diferentes não soma", () => {
    const a = anexoPrioridades(2026, [
      { descricaoAcao: "Construir escolas", produto: "Escola", unidadeMedida: "unidade", meta: M("12") },
      { descricaoAcao: "Pavimentar vias", produto: "Via", unidadeMedida: "km", meta: M("3.5") },
    ]);
    expect(Object.keys(a.totais)).toEqual([]);
    // "12 escolas + 3,5 km" não é 15,5 de coisa nenhuma.
    expect(a.notas.some((n) => n.includes("não somam"))).toBe(true);
  });

  it("RPPS e margem também são série por exercício", () => {
    expect(Object.keys(anexoProjecaoRpps(2026, []).totais)).toEqual([]);
    expect(Object.keys(anexoMargemExpansao(2026, []).totais)).toEqual([]);
    expect(Object.keys(anexoDividaConsolidada(2026, []).totais)).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t3 — AS DERIVAÇÕES: nada é lido de coluna
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t3 — os valores derivados saem do domínio, não do banco", () => {
  it("⚠️ resultado primário = receita primária − despesa primária, linha a linha", () => {
    const a = anexoMetasAnuais(2026, METAS);

    const l2026 = a.linhas[0]!;
    const l2027 = a.linhas[1]!;

    expect((l2026["resultadoPrimario"] as ReturnType<typeof toMoney>).toFixed(2)).toBe(
      "100000.00"
    );
    // ⚠️ DÉFICIT É RESULTADO LEGÍTIMO — nenhum guard de sinal.
    expect((l2027["resultadoPrimario"] as ReturnType<typeof toMoney>).toFixed(2)).toBe(
      "-50000.00"
    );

    // E é a MESMA função do domínio — não uma subtração escrita no gerador.
    expect((l2026["resultadoPrimario"] as ReturnType<typeof toMoney>).toFixed(2)).toBe(
      resultadoPrimario(METAS[0]!.receitaPrimaria, METAS[0]!.despesaPrimaria).toFixed(2)
    );
  });

  it("dívida líquida = consolidada − deduções", () => {
    const a = anexoDividaConsolidada(2026, [
      {
        ano: 2026,
        dividaConsolidada: M("5000000.00"),
        deducoes: M("1200000.00"),
        receitaCorrenteLiquida: M("40000000.00"),
        percentualRcl: M("0.095000"),
      },
    ]);
    expect((a.linhas[0]!["dividaLiquida"] as ReturnType<typeof toMoney>).toFixed(2)).toBe(
      "3800000.00"
    );
  });

  it("⚠️ margem de expansão pode ser NEGATIVA — e é aí que ela informa", () => {
    const a = anexoMargemExpansao(2026, [
      {
        ano: 2026,
        aumentoPermanenteReceita: M("100000.00"),
        reducaoPermanenteDespesa: M("50000.00"),
        novasDespesasObrigatorias: M("400000.00"),
      },
    ]);
    expect((a.linhas[0]!["margem"] as ReturnType<typeof toMoney>).toFixed(2)).toBe(
      "-250000.00"
    );
  });

  /** ⚠️ O anexo NÃO tem coluna de resultado primário no schema — provado no PR anterior. */
  it("⚠️ o gerador não lê `resultadoPrimario` do DTO — ele não existe lá", () => {
    const chaves = Object.keys(METAS[0]!);
    expect(chaves).not.toContain("resultadoPrimario");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t4 — CASO NEGATIVO: sem dado é anexo NOMEADO, nunca erro
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t4 — anexo vazio é anexo, não exceção", () => {
  const VAZIOS: readonly [string, AnexoLdo][] = [
    ["metas-anuais", anexoMetasAnuais(2026, [])],
    ["riscos-fiscais", anexoRiscosFiscais(2026, [])],
    ["renuncia-receita", anexoRenunciaReceita(2026, [])],
    ["alienacao-bens", anexoAlienacaoBens(2026, [])],
    ["projecao-rpps", anexoProjecaoRpps(2026, [])],
    ["divida-consolidada", anexoDividaConsolidada(2026, [])],
    ["margem-expansao", anexoMargemExpansao(2026, [])],
    ["prioridades", anexoPrioridades(2026, [])],
  ];

  for (const [chave, a] of VAZIOS) {
    it(`${chave}: não estoura, e DIZ que está vazio`, () => {
      expect(a.linhas).toEqual([]);
      expect(a.titulo.length).toBeGreaterThan(10);
      expect(a.baseLegal.length).toBeGreaterThan(10);
      // ⚠️ A NOTA É O QUE DISTINGUE "o ente não tem" de "o ente não preencheu".
      expect(
        a.notas.some((n) => n.includes("SEM DADO")),
        `o anexo "${chave}" vazio não declarou a ausência`
      ).toBe(true);
    });
  }

  it("⚠️ o RPPS vazio lembra que 'inaplicável' também precisa ser dito", () => {
    const a = anexoProjecaoRpps(2026, []);
    expect(a.notas.some((n) => n.includes("não omitido"))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t5 — DETERMINISMO e o LIMITE DE FONTE
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t5 — determinismo e procedência", () => {
  it("mesma entrada → mesma saída, campo a campo", () => {
    const a = anexoRiscosFiscais(2026, [
      {
        codigoPassivo: "1",
        descricaoPassivo: "X",
        valorPassivo: M("10.00"),
        descricaoProvidencia: "Y",
        valorProvidencia: M("5.00"),
      },
    ]);
    const b = anexoRiscosFiscais(2026, [
      {
        codigoPassivo: "1",
        descricaoPassivo: "X",
        valorPassivo: M("10.00"),
        descricaoProvidencia: "Y",
        valorProvidencia: M("5.00"),
      },
    ]);

    // ⚠️ Serialização canônica: sem `Date.now()`, sem `Math.random()`, sem ordenação
    // instável. O gerador é PURO, e este teste é o que impede alguém de pôr um
    // carimbo de hora dentro dele.
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  /**
   * ⚠️ O LIMITE DE FONTE VAI IMPRESSO EM TODOS. O layout oficial está no Manual de
   * Demonstrativos Fiscais da STN, que NÃO está transcrito neste repositório. Declarar
   * conformidade que não foi conferida é o erro que este teste impede.
   */
  it("⚠️ TODO anexo carrega a nota do MDF não conferido", () => {
    const todos = [
      anexoMetasAnuais(2026, METAS),
      anexoRiscosFiscais(2026, []),
      anexoRenunciaReceita(2026, []),
      anexoAlienacaoBens(2026, []),
      anexoProjecaoRpps(2026, []),
      anexoDividaConsolidada(2026, []),
      anexoMargemExpansao(2026, []),
      anexoPrioridades(2026, []),
    ];
    for (const a of todos) {
      expect(
        a.notas.some((n) => n.includes("MDF")),
        `o anexo "${a.chave}" não declara o limite de fonte`
      ).toBe(true);
    }
  });

  it("⚠️ nenhum anexo declara conformidade com o MDF", () => {
    const RAIZ = fileURLToPath(new URL("../../..", import.meta.url));
    const fonte = readFileSync(`${RAIZ}/modules/m02b-plurianual/anexos/ldo.ts`, "utf8");
    // "conforme o MDF", "conformidade com o MDF", "homologado" — nenhum deles.
    expect(fonte).not.toMatch(/conforme o MDF|conformidade com o MDF|homologad/i);
  });

  it("o rol e o guarda de chave concordam", () => {
    expect(ANEXOS_DA_LDO.length).toBe(8);
    for (const c of ANEXOS_DA_LDO) expect(ehChaveDeAnexo(c)).toBe(true);
    expect(ehChaveDeAnexo("anexo-que-nao-existe")).toBe(false);

    // ⚠️ E cada chave do rol corresponde a um gerador que a produz — senão a rota
    // ofereceria um anexo que nada gera.
    const produzidas = [
      anexoMetasAnuais(0, []),
      anexoRiscosFiscais(0, []),
      anexoRenunciaReceita(0, []),
      anexoAlienacaoBens(0, []),
      anexoProjecaoRpps(0, []),
      anexoDividaConsolidada(0, []),
      anexoMargemExpansao(0, []),
      anexoPrioridades(0, []),
    ].map((a) => a.chave);
    expect([...ANEXOS_DA_LDO].sort()).toEqual(produzidas.sort());
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
 * t6 — O GUARD DA SOMA
 * ════════════════════════════════════════════════════════════════════════════ */

describe("t6 — somar coluna que não é dinheiro ESTOURA", () => {
  /**
   * ⚠️ Sem este guard, somar a coluna "ano" daria 4053 (2026+2027) e o anexo imprimiria
   * um "total" de exercícios. Erro que nenhum teste de valor pegaria, porque os valores
   * estariam todos certos.
   */
  it("coluna de texto ou contagem recusa a soma, nomeando", () => {
    expect(() => somarColuna([{ ano: 2026 }, { ano: 2027 }], "ano")).toThrow(
      /NÃO É DINHEIRO/i
    );
    expect(() => somarColuna([{ nome: "abc" }], "nome")).toThrow(/NÃO É DINHEIRO/i);
  });

  it("coluna ausente ou nula é ignorada, não estoura", () => {
    expect(somarColuna([{ v: M("10.00") }, { v: null }, {}], "v").toFixed(2)).toBe("10.00");
  });
});
