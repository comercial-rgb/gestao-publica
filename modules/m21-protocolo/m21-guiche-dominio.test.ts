import { describe, expect, it } from "vitest";
import {
  diaDaSemanaCivil,
  horaDosMinutos,
  horariosDaJanela,
  janelaValeNoDia,
  janelasSeSobrepoem,
  minutosDaHora,
  ofertaDoDia,
  type JanelaVigente,
} from "./guiche.js";
import { meioDiaCivil } from "../../packages/datas/index.js";

/**
 * O RELÓGIO E O CALENDÁRIO DA AGENDA DO GUICHÊ (V11 V8) — a parte que erra em silêncio.
 *
 * ═══ ⚠️ PROPRIEDADE, NÃO PADRÃO ═══
 * Não basta conferir "08:00, 08:30, 09:00" numa janela bonita. O que derruba agenda é a
 * BORDA: o último horário que não cabe, a meia-noite, a vigência que acaba hoje, e o
 * processo rodando num fuso diferente do do ente. Cada um tem um teste.
 */

const janela = (p: Partial<JanelaVigente> = {}): JanelaVigente => ({
  id: "j",
  diaDaSemana: 1,
  horaInicio: "08:00",
  horaFim: "12:00",
  duracaoMinutos: 30,
  capacidade: 2,
  vigenciaInicio: meioDiaCivil("2026-01-01"),
  vigenciaFim: null,
  ...p,
});

describe("o relógio do guichê", () => {
  it("t1: hora e minutos são a MESMA informação nos dois sentidos, na borda inclusive", () => {
    expect(minutosDaHora("00:00")).toBe(0);
    expect(minutosDaHora("23:59")).toBe(1439);
    expect(horaDosMinutos(0)).toBe("00:00");
    expect(horaDosMinutos(1439)).toBe("23:59");
    // ⚠️ IDA E VOLTA em todo minuto do dia — uma tabela de casos escolhidos a dedo
    // deixaria passar um erro de padding que só aparece às 09:05.
    for (let m = 0; m <= 1439; m += 1) expect(minutosDaHora(horaDosMinutos(m))).toBe(m);
  });

  it("t2: o que não é hora é RECUSADO, e não interpretado com boa vontade", () => {
    for (const ruim of ["24:00", "8:00", "08:60", "0800", "08:0", "", "12:34:56", "-1:00"]) {
      expect(() => minutosDaHora(ruim), ruim).toThrow(/não é uma hora/);
    }
    expect(() => horaDosMinutos(1440)).toThrow(/não é um minuto válido/);
    expect(() => horaDosMinutos(-1)).toThrow(/não é um minuto válido/);
  });
});

describe("os horários que uma janela oferece", () => {
  it("t3: o ÚLTIMO horário tem de CABER INTEIRO — 08:00–12:00 de 30 min para em 11:30", () => {
    const h = horariosDaJanela({ horaInicio: "08:00", horaFim: "12:00", duracaoMinutos: 30 });
    expect(h[0]).toBe("08:00");
    expect(h[h.length - 1]).toBe("11:30");
    expect(h.length).toBe(8);
    expect(h).not.toContain("12:00");
  });

  it("t4: a sobra que não completa um atendimento NÃO vira horário", () => {
    // 08:00–09:10 com 30 min: 08:00 e 08:30 cabem; 09:00 terminaria 09:30, depois do fim.
    expect(horariosDaJanela({ horaInicio: "08:00", horaFim: "09:10", duracaoMinutos: 30 })).toEqual([
      "08:00",
      "08:30",
    ]);
  });

  it("t5: janela que não comporta NENHUM atendimento devolve lista VAZIA, sem inventar um", () => {
    expect(horariosDaJanela({ horaInicio: "08:00", horaFim: "08:20", duracaoMinutos: 30 })).toEqual([]);
  });

  it("t6: duração ou faixa impossível é recusada NOMEANDO o motivo", () => {
    expect(() => horariosDaJanela({ horaInicio: "08:00", horaFim: "12:00", duracaoMinutos: 0 })).toThrow(
      /não gera horário nenhum/
    );
    expect(() => horariosDaJanela({ horaInicio: "12:00", horaFim: "08:00", duracaoMinutos: 30 })).toThrow(
      /termina antes de começar/
    );
  });
});

