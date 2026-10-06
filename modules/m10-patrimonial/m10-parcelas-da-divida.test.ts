import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { cadastrarDivida } from "./divida.js";
import { comparativoDaDivida, informarParcelasDaDivida, substituirParcelaDaDivida } from "./parcelas-da-divida.js";

/**
 * V36 — AS PARCELAS INFORMADAS DA DÍVIDA E O COMPARATIVO COM O AMORTIZADO (TR 5.10.1.84).
 *
 * N=2 em dívidas (o pago de uma não vaza para a outra) e em parcelas; uma amortização às 23h30 do último dia do mês
 * (hora de borda: em UTC ela já é do mês seguinte e cairia na parcela errada); uma amortização estornada (não conta);
 * pagamento depois do último vencimento (linha própria). Cada recusa afirma o motivo e que nada foi gravado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const POR = "contabilidade@cg.pb.gov.br";
const SEM_PERMISSAO = "so-consulta-divida@cg.pb.gov.br";

let A = "";
let B = "";

async function divida(identificador: string): Promise<string> {
  const { dividaId } = await cadastrarDivida(prisma, {
    identificador,
    credorNome: "Banco de fomento (fixture)",
    credorDocumento: "00360305000104",
    tipo: "CONTRATUAL",
    leiAutorizativa: "Lei de teste",
    objeto: "Financiamento de teste",
    contaContabilId: "c-divida",
    criadoPor: POR,
  });
  return dividaId;
}

async function movimento(dividaId: string, tipo: "INGRESSO_OPERACAO_CREDITO" | "AMORTIZACAO", valor: string, instante: string): Promise<string> {
  const m = await prisma.movimentoDivida.create({
    data: { dividaId, tipo, valor, dataMovimento: new Date(instante), motivo: "fixture", criadoPor: POR },
    select: { id: true },
  });
  return m.id;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({
    data: { id: "c-divida", codigo: "2.2.2.1.1.00.00", nome: "Empréstimos a longo prazo", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "P" },
  });
  A = await divida("FIX-A");
  B = await divida("FIX-B");
  await movimento(A, "INGRESSO_OPERACAO_CREDITO", "100000.00", "2026-01-10T15:00:00Z");
  await movimento(B, "INGRESSO_OPERACAO_CREDITO", "50000.00", "2026-01-10T15:00:00Z");

  await movimento(A, "AMORTIZACAO", "10000.00", "2026-02-28T15:00:00Z"); // no dia do vencimento: entra na parcela 1
  await movimento(A, "AMORTIZACAO", "9000.00", "2026-04-01T02:30:00Z"); // 31/03 às 23h30 no ente: parcela 2
  const estornada = await movimento(A, "AMORTIZACAO", "5000.00", "2026-04-15T15:00:00Z");
  await prisma.movimentoDivida.create({
    data: { dividaId: A, tipo: "ESTORNO_AMORTIZACAO", valor: "5000.00", dataMovimento: new Date("2026-04-20T15:00:00Z"), estornoDeId: estornada, motivo: "pagamento anulado", criadoPor: POR },
  });
  await movimento(A, "AMORTIZACAO", "1000.00", "2026-06-01T15:00:00Z"); // depois do último vencimento
  await movimento(B, "AMORTIZACAO", "2000.00", "2026-02-10T15:00:00Z"); // da outra dívida: não pode aparecer na A

  const leitor = await prisma.perfil.create({
    data: { nome: "SO_CONSULTA_DIVIDA", descricao: "so consulta", criadoPor: POR, permissoes: { create: [{ acao: "CONSULTAR_DIVIDA", criadoPor: POR }] } },
    select: { id: true },
  });
  const u = await prisma.usuario.create({ data: { identificador: SEM_PERMISSAO, nome: SEM_PERMISSAO, criadoPor: POR }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: leitor.id, criadoPor: POR } });
}

const CRONOGRAMA_A = [
  { numero: 1, vencimento: "2026-02-28", valorPrincipal: "10000.00", valorEncargos: "500.00" },
  { numero: 2, vencimento: "2026-03-31", valorPrincipal: "10000.00", valorEncargos: null },
  { numero: 3, vencimento: "2026-04-30", valorPrincipal: "10000.00", valorEncargos: null },
];

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

describe("M10 V36 — parcelas da dívida e o comparativo informado × amortizado", () => {
  beforeEach(semear, 30000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: cada parcela recebe o amortizado no seu intervalo, pelo dia civil; estorno não conta; a outra dívida não vaza", async () => {
    await informarParcelasDaDivida(prisma, { dividaId: A, parcelas: CRONOGRAMA_A, criadoPor: POR });
    await informarParcelasDaDivida(prisma, { dividaId: B, parcelas: [{ numero: 1, vencimento: "2026-02-28", valorPrincipal: "2000.00", valorEncargos: null }], criadoPor: POR });

    const a = await comparativoDaDivida(prisma, A);
    expect(a.linhas.map((l) => [l.numero, l.vencimento, l.principalInformado.toFixed(2), l.amortizadoNoPeriodo.toFixed(2), l.diferenca.toFixed(2)])).toEqual([
      [1, "2026-02-28", "10000.00", "10000.00", "0.00"],
      [2, "2026-03-31", "10000.00", "9000.00", "-1000.00"],
      [3, "2026-04-30", "10000.00", "0.00", "-10000.00"],
      [null, null, "0.00", "1000.00", "1000.00"],
    ]);
    expect(a.linhas[0]!.encargosInformados?.toFixed(2)).toBe("500.00");
    expect([a.totalInformado.toFixed(2), a.totalAmortizado.toFixed(2), a.saldo.toFixed(2)]).toEqual(["30000.00", "20000.00", "80000.00"]);

    const b = await comparativoDaDivida(prisma, B);
    expect(b.linhas.map((l) => [l.numero, l.amortizadoNoPeriodo.toFixed(2)])).toEqual([[1, "2000.00"]]);
    expect(b.saldo.toFixed(2)).toBe("48000.00");
  });

  it("t2: número repetido — no lote ou já informado — recusa nomeando a parcela, e nada é gravado", async () => {
    const dobrada = [CRONOGRAMA_A[0]!, { ...CRONOGRAMA_A[1]!, numero: 1 }];
    expect(await recusa(() => informarParcelasDaDivida(prisma, { dividaId: A, parcelas: dobrada, criadoPor: POR }))).toMatch(/parcela 1 aparece duas vezes[\s\S]*Nada foi gravado/);
    await informarParcelasDaDivida(prisma, { dividaId: A, parcelas: CRONOGRAMA_A.slice(0, 2), criadoPor: POR });
    expect(await recusa(() => informarParcelasDaDivida(prisma, { dividaId: A, parcelas: CRONOGRAMA_A.slice(1), criadoPor: POR }))).toMatch(/FIX-A já tem a\(s\) parcela\(s\) 2[\s\S]*correção da parcela[\s\S]*Nada foi gravado/);
    expect(await prisma.parcelaDaDivida.count({ where: { dividaId: A } })).toBe(2);
    // A parcela 2 da OUTRA dívida não é repetição.
    await informarParcelasDaDivida(prisma, { dividaId: B, parcelas: [CRONOGRAMA_A[1]!], criadoPor: POR });
  });

  it("t3: corrigir grava outra no lugar; a corrigida sai do comparativo e não se corrige de novo", async () => {
    await informarParcelasDaDivida(prisma, { dividaId: A, parcelas: CRONOGRAMA_A, criadoPor: POR });
    const p2 = await prisma.parcelaDaDivida.findFirstOrThrow({ where: { dividaId: A, numero: 2 }, select: { id: true } });
    await substituirParcelaDaDivida(prisma, { parcelaId: p2.id, vencimento: "2026-03-31", valorPrincipal: "9000.00", valorEncargos: null, motivo: "aditivo do contrato", criadoPor: POR });
    const a = await comparativoDaDivida(prisma, A);
    expect(a.linhas.filter((l) => l.numero === 2).map((l) => [l.principalInformado.toFixed(2), l.diferenca.toFixed(2), l.corrigida])).toEqual([["9000.00", "0.00", true]]);
    expect(a.totalInformado.toFixed(2)).toBe("29000.00");
    expect(await recusa(() => substituirParcelaDaDivida(prisma, { parcelaId: p2.id, vencimento: "2026-03-31", valorPrincipal: "8000.00", valorEncargos: null, motivo: "de novo", criadoPor: POR }))).toMatch(/parcela 2 já foi corrigida[\s\S]*Nada foi gravado/);
    expect(await prisma.parcelaDaDivida.count({ where: { dividaId: A } })).toBe(4);
  });

  it("t4: NEGAÇÃO — quem só consulta a dívida não informa nem corrige parcela; o motivo nomeia a ação", async () => {
    expect(await recusa(() => informarParcelasDaDivida(prisma, { dividaId: A, parcelas: CRONOGRAMA_A, criadoPor: SEM_PERMISSAO }))).toMatch(/ACESSO NEGADO[\s\S]*CADASTRAR_DIVIDA/);
    expect(await prisma.parcelaDaDivida.count()).toBe(0);
    await informarParcelasDaDivida(prisma, { dividaId: A, parcelas: CRONOGRAMA_A, criadoPor: POR });
    const p1 = await prisma.parcelaDaDivida.findFirstOrThrow({ where: { dividaId: A, numero: 1 }, select: { id: true } });
    expect(await recusa(() => substituirParcelaDaDivida(prisma, { parcelaId: p1.id, vencimento: "2026-02-28", valorPrincipal: "1.00", valorEncargos: null, motivo: "tentativa", criadoPor: SEM_PERMISSAO }))).toMatch(/ACESSO NEGADO[\s\S]*CADASTRAR_DIVIDA/);
    expect(await prisma.parcelaDaDivida.count()).toBe(3);
  });

  it("t5: parcela sem valor ou com valor negativo é recusada; parcela só de encargos (carência) entra", async () => {
    expect(await recusa(() => informarParcelasDaDivida(prisma, { dividaId: A, parcelas: [{ numero: 1, vencimento: "2026-02-28", valorPrincipal: "0.00", valorEncargos: null }], criadoPor: POR }))).toMatch(/parcela 1 não tem valor[\s\S]*Nada foi gravado/);
    expect(await recusa(() => informarParcelasDaDivida(prisma, { dividaId: A, parcelas: [{ numero: 1, vencimento: "2026-02-28", valorPrincipal: "-5.00", valorEncargos: null }], criadoPor: POR }))).toMatch(/parcela 1 tem valor negativo/);
    await informarParcelasDaDivida(prisma, { dividaId: A, parcelas: [{ numero: 1, vencimento: "2026-02-28", valorPrincipal: "0.00", valorEncargos: "700.00" }], criadoPor: POR });
    expect(await prisma.parcelaDaDivida.count()).toBe(1);
  });
});
