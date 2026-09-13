import { describe, expect, it } from "vitest";
import {
  EscopoDeLeituraError,
  exercicioAutorizado,
  EXERCICIO_PADRAO,
  ExercicioIlegivelError,
  recorteAutorizado,
  type EscopoDeLeitura,
} from "../../lib/recorte.js";

/**
 * O RECORTE AUTORIZADO — a decisão pura, provada sem banco e sem request.
 *
 * ⚠️ ISTO É O GUARD, e o CLAUDE.md põe guard no regime de PROFUNDIDADE por nome. O
 * comportamento que ele substitui está medido em
 * `test/caracterizacao/leitura-por-unidade.test.ts`: hoje a porta entrega DUAS unidades a
 * qualquer sessão quando `ug` é omitida, entrega a unidade alheia quando ela vem na URL, e
 * a MESMA identidade recebe uma unidade de `listarUgsDoUsuario` e duas da lista.
 *
 * ═══ ⚠️ CADA NEGAÇÃO AFIRMA O MOTIVO, NÃO SÓ O LANÇAMENTO ═══
 * "Não completou" é compatível com o servidor entregando o dado a qualquer um. Um
 * `expect(...).toThrow()` seco passaria se a função estourasse por um `undefined` em
 * qualquer linha — inclusive por um defeito que não tem nada a ver com autorização. Por
 * isso cada recusa confere a CLASSE e o TRECHO da mensagem que diz o que fazer em seguida.
 *
 * ═══ ⚠️ FIXTURE N=2 NO ESCOPO ═══
 * O escopo de teste tem DUAS unidades onde a pertinência precisa distinguir. Com uma
 * unidade só, "aceitou a unidade certa" é verdade por vacuidade: aceitou a única que
 * existe, e um `includes` que sempre devolvesse `true` passaria igual.
 *
 * ⚠️ SEM BANCO, DE PROPÓSITO — e é isso que põe este arquivo na partição RÁPIDA, rodando a
 * cada edição. A decisão é pura: o escopo chega por parâmetro, e quem o busca é a porta. A
 * fronteira (`test/ui/fronteira-ui.test.ts`) exige isso de `lib/` fora de `lib/portas/`.
 */

const SAUDE = "01004";
const EDUCACAO = "01003";
const OBRAS = "01007";

/** Quem só tem crachá da Saúde. */
const SO_SAUDE: EscopoDeLeitura = { unidades: [SAUDE], podeConsolidado: false };

/**
 * Quem tem DUAS unidades e NÃO tem consolidado. É o escopo que obriga a distinguir — e o
 * que hoje não é exprimível no tipo do recorte (ver `CONSOLIDADO-PARCIAL-NAO-EXPRIMIVEL`).
 */
const DUAS_SEM_CONSOLIDADO: EscopoDeLeitura = {
  unidades: [SAUDE, EDUCACAO],
  podeConsolidado: false,
};

/**
 * O usuário GLOBAL. `listarUgsDoUsuario` devolve TODAS as unidades quando a permissão é
 * global — por isso ele atravessa a MESMA conferência de pertinência, sem ramo especial.
 */
const GLOBAL: EscopoDeLeitura = {
  unidades: [EDUCACAO, SAUDE, OBRAS],
  podeConsolidado: true,
};

/** Existe, está ativo, e o perfil não concede leitura em unidade nenhuma. */
const SEM_ESCOPO: EscopoDeLeitura = { unidades: [], podeConsolidado: false };

const QUEM = "servidor.saude";

function pedir(
  pedido: Record<string, string | string[] | undefined>,
  escopo: EscopoDeLeitura
): ReturnType<typeof recorteAutorizado> {
  return recorteAutorizado({ pedido, escopo, identificador: QUEM });
}

