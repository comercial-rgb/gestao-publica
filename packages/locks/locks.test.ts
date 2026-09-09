import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { raizesExistentes } from "../../test/raizes-dominio.js";
import { ORDEM_DOS_LOCKS, type RecursoTravavel } from "./index.js";

/**
 * O TRINCO PESSIMISTA — as três coisas que ele precisa que ALGUÉM verifique.
 *
 * ═══ POR QUE UM GREP, E NÃO SÓ TESTE DE COMPORTAMENTO ═══
 * `m05-concorrencia.test.ts` prova que duas transações concorrentes não estouram o saldo
 * da ficha. Ele prova isso do caminho que ELE exercita. O que nenhum teste de
 * comportamento alcança é a frase que resume a natureza desta primitiva:
 *
 *     **lock só protege quem o toma.**
 *
 * Um caminho de escrita novo — uma rota, um worker, um importador — que some o razão e
 * grave sem passar por `travar()` não quebra teste nenhum. Ele simplesmente não é
 * protegido, e a corrida aparece sob carga, em produção. É o mesmo formato do
 * grep-teste do funil do M01 e do censo do M16, e pela mesma razão: o compilador só
 * enxerga o que alguém declarou.
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));

function varrer(dir: string, achados: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "generated" || e.name === ".git") continue;
      varrer(p, achados);
      continue;
    }
    if (!e.name.endsWith(".ts") || e.name.endsWith(".test.ts")) continue;
    achados.push(p);
  }
}

function arquivosDoDominio(): readonly { readonly rel: string; readonly fonte: string }[] {
  const abs: string[] = [];
  for (const r of raizesExistentes(RAIZ)) varrer(r, abs);
  return abs.map((a) => ({
    rel: a.slice(RAIZ.length).replace(/^[\\/]/, "").replace(/\\/g, "/"),
    fonte: readFileSync(a, "utf8"),
  }));
}

describe("trinco pessimista — a chave, a fila e quem a toma", () => {
  /**
   * ⚠️ O POSTO É O ESPAÇO DE NOMES DO TRINCO, e é por isso que ele precisa ser único.
   *
   * A chave é `pg_advisory_xact_lock(posto, hashtext(id))` — dois inteiros. O primeiro
   * separa os recursos; o segundo, as linhas. Se dois recursos compartilhassem o posto,
   * a ficha `abc` e a liquidação `abc` passariam a disputar o MESMO trinco: não é erro de
   * correção (serializar demais nunca corrompe), mas é perda de vazão silenciosa — e,
   * pior, é a porta para alguém "consertar" removendo o lock errado.
   *
   * O posto também é a FILA de aquisição. Dois recursos no mesmo posto tornam a regra de
   * inversão cega entre eles: `travar(A)` depois de `travar(B)` passaria, e o deadlock que
   * `ORDEM_DOS_LOCKS` existe para impedir voltaria a ser possível.
   */
  it("cada recurso tem um posto PRÓPRIO — posto repetido funde dois espaços de nomes", () => {
    const postos = Object.values(ORDEM_DOS_LOCKS);
    const repetidos = postos.filter((p, i) => postos.indexOf(p) !== i);
    expect(
      [...new Set(repetidos)],
      "\n\n⚠️ DOIS RECURSOS COMPARTILHANDO O MESMO POSTO.\n\n" +
        "O posto é o espaço de nomes do trinco E a posição na fila de aquisição. " +
        "Repetido, ele faz dois recursos disputarem o mesmo lock (perda de vazão) e " +
        "cega a checagem de inversão entre eles (deadlock de volta).\n\n" +
        "Dê um posto novo ao recurso novo, decidindo ONDE ele entra na fila.\n\nPostos repetidos:\n"
    ).toEqual([]);
  });

  it("os postos são uma sequência sem buracos — a fila é uma lista, não um sorteio", () => {
    // Um buraco não quebra nada hoje. Ele é sintoma: alguém removeu um recurso sem
    // renumerar, e o próximo a acrescentar vai escolher um número "livre" no meio da
    // fila sem perceber que está decidindo ordem de aquisição.
    const postos = Object.values(ORDEM_DOS_LOCKS).sort((a, b) => a - b);
    expect(postos).toEqual(postos.map((_, i) => i + 1));
  });

  it("todo recurso da fila é REALMENTE travado por alguém — fila sem uso apodrece", () => {
    const arquivos = arquivosDoDominio();
    const orfaos: string[] = [];

    for (const recurso of Object.keys(ORDEM_DOS_LOCKS) as RecursoTravavel[]) {
      const usado = arquivos.some(
        (a) =>
          !a.rel.startsWith("packages/locks/") &&
          new RegExp(`travar\\s*\\(\\s*\\w+\\s*,\\s*"${recurso}"`).test(a.fonte)
      );
      // A ficha é travada pelo atalho `travarFichas`, não pelo `travar` direto.
      const porAtalho =
        recurso === "FichaOrcamentaria" &&
        arquivos.some((a) => /travarFichas\s*\(/.test(a.fonte));
      if (!usado && !porAtalho) orfaos.push(recurso);
    }

    expect(
      orfaos,
      "\n\n⚠️ RECURSO NA FILA DE LOCKS QUE NINGUÉM TRAVA.\n\n" +
        "Ou o caminho que deveria travá-lo esqueceu — e a corrida está aberta —, ou o " +
        "recurso deixou de existir e a fila ficou com uma posição fantasma que empurra " +
        "as outras. Nos dois casos, quem lê `ORDEM_DOS_LOCKS` acredita numa proteção " +
        "que não está lá.\n\nÓrfãos:\n"
    ).toEqual([]);
  });

  /**
   * ⚠️ NINGUÉM TRAVA POR FORA.
   *
   * Um `pg_advisory_xact_lock` escrito à mão em outro arquivo escapa de DUAS coisas: da
   * checagem de inversão (que é o que impede deadlock) e do espaço de nomes por posto
   * (que é o que impede recursos diferentes de disputarem o mesmo trinco). Ele parece
   * proteger, e protege — contra a metade dos casos, e contra a metade errada.
   *
   * O mesmo vale para `FOR UPDATE`/`FOR SHARE`: além de furarem a fila, eles exigem
   * privilégio de UPDATE, que o papel de runtime não tem. Um `FOR UPDATE` novo passaria
   * no ambiente do desenvolvedor (dono do banco) e quebraria sob o papel restrito.
   */
  it("todo lock de banco mora em packages/locks — nada de trinco avulso", () => {
    const infratores: string[] = [];

    for (const { rel, fonte } of arquivosDoDominio()) {
      if (rel.startsWith("packages/locks/")) continue;
      const semComentario = fonte
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/[^\n]*/gm, "$1");

      for (const [padrao, oQue] of [
        [/pg_advisory[_a-z]*lock/i, "pg_advisory lock fora do pacote"],
        [/\bFOR\s+UPDATE\b/i, "SELECT ... FOR UPDATE"],
        [/\bFOR\s+(SHARE|KEY\s+SHARE)\b/i, "SELECT ... FOR SHARE"],
      ] as const) {
        if (padrao.test(semComentario)) infratores.push(`${rel} → ${oQue}`);
      }
    }

    expect(
      infratores,
      "\n\n⚠️ TRINCO DE BANCO FORA DE `packages/locks`.\n\n" +
        "Um lock avulso escapa da checagem de inversão (que impede deadlock) e do " +
        "espaço de nomes por posto (que impede recursos diferentes de disputarem o " +
        "mesmo trinco). E `FOR UPDATE`/`FOR SHARE` exigem privilégio de UPDATE, que o " +
        "papel de runtime NÃO tem: passaria na máquina de quem escreveu (dono do banco) " +
        "e quebraria sob o papel restrito.\n\n" +
        "Use `travar(tx, <Recurso>, ids)`.\n\nOcorrências:\n"
    ).toEqual([]);
  });
});
