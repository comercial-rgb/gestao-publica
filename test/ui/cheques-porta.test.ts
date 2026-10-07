import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * V36 — A PORTA DOS CHEQUES decide, pela leitura da DESPESA no ente, se os cheques de pagamento (credor e empenho)
 * entram na lista. O domínio recebe a decisão pronta; este teste prova que a porta a toma (achado da auditoria: trocar
 * `incluirDePagamento: leDespesa` por `true` ficava verde em todo o resto).
 */
const leDespesa = { valor: false };
const chamadas: { incluirDePagamento: boolean }[] = [];

vi.mock("../../lib/portas/leitura", () => ({ temLeituraDoEnte: async (acao: string) => (acao === "CONSULTAR_DESPESA" ? leDespesa.valor : true) }));
vi.mock("../../lib/portas/cliente", () => ({ cliente: () => ({ contaBancaria: { findMany: async () => [] } }) }));
vi.mock("../../lib/portas/empenho", () => ({ nomesDosCredores: async () => new Map<string, string>() }));
vi.mock("../../lib/portas/sessao", () => ({ comEscritaAutenticada: async () => undefined }));
vi.mock("../../modules/m09-tesouraria/cheques", async (original) => ({
  ...(await original<typeof import("../../modules/m09-tesouraria/cheques")>()),
  chequesEmitidos: async (_p: unknown, r: { incluirDePagamento: boolean }) => {
    chamadas.push({ incluirDePagamento: r.incluirDePagamento });
    return [];
  },
}));

const { filtroDosCheques, lerTelaDosCheques } = await import("../../lib/portas/cheques");

describe("porta dos cheques — quem não lê a despesa vê só os avulsos", () => {
  beforeEach(() => {
    chamadas.length = 0;
  });

  it("sem a consulta da despesa: o domínio é chamado sem os de pagamento, e a tela diz o motivo", async () => {
    leDespesa.valor = false;
    const f = filtroDosCheques({ de: "2026-09-01", ate: "2026-09-30" });
    if ("erro" in f) throw new Error(f.erro);
    const t = await lerTelaDosCheques(f);
    expect(chamadas).toEqual([{ incluirDePagamento: false }]);
    expect(t.motivoSemPagamentos).toMatch(/não consulta a despesa de todo o ente/);
  });

  it("com a consulta da despesa: os de pagamento entram, sem aviso", async () => {
    leDespesa.valor = true;
    const f = filtroDosCheques({ de: "2026-09-01", ate: "2026-09-30" });
    if ("erro" in f) throw new Error(f.erro);
    const t = await lerTelaDosCheques(f);
    expect(chamadas).toEqual([{ incluirDePagamento: true }]);
    expect(t.motivoSemPagamentos).toBeNull();
  });

  it("o filtro recusa período invertido e data impossível, dizendo o motivo", () => {
    expect(filtroDosCheques({ de: "2026-09-30", ate: "2026-09-01" })).toEqual({ erro: "A data inicial do período é posterior à final." });
    expect(filtroDosCheques({ de: "2026-09-01", ate: "2026-09-31" })).toEqual({ erro: "Informe o período com datas válidas." });
  });
});
