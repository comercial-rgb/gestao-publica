import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RAIZES_DE_CODIGO, RAIZES_DE_DOMINIO, raizesExistentes } from "./raizes-dominio.js";

/**
 * O GUARDA DOS GUARDAS — para o próximo move não repetir o erro deste.
 *
 * ═══ O QUE ACONTECEU, E POR QUE UM TESTE PRECISA IMPEDIR QUE SE REPITA ═══
 * O M15/M18/M19 saíram de `modules/mNN/` para `adapters/tribunais/tce-pb/`. Dois grep-testes que
 * enumeravam `"modules"` à mão pararam de enxergar o código movido:
 *
 *   · `m16-censo.test.ts` — deixou de achar o `submeterCaptura`. Acusou-o como ação fantasma
 *     (t5b, visível) E fez t6/t6b PULAREM a checagem de autorização dele, em silêncio.
 *   · `m01-funil.test.ts` — deixou de varrer o gerador SAGRES. Um `lancamentoContabil.create()`
 *     escrito ali não seria acusado por ninguém, com o guard verde.
 *
 * O segundo é o modo de falha que este teste existe para matar: o guard não quebra, ele só para
 * de guardar. Ninguém revisita um teste verde.
 *
 * ⚠️ ESTE TESTE NÃO É SOBRE ESTILO. É sobre a única coisa que mantém os grep-testes honestos
 * depois de um move: a lista de onde procurar tem de ser ÚNICA, e tem de ser esta.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

/** Onde vive a lista canônica — o único arquivo autorizado a escrever as raízes literalmente. */
const O_CANONICO = "test/raizes-dominio.ts";

function varrer(dir: string, achados: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated" || e.name === ".git") continue;
      varrer(p, achados);
      continue;
    }
    if (e.name.endsWith(".ts")) achados.push(p);
  }
}

const relDe = (abs: string): string =>
  abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");

/** As linhas que NÃO são comentário — os testes se descrevem citando "modules" na prosa. */
function linhasEfetivas(conteudo: string): string[] {
  return conteudo.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l));
}

/**
 * ⚠️ A ASSINATURA DO BUG: uma raiz de domínio QUOTADA DENTRO DE UM ARRAY.
 *
 * É isso que `["modules", "packages", "prisma/seed", "test"]` era. Duas precisões importam:
 *
 *   · **Array, não qualquer aspa.** `join("modules", "m01-core-contabil", "razao.ts")` (o
 *     `O_FUNIL` do M01) é um caminho de ARQUIVO ÚNICO, não uma raiz de varredura — e ele falha
 *     ALTO se o M01 se mover (o arquivo deixa de casar e o próprio funil vira infrator). O que
 *     falha em SILÊNCIO é a lista de onde procurar. O colchete é o discriminador.
 *
 *   · **Qualquer posição, não só a primeira.** A primeira versão desta regra exigia a raiz como
 *     PRIMEIRO elemento (`["modules", ...]`) e deixava passar `["packages", "modules"]` — que é
 *     exatamente a forma do bug do `m01-funil`, onde "modules" vinha primeiro por acaso. Um
 *     guarda que depende da ordem em que alguém digitou o array não é guarda.
 */
const RAIZ_EM_ARRAY = /\[[^\]]*['"`](modules|adapters(\/tribunais)?)['"`][^\]]*\]/;

/** A mesma regra, para o array que foi quebrado em várias linhas pelo formatador. */
const RAIZ_EM_ARRAY_MULTILINHA = /\[[^\]]{0,300}['"`](modules|adapters(\/tribunais)?)['"`]/s;

describe("as raízes de domínio são uma lista SÓ (o guarda dos guardas)", () => {
  it("nenhum scanner enumera as raízes à mão — todos importam de test/raizes-dominio.ts", () => {
    const arquivos: string[] = [];
    for (const abs of raizesExistentes(RAIZ, [...RAIZES_DE_CODIGO])) varrer(abs, arquivos);
    expect(arquivos.length).toBeGreaterThan(50);

    const infratores: string[] = [];
    for (const abs of arquivos) {
      const rel = relDe(abs);
      if (rel === O_CANONICO) continue; // é ELE quem pode

      const conteudo = readFileSync(abs, "utf8");
      const efetivas = linhasEfetivas(conteudo);

      // Só interessa quem VARRE o disco — o resto pode citar "modules" à vontade.
      const varreDisco = efetivas.some((l) => /readdirSync|globSync|import\.meta\.glob/.test(l));
      if (!varreDisco) continue;

      let achouNaLinha = false;
      efetivas.forEach((linha, i) => {
        if (RAIZ_EM_ARRAY.test(linha)) {
          infratores.push(`${rel}:${i + 1}  ${linha.trim()}`);
          achouNaLinha = true;
        }
      });

      // O array quebrado em várias linhas pelo formatador não casa linha a linha — mas casa no
      // arquivo inteiro. Sem isto, bastaria `prettier` reformatar a lista para o guarda cegar.
      if (!achouNaLinha && RAIZ_EM_ARRAY_MULTILINHA.test(efetivas.join("\n"))) {
        infratores.push(`${rel}  (lista de raízes quebrada em várias linhas)`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ UM SCANNER VOLTOU A ENUMERAR AS RAÍZES DE DOMÍNIO NA MÃO.\n\n" +
        "Quem varre o disco para defender um invariante tem de importar as raízes de " +
        "`test/raizes-dominio.ts`. Uma lista literal aqui é uma bomba-relógio: ela fica CORRETA " +
        "até o dia em que um diretório de domínio nasce ou se move — e então o guard não quebra, " +
        "ele só PARA DE GUARDAR, em silêncio, com a suíte verde.\n\n" +
        "Foi exatamente assim que o censo (M16) deixou de verificar a autorização do " +
        "`submeterCaptura` e o funil (M01) deixou de varrer o gerador SAGRES quando os tribunais " +
        "viraram `adapters/`.\n\n" +
        "Troque por: `for (const abs of raizesExistentes(RAIZ)) varrer(abs, arquivos);`\n\n" +
        "Infratores:\n"
    ).toEqual([]);
  });

  it("as raízes declaradas EXISTEM — a lista não pode apontar para o vazio", () => {
    // ⚠️ Sem isto, um erro de digitação ("adapter" em vez de "adapters") desativaria todos os
    // guardas de uma vez, e nenhum deles reclamaria: eles varreriam um diretório a menos e
    // continuariam verdes. O canário precisa ser explícito.
    const achadas = raizesExistentes(RAIZ, [...RAIZES_DE_DOMINIO]);
    expect(
      achadas.map(relDe).sort(),
      `\n\n⚠️ Uma raiz de domínio declarada em RAIZES_DE_DOMINIO não existe no disco. ` +
        `Declaradas: ${RAIZES_DE_DOMINIO.join(", ")}\n`
    ).toEqual([...RAIZES_DE_DOMINIO].sort());
  });

  it("o domínio de tribunal está coberto — o caso concreto que quebrou", () => {
    const arquivos: string[] = [];
    for (const abs of raizesExistentes(RAIZ)) varrer(abs, arquivos);
    const rels = arquivos.map(relDe);

    // O serviço que sumiu do censo, e o gerador que sumiu do funil.
    expect(rels).toContain("adapters/tribunais/tce-pb/captura/servico.ts");
    expect(rels).toContain("adapters/tribunais/tce-pb/sagres/gerador.ts");
    // E o adapter novo, para o TCM-BA nascer já coberto.
    expect(rels).toContain("adapters/tribunais/tcm-ba/siga/writer.ts");
  });
});
