import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { diaCivil, instanteCivil, meioDiaCivil } from "../../packages/datas/index.js";
import {
  escolherConfiguracaoVigente,
  limiteDoRecurso,
  podeProrrogar,
  podeRecorrer,
  prazoDoPedido,
  SEM_CONFIGURACAO,
  SEM_REGULAMENTACAO_LOCAL,
  type ConfiguracaoLida,
} from "./acesso-a-informacao.js";

/**
 * ⚠️ OS NÚMEROS DESTES TESTES SÃO INVENTADOS DE PROPÓSITO — 7 dias de resposta, 3 de prorrogação,
 * 2 prorrogações. Não são os de norma nenhuma, e é isso que se quer: se a suíte usasse os números
 * que se citam de cabeça, ela passaria a ensiná-los, e o próximo leitor os copiaria para dentro do
 * código. O que está sob teste é a MÁQUINA — escolher a versão vigente, somar em dias civis,
 * recusar além do declarado —, não o conteúdo da norma, que vem de fora por publicação do ente.
 */

const D = (dia: string): Date => meioDiaCivil(dia);

function config(p: Partial<ConfiguracaoLida> & { readonly versao: number }): ConfiguracaoLida {
  return {
    versao: p.versao,
    vigenciaInicio: p.vigenciaInicio ?? "2026-01-01",
    prazoDeRespostaEmDias: p.prazoDeRespostaEmDias ?? 7,
    prazoDeProrrogacaoEmDias: p.prazoDeProrrogacaoEmDias ?? 3,
    prorrogacoesPermitidas: p.prorrogacoesPermitidas ?? 2,
    instanciasDeRecurso: p.instanciasDeRecurso ?? 1,
    prazoDeRecursoEmDias: p.prazoDeRecursoEmDias ?? 5,
    normaFederal: p.normaFederal ?? "Norma de teste, art. 1",
    normaFederalPublicadaEm: p.normaFederalPublicadaEm ?? D("2025-01-01"),
    // ⚠️ `in`, NÃO `??`. `p.regulamentacaoLocal ?? padrão` devolve o padrão quando o caso passa
    // `null` DE PROPÓSITO — e o `a4`, que existe justamente para o caso sem regulamentação local,
    // media a configuração COM ela. A fixture mentia para o teste, e o teste acusou. Ausência
    // declarada e ausência por omissão são coisas diferentes em toda parte deste repositório;
    // numa fábrica de fixture também.
    regulamentacaoLocal: "regulamentacaoLocal" in p ? p.regulamentacaoLocal! : "Decreto municipal de teste",
    regulamentacaoLocalPublicadaEm:
      "regulamentacaoLocalPublicadaEm" in p ? p.regulamentacaoLocalPublicadaEm! : D("2025-06-01"),
    observacao: p.observacao ?? null,
  };
}

describe("V5.1 — a configuração vigente", () => {
  it("a1 — sem configuração, o sistema NÃO promete data, e diz por quê", () => {
    const r = prazoDoPedido(null, D("2026-09-01"), 0, D("2026-09-18"));
    expect(r.limite).toBeNull();
    expect(r.limiteBr).toBeNull();
    expect(r.situacao).toBe("SEM_PRAZO");
    expect(r.diasRestantes).toBeNull();
    expect(r.pendencias).toHaveLength(1);
    expect(r.pendencias[0]!.codigo).toBe("SEM-CONFIGURACAO-DO-ACESSO");
    expect(r.pendencias[0]!.bloqueia).toBe(true);
    expect(r.pendencias[0]!.rota.startsWith("/")).toBe(true);
    // ⚠️ O MOTIVO, não só o resultado: o texto diz que o pedido continua correndo.
    expect(r.pendencias[0]!.mensagem).toBe(SEM_CONFIGURACAO);
    expect(r.pendencias[0]!.mensagem).toMatch(/continua podendo ser recebido/);
  });

  it("a2 — N=2 versões vigentes: vence a de MAIOR versão, não a primeira do array", () => {
    const v = [config({ versao: 1, prazoDeRespostaEmDias: 7 }), config({ versao: 2, prazoDeRespostaEmDias: 9 })];
    expect(escolherConfiguracaoVigente(v, "2026-09-18")?.versao).toBe(2);
    expect(escolherConfiguracaoVigente([...v].reverse(), "2026-09-18")?.versao).toBe(2);
  });

  it("a2b — mesmo dia de vigência, versões diferentes: a versão desempata", () => {
    const v = [
      config({ versao: 5, vigenciaInicio: "2026-03-01", prazoDeRespostaEmDias: 7 }),
      config({ versao: 6, vigenciaInicio: "2026-03-01", prazoDeRespostaEmDias: 11 }),
    ];
    expect(escolherConfiguracaoVigente(v, "2026-03-01")?.prazoDeRespostaEmDias).toBe(11);
    expect(escolherConfiguracaoVigente([...v].reverse(), "2026-03-01")?.prazoDeRespostaEmDias).toBe(11);
  });

  it("a3 — vigência FUTURA não vale hoje, e a anterior continua valendo", () => {
    const v = [
      config({ versao: 1, vigenciaInicio: "2026-01-01", prazoDeRespostaEmDias: 7 }),
      config({ versao: 2, vigenciaInicio: "2026-10-01", prazoDeRespostaEmDias: 30 }),
    ];
    expect(escolherConfiguracaoVigente(v, "2026-09-30")?.versao).toBe(1);
    expect(escolherConfiguracaoVigente(v, "2026-10-01")?.versao).toBe(2);
  });

  it("a3b — nenhuma versão já vigente devolve null, e não a mais antiga", () => {
    const v = [config({ versao: 1, vigenciaInicio: "2027-01-01" })];
    expect(escolherConfiguracaoVigente(v, "2026-09-18")).toBeNull();
  });
});

