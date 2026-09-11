import { describe, expect, it } from "vitest";
import { z } from "zod";
import { toMoney } from "../../packages/contracts/index.js";
import {
  diaCivil,
  FUSO_DO_ENTE,
  inicioDoDiaCivil,
} from "../../packages/datas/index.js";
import { posicaoDeEstoque } from "./estoque-fisico-dominio.js";

/**
 * ═══ ⚠️ CARACTERIZAÇÃO — A DATA QUE ENTRA PELO FORMULÁRIO É GUARDADA UM DIA ANTES ═══
 *
 * ⚠️ ESTE ARQUIVO DESCREVE UM DEFEITO QUE EXISTE, e as asserções abaixo passam porque o
 * comportamento é ESTE. Elas não aprovam o comportamento: elas o prendem, para que a
 * correção tenha contra o que ser medida. É o mesmo regime da competência e do
 * repontamento de conta — caracterizar primeiro, corrigir depois.
 *
 * ═══ O QUE FOI MEDIDO, E ONDE ═══
 *
 * Os três módulos do ENT05 (`estoque-fisico.ts`, `gestao-do-bem.ts`, `compras.ts`) recebem
 * data por `z.coerce.date()` — 25 ocorrências somadas. `z.coerce.date("2026-09-11")` produz
 * `2026-09-11T00:00:00.000Z`: meia-noite **UTC**. No fuso do ente (America/Sao_Paulo,
 * UTC-3) esse instante é **10/09 às 21:00**, e portanto `diaCivil` dele devolve `2026-09-10`.
 *
 * O operador digita 11, o sistema guarda um instante cujo dia civil é 10.
 *
 * ═══ ⚠️ POR QUE ISSO NÃO É SÓ APRESENTAÇÃO ═══
 *
 * `posicaoDeEstoque(movimentos, ateDia)` corta por `compararPorDiaCivil`. Um movimento
 * digitado como 11 entra na posição pedida "até 10" — a posição de ontem inclui um
 * movimento de hoje. A ficha de controle (5.18.16) tem o mesmo corte, e o inventário
 * compara a contagem contra a posição na data de abertura.
 *
 * ═══ ⚠️ POR QUE O GUARD DE DATA CIVIL NÃO PEGOU ═══
 *
 * `test/data-civil.test.ts` vigia TRÊS FORMAS no código-fonte: `getUTC*`, fatiar ISO e
 * `Date.UTC(`. `z.coerce.date()` não é nenhuma das três — ele é uma quarta porta para o
 * mesmo eixo errado, e entrou por ela. O guard não estava frouxo; ele estava vigiando as
 * portas que a medição anterior conhecia.
 *
 * ═══ COMO O RESTO DO REPOSITÓRIO FAZ ═══
 *
 * O M28 (convênios) recebe `zDia` — a string `YYYY-MM-DD` — e converte com
 * `inicioDoDiaCivil`, que ancora na meia-noite CIVIL DO ENTE. O último teste abaixo mostra
 * as duas convenções lado a lado.
 *
 * PENDÊNCIA NOMEADA: `EIXO-DE-DATA-NA-ENTRADA-DO-ENT05`.
 */

const ENTRADA_DO_FORMULARIO = "2026-09-11";

describe("o eixo da data que entra pelo formulário", () => {
  it("caracteriza: `z.coerce.date` ancora em meia-noite UTC, não do ente", () => {
    const guardado = z.coerce.date().parse(ENTRADA_DO_FORMULARIO);

    expect(guardado.toISOString()).toBe("2026-09-11T00:00:00.000Z");
    // ⚠️ E É AQUI QUE O DIA SE PERDE.
    expect(diaCivil(guardado, FUSO_DO_ENTE)).toBe("2026-09-10");
  });

  it("caracteriza: o movimento digitado como 11 entra na posição pedida até 10", () => {
    const movimento = {
      tipo: "ENTRADA" as const,
      quantidade: toMoney("10"),
      valorTotal: toMoney("100.00"),
      dataMovimento: z.coerce.date().parse(ENTRADA_DO_FORMULARIO),
    };

    // A pergunta é "quanto havia no dia 10". A resposta correta seria ZERO: a entrada foi
    // no dia 11. O comportamento atual conta os 10.
    const em10 = posicaoDeEstoque([movimento], "2026-09-10");
    expect(em10.quantidade.toFixed(0)).toBe("10");

    // E a pergunta "quanto havia no dia 09" responde zero, como deveria — o erro é de UM
    // dia, sempre para trás, e não um deslocamento aleatório.
    const em09 = posicaoDeEstoque([movimento], "2026-09-09");
    expect(em09.quantidade.toFixed(0)).toBe("0");
  });

  it("a convenção do resto do repositório não tem o defeito", () => {
    // O M28 recebe a string e ancora com `inicioDoDiaCivil` — meia-noite DO ENTE.
    const comoOM28Guarda = inicioDoDiaCivil(ENTRADA_DO_FORMULARIO);

    expect(comoOM28Guarda.toISOString()).toBe("2026-09-11T03:00:00.000Z");
    expect(diaCivil(comoOM28Guarda, FUSO_DO_ENTE)).toBe("2026-09-11");

    const movimento = {
      tipo: "ENTRADA" as const,
      quantidade: toMoney("10"),
      valorTotal: toMoney("100.00"),
      dataMovimento: comoOM28Guarda,
    };
    // Com a âncora certa, a posição até o dia 10 responde ZERO, que é o correto.
    expect(posicaoDeEstoque([movimento], "2026-09-10").quantidade.toFixed(0)).toBe("0");
    expect(posicaoDeEstoque([movimento], "2026-09-11").quantidade.toFixed(0)).toBe("10");
  });

  it("o defeito é do EIXO e não do horário de verão nem de uma data de borda", () => {
    // Qualquer dia do ano, o mesmo um dia a menos — porque o fuso do ente é UTC-3 o ano
    // inteiro desde 2019. Uma amostra em quatro estações prende isso.
    for (const dia of ["2026-01-15", "2026-04-15", "2026-07-15", "2026-10-15"]) {
      const guardado = z.coerce.date().parse(dia);
      const civil = diaCivil(guardado, FUSO_DO_ENTE);
      const esperadoUmDiaAntes = diaCivil(
        new Date(Date.parse(`${dia}T00:00:00.000Z`) - 1),
        FUSO_DO_ENTE
      );
      expect(civil, `${dia} deveria virar o dia anterior`).toBe(esperadoUmDiaAntes);
    }
  });
});
