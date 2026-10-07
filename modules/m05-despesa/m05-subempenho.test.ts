import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarFichaDeTeste } from "../../test/ficha-teste.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM05DepsComContratos } from "../m11-licitacoes/adapter-m05.js";
import { travarFichas } from "./adapter-prisma.js";
import { anularEmpenhoParcial, anularLiquidacaoParcial, estornarAnulacaoParcial } from "./anulacao-parcial.js";
import { roteiroEmpenho, roteiroLiquidacao } from "./dominio.js";
import { anularEmpenho, empenhar } from "./servico.js";
import { anularLiquidacao, liquidar } from "./servico-bloco2.js";
import { anularSaldoDoSubempenho, emitirSubempenho, lerSubempenhosDoEmpenho } from "./subempenho.js";

/**
 * V36 (TR 5.10.1.7) — O SUBEMPENHO SOBRE O EMPENHO GLOBAL E O ESTIMATIVO.
 *
 * Empenhos de 1.000,00. Fixture N=2: dois subempenhos no mesmo empenho (300 e 400), cada um liquidado.
 *   Estimativo 1.000: sub 1 = 300, sub 2 = 400 → livre 300. Sub 1 liquidado 300 (saldo 0); sub 2 liquidado 150 + 250
 *   (saldo 0). Liquidação direta de 300,01 recusada (passa do livre 300); de 300,00 passa → livre 0.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "despesa@cg.pb.gov.br";
const FICHA = "ficha-1";
const C_DISPONIVEL = "6.2.2.1.1.00.00";
const C_EMPENHADO = "6.2.2.1.3.01.00";
const C_LIQUIDADO = "6.2.2.1.3.03.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISPONIVEL, creditoEmpenhado: C_EMPENHADO });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMPENHADO, creditoLiquidado: C_LIQUIDADO });
const D = (iso: string) => new Date(`${iso}T12:00:00Z`);

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: C_DISPONIVEL, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C_EMPENHADO, nome: "Crédito Empenhado a Liquidar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: C_LIQUIDADO, nome: "Crédito Empenhado Liquidado a Pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: VPD, nome: "Serviços de terceiros", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Administração", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-04", codigo: "04", nome: "Administração" } });
  await prisma.subfuncao.create({ data: { id: "sub-122", codigo: "122", nome: "Adm" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0004", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2001", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.create({ data: { id: "nd", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" } });
  await prisma.fonteRecurso.create({ data: { id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await criarFichaDeTeste(prisma, {
    id: FICHA, exercicio: 2026, numero: 1, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-04", subfuncaoId: "sub-122",
    programaId: "prg", acaoId: "aca", naturezaDespesaId: "nd", fonteId: "fnt-500", valorDotado: "100000.00",
  });
});

const deps = () => criarM05DepsComContratos(prisma);
const novoEmpenho = async (numero: string, tipo: "ORDINARIO" | "GLOBAL" | "ESTIMATIVO") =>
  (await empenhar({ fichaId: FICHA, numero, tipo, valor: "1000.00", data: D("2026-02-01"), credorCpfCnpj: "11144477735", historico: "fixture", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR }, R_EMPENHO, deps())).empenhoId;
const sub = (empenhoId: string, valor: string, data = "2026-02-05", por = POR) =>
  emitirSubempenho(prisma, { empenhoId, valor, data: D(data), historico: "Parcela do mês", criadoPor: por });
const liquida = (empenhoId: string, numero: string, valor: string, subempenhoId?: string, data = "2026-02-10") =>
  liquidar({ empenhoId, numero, valor, data: D(data), responsavelAtesto: "Fulano", historico: "parcela", criadoPor: POR, ...(subempenhoId !== undefined ? { subempenhoId } : {}) }, R_LIQUIDACAO, deps());
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "(não recusou)";
};
const quadro = async (empenhoId: string) => {
  const q = await lerSubempenhosDoEmpenho(prisma, empenhoId);
  return {
    empenhado: q.empenhado.toFixed(2),
    liquidadoDireto: q.liquidadoDireto.toFixed(2),
    repartido: q.repartido.toFixed(2),
    livre: q.livre.toFixed(2),
    subs: q.subempenhos.map((s) => `${String(s.numero)}:${s.efetivo.toFixed(2)}/${s.liquidado.toFixed(2)}/${s.saldo.toFixed(2)}`),
  };
};

describe("M05 — subempenho", () => {
  it("t1: estimativo repartido em dois subempenhos (N=2), cada um liquidado no seu saldo; a direta só no livre", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    const lancamentosAntes = await prisma.lancamentoContabil.count();
    const s1 = await sub(e, "300.00");
    const s2 = await sub(e, "400.00");
    // O subempenho não lança no razão: o crédito empenhado já foi lançado no empenho.
    expect(await prisma.lancamentoContabil.count()).toBe(lancamentosAntes);
    expect([s1.numero, s2.numero, s1.rotulo, s2.rotulo]).toEqual([1, 2, "NE-EST/1", "NE-EST/2"]);
    expect(await quadro(e)).toEqual({ empenhado: "1000.00", liquidadoDireto: "0.00", repartido: "700.00", livre: "300.00", subs: ["1:300.00/0.00/300.00", "2:400.00/0.00/400.00"] });

    // O terceiro não cabe no livre.
    expect(await recusa(() => sub(e, "300.01"))).toMatch(/não cabe no saldo livre do empenho NE-EST: empenhado R\$ 1\.000,00, liquidado direto R\$ 0,00, já repartido em subempenhos R\$ 700,00, livre R\$ 300,00/);

    await liquida(e, "NL-1", "300.00", s1.subempenhoId);
    expect(await recusa(() => liquida(e, "NL-X", "0.01", s1.subempenhoId))).toMatch(/passa do saldo do subempenho NE-EST\/1: valor R\$ 300,00, já liquidado R\$ 300,00, saldo R\$ 0,00/);
    await liquida(e, "NL-2", "150.00", s2.subempenhoId);
    // 450 liquidados: 300,01 cabe no empenho (1.000) mas não no livre (300) — é a guarda do subempenho que recusa.
    expect(await recusa(() => liquida(e, "NL-Y", "300.01"))).toMatch(/direto no empenho NE-EST passa do saldo livre dele \(R\$ 300,00\): R\$ 700,00 estão repartidos em subempenhos/);
    await liquida(e, "NL-3", "250.00", s2.subempenhoId);
    await liquida(e, "NL-4", "300.00");
    expect(await quadro(e)).toEqual({ empenhado: "1000.00", liquidadoDireto: "300.00", repartido: "700.00", livre: "0.00", subs: ["1:300.00/300.00/0.00", "2:400.00/400.00/0.00"] });
    // A liquidação guarda o subempenho; cada liquidação lança uma vez, pelo roteiro da liquidação do empenho.
    expect((await prisma.liquidacao.findMany({ where: { empenhoId: e }, orderBy: { numero: "asc" }, select: { subempenhoId: true } })).map((l) => l.subempenhoId)).toEqual([s1.subempenhoId, s2.subempenhoId, s2.subempenhoId, null]);
    expect(await prisma.lancamentoContabil.count()).toBe(lancamentosAntes + 4);
  });

  it("t2: o global já liquidado direto não aceita subempenho; o global liquidado pelo subempenho aceita o segundo", async () => {
    const g = await novoEmpenho("NE-GLO", "GLOBAL");
    await liquida(g, "NL-1", "100.00");
    expect(await recusa(() => sub(g, "200.00"))).toMatch(/O empenho global NE-GLO já tem liquidação de R\$ 100,00 feita direto nele: o empenho global que já possui liquidação não aceita subempenho/);
    expect(await prisma.subempenho.count()).toBe(0);

    const g2 = await novoEmpenho("NE-GLO2", "GLOBAL");
    const a = await sub(g2, "200.00");
    await liquida(g2, "NL-2", "200.00", a.subempenhoId);
    const b = await sub(g2, "300.00");
    expect(b.numero).toBe(2);
    // Estornada a liquidação direta do primeiro global, ele volta a aceitar subempenho (o líquido é zero).
    const [l1] = await prisma.liquidacao.findMany({ where: { empenhoId: g }, select: { id: true } });
    await anularLiquidacao({ liquidacaoId: l1?.id ?? "", numero: "NL-1-ANUL", data: D("2026-02-11"), historico: "Atesto refeito por subempenho", criadoPor: POR }, deps());
    expect((await sub(g, "200.00")).numero).toBe(1);
  });

  it("t3: as recusas da emissão — ordinário, data anterior ao empenho, subempenho de outro empenho na liquidação; nada é gravado", async () => {
    const o = await novoEmpenho("NE-ORD", "ORDINARIO");
    expect(await recusa(() => sub(o, "100.00"))).toMatch(/NE-ORD é ORDINÁRIO: o subempenho reparte só o empenho GLOBAL ou o ESTIMATIVO/);
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    expect(await recusa(() => sub(e, "100.00", "2026-01-31"))).toMatch(/data do subempenho \(31\/01\/2026\) é anterior à do empenho NE-EST \(01\/02\/2026\)/);
    const outro = await novoEmpenho("NE-EST2", "ESTIMATIVO");
    const s = await sub(outro, "100.00");
    expect(await recusa(() => liquida(e, "NL-1", "50.00", s.subempenhoId))).toMatch(/O subempenho informado não é do empenho NE-EST/);
    expect(await recusa(() => liquida(outro, "NL-2", "50.00", s.subempenhoId, "2026-02-04"))).toMatch(/data da liquidação \(04\/02\/2026\) é anterior à do subempenho NE-EST2\/1 \(05\/02\/2026\)/);
    expect(await prisma.subempenho.count()).toBe(1);
    expect(await prisma.liquidacao.count()).toBe(0);
  });

  it("t4: a anulação do subempenho devolve ao livre só o não liquidado; o estorno da liquidação devolve ao subempenho", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    const s = await sub(e, "500.00");
    const { liquidacaoId } = await liquida(e, "NL-1", "200.00", s.subempenhoId);
    const anular = (valor: string) => anularSaldoDoSubempenho(prisma, { subempenhoId: s.subempenhoId, valor, data: D("2026-03-01"), motivo: "Parcela menor que a prevista", criadoPor: POR });
    expect(await recusa(() => anular("300.01"))).toMatch(/passa do saldo não liquidado do subempenho NE-EST\/1: valor R\$ 500,00, já anulado R\$ 0,00, liquidado R\$ 200,00, saldo R\$ 300,00/);
    expect((await anular("100.00")).saldo).toBe("200.00");
    expect((await anular("200.00")).saldo).toBe("0.00");
    expect(await quadro(e)).toEqual({ empenhado: "1000.00", liquidadoDireto: "0.00", repartido: "200.00", livre: "800.00", subs: ["1:200.00/200.00/0.00"] });
    await anularLiquidacao({ liquidacaoId, numero: "NL-1-ANUL", data: D("2026-03-02"), historico: "Fatura devolvida", criadoPor: POR }, deps());
    expect(await quadro(e)).toEqual({ empenhado: "1000.00", liquidadoDireto: "0.00", repartido: "200.00", livre: "800.00", subs: ["1:200.00/0.00/200.00"] });
  });

  it("t5: o empenho repartido — a parcial só no livre, a total só sem subempenho com valor", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    await sub(e, "600.00");
    const parcial = (valor: string) => anularEmpenhoParcial({ originalId: e, numero: `NE-AP-${valor}`, valor, data: D("2026-03-01"), motivo: "Saldo não utilizado do empenho", criadoPor: POR }, deps());
    expect(await recusa(() => parcial("400.01"))).toMatch(/ANULAÇÃO PARCIAL MAIOR QUE O SALDO LIVRE do empenho NE-EST: R\$ 400,00 livres, R\$ 600,00 repartidos em subempenhos/);
    await parcial("400.00");
    expect(await quadro(e)).toMatchObject({ empenhado: "600.00", repartido: "600.00", livre: "0.00" });
    // A total, num empenho sem parcial (a parcial viva já impede a total por outro motivo).
    const e2 = await novoEmpenho("NE-EST2", "ESTIMATIVO");
    const s = await sub(e2, "600.00");
    const total = () => anularEmpenho({ empenhoId: e2, numero: "NE-ANUL", data: D("2026-03-02"), historico: "Empenho sem uso", criadoPor: POR }, deps());
    expect(await recusa(total)).toMatch(/O empenho está repartido em subempenhos \(R\$ 600,00\)\. Antes de anulá-lo inteiro, anule o saldo não liquidado de cada subempenho/);
    expect(await prisma.empenho.count({ where: { estornoDeId: e2 } })).toBe(0);
    await anularSaldoDoSubempenho(prisma, { subempenhoId: s.subempenhoId, valor: "600.00", data: D("2026-03-02"), motivo: "Serviço não prestado", criadoPor: POR });
    await total();
    expect(await prisma.empenho.count({ where: { estornoDeId: e2 } })).toBe(1);
  });

  it("t6: duas emissões ao mesmo tempo sobre o mesmo livre — a segunda espera a trava da ficha e é recusada", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    let pegou = (): void => undefined;
    let liberar = (): void => undefined;
    const pronto = new Promise<void>((r) => (pegou = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const primeira = prisma.$transaction(
      async (tx) => {
        await travarFichas(tx, [FICHA]);
        await tx.subempenho.create({ data: { empenhoId: e, numero: 1, valor: "700.00", data: D("2026-02-05"), historico: "Emissão A simultânea", criadoPor: POR } });
        pegou();
        await segura;
      },
      { timeout: 60000 }
    );
    await pronto;
    const segunda = sub(e, "700.00").then(() => "(gravou)", (x: unknown) => (x as Error).message);
    let vista = false;
    for (let i = 0; i < 400 && !vista; i += 1) {
      const [l] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND wait_event = 'advisory' AND datname = current_database()`;
      vista = (l?.n ?? 0n) > 0n;
      if (!vista) await new Promise((r) => setTimeout(r, 25));
    }
    liberar();
    await primeira;
    expect(vista, "a segunda emissão não chegou a esperar a trava da ficha").toBe(true);
    expect(await segunda).toMatch(/não cabe no saldo livre do empenho NE-EST: .*já repartido em subempenhos R\$ 700,00, livre R\$ 300,00/);
    expect(await prisma.subempenho.count()).toBe(1);
  });

  it("t7: sem a ação, nem emite nem anula; a recusa nomeia a ação", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    const s = await sub(e, "100.00");
    const u = await prisma.usuario.create({ data: { identificador: "so.le.despesa@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_DESPESA", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_DESPESA" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => sub(e, "100.00", "2026-02-05", "so.le.despesa@cg.pb.gov.br"))).toMatch(/EMPENHAR/);
    expect(await recusa(() => anularSaldoDoSubempenho(prisma, { subempenhoId: s.subempenhoId, valor: "10.00", data: D("2026-03-01"), motivo: "Tentativa sem a ação", criadoPor: "so.le.despesa@cg.pb.gov.br" }))).toMatch(/ANULAR_EMPENHO_PARCIAL/);
    expect(await prisma.subempenho.count()).toBe(1);
    expect(await prisma.anulacaoDeSubempenho.count()).toBe(0);
  });

  it("t8: o estimativo liquidado direto aceita subempenho no livre (a restrição é só do global)", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    await liquida(e, "NL-1", "100.00");
    expect((await sub(e, "900.00")).numero).toBe(1);
    expect(await quadro(e)).toMatchObject({ liquidadoDireto: "100.00", repartido: "900.00", livre: "0.00" });
  });

  it("t9: o global repartido não se liquida direto; anulado o saldo dos subempenhos, volta a se liquidar direto", async () => {
    const g = await novoEmpenho("NE-GLO", "GLOBAL");
    const s = await sub(g, "300.00");
    expect(await recusa(() => liquida(g, "NL-1", "100.00"))).toMatch(/O empenho global NE-GLO está repartido em subempenhos \(R\$ 300,00\): ele se liquida pelos subempenhos/);
    expect(await prisma.liquidacao.count()).toBe(0);
    await anularSaldoDoSubempenho(prisma, { subempenhoId: s.subempenhoId, valor: "300.00", data: D("2026-02-06"), motivo: "Etapa cancelada", criadoPor: POR });
    await liquida(g, "NL-1", "100.00");
    expect(await recusa(() => sub(g, "100.00"))).toMatch(/já tem liquidação de R\$ 100,00 feita direto nele/);
  });

  it("t10: o estorno da anulação parcial da liquidação não devolve ao subempenho mais que o saldo dele, nem ao empenho mais que o empenhado", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    const s = await sub(e, "100.00");
    const { liquidacaoId } = await liquida(e, "NL-1", "100.00", s.subempenhoId);
    const ap = await anularLiquidacaoParcial({ originalId: liquidacaoId, numero: "NL-1-AP", valor: "40.00", data: D("2026-02-11"), motivo: "Fatura com valor a maior", criadoPor: POR }, deps());
    await anularSaldoDoSubempenho(prisma, { subempenhoId: s.subempenhoId, valor: "40.00", data: D("2026-02-12"), motivo: "Parcela encerrada", criadoPor: POR });
    const estornar = (anulacaoId: string, numero: string) => estornarAnulacaoParcial({ anulacaoId, nivel: "LIQUIDACAO", numero, data: D("2026-02-13"), motivo: "Anulação lançada por engano", criadoPor: POR }, deps());
    expect(await recusa(() => estornar(ap.anulacaoId, "NL-1-AP-EST"))).toMatch(/O estorno devolveria R\$ 40,00 ao subempenho NE-EST\/1, que tem só R\$ 0,00 de saldo/);
    expect(await quadro(e)).toMatchObject({ subs: ["1:60.00/60.00/0.00"] });

    // O defeito antigo do mesmo caminho: o empenho anulado em parte depois da anulação da liquidação.
    const o = await novoEmpenho("NE-ORD", "ORDINARIO");
    const l = await liquida(o, "NL-2", "1000.00");
    const ap2 = await anularLiquidacaoParcial({ originalId: l.liquidacaoId, numero: "NL-2-AP", valor: "400.00", data: D("2026-02-11"), motivo: "Fatura com valor a maior", criadoPor: POR }, deps());
    await anularEmpenhoParcial({ originalId: o, numero: "NE-ORD-AP", valor: "400.00", data: D("2026-02-12"), motivo: "Saldo não utilizado do empenho", criadoPor: POR }, deps());
    expect(await recusa(() => estornar(ap2.anulacaoId, "NL-2-AP-EST"))).toMatch(/O estorno devolveria R\$ 400,00 ao liquidado do empenho NE-ORD, que passaria do empenhado \(R\$ 600,00, já liquidados R\$ 600,00\)/);
    expect(await prisma.liquidacao.count({ where: { estornoDeId: { not: null } } })).toBe(0);
  });

  it("t11: as datas são do dia civil do ente — 23h de 31/01 no ente (02h UTC de 01/02) antecede o empenho de 01/02", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    const borda = (iso: string) => emitirSubempenho(prisma, { empenhoId: e, valor: "10.00", data: new Date(iso), historico: "Parcela na borda", criadoPor: POR });
    expect(await recusa(() => borda("2026-02-01T02:00:00Z"))).toMatch(/data do subempenho \(31\/01\/2026\) é anterior à do empenho NE-EST \(01\/02\/2026\)/);
    expect((await borda("2026-02-01T03:30:00Z")).numero).toBe(1);
  });

  it("t12: nem sobre empenho anulado, nem sobre a linha da anulação", async () => {
    const e = await novoEmpenho("NE-EST", "ESTIMATIVO");
    const { empenhoId: anulacao } = await anularEmpenho({ empenhoId: e, numero: "NE-ANUL", data: D("2026-02-02"), historico: "Empenho sem uso", criadoPor: POR }, deps());
    expect(await recusa(() => sub(e, "10.00"))).toMatch(/O empenho NE-EST está anulado: não se subempenha/);
    expect(await recusa(() => sub(anulacao, "10.00"))).toMatch(/O documento NE-ANUL é uma anulação de empenho, não um empenho/);
    expect(await prisma.subempenho.count()).toBe(0);
  });
});
