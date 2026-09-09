import { describe, expect, it } from "vitest";
import {
  filtrarAtualizacoes,
  linhasDeAtualizacao,
  opcoesDeFiltro,
  totaisDeAtualizacoes,
  type DecretoParaRelatorio,
} from "../../lib/relatorios/atualizacoes-orcamentarias";

/**
 * O RELATÓRIO 4.40 — o achatamento, os quatro filtros e os totais, provados sem banco e sem React.
 *
 * ═══ POR QUE ESTE TESTE NÃO PRECISA DE BANCO ═══
 * A leitura já é testada onde ela mora (o M03, contra o Postgres). O que este arquivo prova é a
 * camada que existe SÓ para o 4.40: mudar o grão de "decreto com N itens" para "uma linha por
 * movimento", recortar por ficha/decreto/fonte/UG, e somar o que sobrou. É aritmética e filtro
 * puros — pô-los contra o banco esconderia o que está sendo provado atrás de um seed.
 *
 * ═══ O QUE CADA FILTRO PODE ERRAR, E POR QUE ESTÁ TESTADO ═══
 * O erro clássico de um filtro de identificador é usar "contém" onde o certo é "é igual": com
 * `startsWith`, pedir a ficha 1 traria também a 10 e a 12, e o relatório sairia inflado sem que
 * ninguém percebesse — o número está lá, é só "demais". t3 é essa linha de defesa.
 */

const decreto = (
  numero: string,
  itens: readonly {
    tipo: "SUPLEMENTACAO" | "ANULACAO";
    valor: string;
    ficha: number;
    ug: string;
    fonte: string;
    anulado?: boolean;
  }[],
  encerrado = false
): DecretoParaRelatorio => ({
  id: `dec-${numero}`,
  numero,
  ano: 2026,
  data: new Date("2026-03-01T12:00:00Z"),
  origemRecurso: "ANULACAO",
  leiNumero: "L-001",
  leiAno: 2026,
  tipoCredito: "SUPLEMENTAR",
  encerrado,
  itens: itens.map((i, n) => ({
    id: `${numero}-${n}`,
    tipo: i.tipo,
    valor: i.valor,
    fichaNumero: i.ficha,
    unidadeCodigo: i.ug,
    fonteCodigo: i.fonte,
    anulado: i.anulado ?? false,
  })),
});

/**
 * O cenário: dois decretos, três fichas (1, 10 e 2 — a 1 e a 10 existem justamente para expor um
 * filtro por prefixo), duas UGs e duas fontes.
 */
const DECRETOS: readonly DecretoParaRelatorio[] = [
  decreto("D-001", [
    { tipo: "ANULACAO", valor: "1500.00", ficha: 1, ug: "01001", fonte: "500" },
    { tipo: "SUPLEMENTACAO", valor: "1500.00", ficha: 2, ug: "01001", fonte: "500" },
  ]),
  decreto(
    "D-002",
    [
      { tipo: "SUPLEMENTACAO", valor: "800.00", ficha: 10, ug: "02001", fonte: "540" },
      // Um item ESTORNADO: continua listado (o fato aconteceu), mas fora dos totais.
      { tipo: "SUPLEMENTACAO", valor: "9999.00", ficha: 10, ug: "02001", fonte: "540", anulado: true },
    ],
    true
  ),
];

const TODAS = linhasDeAtualizacao(DECRETOS);

describe("4.40 — o achatamento de decretos em linhas de movimento", () => {
  it("t1: uma linha por ITEM, carregando os dados do decreto que a produziu", () => {
    expect(TODAS.length, "2 itens do D-001 + 2 do D-002").toBe(4);

    const primeira = TODAS[0]!;
    expect(primeira.fichaNumero).toBe(1);
    expect(primeira.tipo).toBe("ANULACAO");
    // O grão mudou, mas o vínculo com o decreto NÃO se perde — é ele que responde "por qual ato".
    expect(primeira.decretoNumero).toBe("D-001");
    expect(primeira.leiNumero).toBe("L-001");
    expect(primeira.decretoEncerrado).toBe(false);

    // O encerramento do decreto desce para TODAS as linhas dele.
    expect(TODAS.filter((l) => l.decretoNumero === "D-002").every((l) => l.decretoEncerrado)).toBe(true);
  });

  it("t2: as OPÇÕES de filtro saem das próprias linhas, ordenadas e sem repetição", () => {
    const o = opcoesDeFiltro(TODAS);
    // Fichas ordenadas como NÚMERO (2 antes de 10) — ordenar como texto daria ["1","10","2"].
    expect(o.fichas).toEqual(["1", "2", "10"]);
    expect(o.decretos).toEqual(["D-001", "D-002"]);
    expect(o.fontes).toEqual(["500", "540"]);
    expect(o.unidades).toEqual(["01001", "02001"]);
  });
});

