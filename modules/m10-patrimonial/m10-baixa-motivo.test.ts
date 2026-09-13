import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { baixarBem, registrarEntradaAvulsa, valorContabilDoBem } from "./patrimonio.js";

/**
 * O MOTIVO DE BAIXA DO ROL DO ENTE, LIGADO AO ATO (TR 5.19.30; V3, pacote 2).
 *
 * O rol é TABELA (`MotivoDeBaixa`, cadastrado pelo ente). Até aqui a baixa só levava texto
 * livre; agora leva também a classificação, e o histórico do lançamento cita o código. N=2:
 * um motivo ATIVO e um INATIVO — o inativo ainda classifica as baixas antigas, e por isso
 * não se apaga, mas não classifica baixa nova.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br";
const CLASSE = "cl-mov";
const BEM = "bem-1";
let motivoAtivo = "";
let motivoInativo = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-imob", codigo: "1.2.3.1.1.01.00", nome: "Bens móveis", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-vpa", codigo: "4.5.9.1.1.00.00", nome: "VPA incorporação", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-vpd", codigo: "3.6.1.1.1.00.00", nome: "VPD baixa de ativos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.classeDeBens.create({
    data: { id: CLASSE, codigo: "1.2.3.1.1.02", descricao: "Móveis", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
  });
  await prisma.bemPatrimonial.create({
    data: { id: BEM, numeroTombamento: "TOMB-0001", descricao: "Armário", classeDeBensId: CLASSE, dataAquisicao: new Date("2026-01-10T12:00:00Z"), criadoPor: POR },
  });
  await prisma.roteiroPatrimonial.createMany({
    data: [
      { tipo: "AVALIACAO_INICIAL", contaDebitoId: "c-imob", contaCreditoId: "c-vpa", criadoPor: POR },
      { tipo: "BAIXA_ALIENACAO", contaDebitoId: "c-vpd", contaCreditoId: "c-imob", criadoPor: POR },
      { tipo: "DOACAO_REALIZADA", contaDebitoId: "c-vpd", contaCreditoId: "c-imob", criadoPor: POR },
    ],
  });
  await registrarEntradaAvulsa(prisma, {
    classeDeBensId: CLASSE, bemId: BEM, tipo: "AVALIACAO_INICIAL", valor: "1000.00",
    dataMovimento: new Date("2026-02-01T12:00:00Z"), motivo: "Avaliação inicial do armário.", criadoPor: POR,
  });
  const a = await prisma.motivoDeBaixa.create({ data: { codigo: "DOACAO", descricao: "Doação a entidade sem fins lucrativos", criadoPor: POR }, select: { id: true } });
  const i = await prisma.motivoDeBaixa.create({ data: { codigo: "FURTO", descricao: "Furto ou roubo", ativo: false, criadoPor: POR }, select: { id: true } });
  motivoAtivo = a.id;
  motivoInativo = i.id;
}

const BAIXA = {
  tipo: "DOACAO_REALIZADA" as const,
  classeDeBensId: CLASSE,
  bemId: BEM,
  valor: "400.00",
  dataMovimento: new Date("2026-03-01T12:00:00Z"),
  motivo: "Doado à APAE conforme termo 7/2026.",
  criadoPor: POR,
};

describe("o motivo de baixa do rol, ligado ao ato", () => {
  beforeEach(semear);

  it("t1: a baixa grava o motivo do rol E preserva o texto; o histórico do lançamento cita o código", async () => {
    const r = await baixarBem(prisma, { ...BAIXA, motivoDeBaixaId: motivoAtivo });
    const m = await prisma.movimentoPatrimonial.findUniqueOrThrow({
      where: { id: r.movimentoId },
      select: { motivoDeBaixaId: true, motivo: true, lancamento: { select: { historico: true } } },
    });
    expect(m.motivoDeBaixaId).toBe(motivoAtivo);
    expect(m.motivo).toBe(BAIXA.motivo);
    expect(m.lancamento.historico).toBe("DOACAO_REALIZADA [DOACAO — Doação a entidade sem fins lucrativos]: Doado à APAE conforme termo 7/2026.");
    expect((await valorContabilDoBem(prisma, BEM)).toFixed(2)).toBe("600.00");
  });

  it("t2: motivo INATIVO recusa nomeando, e nada é gravado — nem movimento, nem lançamento", async () => {
    const movs = await prisma.movimentoPatrimonial.count();
    const lancs = await prisma.lancamentoContabil.count();
    await expect(baixarBem(prisma, { ...BAIXA, motivoDeBaixaId: motivoInativo })).rejects.toThrow(/MOTIVO DE BAIXA INATIVO[\s\S]*FURTO/);
    expect(await prisma.movimentoPatrimonial.count()).toBe(movs);
    expect(await prisma.lancamentoContabil.count()).toBe(lancs);
    expect((await valorContabilDoBem(prisma, BEM)).toFixed(2)).toBe("1000.00");
  });

  it("t3: motivo INEXISTENTE recusa nomeando o rol", async () => {
    await expect(baixarBem(prisma, { ...BAIXA, motivoDeBaixaId: "nao-existe" })).rejects.toThrow(/MOTIVO DE BAIXA INEXISTENTE[\s\S]*Motivos de Baixa/);
    expect(await prisma.movimentoPatrimonial.count({ where: { tipo: "DOACAO_REALIZADA" } })).toBe(0);
  });

  it("t4: sem motivo do rol a baixa continua válida (baixa por classe, sem bem) — e o histórico não inventa colchetes", async () => {
    const r = await baixarBem(prisma, { ...BAIXA, bemId: undefined });
    const m = await prisma.movimentoPatrimonial.findUniqueOrThrow({
      where: { id: r.movimentoId },
      select: { motivoDeBaixaId: true, lancamento: { select: { historico: true } } },
    });
    expect(m.motivoDeBaixaId).toBeNull();
    expect(m.lancamento.historico).toBe("DOACAO_REALIZADA: Doado à APAE conforme termo 7/2026.");
  });
});
