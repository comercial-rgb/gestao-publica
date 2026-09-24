import { describe, expect, it } from "vitest";
import {
  AbrangenciaIncompletaError,
  EXCLUSAO_FOI_PEDIDA,
  SELECAO_DE_TODOS,
  abrangenciaDeclarada,
  exigirAbrangenciaCompleta,
  selecionadosQueSumiriam,
  vinculosPagosDuasVezes,
  SelecaoComVinculoInexistenteError,
  type LinhaDeAbrangencia,
} from "./abrangencia.js";

/**
 * ═══ A SELEÇÃO E A ABRANGÊNCIA, PURAS — TR 5.12.50 (V11 V9.5) ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO EXISTE PARA IMPEDIR é a folha PARCIAL que fecha em silêncio. A promessa do
 * motor deixou de ser mantida por construção (o `findMany` sem `where` foi embora) e passou a ser
 * uma AFIRMAÇÃO: "exatamente os selecionados e elegíveis, com cada exclusão nomeada". Uma promessa
 * que ninguém afirma é uma promessa que some no primeiro refactor.
 */

describe("(1) a seleção é EXPLÍCITA — o modo é declarado, nunca inferido", () => {
  it("⚠️ 25 SELECIONADOS NUM ENTE DE 25 NÃO É 'TODOS' — é o defeito da paginação que isto impede", () => {
    const todos = ["v1", "v2"];
    const explicitaQueCobreTudo = abrangenciaDeclarada({ modo: "EXPLICITA", vinculoIds: ["v1", "v2"] }, todos);
    const modoTodos = abrangenciaDeclarada(SELECAO_DE_TODOS, todos);
    // O CONJUNTO calculado é o mesmo…
    expect(explicitaQueCobreTudo.aConsiderar).toEqual(modoTodos.aConsiderar);
    // …mas os dois estados continuam distinguíveis pelo MODO, que é o que o cálculo grava. Se o
    // modo fosse inferido do tamanho da lista, uma tela paginada que manda os visíveis passaria
    // por "selecionou tudo" no dia em que a página cobrisse o ente inteiro.
    expect(SELECAO_DE_TODOS.modo).not.toBe("EXPLICITA");
  });

  it("no modo EXPLÍCITA, considera SÓ os pedidos — e quem não foi pedido é DERIVÁVEL, não linha", () => {
    const r = abrangenciaDeclarada({ modo: "EXPLICITA", vinculoIds: ["v1"] }, ["v1", "v2", "v3"]);
    expect(r.aConsiderar).toEqual(["v1"]);
    // ⚠️ `v2` e `v3` NÃO viram exclusão: gravar uma linha por vínculo não pedido seria ruído que
    // esconde as exclusões que importam, e o fato é derivável do modo mais esta lista.
  });

  it("no modo 'TODOS', considera todos os que existem", () => {
    expect(abrangenciaDeclarada(SELECAO_DE_TODOS, ["v1", "v2", "v3"]).aConsiderar).toEqual(["v1", "v2", "v3"]);
  });
});

describe("(2) a REVALIDAÇÃO no instante do cálculo — a tela envelhece, o fato não", () => {
  it("⚠️ VÍNCULO QUE DEIXOU DE EXISTIR RECUSA O CÁLCULO — não entra em silêncio, e nem pode virar linha", () => {
    // A FK de `AbrangenciaDoCalculo` aponta para `Vinculo`: registrar o inexistente é impossível,
    // e calcular os demais calando sobre ele seria o silêncio que esta unidade elimina.
    expect(() => abrangenciaDeclarada({ modo: "EXPLICITA", vinculoIds: ["v1", "sumiu"] }, ["v1", "v2"]))
      .toThrow(SelecaoComVinculoInexistenteError);
    expect(() => abrangenciaDeclarada({ modo: "EXPLICITA", vinculoIds: ["v1", "sumiu"] }, ["v1", "v2"]))
      .toThrow(/SELECAO-COM-VINCULO-INEXISTENTE/);
  });

  it("⚠️ TODO MOTIVO QUE SOBROU FRUSTRA EXPECTATIVA — o operador pediu e não recebeu", () => {
    expect(EXCLUSAO_FOI_PEDIDA.ADMITIDO_APOS_A_COMPETENCIA).toBe(true);
    expect(EXCLUSAO_FOI_PEDIDA.DESLIGADO_ANTES_DA_COMPETENCIA).toBe(true);
    expect(EXCLUSAO_FOI_PEDIDA.SEM_DIFERENCA_A_PAGAR).toBe(true);
  });
});

