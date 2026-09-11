import { describe, expect, it } from "vitest";
import { diaCivil, diaCivilBr, fimDoDiaCivil, instanteCivil } from "../../packages/datas/index.js";
import {
  diasAteVencimento,
  estaEmAlertaDeVencimento,
  estaVencido,
  vigenciaFim,
} from "./dominio.js";
import {
  documentoTemFormatoValido,
  normalizarDocumento,
  tipoDeDocumento,
} from "./documento.js";

/**
 * O ALERTA DE VENCIMENTO (TR req. 7) E A SEPARAÇÃO VENCIDO × A VENCER (req. 9).
 *
 * ⚠️ ESTES HELPERS SÃO PUROS DE PROPÓSITO. A alternativa era cada tela derivar o fim da vigência
 * do seu jeito — e três telas com três derivações do mesmo contrato é como o valor de um contrato
 * passa a depender de por onde se olha.
 */

/** O último instante do dia — é assim que `vigenciaFimInicial` guarda a data (ver `estaVigente`). */
const fimDoDia = (ano: number, mes: number, dia: number): Date =>
  new Date(Date.UTC(ano, mes - 1, dia, 23, 59, 59));

const meioDia = (ano: number, mes: number, dia: number): Date =>
  new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));

describe("M11 — dias até o vencimento", () => {
  it("conta DIAS DE CALENDÁRIO, não milissegundos arredondados", () => {
    // ⚠️ A ARMADILHA: `vigenciaFimInicial` é 23:59:59 do último dia. Em milissegundos,
    // (amanhã 23:59:59 − hoje 12:00) = 1,5 dia; um `Math.floor` diria 1, e um cálculo ingênuo a
    // partir de 00:00 diria 0 — "vence hoje" para um contrato que vence amanhã.
    const fim = fimDoDia(2026, 3, 16);
    const hoje = meioDia(2026, 3, 15);
    expect(diasAteVencimento(fim, hoje)).toBe(1);
  });

  it("é 0 no próprio dia do vencimento — o contrato ainda vale nele", () => {
    expect(diasAteVencimento(fimDoDia(2026, 3, 15), meioDia(2026, 3, 15))).toBe(0);
  });

  it("é NEGATIVO depois de vencido", () => {
    expect(diasAteVencimento(fimDoDia(2026, 3, 10), meioDia(2026, 3, 15))).toBe(-5);
  });

  it("atravessa a virada do ano sem se perder", () => {
    expect(diasAteVencimento(fimDoDia(2027, 1, 10), meioDia(2026, 12, 31))).toBe(10);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // ⚠️ O EIXO DE DATA — e por que as fixtures acima NÃO acusavam o defeito
  //
  // Todas usam meio-dia e fim-de-dia em UTC, e nesse eixo as duas réguas coincidem.
  // O defeito só aparece quando o fim do contrato é o último instante CIVIL do dia —
  // que é o que o banco guarda — e a tela é aberta fora da janela do meio-dia.
  // ═══════════════════════════════════════════════════════════════════════════

  it("o fim gravado no último instante CIVIL do dia não empurra o vencimento para o dia seguinte", () => {
    // 31/12/2026 às 23:59:59 civis é 01/01/2027 às 02:59:59Z: no eixo UTC o contrato
    // "terminava" em janeiro, e às 10:00 de 30/12 a tela dizia 2 dias para quem vence em 1.
    const fim = fimDoDiaCivil("2026-12-31");
    expect(diasAteVencimento(fim, instanteCivil(2026, 12, 30, 10, 0))).toBe(1);
    expect(diasAteVencimento(fim, instanteCivil(2026, 12, 31, 10, 0))).toBe(0);
  });

  it("a resposta não depende da HORA em que alguém abriu a tela", () => {
    const fim = fimDoDiaCivil("2026-12-31");
    const respostas = [0, 9, 15, 22, 23].map((h) =>
      diasAteVencimento(fim, instanteCivil(2026, 11, 2, h, 30))
    );
    expect(new Set(respostas).size, `respostas divergentes: ${respostas.join(", ")}`).toBe(1);
    expect(respostas[0]).toBe(59);
  });

  it("prorrogar dias ENTRANDO no horário de verão não move o DIA do vencimento", () => {
    // ⚠️ O PRAZO TEM DE CRUZAR A VIRADA, e é isso que distingue as duas aritméticas. Um
    // ano cheio de 30/06/2018 a 30/06/2019 tem as duas pontas FORA do horário de verão, e
    // ali as duas contas coincidem — a primeira versão deste teste ficava verde com o
    // defeito, e a mutação de `scripts/mutacoes-eixo-de-data.ts` foi quem mostrou.
    //
    // O horário de verão de 2018 começou em 04/11. De 30/06 + 150 dias = **27/11/2018**.
    // Somando 150 x 86.400.000 ms a um fim de 23:59:59 civis, o instante cai em
    // 28/11T02:59:59.999Z — e com o fuso já em −2 isso é **28/11 às 00:59:59**: o
    // contrato passava a vencer UM DIA DEPOIS do que o aditivo concedeu.
    const fim = vigenciaFim(fimDoDiaCivil("2018-06-30"), [
      { tipo: "PRORROGACAO_PRAZO", dias: 150, valor: null },
    ]);
    expect(diaCivil(fim)).toBe("2018-11-27");
    // e a hora civil do fim continua sendo o ÚLTIMO instante do dia, não 00:59.
    expect(diaCivilBr(fim)).toBe("27/11/2018");
    expect(fim.getTime()).toBe(fimDoDiaCivil("2018-11-27").getTime());
  });

  it("prorrogar SAINDO do horário de verão também não move o dia", () => {
    // O horário de verão de 2018/2019 acabou em 17/02/2019. De 01/12/2018 + 100 dias =
    // 11/03/2019 — e a travessia é no outro sentido.
    const fim = vigenciaFim(fimDoDiaCivil("2018-12-01"), [
      { tipo: "PRORROGACAO_PRAZO", dias: 100, valor: null },
    ]);
    expect(diaCivil(fim)).toBe("2019-03-11");
    expect(fim.getTime()).toBe(fimDoDiaCivil("2019-03-11").getTime());
  });
});

describe("M11 — a janela de alerta (req. 7) e a separação do req. 9", () => {
  const hoje = meioDia(2026, 3, 15);

  it("dispara dentro da janela configurada no contrato", () => {
    // 90 dias é o default da coluna; o gestor o ajusta POR CONTRATO.
    expect(estaEmAlertaDeVencimento(fimDoDia(2026, 5, 1), hoje, 90)).toBe(true);
  });

  it("NÃO dispara fora da janela", () => {
    expect(estaEmAlertaDeVencimento(fimDoDia(2026, 12, 31), hoje, 90)).toBe(false);
  });

  it("a janela é do PRÓPRIO contrato — 30 dias não alerta o que 90 alertaria", () => {
    const fim = fimDoDia(2026, 5, 1); // faltam 47 dias
    expect(estaEmAlertaDeVencimento(fim, hoje, 90)).toBe(true);
    expect(estaEmAlertaDeVencimento(fim, hoje, 30)).toBe(false);
  });

  it("inclui as duas bordas: hoje e o último dia da janela", () => {
    expect(estaEmAlertaDeVencimento(fimDoDia(2026, 3, 15), hoje, 90)).toBe(true); // faltam 0
    expect(estaEmAlertaDeVencimento(fimDoDia(2026, 6, 13), hoje, 90)).toBe(true); // faltam 90
    expect(estaEmAlertaDeVencimento(fimDoDia(2026, 6, 14), hoje, 90)).toBe(false); // 91
  });

  it("⚠️ VENCIDO NÃO É 'A VENCER' — as duas listas do req. 9 são disjuntas", () => {
    const vencido = fimDoDia(2026, 3, 10); // 5 dias atrás

    // O contrato vencido NÃO entra na fila de alerta: a providência para ele é outra, e
    // misturá-lo faria o gestor ver, na lista de "renovar", o que já passou do prazo de renovação.
    expect(estaEmAlertaDeVencimento(vencido, hoje, 90)).toBe(false);
    expect(estaVencido(vencido, hoje)).toBe(true);

    // E o inverso: o que está a vencer não é vencido.
    const aVencer = fimDoDia(2026, 4, 1);
    expect(estaVencido(aVencer, hoje)).toBe(false);
    expect(estaEmAlertaDeVencimento(aVencer, hoje, 90)).toBe(true);
  });

  it("o alerta lê o fim DERIVADO — uma prorrogação tira o contrato da janela", () => {
    // ⚠️ Este é o ponto de ligar o alerta à derivação existente (`vigenciaFim`), e não a
    // `vigenciaFimInicial`: prorrogar um contrato tem de silenciar o alerta dele.
    const inicial = fimDoDia(2026, 4, 1);
    expect(estaEmAlertaDeVencimento(inicial, hoje, 90)).toBe(true);

    const prorrogado = vigenciaFim(inicial, [
      { tipo: "PRORROGACAO_PRAZO", valor: null, dias: 365 },
    ]);
    expect(estaEmAlertaDeVencimento(prorrogado, hoje, 90)).toBe(false);
    expect(diasAteVencimento(prorrogado, hoje)).toBe(382);
  });
});

describe("M11 — a normalização do documento (a FK lógica da certidão)", () => {
  it("tira a máscara do CNPJ e do CPF", () => {
    expect(normalizarDocumento("12.345.678/0001-99")).toBe("12345678000199");
    expect(normalizarDocumento("111.444.777-35")).toBe("11144477735");
  });

  it("⚠️ o mascarado e o limpo viram a MESMA chave — é isso que impede duas empresas", () => {
    // Sem esta garantia, a certidão fica pendurada numa grafia e a tela da outra a declara
    // ausente: fornecedor com certidão válida aparecendo como irregular, sem erro nenhum.
    expect(normalizarDocumento("12.345.678/0001-99")).toBe(normalizarDocumento("12345678000199"));
  });

  it("nulo/indefinido/vazio devolvem string vazia — quem valida é o chamador", () => {
    expect(normalizarDocumento(null)).toBe("");
    expect(normalizarDocumento(undefined)).toBe("");
    expect(normalizarDocumento("   ")).toBe("");
  });

  it("responde a MESMA pergunta do CHECK do banco: 11 ou 14 dígitos", () => {
    expect(documentoTemFormatoValido("11144477735")).toBe(true);
    expect(documentoTemFormatoValido("12345678000199")).toBe(true);
    expect(documentoTemFormatoValido("123")).toBe(false);
    expect(documentoTemFormatoValido("1234567890123")).toBe(false); // 13
    expect(documentoTemFormatoValido("12.345.678/0001-99")).toBe(false); // mascarado
  });

  it("distingue CPF de CNPJ pelo comprimento", () => {
    expect(tipoDeDocumento("11144477735")).toBe("CPF");
    expect(tipoDeDocumento("12345678000199")).toBe("CNPJ");
    expect(tipoDeDocumento("")).toBe("INVALIDO");
  });
});