describe("V5.1 — a regulamentação local é pendência TRATÁVEL, não bloqueio", () => {
  it("a4 — sem regulamentação local o prazo federal CONTINUA valendo, com a pendência junto", () => {
    const c = config({ versao: 1, regulamentacaoLocal: null, regulamentacaoLocalPublicadaEm: null });
    const r = prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-02"));
    // ⚠️ O ponto do caso: a omissão do ente NÃO vira negativa de direito do cidadão.
    expect(r.limite).not.toBeNull();
    expect(r.situacao).toBe("NO_PRAZO");
    expect(r.diasRestantes).toBe(6);
    expect(r.pendencias).toHaveLength(1);
    expect(r.pendencias[0]!.codigo).toBe("SEM-REGULAMENTACAO-LOCAL");
    expect(r.pendencias[0]!.bloqueia).toBe(false);
    expect(r.pendencias[0]!.mensagem).toBe(SEM_REGULAMENTACAO_LOCAL);
  });

  it("a5 — com regulamentação local declarada, nenhuma pendência", () => {
    const r = prazoDoPedido(config({ versao: 1 }), D("2026-09-01"), 0, D("2026-09-02"));
    expect(r.pendencias).toHaveLength(0);
    expect(r.regulamentacaoLocal).toBe("Decreto municipal de teste");
  });
});

