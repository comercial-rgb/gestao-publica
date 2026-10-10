import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ABA_OUTRAS_AREAS, AREAS, MENU_DO_CONTADOR, abaDaRota, areaDaRota, menuVisivel, rotaDaArea, rotuloDaRota } from "../../lib/navegacao";

/**
 * O MENU DO CONTADOR (V31 §1). Ele só reorganiza — então o que se prova é que não MENTE:
 *   · todo item aponta para uma página que existe (nada de entrada morta);
 *   · todo item tem uma ÁREA, que é de onde vem a visibilidade — item sem área nunca apareceria;
 *   · o recorte por área esconde o que o servidor não liberou, e nada além disso;
 *   · nenhuma área do sistema ficou sem caminho no menu.
 */

const APP = fileURLToPath(new URL("../../app", import.meta.url));
const GRUPOS_DE_ROTA = ["(areas)", "(publico)", ""];

function temPagina(href: string): boolean {
  const caminho = href.split("?")[0] ?? href;
  return GRUPOS_DE_ROTA.some((g) => existsSync(join(APP, g, ...caminho.split("/").filter(Boolean), "page.tsx")));
}

const TODOS = [...MENU_DO_CONTADOR, ABA_OUTRAS_AREAS].flatMap((a) => a.grupos.flatMap((g) => g.itens.map((i) => ({ aba: a.id, ...i }))));

describe("o menu do contador", () => {
  it("m1: todo item aponta para uma página que existe", () => {
    const mortos = TODOS.filter((i) => !temPagina(i.href)).map((i) => `${i.aba}: ${i.href}`);
    expect(mortos).toEqual([]);
  });

  it("m2: todo item pertence a uma área — é ela que decide quem vê", () => {
    const semArea = TODOS.filter((i) => areaDaRota(i.href) === null).map((i) => i.href);
    expect(semArea).toEqual([]);
  });

  it("m3: o recorte esconde o item cuja área o servidor não liberou — e mostra o resto", () => {
    const soDespesa = menuVisivel(["despesa"]);
    const hrefs = soDespesa.flatMap((a) => a.grupos.flatMap((g) => g.itens.map((i) => i.href)));
    expect(hrefs).toContain("/despesa/empenhos");
    expect(hrefs.every((h) => areaDaRota(h)?.slug === "despesa")).toBe(true);
    // Negação com motivo: a ficha mora no planejamento; sem a área, ela some mesmo dentro da aba de despesa.
    expect(hrefs).not.toContain("/planejamento/fichas");
    // Abas sem nenhum item visível somem inteiras (sem cabeçalho vazio).
    expect(soDespesa.every((a) => a.grupos.length > 0)).toBe(true);
    expect(menuVisivel([])).toEqual([]);
  });

  it("m4: nenhuma área do sistema ficou sem caminho no menu", () => {
    const areasNoMenu = new Set(TODOS.map((i) => areaDaRota(i.href)?.slug));
    const orfas = AREAS.filter((a) => !areasNoMenu.has(a.slug)).map((a) => `${a.slug} (${rotaDaArea(a)})`);
    expect(orfas).toEqual([]);
  });

  it("m5: a aba aberta é a da rota atual, pelo prefixo mais longo", () => {
    expect(abaDaRota("/despesa/empenhos/cm1abc", MENU_DO_CONTADOR)).toBe("despesa");
    expect(abaDaRota("/financeiro/extraorcamentario/recolher", MENU_DO_CONTADOR)).toBe("extraorcamentario");
    expect(abaDaRota("/integracoes/sagres", MENU_DO_CONTADOR)).toBe("prestacao");
    expect(abaDaRota("/inexistente", MENU_DO_CONTADOR)).toBeNull();
  });

  // ⚠️ AS BORDAS SÃO DE LETRA UNICODE, não o `\b` do JavaScript: sem a flag `u`, o `\b` trata "â" como não-letra, e
  // "Multas de trânsito" casava com `\bTR\b` (V37, medido: a guarda acusava um rótulo limpo).
  const JARGAO = /(?<![\p{L}\p{N}_])(?:M\d{2}|V\d{1,2}|TR|molde|porta|guard)(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])ENT\d|cláusula/iu;

  it("m6: o texto do menu não expõe código de módulo nem jargão de engenharia", () => {
    const rotulos = [...MENU_DO_CONTADOR, ABA_OUTRAS_AREAS].flatMap((a) => [a.rotulo, ...a.grupos.flatMap((g) => [g.rotulo, ...g.itens.map((i) => i.rotulo)])]);
    const ruins = rotulos.filter((r) => JARGAO.test(r));
    expect(ruins).toEqual([]);
  });

  it("m6b: o instrumento acusa o jargão e deixa passar a palavra acentuada", () => {
    const acusa = ["Cobertura do TR 5.10", "Mapa da V36", "Painel do M05", "Lote ENT04", "Ver a cláusula", "Fronteira da porta", "o molde", "guard de período"];
    const passa = ["Multas de trânsito", "Transferências", "Portal da transparência", "Importação", "Trâmite da LDO", "Mês a mês"];
    expect(acusa.filter((r) => !JARGAO.test(r))).toEqual([]);
    expect(passa.filter((r) => JARGAO.test(r))).toEqual([]);
  });

  // V39 — a trilha da página mostrava "ordens-de-servico": a lista de licitações não entrava na tabela de rótulos.
  // Propriedade: toda página que o menu do contador abre tem nome na trilha, e não o trecho cru da rota.
  it("toda página do menu do contador tem rótulo na trilha", () => {
    const hrefs = MENU_DO_CONTADOR.flatMap((a) => a.grupos.flatMap((g) => g.itens.map((i) => i.href.split("?")[0] ?? i.href)));
    const semRotulo = hrefs.filter((h) => rotuloDaRota(h) === null);
    expect(semRotulo).toEqual([]);
  });
});