describe("o recorte autorizado — o exercício", () => {
  it("exercício AUSENTE cai no padrão, e isso não é defeito", () => {
    // ⚠️ O PRIMEIRO RENDER ACONTECE ANTES DE A ILHA DO CABEÇALHO SINCRONIZAR A URL.
    // Recusar a ausência quebraria toda navegação por link sem parâmetro.
    const r = pedir({}, SO_SAUDE);
    expect(r.exercicio).toBe(EXERCICIO_PADRAO);
  });

  it("exercício PRESENTE e legível é respeitado", () => {
    expect(pedir({ exercicio: "2025" }, SO_SAUDE).exercicio).toBe(2025);
  });

  it("exercício ILEGÍVEL recusa nomeando o valor — não vira o padrão em silêncio", () => {
    expect(() => pedir({ exercicio: "abc" }, SO_SAUDE)).toThrow(ExercicioIlegivelError);
    expect(() => pedir({ exercicio: "abc" }, SO_SAUDE)).toThrow(/"abc"/);
    // A mensagem diz o que fazer em seguida.
    expect(() => pedir({ exercicio: "abc" }, SO_SAUDE)).toThrow(/seletor de exercício/);
  });

  /**
   * ⚠️ A ARMADILHA DO `parseInt`, e ela é o motivo de a conferência ser sobre a STRING.
   * `Number.parseInt("2026abc", 10)` devolve **2026** — um teste que só conferisse
   * `Number.isInteger(n)` aceitaria ano com sujeira colada e ficaria verde.
   */
  it("exercício com sujeira colada recusa — o parse sozinho aceitaria", () => {
    expect(Number.parseInt("2026abc", 10)).toBe(2026); // a armadilha, medida aqui
    expect(() => pedir({ exercicio: "2026abc" }, SO_SAUDE)).toThrow(ExercicioIlegivelError);
    expect(() => pedir({ exercicio: "2026'; DROP" }, SO_SAUDE)).toThrow(
      ExercicioIlegivelError
    );
  });

  it("exercício que não tem quatro dígitos recusa", () => {
    expect(() => pedir({ exercicio: "202" }, SO_SAUDE)).toThrow(ExercicioIlegivelError);
    expect(() => pedir({ exercicio: "20266" }, SO_SAUDE)).toThrow(ExercicioIlegivelError);
    expect(() => pedir({ exercicio: "-2026" }, SO_SAUDE)).toThrow(ExercicioIlegivelError);
  });

  it("exercício VAZIO é ausência, não ilegibilidade", () => {
    expect(pedir({ exercicio: "" }, SO_SAUDE).exercicio).toBe(EXERCICIO_PADRAO);
  });
});

/**
 * ⚠️ AS LEITURAS DO **ENTE** — e a razão de elas terem função própria.
 *
 * Receita, extraorçamentário, conciliação, patrimônio, plano de contas e programação
 * financeira não passam `unidadeCodigo` a porta nenhuma: a dimensão não existe no modelo
 * delas. Elas precisam da recusa do EXERCÍCIO e **não** da recusa de unidade — impor esta
 * segunda faria a tela recusar um `?ug=` que ela própria ignora, quebrando link salvo sem
 * proteger dado algum.
 */
describe("o exercício autorizado — a metade que as leituras do ENTE usam", () => {
  it("ausente cai no padrão; presente e legível é respeitado", () => {
    expect(exercicioAutorizado({})).toBe(EXERCICIO_PADRAO);
    expect(exercicioAutorizado({ exercicio: "" })).toBe(EXERCICIO_PADRAO);
    expect(exercicioAutorizado({ exercicio: "2025" })).toBe(2025);
  });

  it("recusa o ilegível com a MESMA classe de erro, nomeando o valor", () => {
    expect(() => exercicioAutorizado({ exercicio: "abc" })).toThrow(ExercicioIlegivelError);
    expect(() => exercicioAutorizado({ exercicio: "abc" })).toThrow(/"abc"/);
    expect(() => exercicioAutorizado({ exercicio: "2026abc" })).toThrow(
      ExercicioIlegivelError
    );
    expect(() => exercicioAutorizado({ exercicio: "202" })).toThrow(ExercicioIlegivelError);
  });

  /**
   * ⚠️ ESTA É A ASSERÇÃO QUE JUSTIFICA A FUNÇÃO EXISTIR. Se ela também conferisse unidade,
   * eu teria feito das leituras do ente uma cópia disfarçada da outra decisão — e o
   * conserto teria o custo que eu disse estar evitando.
   */
  it("NÃO confere unidade — um `?ug=` alheio atravessa sem recusa", () => {
    expect(exercicioAutorizado({ exercicio: "2026", ug: EDUCACAO })).toBe(2026);
    expect(exercicioAutorizado({ ug: "99999" })).toBe(EXERCICIO_PADRAO);
  });

  it("as duas funções concordam sobre o exercício — um parse, não dois", () => {
    // ⚠️ O RISCO REAL DE TER DUAS ENTRADAS É DIVERGIREM. `recorteAutorizado` chama esta
    // função em vez de repetir o parse; esta asserção é o que prova que continua assim.
    for (const bruto of ["2024", "2026", "1999"]) {
      expect(pedir({ exercicio: bruto, ug: SAUDE }, SO_SAUDE).exercicio).toBe(
        exercicioAutorizado({ exercicio: bruto })
      );
    }
    for (const ruim of ["abc", "2026abc", "202", "-2026"]) {
      expect(() => pedir({ exercicio: ruim, ug: SAUDE }, SO_SAUDE)).toThrow(
        ExercicioIlegivelError
      );
      expect(() => exercicioAutorizado({ exercicio: ruim })).toThrow(ExercicioIlegivelError);
    }
  });
});

