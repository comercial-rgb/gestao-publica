import { describe, expect, it } from "vitest";
import {
  anoCivil,
  competenciaCivil,
  compararPorDiaCivil,
  diaCivil,
  diferencaEmDiasCivis,
  diaCivilBr,
  fimDoDiaCivil,
  FUSO_DO_ENTE,
  inicioDoDiaCivil,
  instanteCivil,
  janelaCivilDeMeses,
  janelaCivilDoAno,
  janelaCivilDoMes,
  normalizarMes,
  mesmoDiaCivil,
} from "./index.js";

/**
 * ⚠️ ESTE ARQUIVO EXISTE PORQUE UM DIA DECIDE SE A CONCILIAÇÃO FECHA.
 *
 * Os casos abaixo não são exercícios de fuso: são os instantes exatos em que o
 * repositório errava. Cada um deles vinha de um defeito real, e nenhum deles seria pego
 * por um teste de "meio-dia", que é a hora em que quase toda fixture do repositório vive.
 */

describe("data civil do ente", () => {
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. A VIRADA DO DIA — os dois lados da meia-noite
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ O CASO DO OFX, LITERALMENTE. `20260131235900[-3:BRT]` é `2026-02-01T02:59:00Z`.
   * Em UTC é fevereiro; no extrato do tesoureiro é 31 de janeiro.
   */
  it("t1: 31/01 às 23:59 locais é 01/02 em UTC — e o dia civil é 31/01", () => {
    const instante = new Date("2026-02-01T02:59:00Z");
    expect(instante.toISOString().slice(0, 10)).toBe("2026-02-01"); // UTC
    expect(diaCivil(instante)).toBe("2026-01-31"); // civil
    expect(competenciaCivil(instante)).toBe("2026-01");
    expect(diaCivilBr(instante)).toBe("31/01/2026");
  });

  /**
   * ⚠️ O OUTRO LADO, e ele é o que quebrava o travamento: meia-noite UTC de 1º de janeiro
   * ainda é 31 de dezembro do ANO ANTERIOR no ente. Um fato assim, lido pelo ano UTC,
   * seria atribuído a um exercício que não é o dele.
   */
  it("t2: 01/01 às 00:00 UTC é 31/12 do ano anterior no ente", () => {
    const instante = new Date("2026-01-01T00:00:00Z");
    expect(instante.getUTCFullYear()).toBe(2026);
    expect(diaCivil(instante)).toBe("2025-12-31");
    expect(anoCivil(instante)).toBe(2025);
  });

  it("t3: meio-dia UTC cai no mesmo dia civil — é por isso que as fixtures não acusavam", () => {
    const instante = new Date("2026-03-10T12:00:00Z");
    expect(diaCivil(instante)).toBe("2026-03-10");
    expect(anoCivil(instante)).toBe(2026);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. A JANELA DO MÊS — o defeito do travamento de competência
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ O DEFEITO QUE ESTA FUNÇÃO CURA, com os números.
   *
   * A janela de `2026-12` montada com `Date.UTC` ia de `2026-12-01T00:00Z` a
   * `2026-12-31T23:59:59.999Z` — em horário civil, de **30/11 às 21:00** a **31/12 às
   * 20:59:59**. As duas pontas erradas:
   *
   *   · o lançamento de 31/12 às 22:00 (civil) ficava FORA — escapava da trava;
   *   · o de 30/11 às 22:00 (civil) ficava DENTRO — travado por um mês que não é o dele.
   */
  it("t4: a janela do mês cobre o mês CIVIL inteiro, nas duas pontas", () => {
    const { inicio, fim } = janelaCivilDoMes("2026-12");

    // O primeiro instante do mês civil é 01/12 às 00:00 locais = 03:00Z.
    expect(inicio.toISOString()).toBe("2026-12-01T03:00:00.000Z");
    // O último é 31/12 às 23:59:59.999 locais = 01/01 às 02:59:59.999Z.
    expect(fim.toISOString()).toBe("2027-01-01T02:59:59.999Z");

    // ⚠️ O FATO QUE ESCAPAVA: 31/12 às 22:00 locais.
    const noiteDe31 = new Date("2027-01-01T01:00:00Z");
    expect(diaCivil(noiteDe31)).toBe("2026-12-31");
    expect(noiteDe31.getTime()).toBeGreaterThanOrEqual(inicio.getTime());
    expect(noiteDe31.getTime()).toBeLessThanOrEqual(fim.getTime());

    // ⚠️ O FATO QUE ERA TRAVADO À TOA: 30/11 às 22:00 locais.
    const noiteDe30Nov = new Date("2026-12-01T01:00:00Z");
    expect(diaCivil(noiteDe30Nov)).toBe("2026-11-30");
    expect(noiteDe30Nov.getTime()).toBeLessThan(inicio.getTime());
  });

  it("t5: fevereiro bissexto termina em 29 — sem tabela de dias por mês", () => {
    expect(diaCivil(janelaCivilDoMes("2028-02").fim)).toBe("2028-02-29");
    expect(diaCivil(janelaCivilDoMes("2026-02").fim)).toBe("2026-02-28");
  });

  it("t6: a janela do ANO cobre o ano civil inteiro", () => {
    const { inicio, fim } = janelaCivilDoAno(2026);
    expect(diaCivil(inicio)).toBe("2026-01-01");
    expect(diaCivil(fim)).toBe("2026-12-31");
    expect(anoCivil(inicio)).toBe(2026);
    expect(anoCivil(fim)).toBe(2026);
  });

  it("t7: competência inválida é recusada nomeando o formato", () => {
    expect(() => janelaCivilDoMes("2026-13")).toThrow(/não existe/);
    expect(() => janelaCivilDoMes("dez/2026")).toThrow(/YYYY-MM/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. HORÁRIO DE VERÃO — por que não se crava −3
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ O BRASIL TEVE HORÁRIO DE VERÃO ATÉ 2019, e pode voltar a ter — é decreto, não
   * física. Um `-3` cravado no código estaria errado em qualquer exercício histórico que
   * atravessasse outubro–fevereiro, e errado de novo no dia em que ele voltar.
   *
   * Em 2018-01-15, São Paulo estava em UTC−2 (horário de verão). O mesmo instante em
   * horário-padrão daria outro dia civil.
   */
  it("t8: respeita o horário de verão de 2018 — offset −2, não −3", () => {
    // 2018-01-15T01:30:00Z = 15/01 às 23:30 em UTC−2 (verão), mas 22:30 em UTC−3.
    const instante = new Date("2018-01-16T01:30:00Z");
    expect(diaCivil(instante)).toBe("2018-01-15");

    // E o ida-e-volta fecha: montar 15/01 às 23:30 civil devolve o mesmo instante.
    expect(instanteCivil(2018, 1, 15, 23, 30).toISOString()).toBe(
      "2018-01-16T01:30:00.000Z"
    );
  });

  it("t9: fora do horário de verão o offset é −3", () => {
    expect(instanteCivil(2026, 6, 15, 0, 0).toISOString()).toBe(
      "2026-06-15T03:00:00.000Z"
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. IDA E VOLTA — a amarração que pega erro de sinal
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ ERRO DE SINAL NO OFFSET É O DEFEITO CLÁSSICO DESTE TIPO DE CÓDIGO, e ele passa
   * despercebido em qualquer teste que só olhe o meio-dia. O ida-e-volta o pega: somar em
   * vez de subtrair desloca o resultado em 6 horas, e a volta não fecha.
   *
   * N=2 por mês do ano, e nas bordas do dia — não numa data só.
   */
  it("t10: dia civil -> instante -> dia civil fecha, em todo mês e nas bordas", () => {
    for (let mes = 1; mes <= 12; mes++) {
      for (const [h, m, s, ms] of [
        [0, 0, 0, 0],
        [23, 59, 59, 999],
      ] as const) {
        const dia = `2026-${String(mes).padStart(2, "0")}-15`;
        const instante = instanteCivil(2026, mes, 15, h, m, s, ms);
        expect(diaCivil(instante), `${dia} ${h}:${m}`).toBe(dia);
      }
    }
  });

  it("t11: início e fim do dia civil são o mesmo dia, e o fim é depois do início", () => {
    const inicio = inicioDoDiaCivil("2026-12-31");
    const fim = fimDoDiaCivil("2026-12-31");
    expect(diaCivil(inicio)).toBe("2026-12-31");
    expect(diaCivil(fim)).toBe("2026-12-31");
    expect(fim.getTime()).toBeGreaterThan(inicio.getTime());
    // Um dia inteiro, menos um milissegundo.
    expect(fim.getTime() - inicio.getTime()).toBe(24 * 60 * 60 * 1000 - 1);
  });

  it("t12: dia inválido é recusado nomeando o formato", () => {
    expect(() => inicioDoDiaCivil("31/12/2026")).toThrow(/YYYY-MM-DD/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. A COMPARAÇÃO POR DIA CIVIL — e o EMPATE, que é o ponto
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ O `0` É O QUE IMPORTA. Dois fatos do mesmo dia civil têm de EMPATAR para que o
   * critério de desempate do domínio — o número da liquidação, no art. 141 — chegue a ser
   * aplicado. Comparar instantes ordenaria por hora de digitação, e o desempate nunca
   * rodaria: a ordem cronológica viraria a ordem de quem digitou primeiro.
   */
  it("t13: instantes do MESMO dia civil empatam, mesmo em horas diferentes", () => {
    const manha = new Date("2026-03-01T11:00:00Z"); // 08:00 local
    const noite = new Date("2026-03-02T01:00:00Z"); // 22:00 local do dia 1

    expect(diaCivil(manha)).toBe("2026-03-01");
    expect(diaCivil(noite)).toBe("2026-03-01");
    expect(compararPorDiaCivil(manha, noite)).toBe(0);
    expect(mesmoDiaCivil(manha, noite)).toBe(true);

    // ⚠️ E POR INSTANTE ELES NÃO EMPATAM — é essa a diferença que o desempate perdia.
    expect(manha.getTime()).not.toBe(noite.getTime());
  });

  it("t14: dias civis diferentes comparam na ordem do calendário", () => {
    const a = new Date("2026-03-01T15:00:00Z");
    const b = new Date("2026-03-02T15:00:00Z");
    expect(compararPorDiaCivil(a, b)).toBe(-1);
    expect(compararPorDiaCivil(b, a)).toBe(1);
    expect(mesmoDiaCivil(a, b)).toBe(false);
  });

  it("t15: o fuso é parâmetro — o padrão é o do ente, e ele é explícito", () => {
    expect(FUSO_DO_ENTE).toBe("America/Sao_Paulo");
    const instante = new Date("2026-02-01T02:59:00Z");
    expect(diaCivil(instante, "UTC")).toBe("2026-02-01");
    expect(diaCivil(instante, FUSO_DO_ENTE)).toBe("2026-01-31");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A CORRIDA DE MESES — bimestre, quadrimestre, doze meses
  //
  // ⚠️ ELA FECHA A METADE DO EIXO QUE O REGEX NÃO ENXERGAVA. A guarda do ENT03a
  // procurava `getUTC*`, e por isso NÃO VIA a forma dominante do defeito, que é a
  // CONSTRUÇÃO da janela por `new Date(Date.UTC(...))`. Os testes abaixo prendem os
  // instantes exatos das duas pontas.
  // ═══════════════════════════════════════════════════════════════════════════

  it("t16: a janela do 1º bimestre começa em 01/01 às 00:00 CIVIS, não em 31/12 às 21:00", () => {
    const j = janelaCivilDeMeses(2026, 1, 2);
    // 01/01/2026 00:00 em São Paulo é 03:00Z — e NÃO 2026-01-01T00:00:00Z, que civilmente
    // ainda é 31/12/2025 às 21:00 e portanto pertence a um exercício já encerrado.
    expect(j.inicio.toISOString()).toBe("2026-01-01T03:00:00.000Z");
    expect(diaCivil(j.inicio)).toBe("2026-01-01");
    expect(diaCivil(j.fim)).toBe("2026-02-28");
    expect(j.fim.toISOString()).toBe("2026-03-01T02:59:59.999Z");
  });

  it("t17: um fato de 28/02 às 22:00 civis está DENTRO do 1º bimestre", () => {
    const j = janelaCivilDeMeses(2026, 1, 2);
    const fato = instanteCivil(2026, 2, 28, 22, 0);
    expect(fato >= j.inicio && fato <= j.fim).toBe(true);
    // A mesma pergunta no eixo antigo: a janela acabava em 28/02T23:59:59Z, e 22:00
    // civis são 01/03T01:00Z — o fato caía no bimestre SEGUINTE.
    expect(fato.toISOString()).toBe("2026-03-01T01:00:00.000Z");
  });

  it("t18: a corrida de doze meses do 1º bimestre recua para MARÇO do exercício anterior", () => {
    const j = janelaCivilDeMeses(2026, 2 - 11, 12); // último mês = fev/2026
    expect(diaCivil(j.inicio)).toBe("2025-03-01");
    expect(diaCivil(j.fim)).toBe("2026-02-28");
  });

  it("t19: o mês transborda o ano nos dois sentidos", () => {
    expect(normalizarMes(2026, 0)).toBe("2025-12");
    expect(normalizarMes(2026, 13)).toBe("2027-01");
    expect(normalizarMes(2026, -11)).toBe("2025-01");
    expect(normalizarMes(2026, 7)).toBe("2026-07");
  });

  it("t20: fevereiro bissexto entra inteiro na janela", () => {
    const j = janelaCivilDeMeses(2028, 1, 2);
    expect(diaCivil(j.fim)).toBe("2028-02-29");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // A DISTÂNCIA EM DIAS — "faltam 90 dias para vencer"
  // ═══════════════════════════════════════════════════════════════════════════

  it("t21: o contrato que termina no ÚLTIMO instante de amanhã vence em 1 dia, não em 0", () => {
    const fim = fimDoDiaCivil("2026-03-16");
    const hoje = instanteCivil(2026, 3, 15, 10, 0);
    expect(diferencaEmDiasCivis(fim, hoje)).toBe(1);
  });

  it("t22: a conta não muda com a hora do dia — nem às 22:00, quando o eixo UTC já virou", () => {
    const fim = fimDoDiaCivil("2026-12-31");
    for (const hora of [0, 10, 22, 23]) {
      const hoje = instanteCivil(2026, 12, 30, hora, 30);
      expect(diferencaEmDiasCivis(fim, hoje), `às ${hora}h`).toBe(1);
    }
  });

  it("t23: vencido dá negativo, e o mesmo dia dá zero", () => {
    expect(diferencaEmDiasCivis(fimDoDiaCivil("2026-03-10"), instanteCivil(2026, 3, 15, 12))).toBe(-5);
    expect(diferencaEmDiasCivis(fimDoDiaCivil("2026-03-15"), instanteCivil(2026, 3, 15, 12))).toBe(0);
  });

  it("t24: a virada do horário de verão de 2018 não perde nem ganha um dia", () => {
    // 04/11/2018 teve 23 horas em São Paulo. Contar por milissegundos daria 0,96 dia.
    const de = instanteCivil(2018, 11, 3, 12, 0);
    const ate = instanteCivil(2018, 11, 4, 12, 0);
    expect(diferencaEmDiasCivis(ate, de)).toBe(1);
    // e a travessia inteira do horário de verão: 15/10/2018 a 15/03/2019 são 151 dias.
    expect(
      diferencaEmDiasCivis(instanteCivil(2019, 3, 15, 12), instanteCivil(2018, 10, 15, 12))
    ).toBe(151);
  });
});