describe("o calendário — e o fuso do ente", () => {
  it("t7: o dia da semana é o do DIA CIVIL DO ENTE, não o do processo", () => {
    // 2026-09-19 é um sábado (6). O meio-dia civil do ente é a âncora.
    expect(diaDaSemanaCivil(meioDiaCivil("2026-09-19"))).toBe(6);
    expect(diaDaSemanaCivil(meioDiaCivil("2026-09-20"))).toBe(0);
    expect(diaDaSemanaCivil(meioDiaCivil("2026-09-21"))).toBe(1);
  });

  it("t7b: a conta do dia da semana confere contra implementação INDEPENDENTE, em 4 anos de datas", () => {
    // ⚠️ A REGRA DA CASA: "parser se testa contra implementação independente". A conta de
    // Sakamoto é aritmética própria; conferi-la contra ela mesma passaria com qualquer erro
    // consistente — um deslocamento de mês trocado sairia verde o ano inteiro.
    //
    // O árbitro é o calendário do próprio motor de datas, por `Date.UTC` — que NÃO pode ser
    // usado no domínio (ele reintroduz a pergunta "em que fuso?", e o guard de data civil
    // acusa), mas é exatamente o que se quer aqui: outra cabeça chegando ao mesmo número.
    for (let t = Date.UTC(2024, 0, 1); t <= Date.UTC(2027, 11, 31); t += 86_400_000) {
      const d = new Date(t);
      const iso = d.toISOString().slice(0, 10);
      expect(diaDaSemanaCivil(meioDiaCivil(iso)), iso).toBe(d.getUTCDay());
    }
  });

  it("t7c: o BISSEXTO cai no lugar certo — 29 de fevereiro e a virada de século", () => {
    // 2024-02-29 é quinta (4); 2024-03-01 é sexta (5). Um deslocamento errado de janeiro/
    // fevereiro só aparece aqui.
    expect(diaDaSemanaCivil(meioDiaCivil("2024-02-29"))).toBe(4);
    expect(diaDaSemanaCivil(meioDiaCivil("2024-03-01"))).toBe(5);
    // 2000 foi bissexto (divisível por 400); 1900 não seria (divisível por 100).
    expect(diaDaSemanaCivil(meioDiaCivil("2000-02-29"))).toBe(2);
    expect(diaDaSemanaCivil(meioDiaCivil("2100-03-01"))).toBe(1);
  });

  it("t8: a MADRUGADA do ente não é o dia anterior — é aqui que UTC quebraria a agenda", () => {
    // 01:00 de segunda-feira em São Paulo é 04:00 UTC da MESMA segunda. Mas um instante
    // gravado às 23:00 de domingo no ente é 02:00 de SEGUNDA em UTC: lido por UTC, um
    // compromisso de domingo à noite cairia na segunda, e a agenda inteira andaria.
    const domingoTarde = new Date("2026-09-20T23:00:00-03:00");
    expect(domingoTarde.getUTCDay()).toBe(1); // UTC já virou segunda…
    expect(diaDaSemanaCivil(domingoTarde)).toBe(0); // …e no ente ainda é domingo.
  });

  it("t9: a vigência é comparada por DIA CIVIL — a que termina hoje vale hoje INTEIRO", () => {
    const segunda = meioDiaCivil("2026-09-21");
    const j = janela({ vigenciaInicio: meioDiaCivil("2026-09-21"), vigenciaFim: meioDiaCivil("2026-09-21") });
    expect(janelaValeNoDia(j, segunda)).toBe(true);
    expect(janelaValeNoDia(j, meioDiaCivil("2026-09-22"))).toBe(false);
    expect(janelaValeNoDia(j, meioDiaCivil("2026-09-20"))).toBe(false);
  });

  it("t10: dia da semana diferente não vale, por mais que a vigência cubra", () => {
    // A janela é de SEGUNDA; 2026-09-22 é terça.
    expect(janelaValeNoDia(janela(), meioDiaCivil("2026-09-22"))).toBe(false);
    expect(janelaValeNoDia(janela(), meioDiaCivil("2026-09-21"))).toBe(true);
  });
});

