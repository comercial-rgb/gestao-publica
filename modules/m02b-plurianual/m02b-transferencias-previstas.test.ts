import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { preverTransferenciaNoPpa, quadroDeTransferenciasPrevistas } from "./transferencias-previstas.js";

/**
 * M02b — AS TRANSFERÊNCIAS FINANCEIRAS PREVISTAS NO PPA (TR 5.9.1.17), por entidade de destino e ano.
 *
 * Plano 2026–2029; duas entidades de destino (Câmara e fundo de previdência — N=2):
 *   Câmara 2026: 1.200.000,00, corrigida para 1.250.000,00 (versão 2, com motivo); 2027: 1.300.000,00.
 *   Fundo 2026: 800.000,00.
 *   Total 2026 = 1.250.000 + 800.000 = 2.050.000,00; 2027 = 1.300.000,00; Câmara no quadriênio = 2.550.000,00.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "planejamento@cg.pb.gov.br";
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    const m = (e as Error).message;
    return /invocation in/.test(m) ? `(erro do banco) ${m.trim().split(/\r?\n/).pop() ?? ""}` : m;
  }
  return "(não recusou)";
};

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.planoPlurianual.create({ data: { id: "ppa", anoInicio: 2026, anoFim: 2029, leiRef: "Lei 1/2025", dataPublicacao: new Date("2025-12-20T15:00:00Z"), criadoPor: POR } });
  await prisma.entidadeContabil.createMany({ data: [{ id: "cm", codigo: "CM", criadoPor: POR }, { id: "fps", codigo: "FPS", criadoPor: POR }] });
});

afterAll(async () => {
  await prisma.$disconnect();
});

const prever = (entidadeId: string, ano: number, valor: string, motivo?: string): Promise<unknown> =>
  preverTransferenciaNoPpa(prisma, { planoId: "ppa", entidadeId, ano, valor, finalidade: "Repasse previsto no quadriênio", ...(motivo !== undefined ? { motivo } : {}), criadoPor: POR });

describe("M02b — transferências financeiras previstas no PPA", () => {
  it("t1: por entidade e ano, com a correção versionada e o quadro somado por ano e por entidade", async () => {
    await prever("cm", 2026, "1200000.00");
    await prever("cm", 2027, "1300000.00");
    await prever("fps", 2026, "800000.00");
    const r = (await prever("cm", 2026, "1250000.00", "Duodécimo recalculado pela receita base")) as { versao: number; anterior: string };
    expect(r).toEqual({ versao: 2, anterior: "1200000.00" });
    const q = await quadroDeTransferenciasPrevistas(prisma, "ppa");
    expect(q?.anos).toEqual([2026, 2027, 2028, 2029]);
    const cm = q?.linhas.find((l) => l.entidadeId === "cm");
    expect(cm?.porAno.map((a) => a.valor?.toFixed(2) ?? "-")).toEqual(["1250000.00", "1300000.00", "-", "-"]);
    expect(cm?.porAno[0]?.versoes).toBe(2);
    expect(cm?.total.toFixed(2)).toBe("2550000.00");
    expect(q?.totalPorAno.map((t) => t.toFixed(2))).toEqual(["2050000.00", "1300000.00", "0.00", "0.00"]);
    expect(await prisma.previsaoDeTransferenciaPpa.count()).toBe(4);
  });

  it("t2: as recusas — ano fora do quadriênio, correção sem motivo, primeira previsão zerada, entidade inexistente; nada é gravado", async () => {
    expect(await recusa(() => prever("cm", 2030, "10.00"))).toMatch(/2030 não está no quadriênio do plano \(2026 a 2029\)/);
    expect(await recusa(() => prever("cm", 2026, "0.00"))).toMatch(/primeira previsão tem de ter valor maior que zero/);
    expect(await recusa(() => prever("xx", 2026, "10.00"))).toMatch(/Entidade de destino não encontrada/);
    await prever("cm", 2026, "100.00");
    expect(await recusa(() => prever("cm", 2026, "200.00"))).toMatch(/a correção precisa do motivo/);
    expect(await prisma.previsaoDeTransferenciaPpa.count()).toBe(1);
    // A correção pode zerar, com motivo.
    await prever("cm", 2026, "0.00", "Repasse suspenso por decisão do gestor");
    expect((await quadroDeTransferenciasPrevistas(prisma, "ppa"))?.linhas[0]?.porAno[0]?.valor?.toFixed(2)).toBe("0.00");
  });

  it("t3: duas correções ao mesmo tempo — uma grava, a outra é recusada com o motivo", async () => {
    await prever("cm", 2026, "100.00");
    // Determinístico: uma transação grava a versão 2 e fica ABERTA; a correção lê "última = 1" (não vê a linha não
    // confirmada), tenta a versão 2 e espera no índice único; quando a primeira confirma, ela recebe a violação.
    let gravou = (): void => undefined;
    let liberar = (): void => undefined;
    const pegou = new Promise<void>((r) => (gravou = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const outra = prisma.$transaction(
      async (tx) => {
        await tx.previsaoDeTransferenciaPpa.create({ data: { planoId: "ppa", entidadeId: "cm", ano: 2026, versao: 2, valor: "110.00", finalidade: "Correção A", motivo: "Correção A simultânea", criadoPor: POR } });
        gravou();
        await segura;
      },
      { timeout: 60000 }
    );
    await pegou;
    const correcao = prever("cm", 2026, "120.00", "Correção B simultânea").then(() => "(gravou)", (e: unknown) => (e as Error).message);
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      const [l] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'transactionid' AND datname = current_database()`;
      vista = (l?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    liberar();
    await outra;
    expect(vista, "a correção não chegou a esperar o índice único").toBe(true);
    expect(await correcao).toMatch(/gravada ao mesmo tempo/);
    expect(await prisma.previsaoDeTransferenciaPpa.count()).toBe(2);
  });

  it("t4: quem só consulta o planejamento não prevê transferência; a recusa nomeia a ação", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.ppa@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_PPA", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_PLANEJAMENTO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => preverTransferenciaNoPpa(prisma, { planoId: "ppa", entidadeId: "cm", ano: 2026, valor: "10.00", finalidade: "Tentativa sem a ação", criadoPor: "so.le.ppa@cg.pb.gov.br" }))).toMatch(/CADASTRAR_PPA/);
    expect(await prisma.previsaoDeTransferenciaPpa.count()).toBe(0);
  });
});