describe("V5.1 — a contagem do prazo", () => {
  it("a6 — o limite é o protocolo mais os dias declarados, em DIAS CIVIS", () => {
    const r = prazoDoPedido(config({ versao: 1, prazoDeRespostaEmDias: 7 }), D("2026-09-01"), 0, D("2026-09-01"));
    expect(diaCivil(r.limite!)).toBe("2026-09-08");
    expect(r.limiteBr).toBe("08/09/2026");
    expect(r.diasRestantes).toBe(7);
  });

  it("a7 — cada prorrogação acrescenta os dias DECLARADOS, não um número do código", () => {
    const c = config({ versao: 1, prazoDeRespostaEmDias: 7, prazoDeProrrogacaoEmDias: 3 });
    expect(diaCivil(prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-01")).limite!)).toBe("2026-09-08");
    expect(diaCivil(prazoDoPedido(c, D("2026-09-01"), 1, D("2026-09-01")).limite!)).toBe("2026-09-11");
    expect(diaCivil(prazoDoPedido(c, D("2026-09-01"), 2, D("2026-09-01")).limite!)).toBe("2026-09-14");
  });

  it("a8 — as três situações, e o VENCE_HOJE no meio", () => {
    const c = config({ versao: 1, prazoDeRespostaEmDias: 7 });
    expect(prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-07")).situacao).toBe("NO_PRAZO");
    expect(prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-08")).situacao).toBe("VENCE_HOJE");
    expect(prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-09")).situacao).toBe("VENCIDO");
    expect(prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-08")).diasRestantes).toBe(0);
    expect(prazoDoPedido(c, D("2026-09-01"), 0, D("2026-09-11")).diasRestantes).toBe(-3);
  });

  it("a9 — PROPRIEDADE: a soma é de CALENDÁRIO, e a aritmética de milissegundos erra o dia", () => {
    // ⚠️ A PRIMEIRA VERSÃO DESTE CASO PASSAVA COM A ARITMÉTICA ERRADA, e o achado é do teste, não
    // do código. Ela corria 366 dias de 2026 ancorados ao MEIO-DIA — e o Brasil não tem horário de
    // verão desde 2019, então não havia virada nenhuma a atravessar e o meio-dia é justamente a
    // hora mais segura do dia. A mutação que troca `somarDiasCivis` por `getTime() + n*86400000`
    // passou 18/18. Um teste de propriedade que não distingue as duas implementações não afirma
    // propriedade nenhuma: ele descreve o resultado que as duas dão.
    //
    // ⚠️ O QUE ELE FAZ AGORA: corre 2018, quando `America/Sao_Paulo` AINDA tinha horário de verão,
    // ancorado às 23:30 — a hora onde a borda existe. E ele afirma DUAS coisas: que o limite é o
    // dia de calendário seguinte, e que a corrida CONTÉM pelo menos um dia em que a aritmética de
    // milissegundos discordaria. Sem a segunda asserção, o caso voltaria a passar por vacuidade no
    // dia em que alguém mudasse o ano.
    const c = config({ versao: 1, prazoDeRespostaEmDias: 1 });
    let divergencias = 0;

    // ⚠️ A HORA LOCAL TEM DE FICAR FIXA. Uma âncora que anda por `getTime() + i*86400000` DERIVA
    // junto com a virada: depois dela o protocolo cai noutra hora local, e a diferença some dos
    // dois lados da conta. Foi assim que a segunda versão deste caso também mediu zero divergência.
    // Cada dia civil é montado do zero, às 23:30 locais — meia hora antes da virada.
    for (let i = 0; i < 365; i += 1) {
      const d = new Date(Date.UTC(2018, 0, 1 + i));
      const protocolado = instanteCivil(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), 23, 30, 0, 0);
      const diaDoProtocolo = diaCivil(protocolado);

      const limite = prazoDoPedido(c, protocolado, 0, protocolado).limite!;
      const esperado = new Date(Date.parse(`${diaDoProtocolo}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
      expect(diaCivil(limite)).toBe(esperado);

      const porMilissegundos = diaCivil(new Date(protocolado.getTime() + 86_400_000));
      if (porMilissegundos !== esperado) divergencias += 1;
    }

    // ⚠️ A ANTIVACUIDADE. Se este número for zero, o caso acima não separa as duas implementações
    // e a mutação passaria — foi exatamente o que aconteceu na primeira versão.
    expect(divergencias).toBeGreaterThan(0);
  });

  it("a10 — a norma obedecida sai junto com a data: data sozinha não se confere", () => {
    const r = prazoDoPedido(config({ versao: 1, normaFederal: "Norma de teste, art. 9" }), D("2026-09-01"), 0, D("2026-09-01"));
    expect(r.normaFederal).toBe("Norma de teste, art. 9");
  });
});

describe("V5.1 — prorrogação e recurso saem da norma declarada", () => {
  it("a11 — dentro do permitido concede; no limite RECUSA nomeando quantas já foram", () => {
    const c = config({ versao: 1, prorrogacoesPermitidas: 2 });
    expect(podeProrrogar(c, 0).pode).toBe(true);
    expect(podeProrrogar(c, 1).pode).toBe(true);
    const r = podeProrrogar(c, 2);
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("2 de 2");
    expect(r.motivo).toContain("versão 1");
  });

  it("a11b — zero prorrogações é resposta VÁLIDA, e a recusa diz isso em vez de falar em limite", () => {
    const r = podeProrrogar(config({ versao: 3, prorrogacoesPermitidas: 0 }), 0);
    expect(r.pode).toBe(false);
    expect(r.motivo).toContain("não admite prorrogação");
    expect(r.motivo).toContain("Norma de teste");
  });

  it("a11c — sem configuração, prorrogar e recorrer recusam com o motivo da CONFIGURAÇÃO", () => {
    expect(podeProrrogar(null, 0)).toEqual({ pode: false, motivo: SEM_CONFIGURACAO });
    expect(podeRecorrer(null, 0)).toEqual({ pode: false, motivo: SEM_CONFIGURACAO });
    expect(limiteDoRecurso(null, D("2026-09-01"))).toBeNull();
  });

  it("a11d — o recurso segue as instâncias declaradas, e zero instância é declarado, não erro", () => {
    expect(podeRecorrer(config({ versao: 1, instanciasDeRecurso: 1 }), 0).pode).toBe(true);
    expect(podeRecorrer(config({ versao: 1, instanciasDeRecurso: 1 }), 1).pode).toBe(false);
    const z = podeRecorrer(config({ versao: 1, instanciasDeRecurso: 0 }), 0);
    expect(z.pode).toBe(false);
    expect(z.motivo).toContain("zero instância");
    expect(diaCivil(limiteDoRecurso(config({ versao: 1, prazoDeRecursoEmDias: 5 }), D("2026-09-10"))!)).toBe("2026-09-15");
  });
});

describe("V5.1 — os instrumentos, e a prova de que acusam", () => {
  it("a12 — TRIPWIRE: nenhum prazo de norma escrito dentro do domínio", () => {
    // ⚠️ A propriedade afirmada é a FORMA de um prazo cravado — um número seguido de "dia"/"dias"
    // no texto do módulo —, não uma lista de números conhecidos. Enumerar "20" e "10" acharia só
    // 20 e 10, e o 15 de um decreto municipal entraria em silêncio.
    const alvo = fileURLToPath(new URL("./acesso-a-informacao.ts", import.meta.url));
    const fonte = readFileSync(alvo, "utf8");
    const achados = fonte.match(/\b\d+\s*dias?\b/gi) ?? [];
    expect(achados).toEqual([]);
  });

  it("a13 — a régua não escreve: mesma entrada, mesma saída, e a entrada intacta", () => {
    const c = config({ versao: 1 });
    const antes = JSON.stringify(c);
    const a = prazoDoPedido(c, D("2026-09-01"), 1, D("2026-09-05"));
    const b = prazoDoPedido(c, D("2026-09-01"), 1, D("2026-09-05"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(c)).toBe(antes);
  });
});