describe("o recorte autorizado — a unidade pedida na URL", () => {
  it("unidade DENTRO do escopo é aceita", () => {
    const r = pedir({ exercicio: "2026", ug: SAUDE }, SO_SAUDE);
    expect(r).toEqual({ exercicio: 2026, unidadeCodigo: SAUDE });
  });

  /**
   * ⚠️ O FURO QUE ESTE LOTE FECHA, no ponto exato. A caracterização mediu que hoje a porta
   * entrega a unidade alheia; aqui ela é recusada, e a recusa NOMEIA o escopo que ele tem.
   */
  it("unidade FORA do escopo recusa, e a mensagem nomeia o escopo que ele TEM", () => {
    expect(() => pedir({ ug: EDUCACAO }, SO_SAUDE)).toThrow(EscopoDeLeituraError);
    expect(() => pedir({ ug: EDUCACAO }, SO_SAUDE)).toThrow(
      new RegExp(`unidade ${EDUCACAO} não está no escopo`)
    );
    // Diz ONDE ele tem — a distinção que a escrita já faz entre "a ação" e "o escopo".
    expect(() => pedir({ ug: EDUCACAO }, SO_SAUDE)).toThrow(new RegExp(`só em: ${SAUDE}`));
    // E diz quem resolve, porque a providência é de outra pessoa.
    expect(() => pedir({ ug: EDUCACAO }, SO_SAUDE)).toThrow(/estendendo o escopo/);
  });

  it("a recusa NÃO diz 'não encontrado' — mentiria sobre a existência da unidade", () => {
    let mensagem = "";
    try {
      pedir({ ug: EDUCACAO }, SO_SAUDE);
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    // ⚠️ ESTAS DUAS LINHAS NASCERAM DA PROVA POR MUTAÇÃO — E SEM ELAS O TESTE NÃO ACUSAVA
    // NADA. Com a guarda de pertinência removida, `pedir` deixou de estourar, `mensagem`
    // ficou VAZIA, e `expect("").not.toMatch(...)` PASSA: o teste ficava verde justamente
    // no cenário que existe para vigiar — o guard ausente. Duas negações sem afirmar que a
    // recusa ACONTECEU não são um teste, são duas tautologias.
    expect(mensagem, "não houve recusa — não há texto de recusa a conferir").not.toBe("");
    expect(mensagem).toContain(SAUDE); // e ela nomeia o escopo que ele TEM

    expect(mensagem).not.toMatch(/não encontrad/i);
    expect(mensagem).not.toMatch(/não existe/i);
  });

  it("quem não tem escopo nenhum recebe a recusa do CRACHÁ, não a do endereço", () => {
    // ⚠️ AS DUAS CAUSAS PEDEM PROVIDÊNCIAS DIFERENTES, e confundi-las faz o servidor pedir
    // a coisa errada ao administrador.
    expect(() => pedir({ ug: SAUDE }, SEM_ESCOPO)).toThrow(/não é o endereço: é o crachá/i);
    expect(() => pedir({ ug: SAUDE }, SEM_ESCOPO)).toThrow(/concedendo acesso/);
  });

  /**
   * ⚠️ N=2 É O PONTO AQUI. O escopo global tem três unidades; o de uma tem uma. Se a
   * pertinência fosse um `true` constante, o primeiro caso passaria e o segundo também —
   * é a confrontação das duas que prova que a conferência acontece.
   */
  it("o usuário GLOBAL passa pela MESMA conferência, sem ramo especial", () => {
    expect(pedir({ ug: EDUCACAO }, GLOBAL).unidadeCodigo).toBe(EDUCACAO);
    expect(pedir({ ug: OBRAS }, GLOBAL).unidadeCodigo).toBe(OBRAS);
    // E o de uma unidade NÃO alcança as mesmas duas.
    expect(() => pedir({ ug: EDUCACAO }, SO_SAUDE)).toThrow(EscopoDeLeituraError);
    expect(() => pedir({ ug: OBRAS }, SO_SAUDE)).toThrow(EscopoDeLeituraError);
  });

  it("uma unidade que não existe em lugar nenhum recusa igual — pelo escopo", () => {
    // Não é papel deste guard saber o que existe na base: ele sabe o que ELE pode ler.
    expect(() => pedir({ ug: "99999" }, GLOBAL)).toThrow(EscopoDeLeituraError);
  });

  it("`ug` repetida na URL vale a PRIMEIRA — a mesma regra do parse de hoje", () => {
    expect(pedir({ ug: [SAUDE, EDUCACAO] }, GLOBAL).unidadeCodigo).toBe(SAUDE);
    // E se a primeira for alheia, recusa — não "salva" pela segunda.
    expect(() => pedir({ ug: [EDUCACAO, SAUDE] }, SO_SAUDE)).toThrow(EscopoDeLeituraError);
  });

  it("`ug` em branco é ausência, não pedido", () => {
    expect(pedir({ ug: "" }, SO_SAUDE).unidadeCodigo).toBe(SAUDE);
    expect(pedir({ ug: "   " }, SO_SAUDE).unidadeCodigo).toBe(SAUDE);
  });
});

describe("o recorte autorizado — a unidade OMITIDA", () => {
  /**
   * ⚠️ ESTE ERA O CAMINHO MAIS LARGO DO DEFEITO. Omitir `ug` entregava o ente inteiro a
   * qualquer sessão, e nenhuma tela de leitura chamava autorização para reclamar.
   */
  it("quem PODE consolidar recebe o consolidado, como hoje", () => {
    const r = pedir({ exercicio: "2026" }, GLOBAL);
    expect(r).toEqual({ exercicio: 2026, unidadeCodigo: undefined });
  });

  it("quem NÃO pode consolidar e tem UMA unidade cai no escopo dele — nunca no ente", () => {
    // ⚠️ E ISSO É ANTI-REGRESSÃO, não conveniência: o primeiro render acontece antes de a
    // ilha pôr `ug` na URL. Recusar aqui faria toda tela piscar uma recusa antes de abrir.
    const r = pedir({ exercicio: "2026" }, SO_SAUDE);
    expect(r).toEqual({ exercicio: 2026, unidadeCodigo: SAUDE });
    expect(r.unidadeCodigo).not.toBeUndefined(); // consolidado seria `undefined`
  });

  /**
   * ⚠️ A LIMITAÇÃO DECLARADA. `RecorteDaPagina` carrega UMA unidade, e o `where` das
   * consultas é um código único: o consolidado PARCIAL (só as unidades dele) não é
   * exprimível hoje. Escolher uma por ele seria arbitrário; devolver o ente seria o defeito
   * de volta. Então recusa, nomeando as dele.
   */
  it("quem tem DUAS unidades e não pode consolidar recebe pedido de ESCOLHA", () => {
    expect(() => pedir({}, DUAS_SEM_CONSOLIDADO)).toThrow(EscopoDeLeituraError);
    expect(() => pedir({}, DUAS_SEM_CONSOLIDADO)).toThrow(/ESCOLHA A UNIDADE/);
    // Nomeia as duas, ordenadas — senão o usuário não sabe entre o que escolher.
    expect(() => pedir({}, DUAS_SEM_CONSOLIDADO)).toThrow(
      new RegExp(`${EDUCACAO}, ${SAUDE}`)
    );
  });

  it("quem não tem unidade nenhuma recusa dizendo que não há o que consultar", () => {
    expect(() => pedir({}, SEM_ESCOPO)).toThrow(EscopoDeLeituraError);
    expect(() => pedir({}, SEM_ESCOPO)).toThrow(/não há o que consultar/i);
    // Inclui a hipótese do cadastro revogado — `listarUgsDoUsuario` devolve vazio para
    // usuário inativo, e a mensagem tem de cobrir esse caso sem mentir sobre o outro.
    expect(() => pedir({}, SEM_ESCOPO)).toThrow(/revogado/);
  });

  it("NUNCA consolidado por omissão para quem não pode consolidar", () => {
    // A propriedade, afirmada de uma vez: nenhum escopo sem `podeConsolidado` produz
    // `unidadeCodigo: undefined` quando `ug` é omitida.
    for (const escopo of [SO_SAUDE, DUAS_SEM_CONSOLIDADO, SEM_ESCOPO]) {
      let consolidou = false;
      try {
        consolidou = pedir({}, escopo).unidadeCodigo === undefined;
      } catch {
        consolidou = false; // recusou: é o comportamento aceitável
      }
      expect(consolidou, `escopo ${JSON.stringify(escopo)} consolidou por omissão`).toBe(
        false
      );
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// ORQUESTRAÇÃO V3 (4.1) — as três decisões novas, puras: ENTE, ALGUM ESCOPO e REGISTRO.
//
// ⚠️ O ESCOPO AQUI É O DA AÇÃO DE LEITURA COBRADA, não a união das ações do usuário. É a
// porta (`lib/portas/leitura.ts`) que o resolve por ação; estas decisões só o consomem.
// Fixture N=2 nas unidades, como acima: com uma unidade só, "aceitou a certa" é vacuidade.
// ═══════════════════════════════════════════════════════════════════════════════════

import {
  exigirAlgumEscopo,
  exigirEscopoDoEnte,
  exigirEscopoDoRegistro,
} from "../../lib/recorte.js";

const ACAO = "CONSULTAR_DESPESA";

/** Identidade revogada — a porta devolve `identidadeAtiva: false` e escopo vazio. */
const REVOGADO: EscopoDeLeitura = { unidades: [], podeConsolidado: false, identidadeAtiva: false };

describe("leitura do ENTE — só a concessão GLOBAL da ação cobrada autoriza", () => {
  it("global passa", () => {
    expect(() => exigirEscopoDoEnte({ escopo: GLOBAL, identificador: QUEM, acao: ACAO })).not.toThrow();
  });

  it("uma unidade só é recusada NOMEANDO o escopo que ele tem e a ação — não é 'não encontrado'", () => {
    expect(() => exigirEscopoDoEnte({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO })).toThrow(
      EscopoDeLeituraError
    );
    expect(() => exigirEscopoDoEnte({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO })).toThrow(
      /do ENTE inteiro.*só em: 01004.*concessão GLOBAL de CONSULTAR_DESPESA/s
    );
  });

  it("duas unidades sem consolidado também recusam — soma parcial não vira consolidado", () => {
    expect(() =>
      exigirEscopoDoEnte({ escopo: DUAS_SEM_CONSOLIDADO, identificador: QUEM, acao: ACAO })
    ).toThrow(/visão PARCIAL/);
  });

  it("sem escopo nenhum recusa dizendo que é o crachá, e nomeia a ação a conceder", () => {
    expect(() => exigirEscopoDoEnte({ escopo: SEM_ESCOPO, identificador: QUEM, acao: ACAO })).toThrow(
      /não tem a ação CONSULTAR_DESPESA em escopo nenhum.*é o crachá/s
    );
  });

  it("identidade revogada recusa pelo motivo da revogação, antes de olhar o escopo", () => {
    expect(() => exigirEscopoDoEnte({ escopo: REVOGADO, identificador: QUEM, acao: ACAO })).toThrow(
      /REVOGADO/
    );
  });
});

describe("leitura em ALGUM escopo — a ação em qualquer unidade abre a área", () => {
  it("uma unidade basta; global basta", () => {
    expect(() => exigirAlgumEscopo({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO })).not.toThrow();
    expect(() => exigirAlgumEscopo({ escopo: GLOBAL, identificador: QUEM, acao: ACAO })).not.toThrow();
  });

  it("sem escopo nenhum recusa nomeando a ação; revogado recusa pela revogação", () => {
    expect(() => exigirAlgumEscopo({ escopo: SEM_ESCOPO, identificador: QUEM, acao: ACAO })).toThrow(
      /CONSULTAR_DESPESA em escopo nenhum/
    );
    expect(() => exigirAlgumEscopo({ escopo: REVOGADO, identificador: QUEM, acao: ACAO })).toThrow(
      /REVOGADO/
    );
  });
});

describe("leitura de um REGISTRO — o escopo sai do registro, e a recusa não o revela", () => {
  it("registro da unidade dele passa; registro da outra recusa (N=2)", () => {
    expect(() =>
      exigirEscopoDoRegistro({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO, unidadeCodigo: SAUDE })
    ).not.toThrow();
    expect(() =>
      exigirEscopoDoRegistro({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO, unidadeCodigo: EDUCACAO })
    ).toThrow(EscopoDeLeituraError);
  });

  it("a recusa NOMEIA o escopo que ele TEM e NÃO nomeia a unidade do registro", () => {
    let mensagem = "";
    try {
      exigirEscopoDoRegistro({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO, unidadeCodigo: EDUCACAO });
    } catch (e) {
      mensagem = e instanceof Error ? e.message : String(e);
    }
    // ⚠️ AFIRMA QUE A RECUSA ACONTECEU antes de negar o que ela não diz: duas negações
    // sem afirmação são duas tautologias (a lição das cinco asserções vazias da ENT10).
    expect(mensagem).toMatch(/fora do escopo de leitura.*só em: 01004/s);
    expect(mensagem).not.toContain(EDUCACAO);
    expect(mensagem).not.toMatch(/não encontrado/i);
  });

  it("global lê qualquer registro; registro SEM unidade cai na regra do ente", () => {
    expect(() =>
      exigirEscopoDoRegistro({ escopo: GLOBAL, identificador: QUEM, acao: ACAO, unidadeCodigo: OBRAS })
    ).not.toThrow();
    expect(() =>
      exigirEscopoDoRegistro({ escopo: SO_SAUDE, identificador: QUEM, acao: ACAO, unidadeCodigo: undefined })
    ).toThrow(/do ENTE inteiro/);
    expect(() =>
      exigirEscopoDoRegistro({ escopo: GLOBAL, identificador: QUEM, acao: ACAO, unidadeCodigo: undefined })
    ).not.toThrow();
  });

  it("sem escopo nenhum recusa dizendo que é o crachá", () => {
    expect(() =>
      exigirEscopoDoRegistro({ escopo: SEM_ESCOPO, identificador: QUEM, acao: ACAO, unidadeCodigo: SAUDE })
    ).toThrow(/em unidade nenhuma.*é o crachá/s);
  });
});

describe("o recorte nomeia a ação cobrada — e a identidade revogada recusa antes do recorte", () => {
  it("a recusa de `?ug=` alheia termina nomeando a ação", () => {
    expect(() =>
      recorteAutorizado({ pedido: { ug: EDUCACAO }, escopo: SO_SAUDE, identificador: QUEM, acao: ACAO })
    ).toThrow(/A ação de leitura cobrada é CONSULTAR_DESPESA\./);
  });

  it("revogado recusa mesmo pedindo a própria unidade", () => {
    expect(() =>
      recorteAutorizado({ pedido: { ug: SAUDE }, escopo: REVOGADO, identificador: QUEM, acao: ACAO })
    ).toThrow(/REVOGADO/);
  });
});
