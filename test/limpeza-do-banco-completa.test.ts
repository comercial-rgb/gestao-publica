import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { TABELAS } from "./limpar-banco.js";

/**
 * ═══ A LIMPEZA DO BANCO DE TESTE ALCANÇA TODA TABELA? ATÉ AQUI, NINGUÉM CONFERIA (V11 V8.9) ═══
 *
 * `limpar-banco.ts` diz, em comentário, que "a lista tem de ser COMPLETA: uma tabela esquecida faz
 * o processo 1/2026 de um teste sobreviver ao seguinte". Estava certo, e era só um comentário.
 *
 * ⚠️ E O DEFEITO ACONTECEU NESTE MESMO LOTE. As duas tabelas da V8.9 nasceram fora da lista, e o
 * sintoma NÃO foi "a lista está incompleta": foram SETE testes vermelhos do arquivo do eixo, com
 * mensagens que apontavam para o domínio ("Republicar a mesma decisão não é um fato novo") — a
 * política publicada no primeiro teste sobrevivendo até o último.
 *
 * ═══ ⚠️ O QUE ESTE GUARD AFIRMA NÃO É "A LISTA CONTÉM TODA TABELA" ═══
 * Seria uma afirmação ERRADA, e medi-la assim daria 56 acusações falsas. `TRUNCATE ... CASCADE`
 * alcança, além da tabela listada, TODA tabela que a referencia por chave estrangeira — de
 * `ItemDoLote` a `MovimentoDoBordero`, a maior parte do schema é filha de alguém listado e é
 * limpa sem estar na lista.
 *
 * O que importa é a PROPRIEDADE: **toda tabela do schema é alcançada pela limpeza**, seja porque
 * está na lista, seja porque o CASCADE chega nela. É o fecho transitivo das arestas de FK a
 * partir da lista, e é isso que este arquivo calcula — do banco REAL, não de um desenho.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * ⚠️ A ÚNICA EXCEÇÃO, E ELA É NOMEADA. `_prisma_migrations` é o registro de quais migrations já
 * rodaram; truncá-la faria o `migrate deploy` seguinte tentar reaplicar tudo desde o começo. Uma
 * lista de exceções que cresce sem motivo é como um guard morre — esta tem uma linha e um porquê.
 */
const FORA_DA_LIMPEZA = new Set(["_prisma_migrations"]);

async function tabelasDoBanco(): Promise<readonly string[]> {
  const linhas = await prisma.$queryRawUnsafe<{ readonly table_name: string }[]>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return linhas.map((l) => l.table_name).filter((t) => !FORA_DA_LIMPEZA.has(t));
}

/** As arestas filha -> mãe, lidas do catálogo do Postgres. */
async function arestasDeFk(): Promise<readonly { readonly filha: string; readonly mae: string }[]> {
  return prisma.$queryRawUnsafe<{ readonly filha: string; readonly mae: string }[]>(
    `SELECT c.conrelid::regclass::text AS filha, c.confrelid::regclass::text AS mae
       FROM pg_constraint c
       JOIN pg_class f ON f.oid = c.conrelid
       JOIN pg_namespace n ON n.oid = f.relnamespace
      WHERE c.contype = 'f' AND n.nspname = 'public'`
  );
}

const semAspas = (t: string): string => t.replaceAll('"', "");

describe("a limpeza do banco de teste alcança TODAS as tabelas", () => {
  it("t1 — toda tabela do schema é truncada: pela lista ou pelo CASCADE de quem a referencia", async () => {
    const noBanco = await tabelasDoBanco();
    const arestas = (await arestasDeFk()).map((a) => ({ filha: semAspas(a.filha), mae: semAspas(a.mae) }));

    // Fecho transitivo: quem é truncado arrasta quem o referencia.
    const alcancadas = new Set<string>(TABELAS);
    let cresceu = true;
    while (cresceu) {
      cresceu = false;
      for (const a of arestas) {
        if (alcancadas.has(a.mae) && !alcancadas.has(a.filha)) {
          alcancadas.add(a.filha);
          cresceu = true;
        }
      }
    }

    // ⚠️ AS DUAS DIREÇÕES, e elas acusam coisas diferentes. `foraDoAlcance` é estado vazando de um
    // teste para o outro. `naListaSemExistir` é uma tabela removida do schema e esquecida aqui — e
    // o `TRUNCATE` dela derrubaria a limpeza INTEIRA com "relation does not exist", levando junto
    // todo arquivo que chama `limparBanco`.
    const foraDoAlcance = noBanco.filter((t) => !alcancadas.has(t));
    const naListaSemExistir = [...new Set(TABELAS)].filter((t) => !noBanco.includes(t));

    expect({ foraDoAlcance, naListaSemExistir }).toEqual({ foraDoAlcance: [], naListaSemExistir: [] });
  });

  it("t2 — e a lista não tem repetição (o TRUNCATE listaria a mesma tabela duas vezes)", () => {
    const vistas = new Set<string>();
    const repetidas = TABELAS.filter((t) => (vistas.has(t) ? true : (vistas.add(t), false)));
    expect(repetidas).toEqual([]);
  });
});
