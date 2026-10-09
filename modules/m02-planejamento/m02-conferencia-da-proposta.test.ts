import { describe, expect, it } from "vitest";
import { toMoney } from "../../packages/contracts/index.js";
import { conferirProposta, type FatosDoPlanejamento } from "./conferencia-da-proposta.js";
import type { PropostaDetalhada } from "./proposta-orcamentaria.js";

/**
 * A CONFERÊNCIA DA PROPOSTA (V31) — pura. Fixture N=2 em tudo que se agrega: duas fontes, duas ações,
 * receita com dedução. Cada negação afirma o MOTIVO (o código e o texto do achado), não só a cor.
 */

const totais = (v: string) => ({ lei: v, base: v, projetado: v, vigente: v });

function proposta(over: {
  receitas?: { natureza: string; fonte: string; tipo?: string; valor: string }[];
  despesas?: { numero: number; programa: string; acao: string; fonte: string; valor: string }[];
  deducoesSemTipo?: number;
}): PropostaDetalhada {
  const receitas = (over.receitas ?? []).map((r, i) => ({
    id: `r${i}`,
    naturezaCodigo: r.natureza,
    naturezaDescricao: "",
    fonteCodigo: r.fonte,
    tipoReceita: r.tipo ?? "ORCAMENTARIA",
    valorNaLeiDeOrigem: r.valor,
    valorBase: r.valor,
    valorProjetado: r.valor,
    valorVigente: r.valor,
    ajustes: [], nova: false, motivo: null,
  }));
  const despesas = (over.despesas ?? []).map((d, i) => ({
    id: `d${i}`,
    numero: d.numero,
    unidadeCodigo: "02001",
    unidadeNome: "",
    programaCodigo: d.programa,
    acaoCodigo: d.acao,
    tipoDaAcao: "ATIVIDADE",
    naturezaCodigo: "3.3.90.30",
    naturezaDescricao: "",
    fonteCodigo: d.fonte,
    valorNaLeiDeOrigem: d.valor,
    valorBase: d.valor,
    valorProjetado: d.valor,
    valorVigente: d.valor,
    ajustes: [], nova: false, motivo: null,
  }));
  const liquida = receitas.reduce((a, r) => (r.tipoReceita === "DEDUCAO" ? a.minus(r.valorVigente) : a.plus(r.valorVigente)), toMoney("0"));
  const desp = despesas.reduce((a, d) => a.plus(d.valorVigente), toMoney("0"));
  return {
    id: "p1",
    exercicio: 2027,
    exercicioDeOrigem: 2026,
    descricao: "",
    baseDaReceita: "PREVISAO_ATUALIZADA",
    percentualDaReceita: "0",
    baseDaDespesa: "DOTACAO_AUTORIZADA",
    percentualDaDespesa: "0",
    aproveitaReceitas: true,
    aproveitaFichas: true,
    reajustaProjetos: true,
    incluiFichasAbertasPorCredito: false,
    criadoEm: new Date("2026-10-03T15:00:00Z"),
    criadoPor: "t",
    receitas,
    despesas,
    totalDaReceita: totais(liquida.toFixed(2)),
    receitaBruta: totais("0"),
    deducoesDaReceita: totais("0"),
    totalDaDespesa: totais(desp.toFixed(2)),
    efetivacao: null,
    destino: { existe: true, encerrado: false, fichas: 0, receitas: 0, efetivadoPorOutra: false, deducoesSemTipo: over.deducoesSemTipo ?? 0, lei: null },
  };
}

const SEM_PLANEJAMENTO: FatosDoPlanejamento = { metaDaLdo: { ldoRegistrada: false }, prioridadesDaLdo: [], plano: null };

const verif = (c: ReturnType<typeof conferirProposta>, codigo: string) => {
  const v = c.verificacoes.find((x) => x.codigo === codigo);
  if (v === undefined) throw new Error(`sem a verificação ${codigo}`);
  return v;
};

