import { describe, expect, it } from "vitest";
import { buscar, indiceDaBusca } from "../lib/portas/busca-global.js";
import { normalizar } from "../lib/busca-global.js";
import { RECURSOS_DO_MOLDE } from "../lib/portas/recursos/definicoes.js";
import { AREAS } from "../lib/navegacao.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";

/**
 * ═══ A BUSCA NÃO É UM ATALHO PARA CONTORNAR A PERMISSÃO ═══
 *
 * ⚠️ UM CAMPO DE BUSCA É O LUGAR MAIS FÁCIL DE VAZAR NAVEGAÇÃO. A barra lateral é revista
 * quando alguém mexe nela; a busca devolve o que o índice tiver, e um índice completo
 * parece correto — ele "só lista telas". Mas listar a tela de Usuários para quem não
 * administra é a mesma mentira do menu, com aparência de atalho autorizado.
 *
 * ⚠️ E O ÍNDICE TEM DE ACOMPANHAR O MOLDE SOZINHO. O teste abaixo confronta o índice com
 * `RECURSOS_DO_MOLDE`: o cadastro entregue no próximo lote entra na busca sem que ninguém
 * precise lembrar — e se alguém trocar a derivação por uma lista digitada, este teste cai.
 */

const TUDO = { acoes: new Set<AcaoDoSistema>(), areas: new Set<string>() };

function comAcoes(...acoes: AcaoDoSistema[]): {
  acoes: ReadonlySet<AcaoDoSistema>;
  areas: ReadonlySet<string>;
} {
  return { acoes: new Set(acoes), areas: new Set<string>() };
}

describe("busca global", () => {
  it("o índice é DERIVADO: todo recurso do molde está nele", () => {
    const hrefs = new Set(indiceDaBusca().map((d) => d.href));
    const ausentes = RECURSOS_DO_MOLDE.filter((r) => !hrefs.has(r.rota)).map((r) => r.nome);
    expect(
      ausentes,
      "um cadastro do molde fora da busca é uma tela que o usuário não acha. O índice se " +
        "monta de RECURSOS_DO_MOLDE justamente para não depender de alguém lembrar."
    ).toEqual([]);
    // E as áreas também — a busca por nome de área é o caminho mais usado.
    const areasNoIndice = new Set(
      indiceDaBusca().filter((d) => d.contexto === "Área").map((d) => d.href)
    );
    expect(areasNoIndice.size).toBe(AREAS.length);
  });

  it("⚠️ SEM PERMISSÃO NENHUMA, A BUSCA NÃO DEVOLVE NADA — nem área, nem cadastro", () => {
    expect(buscar("convenio", TUDO)).toEqual([]);
    expect(buscar("usuario", TUDO)).toEqual([]);
    expect(buscar("despesa", TUDO)).toEqual([]);
  });

  it("⚠️ O CADASTRO SÓ APARECE PARA QUEM TEM A AÇÃO DELE — não basta ver a área", () => {
    // CADASTRAR_CONSORCIO e CADASTRAR_CONVENIO moram os dois em "transferências".
    const soConsorcio = {
      acoes: new Set<AcaoDoSistema>(["CADASTRAR_CONSORCIO"]),
      areas: new Set<string>(["transferencias"]),
    };
    const cadastros = buscar("con", soConsorcio, 30).filter((d) => d.contexto === "Cadastro");
    expect(cadastros.some((d) => normalizar(d.rotulo).includes("consorcio"))).toBe(true);
    expect(
      cadastros.some((d) => normalizar(d.rotulo).includes("convenio")),
      "quem pode lançar consórcio não pode CADASTRAR convênio — e a busca não pode " +
        "oferecer o cadastro só porque a área está visível."
    ).toBe(false);

    // ⚠️ E A LISTAGEM DE CONVÊNIOS **APARECE**, de propósito. Ela é destino de LEITURA, e
    // leitura ainda não é permissão neste sistema (dito no censo do M16, pendência antiga):
    // o servidor não a nega, e o usuário chega lá clicando em "Transferências". Escondê-la
    // aqui faria a busca ser mais restritiva que o servidor — que é o defeito espelhado, e
    // igualmente mentiroso. No dia em que leitura virar permissão, esta linha cai junto.
    const leituras = buscar("convenio", soConsorcio, 30).filter((d) => d.acao === null);
    expect(leituras.length).toBeGreaterThan(0);
  });

  it("o destino de LEITURA segue a visibilidade da área", () => {
    const semArea = comAcoes();
    expect(buscar("balanco", semArea)).toEqual([]);
    const comArea = { acoes: new Set<AcaoDoSistema>(), areas: new Set(["relatorios"]) };
    expect(buscar("balanco", comArea).length).toBeGreaterThan(0);
  });

  it("acha sem acento, e quem começa com o termo vem antes", () => {
    const comTudo = {
      acoes: new Set<AcaoDoSistema>(),
      areas: new Set(AREAS.map((a) => a.slug)),
    };
    // "orcamento" NÃO é subcadeia de "orcamentario" — o termo curto é o que o usuário digita.
    const achados = buscar("orcament", comTudo);
    expect(achados.length).toBeGreaterThan(0);
    // "Balanço Orçamentário" casa sem o acento e sem o fim da palavra.
    expect(achados.some((d) => normalizar(d.rotulo).includes("orcament"))).toBe(true);

    const res = buscar("restos", comTudo);
    if (res.length > 1) {
      expect(normalizar(res[0]?.rotulo ?? "").startsWith("restos")).toBe(true);
    }
  });

  it("termo de uma letra não busca — evita devolver o índice inteiro", () => {
    const comTudo = {
      acoes: new Set<AcaoDoSistema>(),
      areas: new Set(AREAS.map((a) => a.slug)),
    };
    expect(buscar("a", comTudo)).toEqual([]);
    expect(buscar("", comTudo)).toEqual([]);
  });
});
