import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { criarM01Deps, saldoDasContas } from "./adapter-prisma.js";
import { implantarSaldosIniciais, lerBalancete, previaDaImplantacao } from "./implantacao-de-saldos.js";
import { estornarLancamento } from "./servico.js";

/**
 * V32 — A IMPLANTAÇÃO DOS SALDOS INICIAIS.
 *
 * O balancete de N=2 subsistemas, conferido à mão:
 *   patrimonial   1.1.1.1.1.00.00  D 10.500,00   ·   2.1.1.1.1.00.00  C  4.000,00   ·   2.3.7.1.1.00.00  C 6.500,00
 *                 devedor 10.500,00 = credor 4.000,00 + 6.500,00 ✓
 *   controle      7.9.1.1.1.00.00  D  1.200,00   ·   8.9.1.1.1.00.00  C  1.200,00 ✓
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const LEITOR = "so.consulta.implantacao@cg.pb.gov.br";

const BALANCETE = [
  "Conta;Saldo devedor;Saldo credor",
  "1.1.1.1.1.00.00;10.500,00;",
  "2.1.1.1.1.00.00;;4000.00",
  "2.3.7.1.1.00.00;;6.500,00",
  "",
  "7.9.1.1.1.00.00;1.200,00;0",
  "8.9.1.1.1.00.00;0;1.200,00",
].join("\n");

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { codigo: "1.1.1.1.1.00.00", nome: "Caixa", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: "2.1.1.1.1.00.00", nome: "Pessoal a pagar", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: "2.3.7.1.1.00.00", nome: "Superávits acumulados", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: "7.9.1.1.1.00.00", nome: "Controle devedor", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { codigo: "8.9.1.1.1.00.00", nome: "Controle credor", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { codigo: "1.1.0.0.0.00.00", nome: "Ativo circulante", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false },
    ],
  });
  const perfil = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_IMPLANTACAO", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_CONTABILIDADE", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: LEITOR, nome: LEITOR, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: perfil.id, criadoPor: POR } });
}

async function saldo(codigo: string, credora = false): Promise<string> {
  const s = await saldoDasContas(prisma, [codigo], null);
  return (credora ? s.negated() : s).toFixed(2);
}

describe("V32 — implantação dos saldos iniciais", () => {
  beforeEach(semear);

  it("t1: a leitura do balancete — cabeçalho e linha vazia ignorados, os dois formatos de número", () => {
    const l = lerBalancete(BALANCETE);
    expect(l.problemas).toEqual([]);
    expect(l.linhas.map((x) => [x.linha, x.conta, x.devedor.toFixed(2), x.credor.toFixed(2)])).toEqual([
      [2, "1.1.1.1.1.00.00", "10500.00", "0.00"],
      [3, "2.1.1.1.1.00.00", "0.00", "4000.00"],
      [4, "2.3.7.1.1.00.00", "0.00", "6500.00"],
      [6, "7.9.1.1.1.00.00", "1200.00", "0.00"],
      [7, "8.9.1.1.1.00.00", "0.00", "1200.00"],
    ]);
    const ruim = lerBalancete("1.1.1.1.1.00.00;10;5\n2.1.1.1.1.00.00;abc;\n1.1.1.1.1.00.00;1;\n2.1.1.1.1.00.00;1");
    expect(ruim.problemas).toEqual([
      "Linha 1 (1.1.1.1.1.00.00): saldo devedor e credor ao mesmo tempo; informe o saldo líquido num só lado.",
      "Linha 2 (2.1.1.1.1.00.00): valor que não é número.",
      "Linha 4: esperava conta;devedor;credor e vieram 2 campo(s).",
    ]);
  });

  it("t2: implanta N=2 subsistemas; o mesmo arquivo de novo é o mesmo lançamento; outro arquivo é recusado até o estorno", async () => {
    const previa = await previaDaImplantacao(prisma, BALANCETE);
    expect(previa.podeImplantar).toBe(true);
    expect(previa.totais).toEqual([
      { subsistema: "PATRIMONIAL", devedor: "10500.00", credor: "10500.00", diferenca: "0.00" },
      { subsistema: "CONTROLE", devedor: "1200.00", credor: "1200.00", diferenca: "0.00" },
    ]);
    const r1 = await implantarSaldosIniciais(prisma, { texto: BALANCETE, dia: "2026-01-01", criadoPor: POR });
    expect(await saldo("1.1.1.1.1.00.00")).toBe("10500.00");
    expect(await saldo("2.3.7.1.1.00.00", true)).toBe("6500.00");
    expect(await saldo("8.9.1.1.1.00.00", true)).toBe("1200.00");

    const r2 = await implantarSaldosIniciais(prisma, { texto: BALANCETE.replace("Conta;", "CONTA;"), dia: "2026-01-01", criadoPor: POR });
    expect([r2.repetido, r2.lancamentoId]).toEqual([true, r1.lancamentoId]);
    expect(await prisma.lancamentoContabil.count()).toBe(1);

    const outro = BALANCETE.replace("10.500,00", "10.600,00").replace("6.500,00", "6.600,00");
    await expect(implantarSaldosIniciais(prisma, { texto: outro, dia: "2026-01-02", criadoPor: POR })).rejects.toThrow(/2026 já tem saldos implantados[\s\S]*estorne/);
    await estornarLancamento({ lancamentoId: r1.lancamentoId, numeroControleEstorno: "EST-IMPLANTACAO-2026", dataEstorno: new Date("2026-01-02T15:00:00Z"), criadoPor: POR }, criarM01Deps(prisma));
    await implantarSaldosIniciais(prisma, { texto: outro, dia: "2026-01-02", criadoPor: POR });
    expect(await saldo("1.1.1.1.1.00.00")).toBe("10600.00");
  });

  it("t3: balancete que não fecha, conta sintética ou fora do plano — recusa nomeando, e nada é gravado", async () => {
    const naoFecha = BALANCETE.replace("4000.00", "3999.99");
    await expect(implantarSaldosIniciais(prisma, { texto: naoFecha, dia: "2026-01-01", criadoPor: POR })).rejects.toThrow(/patrimonial não fecha: devedor 10500\.00, credor 10499\.99, diferença 0\.01/);
    const sintetica = `${BALANCETE}\n1.1.0.0.0.00.00;5,00;\n9.9.9.9.9.99.99;;5,00`;
    await expect(implantarSaldosIniciais(prisma, { texto: sintetica, dia: "2026-01-01", criadoPor: POR })).rejects.toThrow(/1\.1\.0\.0\.0\.00\.00 é sintética[\s\S]*9\.9\.9\.9\.9\.99\.99 não está no plano/);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });

  it("t4: quem só consulta não implanta — recusa nomeando a ação, sem conferir nada", async () => {
    await expect(implantarSaldosIniciais(prisma, { texto: BALANCETE, dia: "2026-01-01", criadoPor: LEITOR })).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_LANCAMENTO_MANUAL/);
    expect(await prisma.lancamentoContabil.count()).toBe(0);
  });
});
