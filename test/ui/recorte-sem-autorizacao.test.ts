import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * O RECORTE CRU TEM UM CHAMADOR SÓ — e este grep-teste é o que impede o segundo.
 *
 * ═══ ⚠️ POR QUE UM TESTE, E NÃO SÓ O RENOMEIO ═══
 * O pedido da ENT10 exigia tornar o defeito **inexprimível, não vigiado**. Renomear
 * `recorteDe` para `recorteNaoAutorizado` é metade: quem o digitar não o faz sem ler. Mas
 * nome é convenção, e convenção envelhece — daqui a seis meses alguém escreve uma tela
 * nova, o autocompletar oferece a função, e o furo volta em silêncio, numa tela que
 * ninguém vai reauditar.
 *
 * O que este arquivo afirma é a PROPRIEDADE: existe exatamente UM chamador, e ele é
 * nomeado aqui. Um segundo faz a suíte falhar dizendo o que usar no lugar.
 *
 * ═══ O DEFEITO QUE ELE GUARDA, MEDIDO ═══
 * `test/caracterizacao/leitura-por-unidade.test.ts` mediu que o parse cru entrega as DUAS
 * unidades a qualquer sessão quando `ug` é omitida, entrega a unidade alheia quando ela vem
 * na URL, e que a MESMA identidade recebe uma unidade de `listarUgsDoUsuario` e duas da
 * lista. Não é hipótese: é comportamento gravado em teste.
 *
 * ═══ ⚠️ O ÚNICO CHAMADOR É LEGÍTIMO, E A EXCEÇÃO É NOMEADA, NÃO SILENCIOSA ═══
 * A ordem cronológica (art. 141) é do ENTE, por fonte e categoria de contrato. Aquela tela
 * lê o recorte **para não usá-lo**: a nota ao pé declara que "o recorte do cabeçalho não se
 * aplica a esta tela", e para dizê-lo precisa do valor que o usuário escolheu. Recortá-la
 * por unidade a partiria em filas que a lei não criou, cada uma com uma "posição 1"
 * própria.
 *
 * ⚠️ SEM BANCO — este arquivo só varre o disco, e por isso roda na partição RÁPIDA, a cada
 * edição. Um guard que só roda no portão avisa tarde demais.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

/** As zonas onde uma tela ou rota pode nascer. */
const PASTAS = ["app", "components", "lib"];

/**
 * Quem pode chamar o parse cru — e cada linha aqui precisa do seu motivo escrito.
 *
 * ⚠️ ACRESCENTAR UM CAMINHO A ESTA LISTA É UMA DECISÃO, NÃO UM CONSERTO DE TESTE
 * VERMELHO. Se a sua tela precisa do recorte, ela quase certamente quer
 * `recorteDePagina` (unidade) ou `exercicioAutorizado` (ente). O caso desta lista é o
 * oposto: a tela lê o valor para DECLARAR que não o usa.
 */
const CHAMADORES_LEGITIMOS: readonly string[] = [
  // A ordem cronológica do art. 141: lê o recorte para imprimir, no pé, que ele NÃO se
  // aplica — a fila é do ente, por fonte e categoria.
  "app/(areas)/despesa/ordem-cronologica/page.tsx",
];

/** A definição e este próprio teste não são chamadores. */
const NAO_SAO_CHAMADORES: readonly string[] = [
  "lib/recorte.ts",
  "test/ui/recorte-sem-autorizacao.test.ts",
];

function varrer(dir: string, achados: string[]): void {
  let entradas;
  try {
    entradas = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // pasta ausente (build limpo) não é falha do teste
  }
  for (const e of entradas) {
    if (e.name === "node_modules" || e.name === ".next") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      varrer(p, achados);
      continue;
    }
    if (e.name.endsWith(".ts") || e.name.endsWith(".tsx")) achados.push(p);
  }
}

function rel(abs: string): string {
  return abs.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/");
}

/**
 * ⚠️ LINHA DE COMENTÁRIO NÃO É CHAMADA. Metade dos arquivos migrados desta frente cita o
 * nome antigo na prosa para explicar o que havia antes — e uma contagem que somasse esses
 * casos acusaria arquivos já corrigidos. Esta função já custou uma medição errada neste
 * lote: o grep de `recorteDe` devolveu 19 arquivos quando os reais eram 17.
 */
