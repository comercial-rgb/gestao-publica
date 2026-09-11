import { describe, expect, it } from "vitest";
import { TODAS_AS_ACOES } from "../../modules/m16-travamento/acoes.js";
import { lerConsulta, MAXIMO_DE_SELECAO } from "../../lib/molde/consulta.js";
import { somarSelecionadas } from "../../lib/molde/soma.js";
import {
  definirRecurso,
  verificarDefinicao,
  type DefinicaoDeRecurso,
} from "../../lib/molde/tipos.js";
import { RECURSOS_DO_MOLDE } from "../../lib/portas/recursos/definicoes.js";

/**
 * ═══ A GUARDA DO MOLDE ═══
 *
 * O molde gera a superfície de vários cadastros a partir de um descritor. Isso concentra o
 * risco: um descritor inconsistente não produz um erro — produz uma TELA QUE PARECE PRONTA.
 * Aba de anexos num cadastro que não aceita anexo ensina que o sistema perdeu o arquivo; ação
 * com nome de crachá inexistente esconde o botão para todo mundo, em silêncio.
 *
 * ⚠️ O TESTE MAIS IMPORTANTE AQUI É O DO CENSO. Ele amarra o descritor — que é dado puro, e
 * não pode importar o domínio — às ações reais do M16. Sem ele, um erro de digitação em
 * `permissoes` só apareceria em produção, como um botão que nunca aparece.
 */

const BASE: DefinicaoDeRecurso = {
  nome: "coisas",
  rotulo: "Coisas",
  rotuloSingular: "Coisa",
  rota: "/area/coisas",
  descricao: "Um cadastro de teste.",
  campos: [{ nome: "titulo", rotulo: "Título", tipo: "texto", obrigatorio: true }],
  colunas: [{ nome: "titulo", cabecalho: "Título", tipo: "link", ordenavel: true }],
  filtros: [{ nome: "q", rotulo: "Busca", tipo: "texto" }],
  acoes: [],
  permissoes: { criar: "CADASTRAR_CONVENIO" },
  abas: ["dados"],
};

describe("o molde — a verificação do descritor", () => {
  it("t1: o descritor base é consistente", () => {
    expect(verificarDefinicao(BASE)).toEqual([]);
    expect(() => definirRecurso(BASE)).not.toThrow();
  });

  it("t2: aba de ANEXOS sem dono é recusada — aba vazia é pior que aba ausente", () => {
    const erros = verificarDefinicao({ ...BASE, abas: ["dados", "anexos"] });
    expect(erros.join(" ")).toMatch(/qual coluna de `Anexo`/);
  });

  it("t3: aba de CAMPOS ADICIONAIS sem cadastro do M25 é recusada", () => {
    const erros = verificarDefinicao({ ...BASE, abas: ["dados", "campos"] });
    expect(erros.join(" ")).toMatch(/cadastro do M25/);
  });

  it("t4: coluna SOMÁVEL que não é dinheiro é recusada", () => {
    const erros = verificarDefinicao({
      ...BASE,
      colunas: [{ nome: "qtd", cabecalho: "Qtd", tipo: "inteiro", somavel: true }],
    });
    expect(erros.join(" ")).toMatch(/somável e não é dinheiro/);
  });

  it("t5: seleção sem opções, e opções em campo que não é seleção", () => {
    expect(
      verificarDefinicao({
        ...BASE,
        campos: [{ nome: "x", rotulo: "X", tipo: "selecao" }],
      }).join(" ")
    ).toMatch(/de seleção e não declara opções/);
    expect(
      verificarDefinicao({
        ...BASE,
        campos: [{ nome: "x", rotulo: "X", tipo: "texto", opcoes: [] }],
      }).join(" ")
    ).toMatch(/declara opções e não é de seleção/);
  });

  it("t6: 'assinável' sem dono de anexo é recusado — assinatura sobre o nada", () => {
    const erros = verificarDefinicao({ ...BASE, assinavel: true });
    expect(erros.join(" ")).toMatch(/assinatura recairia sobre o nada/);
  });

  it("t7: ação declarada duas vezes é recusada", () => {
    const acao = { nome: "x", rotulo: "X", acaoDoCenso: "CADASTRAR_CONVENIO" } as const;
    expect(verificarDefinicao({ ...BASE, acoes: [acao, acao] }).join(" ")).toMatch(
      /declarada duas vezes/
    );
  });

  it("t8: `definirRecurso` ESTOURA — o erro aparece antes de alguém abrir a página", () => {
    expect(() => definirRecurso({ ...BASE, abas: ["dados", "anexos"] })).toThrow(
      /é inconsistente/
    );
  });
});