describe("a conferência da proposta antes da votação", () => {
  const equilibrada = proposta({
    receitas: [
      { natureza: "1.1.1", fonte: "500", valor: "1000.00" },
      { natureza: "1.7.1", fonte: "540", valor: "600.00" },
      { natureza: "1.7.1", fonte: "540", tipo: "DEDUCAO", valor: "100.00" },
    ],
    despesas: [
      { numero: 1, programa: "0001", acao: "2001", fonte: "500", valor: "1000.00" },
      { numero: 2, programa: "0002", acao: "2002", fonte: "540", valor: "500.00" },
    ],
  });

  it("k1: receita LÍQUIDA (a dedução subtrai) igual à despesa — equilíbrio e fontes conformes", () => {
    const c = conferirProposta(equilibrada, SEM_PLANEJAMENTO);
    expect(verif(c, "EQUILIBRIO").situacao).toBe("CONFORME");
    expect(verif(c, "FONTES").situacao).toBe("CONFORME");
    expect(verif(c, "LINHAS_NEGATIVAS").situacao).toBe("CONFORME");
  });

  it("k2: a fonte 540 com a dedução vira sem lastro quando a despesa dela sobe — e o achado nomeia a fonte e o que falta", () => {
    const p = proposta({
      receitas: [
        { natureza: "1.1.1", fonte: "500", valor: "1000.00" },
        { natureza: "1.7.1", fonte: "540", valor: "600.00" },
        { natureza: "1.7.1", fonte: "540", tipo: "DEDUCAO", valor: "100.00" },
      ],
      despesas: [
        { numero: 1, programa: "0001", acao: "2001", fonte: "500", valor: "900.00" },
        { numero: 2, programa: "0002", acao: "2002", fonte: "540", valor: "600.00" },
      ],
    });
    const c = conferirProposta(p, SEM_PLANEJAMENTO);
    // O total continua equilibrado (1.500 = 1.500): só a conferência por FONTE acusa.
    expect(verif(c, "EQUILIBRIO").situacao).toBe("CONFORME");
    const f = verif(c, "FONTES");
    expect(f.situacao).toBe("ATENCAO");
    expect(f.itens).toHaveLength(1);
    expect(f.itens[0]).toContain("Fonte 540");
    expect(f.itens[0]).toContain("faltam R$ 100,00");
  });

  it("k3: desequilíbrio diz o lado e o valor", () => {
    const p = proposta({ receitas: [{ natureza: "1.1.1", fonte: "500", valor: "1000.00" }], despesas: [{ numero: 1, programa: "0001", acao: "2001", fonte: "500", valor: "1200.00" }] });
    const e = verif(conferirProposta(p, SEM_PLANEJAMENTO), "EQUILIBRIO");
    expect(e.situacao).toBe("ATENCAO");
    expect(e.resumo).toContain("supera a receita líquida prevista");
    expect(e.resumo).toContain("R$ 200,00");
  });

  it("k4: linha negativa IMPEDE (a geração recusa) e ficha zerada é atenção (não é criada)", () => {
    const p = proposta({
      receitas: [{ natureza: "1.1.1", fonte: "500", valor: "-5.00" }],
      despesas: [
        { numero: 7, programa: "0001", acao: "2001", fonte: "500", valor: "0.00" },
        { numero: 8, programa: "0001", acao: "2001", fonte: "500", valor: "10.00" },
      ],
    });
    const c = conferirProposta(p, SEM_PLANEJAMENTO);
    expect(verif(c, "LINHAS_NEGATIVAS").situacao).toBe("IMPEDE");
    expect(verif(c, "LINHAS_NEGATIVAS").itens[0]).toContain("Receita 1.1.1");
    const z = verif(c, "FICHAS_ZERADAS");
    expect(z.situacao).toBe("ATENCAO");
    expect(z.itens).toEqual(["Ficha 7 (2001 3.3.90.30, fonte 500)"]);
  });

  it("k5: sem LDO e sem PPA, a conferência diz o que falta e aponta onde registrar — não fica verde por vacuidade", () => {
    const c = conferirProposta(equilibrada, SEM_PLANEJAMENTO);
    expect(verif(c, "LDO").situacao).toBe("ATENCAO");
    expect(verif(c, "LDO").ondeCorrigir?.href).toBe("/planejamento/ldo");
    expect(verif(c, "PPA").situacao).toBe("ATENCAO");
    expect(verif(c, "PPA").resumo).toContain("Nenhum PPA registrado cobre o exercício de 2027");
  });

  it("k6: metas da LDO — a diferença de cada lado é nomeada; coincidindo, conforme", () => {
    const fatos = (receita: string, despesa: string): FatosDoPlanejamento => ({
      ...SEM_PLANEJAMENTO,
      metaDaLdo: { ldoRegistrada: true, meta: { receitaTotal: toMoney(receita), despesaTotal: toMoney(despesa), ajustes: 1 } },
    });
    expect(verif(conferirProposta(equilibrada, fatos("1500.00", "1500.00")), "LDO").situacao).toBe("CONFORME");
    const l = verif(conferirProposta(equilibrada, fatos("1600.00", "1500.00")), "LDO");
    expect(l.situacao).toBe("ATENCAO");
    expect(l.itens).toHaveLength(1);
    expect(l.itens[0]).toContain("Receita: meta da LDO R$ 1.600,00, proposta R$ 1.500,00");
    expect(l.resumo).toContain("1 alteração(ões) por lei");
    const semMeta = verif(conferirProposta(equilibrada, { ...SEM_PLANEJAMENTO, metaDaLdo: { ldoRegistrada: true, meta: null } }), "LDO");
    expect(semMeta.resumo).toContain("sem a meta anual de 2027");
  });

  it("k7: prioridade da LDO sem valor na proposta é acusada pela ação; a com valor não", () => {
    const c = conferirProposta(equilibrada, {
      ...SEM_PLANEJAMENTO,
      prioridadesDaLdo: [
        { acaoCodigo: "2001", descricao: "Manter a rede" },
        { acaoCodigo: "1009", descricao: "Construir a creche" },
        { acaoCodigo: null, descricao: "Sem ação cadastrada" },
      ],
    });
    const pr = verif(c, "PRIORIDADES_DA_LDO");
    expect(pr.situacao).toBe("ATENCAO");
    expect(pr.itens).toEqual(["Ação 1009 — Construir a creche"]);
  });

  it("k8: PPA — ação fora do plano no MESMO programa é acusada; e o quadro explica a diferença entre meta e fichas", () => {
    const fatos: FatosDoPlanejamento = {
      ...SEM_PLANEJAMENTO,
      plano: {
        anoInicio: 2026,
        anoFim: 2029,
        leiRef: "Lei 600/2025",
        acoes: [
          {
            programaCodigo: "0001",
            acaoCodigo: "2001",
            acaoDescricao: "Manter a rede",
            metaVigente: toMoney("4000.00"),
            alteracoes: 0,
            dotacaoPorExercicio: [{ exercicio: 2026, valor: toMoney("1100.00") }],
          },
          // A ação 2002 está no plano, mas noutro programa: a ficha do programa 0002 fica FORA.
          { programaCodigo: "0009", acaoCodigo: "2002", acaoDescricao: "Outra", metaVigente: toMoney("100.00"), alteracoes: 2, dotacaoPorExercicio: [] },
        ],
      },
    };
    const c = conferirProposta(equilibrada, fatos);
    const ppa = verif(c, "PPA");
    expect(ppa.situacao).toBe("ATENCAO");
    expect(ppa.itens).toEqual(["Programa 0002, ação 2002"]);
    const a = c.acoesDoPpa.find((x) => x.acaoCodigo === "2001");
    expect(a?.metaDoPlano).toBe("4000.00");
    expect(a?.anosAnteriores).toEqual([{ exercicio: 2026, dotacaoAtualizada: "1100.00" }]);
    expect(a?.naProposta).toBe("1000.00");
    expect(a?.restanteDaMeta).toBe("1900.00");
    const b = c.acoesDoPpa.find((x) => x.acaoCodigo === "2002");
    expect(b?.naProposta).toBe("0.00");
    expect(b?.restanteDaMeta).toBe("100.00");
  });

  it("k9: deduções sem tipo no destino entram como atenção com o caminho da correção", () => {
    const d = verif(conferirProposta(proposta({ deducoesSemTipo: 3 }), SEM_PLANEJAMENTO), "DEDUCOES_SEM_TIPO");
    expect(d.resumo).toContain("3 dedução(ões)");
    expect(d.ondeCorrigir?.href).toBe("/planejamento/receita-prevista");
  });
});