describe("4.40 — os quatro filtros (ficha · decreto · fonte · UG)", () => {
  it("t3: a ficha é comparada por IGUALDADE — pedir a 1 não traz a 10", () => {
    const so1 = filtrarAtualizacoes(TODAS, { ficha: "1" });
    expect(so1.length).toBe(1);
    expect(so1.every((l) => l.fichaNumero === 1)).toBe(true);

    const so10 = filtrarAtualizacoes(TODAS, { ficha: "10" });
    expect(so10.length, "as duas linhas da ficha 10, inclusive a estornada").toBe(2);
  });

  it("t4: decreto, fonte e UG recortam cada um o seu eixo", () => {
    expect(filtrarAtualizacoes(TODAS, { decreto: "D-001" }).length).toBe(2);
    expect(filtrarAtualizacoes(TODAS, { fonte: "540" }).length).toBe(2);
    expect(filtrarAtualizacoes(TODAS, { unidade: "01001" }).length).toBe(2);
    expect(
      filtrarAtualizacoes(TODAS, { unidade: "09999" }).length,
      "uma UG que não aparece devolve vazio — nunca a lista inteira"
    ).toBe(0);
  });

  it("t5: filtros combinados são E lógico; filtro vazio ou ausente NÃO recorta", () => {
    expect(filtrarAtualizacoes(TODAS, { decreto: "D-001", fonte: "500" }).length).toBe(2);
    // Combinação sem interseção: o D-001 não tem nada na fonte 540.
    expect(filtrarAtualizacoes(TODAS, { decreto: "D-001", fonte: "540" }).length).toBe(0);

    expect(filtrarAtualizacoes(TODAS, {}).length, "sem filtro = tudo").toBe(4);
    expect(
      filtrarAtualizacoes(TODAS, { ficha: "", decreto: "  ", fonte: undefined }).length,
      "string vazia (o valor do select 'todas') é ausência de filtro, não um filtro por vazio"
    ).toBe(4);
  });
});

describe("4.40 — os totais somam AS LINHAS EXIBIDAS", () => {
  it("t6: sem filtro, suplementado − anulado = efeito líquido; o ESTORNADO fica de fora", () => {
    const t = totaisDeAtualizacoes(TODAS);
    // 1.500 (ficha 2) + 800 (ficha 10). Os 9.999 estornados NÃO entram — somá-los daria 10.799.
    expect(t.suplementado).toBe("2300.00");
    expect(t.anulado).toBe("1500.00");
    expect(t.liquido, "o orçamento cresceu só pelo crédito por recurso novo").toBe("800.00");
  });

  it("t7: FILTRAR MUDA O TOTAL — é isso que torna o relatório conferível", () => {
    const t = totaisDeAtualizacoes(filtrarAtualizacoes(TODAS, { decreto: "D-001" }));
    // Um decreto por anulação que fecha: o líquido dele é ZERO, e o total tem de dizer isso.
    expect(t.suplementado).toBe("1500.00");
    expect(t.anulado).toBe("1500.00");
    expect(t.liquido).toBe("0.00");
  });

  it("t8: o líquido pode ser NEGATIVO (mais anulado que suplementado), e sai com sinal", () => {
    const soAnulacao = filtrarAtualizacoes(TODAS, { ficha: "1" });
    expect(totaisDeAtualizacoes(soAnulacao).liquido).toBe("-1500.00");
  });

  it("t9: a soma é em CENTAVOS INTEIROS — sem o centavo fantasma do ponto flutuante", () => {
    // 0,10 + 0,20 em `number` daria 0.30000000000000004.
    const centavos = linhasDeAtualizacao([
      decreto("D-9", [
        { tipo: "SUPLEMENTACAO", valor: "0.10", ficha: 1, ug: "01001", fonte: "500" },
        { tipo: "SUPLEMENTACAO", valor: "0.20", ficha: 2, ug: "01001", fonte: "500" },
      ]),
    ]);
    expect(totaisDeAtualizacoes(centavos).suplementado).toBe("0.30");
  });

  it("t10: lista vazia soma zero — nunca `NaN`, nunca string vazia", () => {
    expect(totaisDeAtualizacoes([])).toEqual({ suplementado: "0.00", anulado: "0.00", liquido: "0.00" });
  });
});