describe("o molde — o censo das ações dos descritores", () => {
  it("t9: TODA ação nomeada num descritor EXISTE no censo do M16", () => {
    const conhecidas = new Set<string>(TODAS_AS_ACOES);
    const fantasmas: string[] = [];
    for (const r of RECURSOS_DO_MOLDE) {
      for (const p of Object.values(r.permissoes)) {
        if (p !== undefined && !conhecidas.has(p)) fantasmas.push(`${r.nome}.permissoes → ${p}`);
      }
      for (const a of r.acoes) {
        if (!conhecidas.has(a.acaoDoCenso)) fantasmas.push(`${r.nome}.${a.nome} → ${a.acaoDoCenso}`);
      }
    }
    expect(
      fantasmas,
      "\n\n⚠️ AÇÃO FANTASMA NUM DESCRITOR DO MOLDE.\n\n" +
        "O descritor vive em `lib/molde/`, que não pode importar o domínio, e por isso a ação " +
        "é uma string. É ESTE teste que a amarra ao censo. Uma ação inexistente não dá erro " +
        "nenhum: ela esconde o botão para TODO MUNDO, em silêncio — e o operador conclui que " +
        "o sistema perdeu a funcionalidade.\n\nFantasmas:\n"
    ).toEqual([]);
  });

  it("t10: os descritores registrados são consistentes, e as rotas não colidem", () => {
    const rotas = new Set<string>();
    for (const r of RECURSOS_DO_MOLDE) {
      expect(verificarDefinicao(r), `descritor ${r.nome}`).toEqual([]);
      expect(rotas.has(r.rota), `rota repetida: ${r.rota}`).toBe(false);
      rotas.add(r.rota);
    }
    expect(RECURSOS_DO_MOLDE.length).toBeGreaterThanOrEqual(4);
  });
});

describe("o molde — a leitura da query string é fail-safe", () => {
  const d = RECURSOS_DO_MOLDE[0]!;

  it("t11: página inválida volta para a 1 — link velho não é ataque", () => {
    expect(lerConsulta(d, { pagina: "-3" }).pagina).toBe(1);
    expect(lerConsulta(d, { pagina: "abc" }).pagina).toBe(1);
    expect(lerConsulta(d, { pagina: "7" }).pagina).toBe(7);
  });

  it("t12: ordenar por coluna NÃO DECLARADA não vira ordenação nenhuma", () => {
    // ⚠️ É A FRONTEIRA QUE IMPEDE A QUERY STRING DE ESCOLHER COLUNA. Sem ela, `?ordem=` iria
    // direto para o `orderBy` do Prisma.
    expect(lerConsulta(d, { ordem: "coluna_que_nao_existe" }).ordem).toBeNull();
    expect(lerConsulta(d, { ordem: "identificador" }).ordem).toBe("identificador");
    // e uma coluna que existe mas NÃO é ordenável também não passa.
    expect(lerConsulta(d, { ordem: "partidaNome" }).ordem).toBeNull();
  });

  it("t13: filtro de seleção só aceita valor do rol declarado", () => {
    expect(lerConsulta(d, { papel: "CONCEDENTE" }).filtros["papel"]).toBe("CONCEDENTE");
    expect(lerConsulta(d, { papel: "QUALQUER_COISA" }).filtros["papel"]).toBe("");
  });

  it("t14: filtro de data só aceita AAAA-MM-DD", () => {
    expect(lerConsulta(d, { venceAte: "2026-06-30" }).filtros["venceAte"]).toBe("2026-06-30");
    expect(lerConsulta(d, { venceAte: "30/06/2026" }).filtros["venceAte"]).toBe("");
  });

  it("t15: a seleção tem TETO, e ele é explícito", () => {
    const muitos = Array.from({ length: MAXIMO_DE_SELECAO + 50 }, (_, i) => `id-${i}`);
    expect(lerConsulta(d, { sel: muitos }).selecionados).toHaveLength(MAXIMO_DE_SELECAO);
    // e ids repetidos contam uma vez só.
    expect(lerConsulta(d, { sel: ["a", "a", "b"] }).selecionados).toEqual(["a", "b"]);
  });

  it("t16: aba desconhecida cai em 'dados'", () => {
    expect(lerConsulta(d, { aba: "historico" }).aba).toBe("historico");
    expect(lerConsulta(d, { aba: "inventada" }).aba).toBe("dados");
  });
});

describe("o molde — a soma da seleção é em Decimal, no servidor", () => {
  const linhas = [
    { id: "a", valorRepasse: "1000.50", aLiberar: "500.25" },
    { id: "b", valorRepasse: "2000.25", aLiberar: "0.00" },
    { id: "c", valorRepasse: "9999.99", aLiberar: "9999.99" },
  ];

  it("t17: soma SÓ os marcados, e em Decimal", () => {
    // ⚠️ 1000.50 + 2000.25 = 3000.75. Em ponto flutuante isto é 3000.7499999999995 —
    // e é por isso que a soma não acontece no browser.
    const total = somarSelecionadas(linhas, ["a", "b"], ["valorRepasse", "aLiberar"]);
    expect(total["valorRepasse"]).toBe("3000.75");
    expect(total["aLiberar"]).toBe("500.25");
  });

  it("t18: seleção vazia soma zero — nunca o total da página", () => {
    // ⚠️ "NENHUM MARCADO" NÃO É "TODOS". Somar a página inteira quando nada está marcado
    // daria um número que ninguém pediu, com a mesma aparência do que foi pedido.
    expect(somarSelecionadas(linhas, [], ["valorRepasse"])["valorRepasse"]).toBe("0.00");
  });

  it("t19: id marcado que não está na página é ignorado", () => {
    expect(somarSelecionadas(linhas, ["a", "zzz"], ["valorRepasse"])["valorRepasse"]).toBe("1000.50");
  });
});
