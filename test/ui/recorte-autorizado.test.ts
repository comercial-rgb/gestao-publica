import { describe, expect, it } from "vitest";
import {
  EscopoDeLeituraError,
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