describe("a sobreposição de ofertas", () => {
  it("t11: mesma faixa no mesmo dia da semana e vigências que se cruzam SE SOBREPÕEM", () => {
    const a = janela({ id: "a", horaInicio: "08:00", horaFim: "12:00" });
    const b = janela({ id: "b", horaInicio: "11:00", horaFim: "15:00" });
    expect(janelasSeSobrepoem(a, b)).toBe(true);
    expect(janelasSeSobrepoem(b, a)).toBe(true); // simétrica, e isso importa
  });

  it("t12: encostar NÃO é sobrepor — 08:00–12:00 e 12:00–16:00 convivem", () => {
    const a = janela({ horaInicio: "08:00", horaFim: "12:00" });
    const b = janela({ horaInicio: "12:00", horaFim: "16:00" });
    expect(janelasSeSobrepoem(a, b)).toBe(false);
  });

  it("t13: a MESMA faixa em vigências que não se cruzam é troca de oferta, não conflito", () => {
    const antiga = janela({
      vigenciaInicio: meioDiaCivil("2026-01-01"),
      vigenciaFim: meioDiaCivil("2026-02-28"),
    });
    const nova = janela({ vigenciaInicio: meioDiaCivil("2026-03-01"), vigenciaFim: null });
    expect(janelasSeSobrepoem(antiga, nova)).toBe(false);

    // Mas se a nova começa ANTES de a antiga acabar, é conflito — e um dia de encosto basta.
    const cedoDemais = janela({ vigenciaInicio: meioDiaCivil("2026-02-28"), vigenciaFim: null });
    expect(janelasSeSobrepoem(antiga, cedoDemais)).toBe(true);
  });

  it("t14: dias da semana diferentes nunca se sobrepõem", () => {
    expect(janelasSeSobrepoem(janela({ diaDaSemana: 1 }), janela({ diaDaSemana: 2 }))).toBe(false);
  });
});

describe("a oferta de um dia", () => {
  it("t15: cada horário sai com capacidade, ocupadas e livres — e livres nunca é negativo", () => {
    const segunda = meioDiaCivil("2026-09-21");
    const oferta = ofertaDoDia(
      [janela({ horaInicio: "08:00", horaFim: "09:30", duracaoMinutos: 30, capacidade: 2 })],
      segunda,
      new Map([
        ["08:00", 2],
        // ⚠️ N=2 e MAIS do que cabe: se a capacidade mudou para menos depois de marcado,
        // "livres" tem de ser 0, nunca -1. Um número negativo somado num painel viraria
        // "restam -1 vagas" na tela de quem atende.
        ["08:30", 3],
      ]),
      undefined
    );
    expect(oferta.map((o) => o.hora)).toEqual(["08:00", "08:30", "09:00"]);
    expect(oferta[0]).toEqual({ hora: "08:00", capacidade: 2, ocupadas: 2, livres: 0 });
    expect(oferta[1]).toEqual({ hora: "08:30", capacidade: 2, ocupadas: 3, livres: 0 });
    expect(oferta[2]).toEqual({ hora: "09:00", capacidade: 2, ocupadas: 0, livres: 2 });
  });

  it("t16: dia sem janela vigente não oferece NADA — e não é um dia de 8h às 17h", () => {
    const terca = meioDiaCivil("2026-09-22");
    expect(ofertaDoDia([janela({ diaDaSemana: 1 })], terca, new Map())).toEqual([]);
  });

  it("t17: a oferta sai ORDENADA por hora, venha a janela na ordem que vier", () => {
    const segunda = meioDiaCivil("2026-09-21");
    const tarde = janela({ id: "t", horaInicio: "14:00", horaFim: "15:00", duracaoMinutos: 30 });
    const manha = janela({ id: "m", horaInicio: "08:00", horaFim: "09:00", duracaoMinutos: 30 });
    const oferta = ofertaDoDia([tarde, manha], segunda, new Map());
    expect(oferta.map((o) => o.hora)).toEqual(["08:00", "08:30", "14:00", "14:30"]);
  });
});
