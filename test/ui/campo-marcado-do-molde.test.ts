import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { campoMarcado, VALOR_DO_CAMPO_MARCADO } from "../../lib/molde/marcado.js";
import { RECURSOS_DO_MOLDE } from "../../lib/portas/recursos/definicoes.js";

/**
 * V37 — O CAMPO `booleano` DO MOLDE CHEGA MARCADO. Três portas liam a caixa com "on"/"true"/"1" enquanto o formulário
 * envia "sim": "Controla lote e validade", "Consumo imediato" e "Invalidez permanente" gravavam sempre "não" pela tela.
 * Achado pelo percurso das pendências finais (a troca do roteiro do almoxarifado também não chegava).
 *
 * A propriedade, não a lista: (1) o valor que o FORMULÁRIO envia é o que o leitor aceita; (2) NENHUMA porta compara um
 * campo `booleano` do molde por conta própria — todo campo assim, em qualquer descritor, passa pelo `campoMarcado`.
 */

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? arquivos(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

describe("o campo marcado do molde", () => {
  it("t1: o valor que o formulário envia para a caixa marcada é o que o leitor aceita; desmarcada, nada chega", () => {
    const fonte = readFileSync(join(RAIZ, "components/molde/FormularioDeRecurso.tsx"), "utf8");
    const caso = fonte.slice(fonte.indexOf('case "booleano":'), fonte.indexOf("case ", fonte.indexOf('case "booleano":') + 10));
    const enviado = /value="([^"]+)"/.exec(caso)?.[1];
    expect(enviado).toBe(VALOR_DO_CAMPO_MARCADO);
    expect([campoMarcado(enviado), campoMarcado(""), campoMarcado(undefined), campoMarcado("nao")]).toEqual([true, false, false, false]);
  });

  it("t2: nenhuma porta lê um campo booleano do molde com comparação própria (todos os descritores)", () => {
    const nomes = new Set<string>();
    for (const r of RECURSOS_DO_MOLDE) {
      for (const c of [...r.campos, ...r.acoes.flatMap((a) => a.campos ?? [])]) if (c.tipo === "booleano") nomes.add(c.nome);
    }
    // Sem campo booleano, a guarda passaria por vacuidade.
    expect(nomes.size).toBeGreaterThanOrEqual(8);
    const fontes = [...arquivos(join(RAIZ, "lib/portas")), ...arquivos(join(RAIZ, "app"))].filter((p) => !p.endsWith(".test.ts"));
    const achados: string[] = [];
    for (const p of fontes) {
      const s = readFileSync(p, "utf8");
      for (const nome of nomes) {
        const comparacao = new RegExp(`(\\(\\s*\\w+\\s*,\\s*"${nome}"\\s*\\)|\\["${nome}"\\])\\s*===`);
        if (comparacao.test(s)) achados.push(`${p.slice(RAIZ.length)}: ${nome}`);
      }
    }
    expect(achados, "leia o campo com campoMarcado (lib/molde/marcado.ts)").toEqual([]);
  });
});
