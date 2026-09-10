import "dotenv/config";
import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { travarASuite } from "./trava-da-suite.js";

/**
 * A TRAVA DA SUÍTE, testada de dentro da própria suíte — e é isso que a torna
 * auto-verificável.
 *
 * ═══ ⚠️ O TRINCO JÁ ESTÁ TOMADO QUANDO ESTE ARQUIVO RODA ═══
 * Quem o tomou foi o `global-setup`, antes do primeiro teste. Então "pedir o trinco daqui"
 * é EXATAMENTE a situação que se quer provar: um segundo processo chegando enquanto o
 * primeiro trabalha.
 *
 * O teste é honesto por construção — ele não simula a concorrência, ele É a concorrência.
 * Se alguém remover a trava do `global-setup`, `travarASuite` aqui vai SUCEDER, e o t1
 * falha. É a única forma de o guarda acusar a própria remoção.
 */
describe("a trava da suíte — um processo por banco de teste", () => {
  const url = process.env["DATABASE_URL"];

  it("t1: um segundo processo é RECUSADO, e a mensagem diz quem tem o trinco", async () => {
    expect(url, "o setup.ts aponta DATABASE_URL para o banco de teste").toBeDefined();

    let erro: unknown = null;
    try {
      const segunda = await travarASuite(url as string);
      // ⚠️ SE CHEGOU AQUI, A TRAVA NÃO ESTÁ NO `global-setup`. Libera antes de falhar —
      // deixar o trinco preso faria ESTE teste quebrar todas as execuções seguintes, e o
      // motivo seria bem mais difícil de achar do que o defeito original.
      await segunda.liberar();
    } catch (e) {
      erro = e;
    }

    expect(
      erro,
      "\n\n⚠️ A TRAVA DA SUÍTE NÃO ESTÁ ATIVA.\n\n" +
        "`travarASuite` conseguiu o trinco a partir de dentro da suíte — o que significa " +
        "que o `global-setup` não o tomou. Sem ela, duas execuções do Vitest contra o " +
        "mesmo banco voltam a se destruir em silêncio: a limpeza de uma apaga a semente " +
        "da outra, e as falhas aparecem em módulos que ninguém tocou.\n\n" +
        "Isso já custou 13 falsas falhas e 107 minutos, em 09/09/2026.\n"
    ).not.toBeNull();

    const mensagem = erro instanceof Error ? erro.message : String(erro);
    expect(mensagem).toContain("JÁ HÁ UMA SUÍTE RODANDO CONTRA ESTE BANCO");

    // ⚠️ A MENSAGEM TEM DE NOMEAR O OUTRO PROCESSO. "Alguém está rodando" não ajuda a
    // decidir o que fazer; um pid e um `application_name` ajudam — é por eles que se acha
    // a janela esquecida.
    expect(mensagem).toMatch(/o processo \d+ \("suite-vitest pid=\d+"\)/);

    // E ela tem de dizer QUAL banco, porque a saída legítima é apontar a segunda execução
    // para outro em DATABASE_URL_TEST.
    expect(mensagem).toContain("DATABASE_URL_TEST");
  });

  /**
   * ⚠️ O TRINCO MORRE COM A CONEXÃO, e é por isso que ele não precisa de limpeza manual.
   *
   * Um arquivo de trinco em `/tmp` sobreviveria a um `kill -9` e deixaria a suíte
   * bloqueada até alguém apagá-lo à mão — o guarda viraria o problema. Este teste prova a
   * propriedade que torna isso impossível: fechada a sessão, o Postgres solta.
   */
  it("t2: o trinco morre com a conexão — nenhum kill deixa a suíte bloqueada", async () => {
    const CHAVE = 728_113_356; // vizinha da real, para não disputar com o global-setup.

    const primeira = new Client({ connectionString: url as string });
    await primeira.connect();
    const tomou = await primeira.query<{ ok: boolean }>(
      "SELECT pg_try_advisory_lock($1) AS ok",
      [CHAVE]
    );
    expect(tomou.rows[0]?.ok).toBe(true);

    const segunda = new Client({ connectionString: url as string });
    await segunda.connect();
    try {
      const negada = await segunda.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS ok",
        [CHAVE]
      );
      expect(negada.rows[0]?.ok, "com a primeira sessão viva, a segunda é negada").toBe(
        false
      );

      // Encerra a primeira SEM soltar o trinco — é o que um `kill -9` faz.
      await primeira.end();

      const agora = await segunda.query<{ ok: boolean }>(
        "SELECT pg_try_advisory_lock($1) AS ok",
        [CHAVE]
      );
      expect(agora.rows[0]?.ok, "morta a sessão, o trinco é liberado pelo banco").toBe(
        true
      );
      await segunda.query("SELECT pg_advisory_unlock($1)", [CHAVE]);
    } finally {
      await segunda.end();
    }
  });
});
