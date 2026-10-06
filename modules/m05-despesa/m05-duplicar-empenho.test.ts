import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { empenharDe2026, FICHA, POR, R_EMPENHO, semearM08 } from "../m08-restos-a-pagar/fixture-m08.js";
import { criarM05Deps } from "./adapter-prisma.js";
import { duplicarEmpenho } from "./duplicar-empenho.js";
import { anularEmpenho, empenhar } from "./servico.js";

/**
 * V36 — DUPLICAR O EMPENHO (TR 5.10.1.12): número, data, valor e histórico do usuário; ficha, tipo, credor, categoria
 * e vínculos do original; baixa da dotação e lançamento pela emissão comum. N=2 originais de tipo, credor e categoria
 * diferentes — com um só, "copiou do original" passaria copiando de qualquer lugar fixo.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const deps = () => criarM05Deps(prisma);
const D = (iso: string) => new Date(`${iso}T12:00:00Z`);
let e1 = "";
let e2 = "";

async function semear(): Promise<void> {
  await semearM08();
  e1 = await empenharDe2026(deps(), "1/2026", "1000.00");
  e2 = (
    await empenhar(
      {
        fichaId: FICHA, numero: "2/2026", tipo: "GLOBAL", valor: "2500.00", data: D("2026-06-02"),
        credorCpfCnpj: "11144477735", historico: "serviço de manutenção", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR,
      },
      R_EMPENHO,
      deps()
    )
  ).empenhoId;
}

const duplicar = (origem: string, numero: string, valor: string, por = POR) =>
  duplicarEmpenho({ empenhoOrigemId: origem, numero, data: D("2026-07-10"), valor, historico: `cópia de ${numero}`, criadoPor: por }, R_EMPENHO, deps(), prisma);

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

const empenhadoDaFicha = async (): Promise<string> =>
  (await prisma.empenho.aggregate({ where: { fichaId: FICHA, estornoDeId: null, anulacaoParcialDeId: null }, _sum: { valor: true } }))._sum.valor?.toFixed(2) ?? "0.00";

describe("M05 V36 — duplicar empenho", () => {
  beforeEach(semear, 60000);

  it("t1: cada duplicado copia do SEU original e leva número, data, valor e histórico informados", async () => {
    const d1 = await duplicar(e1, "3/2026", "400.00");
    const d2 = await duplicar(e2, "4/2026", "700.00");
    const campos = { numero: true, tipo: true, credorCpfCnpj: true, categoriaOrdemCronologica: true, fichaId: true, valor: true, data: true, historico: true } as const;
    const n1 = await prisma.empenho.findUniqueOrThrow({ where: { id: d1.empenhoId }, select: campos });
    const n2 = await prisma.empenho.findUniqueOrThrow({ where: { id: d2.empenhoId }, select: campos });
    expect({ ...n1, valor: n1.valor.toFixed(2) }).toEqual({
      numero: "3/2026", tipo: "ORDINARIO", credorCpfCnpj: "12345678000195", categoriaOrdemCronologica: "FORNECIMENTO_BENS",
      fichaId: FICHA, valor: "400.00", data: D("2026-07-10"), historico: "cópia de 3/2026",
    });
    expect({ ...n2, valor: n2.valor.toFixed(2) }).toEqual({
      numero: "4/2026", tipo: "GLOBAL", credorCpfCnpj: "11144477735", categoriaOrdemCronologica: "PRESTACAO_SERVICOS",
      fichaId: FICHA, valor: "700.00", data: D("2026-07-10"), historico: "cópia de 4/2026",
    });
  });

  it("t2: a dotação baixa e o razão recebe o lançamento de cada duplicado, com as partidas no valor novo", async () => {
    expect(await empenhadoDaFicha()).toBe("3500.00");
    const d1 = await duplicar(e1, "3/2026", "400.00");
    const d2 = await duplicar(e2, "4/2026", "700.00");
    expect(await empenhadoDaFicha()).toBe("4600.00");
    for (const [d, v] of [[d1, "400.00"], [d2, "700.00"]] as const) {
      const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: d.lancamentoId }, select: { origemTipo: true, origemId: true, partidas: { select: { tipo: true, valor: true } } } });
      expect(l.origemTipo).toBe("EMPENHO");
      expect(l.origemId).toBe(d.empenhoId);
      expect(l.partidas.filter((p) => p.tipo === "DEBITO").map((p) => p.valor.toFixed(2))).toEqual([v]);
      expect(l.partidas.filter((p) => p.tipo === "CREDITO").map((p) => p.valor.toFixed(2))).toEqual([v]);
    }
  });

  it("t3: quem empenha só noutra unidade é recusado pela ação, antes de ler o original, e nada se grava", async () => {
    await prisma.unidadeOrcamentaria.create({ data: { id: "uo-02", codigo: "01002", descricao: "Saúde", orgaoId: "org-01" } });
    const u = await prisma.usuario.create({ data: { identificador: "so-saude@cg.pb.gov.br", nome: "Só saúde", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({
      data: { nome: "EMPENHA-SAUDE", descricao: "empenha só na saúde", criadoPor: "TESTE", permissoes: { create: [{ acao: "EMPENHAR", unidadeOrcId: "uo-02", criadoPor: "TESTE" }] } },
      select: { id: true },
    });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    const antes = await prisma.empenho.count();
    const motivo = await recusa(() => duplicar(e1, "3/2026", "400.00", "so-saude@cg.pb.gov.br"));
    expect(motivo).toMatch(/EMPENHAR/);
    expect(motivo).not.toMatch(/consórcio|anulação/);
    expect(await prisma.empenho.count()).toBe(antes);
  });

  it("t4: anulação não se duplica (aponta o original); dotação insuficiente recusa pela emissão comum", async () => {
    await anularEmpenho({ empenhoId: e2, numero: "2/2026-A", data: D("2026-06-05"), historico: "anulado para teste", criadoPor: POR }, deps());
    const anulacao = await prisma.empenho.findFirstOrThrow({ where: { estornoDeId: e2 }, select: { id: true } });
    expect(await recusa(() => duplicar(anulacao.id, "5/2026", "10.00"))).toMatch(/2\/2026-A é uma anulação.*empenho original 2\/2026/);

    const antes = await prisma.empenho.count();
    const motivo = await recusa(() => duplicar(e1, "6/2026", "99999.00"));
    expect(motivo).not.toBe("gravou");
    expect(motivo).toMatch(/saldo|dota/i);
    expect(await prisma.empenho.count()).toBe(antes);
  });

  it("t5: empenho inexistente é recusado com o motivo", async () => {
    expect(await recusa(() => duplicar("nao-existe", "7/2026", "10.00"))).toMatch(/empenho a duplicar não existe/);
  });
});
