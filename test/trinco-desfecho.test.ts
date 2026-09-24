import { describe, expect, it } from "vitest";
import { divergenciasComCodigoZero } from "../scripts/trinco-de-maquina.js";

/**
 * ═══ A GUARDA DA DIVERGÊNCIA — E A CONTRAPROVA, QUE É A METADE QUE FALTA NA MAIORIA ═══
 *
 * ⚠️ POR QUE ESTA GUARDA EXISTE. Em 23/09/2026 seis corridas foram lidas como "código 0"
 * enquanto o trabalho dentro delas falhava. O `trinco-de-maquina.ts` **não tinha culpa** — ele
 * propagava certo, e foi ele que denunciou o SIGABRT do OOM e o SIGTERM. Quem mentia era o
 * wrapper de quem chamou: `npx vitest run ...` seguido de `echo "### exit=$?"` como ÚLTIMA
 * instrução. O `echo` tem sucesso, e o script saía 0 de verdade.
 *
 * ⚠️ E POR QUE A CONTRAPROVA É OBRIGATÓRIA. "Propriedade, não padrão": uma guarda que enumera
 * formas de falha casa com texto que apenas PARECE falha — e guarda que grita à toa é desligada
 * em três semanas, o que a torna pior que guarda nenhuma (porque enquanto viveu, deu conforto).
 *
 * A propriedade que qualifica um sinal aqui é estreita: **ele não pode aparecer numa corrida que
 * terminou em 0 de verdade.** Os testes de negação abaixo (t5–t9) são a prova de que ela foi
 * respeitada, e valem tanto quanto os de acusação.
 *
 * ═══ ⚠️ SE VOCÊ VIER MUTAR A GUARDA PARA CONFERIR QUE ELA ACUSA, LEIA ISTO ═══
 *
 * **Em arquivo NÃO COMMITADO, mutação se reverte por EDIÇÃO — nunca por `git checkout --`.**
 *
 * Custou o trabalho uma vez, em 23/09/2026: o `git checkout` de `scripts/trinco-de-maquina.ts`
 * não reverteu a mutação, reverteu **tudo** — a guarda inteira, a lição do cabeçalho, o rodapé e
 * a saída —, porque não havia commit a que voltar. O gesto tinha funcionado nas três mutações da
 * J7 só porque aqueles arquivos já estavam commitados; a diferença passou despercebida.
 *
 * Mute editando, reverta editando, e confira com `git status` **e** com um `grep` do que você
 * acrescentou — o `git status` de um arquivo novo diz `??` nos dois casos.
 */

describe("a guarda da divergência — acusa o zero que o conteúdo contradiz", () => {
  it("t1: wrapper que imprime código de falha e sai 0 é acusado", () => {
    const bruto = [
      " Test Files  1 passed (1)",
      "### exit-vitest=1",
    ].join("\n");
    const d = divergenciasComCodigoZero(bruto);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatch(/wrapper imprimiu codigo de falha e saiu 0/);
  });

  it("t2: o sumário do vitest acusando falha é divergência", () => {
    const bruto = ["      Tests  1 failed | 27 passed (28)"].join("\n");
    expect(divergenciasComCodigoZero(bruto)).toHaveLength(1);
  });

  it("t2b: `Test Files N failed` também", () => {
    expect(divergenciasComCodigoZero(" Test Files  1 failed | 3 passed (4)")).toHaveLength(1);
  });

  it("t3: o aborto do V8 por memória é divergência", () => {
    const bruto = "FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory";
    expect(divergenciasComCodigoZero(bruto)).toHaveLength(1);
  });

  it("t4: cor ANSI não esconde a divergência", () => {
    // ⚠️ O vitest colore o sumário. Uma guarda que casasse só com o texto cru passaria batido
    // no terminal real e acusaria só no arquivo — e é o terminal que a pessoa olha primeiro.
    const bruto = "[31m      Tests  2 failed[39m | 25 passed (27)";
    expect(divergenciasComCodigoZero(bruto)).toHaveLength(1);
  });
});

describe("⚠️ A CONTRAPROVA — o que apenas PARECE falha não pode ser acusado", () => {
  it("t5: `### exit-...=0` é sucesso declarado, e NÃO é divergência", () => {
    // O caso mais comum de todos: o wrapper bem escrito, que imprime o código E sai com ele.
    expect(divergenciasComCodigoZero("### exit-vitest=0")).toEqual([]);
  });

  it("t6: NOME DE TESTE contendo 'failed' não é acusado — só o SUMÁRIO é", () => {
    /**
     * ⚠️ ESTE É O CASO QUE MATA GUARDAS INGÊNUAS. Um `grep failed` acusaria as três linhas
     * abaixo, todas de uma corrida perfeitamente verde. O que salva é a âncora: o sumário do
     * vitest começa a linha com `Tests` ou `Test Files` seguido de um número.
     */
    const bruto = [
      "     ✓ t7: a guia com conta failed antes da declaração continua não atribuída 3ms",
      "     ✓ retorna o motivo quando o lote failed na validação 1ms",
      "       expect(resultado.failed).toBe(0)",
      " Test Files  2 passed (2)",
      "      Tests  28 passed (28)",
    ].join("\n");
    expect(divergenciasComCodigoZero(bruto)).toEqual([]);
  });

  it("t7: `error TS` e `FAIL` em saída LEGÍTIMA não são acusados", () => {
    /**
     * ⚠️ E ESTE É O MOTIVO DE `error TS` E `FAIL ` TEREM FICADO DE FORA DA LISTA.
     *
     * Este repositório tem grep-testes que falam SOBRE erros de tipo e sobre falhas — eles
     * imprimem essas cadeias no caminho feliz. E um `tsc` com erro já sai 2, então o sinal não
     * acrescentaria nada quando o código é 0. Incluí-las trocaria um defeito raro por ruído
     * frequente, e ruído frequente é como uma guarda morre.
     */
    const bruto = [
      "     ✓ o guard recusa e a mensagem cita error TS2345 como exemplo 2ms",
      "     ✓ FAIL é o prefixo que o relatório usa quando reprova 1ms",
      "stdout | a fixture imprime: error TS2339: Property 'x' does not exist",
      "      Tests  15 passed (15)",
    ].join("\n");
    expect(divergenciasComCodigoZero(bruto)).toEqual([]);
  });

  it("t8: corrida verde e silenciosa não é acusada", () => {
    expect(divergenciasComCodigoZero("")).toEqual([]);
    expect(divergenciasComCodigoZero("tudo certo por aqui\n")).toEqual([]);
  });

  it("t9: a palavra 'failed' dentro de um caminho de arquivo não é acusada", () => {
    const bruto = " ✓ modules/m04-receita/failed-fixtures/carga.test.ts (3 tests) 12ms";
    expect(divergenciasComCodigoZero(bruto)).toEqual([]);
  });
});