function chamaDeVerdade(conteudo: string): boolean {
  return conteudo
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
    .some((l) => /\brecorteNaoAutorizado\s*\(/.test(l));
}

describe("o recorte sem autorização — um chamador só", () => {
  const arquivos: string[] = [];
  for (const pasta of PASTAS) {
    const abs = join(RAIZ, pasta);
    try {
      if (statSync(abs).isDirectory()) varrer(abs, arquivos);
    } catch {
      /* pasta opcional */
    }
  }

  it("a varredura enxerga a UI — senão este guard estaria verde por não achar nada", () => {
    // ⚠️ A REDE DA REDE. Um scanner que perde a raiz fica verde para sempre, e verde por
    // ausência é o pior resultado que um guard pode dar. Já aconteceu neste repositório
    // quando o M15/M18/M19 saíram de `modules/` para `adapters/`.
    expect(arquivos.length).toBeGreaterThan(100);
  });

  it("nenhum arquivo NOVO chama o parse cru", () => {
    const permitidos = new Set([...CHAMADORES_LEGITIMOS, ...NAO_SAO_CHAMADORES]);
    const infratores = arquivos
      .map(rel)
      .filter((r) => !permitidos.has(r))
      .filter((r) => chamaDeVerdade(readFileSync(join(RAIZ, r), "utf8")));

    expect(
      infratores,
      "\n\n⚠️ ALGUÉM VOLTOU A LER O RECORTE SEM AUTORIZAÇÃO.\n\n" +
        "`recorteNaoAutorizado` aceita QUALQUER `?ug=` sem perguntar de quem é o crachá, e " +
        "a AUSÊNCIA do parâmetro produz o ENTE INTEIRO. Medido em " +
        "`test/caracterizacao/leitura-por-unidade.test.ts`.\n\n" +
        "Use no lugar:\n" +
        "  · `recorteDePagina(sp)` — telas e rotas com dimensão de UNIDADE (resolve " +
        "identidade e escopo no servidor, e RECUSA nomeando);\n" +
        "  · `exercicioAutorizado(sp)` — leituras do ENTE (recusa exercício ilegível, não " +
        "toca em unidade).\n\n" +
        "Se a sua tela LÊ o recorte para declarar que NÃO o usa (o caso do art. 141), " +
        "acrescente-a a `CHAMADORES_LEGITIMOS` com o motivo escrito.\n\nInfratores:\n"
    ).toEqual([]);
  });

  it("o chamador legítimo declarado EXISTE e chama mesmo — a lista não é decoração", () => {
    // ⚠️ SEM ISTO, A LISTA APODRECE EM SILÊNCIO. Um caminho que deixou de chamar (ou que
    // mudou de lugar) continuaria "permitido", e o guard passaria a autorizar um arquivo
    // que não existe — enquanto o de verdade entraria sem ser notado.
    for (const caminho of CHAMADORES_LEGITIMOS) {
      const conteudo = readFileSync(join(RAIZ, caminho), "utf8");
      expect(
        chamaDeVerdade(conteudo),
        `${caminho} está em CHAMADORES_LEGITIMOS e NÃO chama o parse cru — remova-o da lista`
      ).toBe(true);
    }
  });

  it("o nome ANTIGO não voltou — `recorteDe` era o nome que mentia por omissão", () => {
    // Ele lia-se como "a forma de ler o recorte", e era o que se alcançava por reflexo.
    const voltou = arquivos
      .map(rel)
      .filter((r) => !NAO_SAO_CHAMADORES.includes(r))
      .filter((r) =>
        readFileSync(join(RAIZ, r), "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
          .some((l) => /\brecorteDe\s*\(/.test(l))
      );

    expect(
      voltou,
      "\n\n⚠️ O NOME ANTIGO VOLTOU. `recorteDe` foi renomeado para " +
        "`recorteNaoAutorizado` porque o nome era o aviso que faltava.\n\nSítios:\n"
    ).toEqual([]);
  });
});
