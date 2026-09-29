import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BENS_PATRIMONIAIS, CLASSES_DE_BENS } from "../../lib/portas/recursos/acervo";
import { PARAMETROS_DE_ATUALIZACAO } from "../../lib/portas/recursos/parametros";
import { ROTEIROS_DE_RESULTADO, ROTEIROS_PATRIMONIAIS } from "../../lib/portas/recursos/roteiros";
import type { DefinicaoDeRecurso } from "../../lib/molde/tipos";

/**
 * DESCRITOR × DESPACHANTE — toda ação declarada num descritor tem um `case` (ou `acao === `)
 * no despachante da porta que a atende.
 *
 * ⚠️ O DEFEITO QUE ISTO VIGIA JÁ ACONTECEU: o `case "gerar-etiqueta"` do acervo sumiu no
 * commit bb47320 (ENT12) — o comentário que o explicava ficou, o código não — e a ação passou
 * a cair no `default` ("não existe neste cadastro") por dois lotes, até o percurso do pacote 2
 * acusar. O molde renderiza o botão pelo descritor; o servidor recusa pelo despachante; entre
 * os dois não havia ninguém.
 *
 * Instrumento nasce com a prova de que acusa: t2 mostra que um despachante sem o `case`
 * é apontado, nomeando a ação.
 */

// Portável: `.pathname` dá "/C:/..." com acento em %XX no Windows; fileURLToPath dá o caminho do sistema.
const RAIZ = fileURLToPath(new URL("../../", import.meta.url));

interface Par {
  readonly definicao: DefinicaoDeRecurso;
  readonly despachante: string;
}

const PARES: readonly Par[] = [
  { definicao: BENS_PATRIMONIAIS, despachante: "lib/portas/recursos/acervo-dados.ts" },
  { definicao: CLASSES_DE_BENS, despachante: "lib/portas/recursos/acervo-dados.ts" },
  { definicao: ROTEIROS_PATRIMONIAIS, despachante: "lib/portas/recursos/roteiros-dados.ts" },
  { definicao: ROTEIROS_DE_RESULTADO, despachante: "lib/portas/recursos/roteiros-dados.ts" },
  { definicao: PARAMETROS_DE_ATUALIZACAO, despachante: "lib/portas/recursos/parametros-dados.ts" },
];

/** As ações do descritor que o fonte do despachante NÃO cita como literal. */
export function acoesSemCase(definicao: DefinicaoDeRecurso, fonte: string): readonly string[] {
  return definicao.acoes
    .map((a) => a.nome)
    .filter((nome) => !new RegExp(`(case\\s+"${nome}"\\s*:|acao\\s*===\\s*"${nome}")`).test(fonte));
}

describe("descritor × despachante — toda ação declarada é despachada", () => {
  it("t1: nenhuma ação dos descritores do patrimônio cai no `default` do despachante", () => {
    const faltando: string[] = [];
    for (const par of PARES) {
      const fonte = readFileSync(`${RAIZ}${par.despachante}`, "utf8");
      for (const nome of acoesSemCase(par.definicao, fonte)) {
        faltando.push(`${par.definicao.nome}: ação "${nome}" sem case em ${par.despachante}`);
      }
    }
    expect(
      faltando,
      "\n\n⚠️ AÇÃO DECLARADA SEM DESPACHO. O botão aparece (o molde o monta pelo descritor) e o " +
        "servidor responde \"não existe neste cadastro\". Acrescente o `case` no despachante — ou " +
        "retire a ação do descritor.\n\n"
    ).toEqual([]);
  });

  it("t2: o instrumento acusa — um despachante sem o case da ação é apontado pelo nome", () => {
    const fonteSemEtiqueta = readFileSync(`${RAIZ}lib/portas/recursos/acervo-dados.ts`, "utf8").replace('case "gerar-etiqueta":', 'case "gerar-etiqueta-x":');
    expect(acoesSemCase(BENS_PATRIMONIAIS, fonteSemEtiqueta)).toEqual(["gerar-etiqueta"]);
    // ...e a forma `acao === "x"` também conta como despacho.
    expect(acoesSemCase(ROTEIROS_PATRIMONIAIS, 'if (acao === "propor") {} if (acao === "publicar") {} if (acao === "reparametrizar") {}')).toEqual([]);
  });
});