describe("(3) a GUARDA DE COMPLETUDE — conjunto, não cardinalidade", () => {
  const exc = (id: string): LinhaDeAbrangencia => ({ vinculoId: id, calculado: false, motivo: "DESLIGADO_ANTES_DA_COMPETENCIA" });

  it("passa quando todo considerado tem exatamente um destino", () => {
    expect(() => exigirAbrangenciaCompleta(["a", "b", "c"], ["a", "b"], [exc("c")])).not.toThrow();
  });

  it("⚠️ ACUSA O SUMIÇO SILENCIOSO — considerado sem contracheque e sem exclusão nomeada", () => {
    expect(() => exigirAbrangenciaCompleta(["a", "b"], ["a"], [])).toThrow(AbrangenciaIncompletaError);
    expect(() => exigirAbrangenciaCompleta(["a", "b"], ["a"], [])).toThrow(/ABRANGENCIA-INCOMPLETA/);
  });

  it("⚠️ E NÃO É `length === length`: um que some e um intruso que entra dão a MESMA contagem", () => {
    // Este é o caso que uma conferência de cardinalidade deixaria passar: 2 considerados,
    // 2 contracheques — e mesmo assim "b" não recebeu e "z" recebeu sem ter sido considerado.
    expect(["a", "z"].length).toBe(["a", "b"].length);
    expect(() => exigirAbrangenciaCompleta(["a", "b"], ["a", "z"], [])).toThrow(AbrangenciaIncompletaError);
  });

  it("acusa quem é contado nos DOIS lados — a contagem mentiria sem nada acusar", () => {
    expect(() => exigirAbrangenciaCompleta(["a"], ["a"], [exc("a")])).toThrow(AbrangenciaIncompletaError);
  });
});

describe("(4) ⚠️ A SUBTRAÇÃO SILENCIOSA — o risco que ninguém procuraria", () => {
  it("nº1={A,B} e nº2={C,D}: fechar no nº2 faria A e B sumirem, e a guarda os NOMEIA", () => {
    // ⚠️ ESTE É O CENÁRIO OBRIGATÓRIO. Duas seleções sobrepostas não pagam duas vezes: elas se
    // APAGAM, porque o fechamento congela um único cálculo. N=2 nas duas seleções — com um
    // vínculo por cálculo, um predicado que comparasse cardinalidade passaria.
    const vivos = ["A", "B", "C", "D"];
    const vaiFechar = ["C", "D"];
    expect(selecionadosQueSumiriam(vivos, vaiFechar)).toEqual(["A", "B"]);
  });

  it("não acusa quando o cálculo a congelar cobre todos os calculados nos vivos", () => {
    expect(selecionadosQueSumiriam(["A", "B"], ["A", "B", "C"])).toEqual([]);
  });

  it("⚠️ E O CANCELAMENTO É A SAÍDA LEGÍTIMA: quem saiu dos VIVOS deixa de ser prometido por ATO", () => {
    // O chamador só passa os calculados em cálculos NÃO cancelados. Cancelar o nº1 é a decisão
    // explícita que retira A e B da promessa — a guarda impede o esquecimento, não a decisão.
    const aposCancelarONumero1 = ["C", "D"];
    expect(selecionadosQueSumiriam(aposCancelarONumero1, ["C", "D"])).toEqual([]);
  });
});

describe("(5) CADA UM NO MÁXIMO UMA VEZ — a propriedade que era só coincidência", () => {
  it("⚠️ ACUSA O MESMO VÍNCULO PAGO EM DUAS FOLHAS FECHADAS DA COMPETÊNCIA", () => {
    // Antes da seleção isto era sustentado de lado por três construções que ninguém escreveu com
    // esse fim. A seleção multiplica os caminhos, então a propriedade passa a ser afirmada.
    expect(vinculosPagosDuasVezes([["A", "B"], ["B", "C"]])).toEqual(["B"]);
  });

  it("não acusa quando as folhas da competência são disjuntas", () => {
    expect(vinculosPagosDuasVezes([["A", "B"], ["C", "D"]])).toEqual([]);
  });

  it("repetição DENTRO de uma folha não conta duas vezes — o `@@unique` já a impede no banco", () => {
    expect(vinculosPagosDuasVezes([["A", "A"], ["B"]])).toEqual([]);
  });
});
