import { describe, expect, it } from "vitest";
import { documentoDaNotaDeEstorno } from "../../lib/pdf/nota-de-estorno";
import type { AnulacaoRegistrada } from "../../lib/portas/anulacao";

/**
 * A NOTA DE ESTORNO (V36) — montagem pura. N=2: uma anulação integral de pagamento e uma parcial de empenho, para
 * que "integral" e "parcial" não passem por vacuidade; e o caso de quem não lê a contabilidade, em que as partidas
 * não constam e a nota DIZ por quê (em vez de imprimir uma seção vazia que pareceria "sem lançamento").
 */
const base = (x: Partial<AnulacaoRegistrada>): AnulacaoRegistrada => ({
  tipo: "empenho",
  id: "a1",
  numero: "NEA-1",
  data: new Date("2026-05-10T15:00:00Z"),
  valor: "1500.00",
  integral: false,
  motivo: "redução do objeto contratado por acordo entre as partes",
  lancamentoId: "l1",
  originalId: "e1",
  originalNumero: "NE-12",
  originalHref: "/despesa/empenhos/e1",
  criadoPor: "contador@ente.local",
  ...x,
});

const linhasDe = (doc: ReturnType<typeof documentoDaNotaDeEstorno>, titulo: string): readonly (readonly string[])[] =>
  doc.secoes.find((s) => s.titulo?.startsWith(titulo) === true)?.linhas ?? [];

describe("nota de estorno", () => {
  it("parcial de empenho: número, original, alcance, valor, motivo e as partidas do lançamento", () => {
    const doc = documentoDaNotaDeEstorno({
      ente: "Prefeitura de Teste",
      exercicio: 2026,
      anulacao: base({}),
      lancamento: {
        numeroControle: "ANE-77",
        partidas: [
          { id: "p1", contaCodigo: "conta-empenhado", contaTitulo: "Crédito empenhado", tipo: "DEBITO", subsistema: "ORCAMENTARIO", valor: "1500.00", ficha: null },
          { id: "p2", contaCodigo: "conta-disponivel", contaTitulo: "Crédito disponível", tipo: "CREDITO", subsistema: "ORCAMENTARIO", valor: "1500.00", ficha: null },
        ],
      },
    });
    expect(doc.titulo).toBe("Nota de Estorno nº NEA-1");
    expect(doc.subtitulo).toBe("Anulação de empenho");
    const id = linhasDe(doc, "Identificação");
    expect(id).toContainEqual(["Documento anulado", "empenho nº NE-12"]);
    expect(id.find((l) => l[0] === "Alcance")?.[1]).toMatch(/^parcial/);
    expect(linhasDe(doc, "Valor anulado")).toEqual([["Anulação de empenho", "R$ 1.500,00"]]);
    expect(linhasDe(doc, "Motivo")).toEqual([["redução do objeto contratado por acordo entre as partes"]]);
    const partidas = linhasDe(doc, "Lançamento contábil ANE-77");
    expect(partidas).toEqual([
      ["conta-empenhado Crédito empenhado", "orcamentario", "R$ 1.500,00", ""],
      ["conta-disponivel Crédito disponível", "orcamentario", "", "R$ 1.500,00"],
    ]);
  });

  it("integral de pagamento, sem acesso à contabilidade: sem seção de partidas, e a nota diz por quê", () => {
    const doc = documentoDaNotaDeEstorno({
      ente: "Prefeitura de Teste",
      exercicio: 2026,
      anulacao: base({ tipo: "pagamento", numero: "PGA-3", originalNumero: "PG-9", integral: true, valor: "250.40" }),
      lancamento: null,
    });
    expect(doc.subtitulo).toBe("Anulação de pagamento");
    expect(linhasDe(doc, "Identificação").find((l) => l[0] === "Alcance")?.[1]).toMatch(/^integral/);
    expect(linhasDe(doc, "Valor anulado")).toEqual([["Anulação de pagamento", "R$ 250,40"]]);
    expect(doc.secoes.some((s) => s.titulo?.startsWith("Lançamento") === true)).toBe(false);
    expect(doc.notas?.some((n) => /não consulta a contabilidade/.test(n))).toBe(true);
  });
});
