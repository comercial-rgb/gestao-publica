import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { DIA_DE_BORDA } from "../../test/instantes.js";
import { travar } from "../../packages/locks/index.js";
import { registrarIngressoExtra } from "./extraorcamentario.js";
import { roteiroIngressoExtra } from "./dominio.js";
import { saldoDaContaBancaria } from "../m09-tesouraria/caixa.js";
import { balancoFinanceiro } from "../m12-relatorios/balanco-financeiro.js";
import { linhasDoSuperavitPorFonte } from "../m12-relatorios/superavit-por-fonte.js";
import { demonstracaoFluxosDeCaixa } from "../m12-relatorios/dfc.js";
import { estornarMovimentoBancario } from "../m09-tesouraria/movimentacao.js";
import {
  anularMovimentoDeRealizavel,
  baixarRealizavel,
  cadastrarCategoriaDeRealizavel,
  constituirRealizavel,
  decidirContaDoRealizavel,
  saldoDoRealizavel,
} from "./realizavel.js";

/**
 * V39-R3 (R3-016, V39-030) — O REALIZÁVEL DE NATUREZA ATIVA.
 *
 * Aritmética à mão (N=2 devedores), conferida no RAZÃO, no SALDO DA CONTA BANCÁRIA, no ANEXO 13 e no SUPERÁVIT POR FONTE —
 * não no saldo do próprio serviço:
 *   caução recebida (ingresso extraorçamentário) .. caixa +5.000,00
 *   A constitui 1.000,00, B constitui 400,00 ...... caixa −1.400,00
 *   A baixa 300,00 ................................ caixa   +300,00
 *   caixa ......................................... 3.900,00  (= 5.000 + 300 − 1.400)
 *   conta do ativo ................................ 1.100,00  (saldo A 700,00, B 400,00)
 * As contas são do plano oficial (docs/oficial/tce-pb/pcasp-tcepb/plano-contas-2022.csv), declaradas na fixture; a
 * decisão da conta de cada categoria é do ente.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const SO_CONSULTA = "consulta.realizavel@cg.pb.gov.br";
const CAIXA = "1.1.1.1.1.19.00"; // BANCOS CONTA MOVIMENTO - DEMAIS CONTAS
const ATIVO = "1.1.3.5.1.02.00"; // DEPÓSITOS JUDICIAIS
const ATIVO_2 = "1.1.3.1.1.99.00"; // ADIANTAMENTOS DIVERSOS CONCEDIDOS
const ESTOQUE = "1.1.5.6.1.01.00"; // MATERIAL DE CONSUMO
const GARANTIAS = "2.1.8.8.3.02.00"; // GARANTIAS (passivo)
const SINTETICA = "1.1.3.5.0.00.00"; // DEPÓSITOS RESTITUÍVEIS E VALORES VINCULADOS - A RECEBER
const REDUTORA = "1.1.3.9.1.04.01"; // (-) AJUSTE PARA PERDAS EM CRÉDITOS ADMINISTRATIVOS
const A = "12345678000195";
const B = "52998224725";
const conta = (id: string, codigo: string, natureza: "DEVEDORA" | "CREDORA", analitica = true) => ({ id, codigo, nome: `Conta ${codigo}`, naturezaSaldo: natureza, nivel: 5, analitica });

let categoriaId = "";

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      conta("c-caixa", CAIXA, "DEVEDORA"), conta("c-ativo", ATIVO, "DEVEDORA"), conta("c-ativo2", ATIVO_2, "DEVEDORA"), conta("c-est", ESTOQUE, "DEVEDORA"),
      conta("c-gar", GARANTIAS, "CREDORA"), conta("c-sint", SINTETICA, "DEVEDORA", false), conta("c-red", REDUTORA, "CREDORA"),
    ],
  });
  await prisma.fonteRecurso.createMany({ data: [{ id: "fnt-500", codigo: "500", descricao: "Livre", codigoTce: "500" }, { id: "fnt-540", codigo: "540", descricao: "FUNDEB", codigoTce: "540" }] });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: "fnt-500", contaContabilId: "c-caixa" } });
  // A conta admite também a fonte 540 (TR 5.10.2.6): é o que permite provar que a baixa volta à fonte de onde saiu.
  await prisma.fonteDaContaBancaria.createMany({ data: [{ contaBancariaId: "cb1", fonteId: "fnt-500", criadoPor: "TESTE" }, { contaBancariaId: "cb1", fonteId: "fnt-540", criadoPor: "TESTE" }] });
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: POR } });
  const u = await prisma.usuario.create({ data: { identificador: SO_CONSULTA, nome: SO_CONSULTA, criadoPor: "TESTE" }, select: { id: true } });
  const pf = await prisma.perfil.create({ data: { nome: "SO-CONSULTA-REALIZAVEL", descricao: "perfil do teste", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_FINANCEIRO", unidadeOrcId: null, criadoPor: "TESTE" }] } }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: pf.id, criadoPor: "TESTE" } });
  // O dinheiro que está no banco: uma caução recebida (ingresso extraorçamentário, que o Anexo 13 lê).
  const caucao = await prisma.tipoConsignacao.create({ data: { codigo: "CAUCAO", descricao: "Caução", criadoPor: "TESTE", contaPassivo: { connect: { codigo: GARANTIAS } } }, select: { id: true } });
  await registrarIngressoExtra(
    prisma,
    { tipoConsignacaoId: caucao.id, credorConsignatario: "Construtora Alfa Ltda", contaBancaria: "CC-001", fonteId: "fnt-500", valor: "5000.00", data: DIA_DE_BORDA(2026, 3, 1), historico: "Caução do contrato 1/2026", criadoPor: POR },
    roteiroIngressoExtra({ disponibilidade: CAIXA, consignacaoAPagar: GARANTIAS }),
  );
  categoriaId = (await cadastrarCategoriaDeRealizavel(prisma, { codigo: "DEP-JUD", descricao: "Depósito judicial restituível", criadoPor: POR })).categoriaId;
}

const decidir = (contaAtivoCodigo: string | null, ativa = true) =>
  decidirContaDoRealizavel(prisma, { categoriaId, contaAtivoCodigo, ativa, fundamento: "Orientação contábil do ente (fixture)", criadoPor: POR });
const mov = (devedor: string, valor: string, o: { data?: string; criadoPor?: string; fonteId?: string } = {}) => ({
  categoriaId, devedor, valor, data: o.data ?? "2026-03-10", historico: "Depósito judicial no processo 123", documento: "Guia de depósito 456", contaBancariaId: "cb1", fonteId: o.fonteId ?? "fnt-500", criadoPor: o.criadoPor ?? POR,
});
const saldo = (devedor: string, contaAtivoId = "c-ativo", fonteId = "fnt-500") => saldoDoRealizavel(prisma, { categoriaId, devedor, contaAtivoId, fonteId }).then((m) => m.toFixed(2));
async function saldoNoRazao(codigo: string): Promise<string> {
  const ps = await prisma.partidaContabil.findMany({ where: { conta: { codigo } }, select: { tipo: true, valor: true } });
  let centavos = 0n;
  for (const p of ps) {
    const c = BigInt(p.valor.toFixed(2).replace(".", ""));
    centavos += p.tipo === "DEBITO" ? c : -c;
  }
  const neg = centavos < 0n;
  const abs = neg ? -centavos : centavos;
  return `${neg ? "-" : ""}${(abs / 100n).toString()}.${(abs % 100n).toString().padStart(2, "0")}`;
}

describe("V39-R3 — realizável de natureza ativa: conta decidida pelo ente, constituição, baixa, saldo e anulação, pelo caixa", { timeout: 60000 }, () => {
  beforeEach(semear, 60000);
  afterAll(async () => prisma.$disconnect());

  it("sem a conta decidida pelo ente não constitui; a conta tem de ser analítica, de crédito realizável e de saldo devedor", async () => {
    await expect(constituirRealizavel(prisma, mov(A, "1000.00"))).rejects.toThrow(/não tem a conta do ativo decidida pelo ente/);
    await expect(decidir(SINTETICA)).rejects.toThrow(/é sintética/);
    await expect(decidir(GARANTIAS)).rejects.toThrow(/não é de crédito realizável do ativo .* dinheiro de terceiro guardado pelo município é consignação, no passivo/);
    await expect(decidir(ESTOQUE)).rejects.toThrow(/não é de crédito realizável do ativo/);
    await expect(decidir(REDUTORA)).rejects.toThrow(/tem saldo credor \(é redutora/);
    await expect(decidir(null)).rejects.toThrow(/Categoria ativa precisa da conta do ativo/);
    await decidir(ATIVO);
    // Suspensa MANTENDO a conta: é a decisão do ente, e não a falta de conta, que impede a constituição.
    await decidir(ATIVO, false);
    await expect(constituirRealizavel(prisma, mov(A, "1000.00"))).rejects.toThrow(/ou está suspensa/);
    expect(await prisma.movimentoDeRealizavel.count()).toBe(0);
  });

  it("N=2 devedores pelo caixa: razão, saldo da conta bancária, Anexo 13 e superávit por fonte fecham; nada vira consignação", async () => {
    await decidir(ATIVO);
    await constituirRealizavel(prisma, mov(A, "1000.00"));
    await constituirRealizavel(prisma, mov(B, "400.00"));
    await baixarRealizavel(prisma, mov(A, "300.00", { data: "2026-03-20" }));
    expect([await saldo(A), await saldo(B)]).toEqual(["700.00", "400.00"]);
    expect([await saldoNoRazao(ATIVO), await saldoNoRazao(CAIXA)]).toEqual(["1100.00", "3900.00"]);
    // O caixa vê o fato: o saldo da conta bancária é o do razão (a conciliação soma os mesmos fatos).
    expect((await saldoDaContaBancaria(prisma, "cb1", DIA_DE_BORDA(2026, 3, 31))).saldo.toFixed(2)).toBe("3900.00");
    const tipos = await prisma.movimentoBancario.findMany({ select: { tipo: true, valor: true }, orderBy: { criadoEm: "asc" } });
    expect(tipos.map((t) => `${t.tipo} ${t.valor.toFixed(2)}`)).toEqual(["SAIDA_PARA_REALIZAVEL 1000.00", "SAIDA_PARA_REALIZAVEL 400.00", "RETORNO_DE_REALIZAVEL 300.00"]);
    // O Anexo 13 sai (ele recusa quando o caixa não fecha) e mostra o realizável em "outros".
    const anexo = await balancoFinanceiro(prisma, 2026, [CAIXA]);
    const valorDa = (rotulo: string) => [...anexo.ingressos, ...anexo.dispendios].find((l) => l.rotulo === rotulo)?.valor;
    expect([valorDa("Outros Recebimentos Extraorçamentários"), valorDa("Outros Pagamentos Extraorçamentários")].map(String)).toEqual(["300.00", "1400.00"]);
    // A DFC sai (ela recusa quando o caixa não fecha) e mostra o realizável nos "outros" operacionais.
    const dfc = await demonstracaoFluxosDeCaixa(prisma, 2026, [CAIXA]);
    const operacional = dfc.fluxos.find((x) => x.atividade === "OPERACIONAL");
    const linhaDfc = (lista: readonly { rotulo: string; valor: unknown }[] | undefined, rotulo: string) => String(lista?.find((l) => l.rotulo === rotulo)?.valor);
    expect([linhaDfc(operacional?.ingressos, "Outros Ingressos Operacionais"), linhaDfc(operacional?.desembolsos, "Outros Desembolsos Operacionais")]).toEqual(["300.00", "1400.00"]);
    // O superávit por fonte tira da fonte 500 o que está fora: o caixa por fonte soma o caixa do razão (amarração S1).
    const s = await linhasDoSuperavitPorFonte(prisma, { corte: DIA_DE_BORDA(2026, 12, 31) });
    expect(s.totalCaixa.toFixed(2)).toBe(await saldoNoRazao(CAIXA));
    expect([await prisma.movimentoExtraorcamentario.count(), await prisma.tipoConsignacao.count()]).toEqual([1, 1]);
  });

  it("a baixa volta à fonte de onde saiu, até o saldo dela na data; a constituição não passa do saldo bancário", async () => {
    await decidir(ATIVO);
    await constituirRealizavel(prisma, mov(A, "1000.00"));
    await expect(baixarRealizavel(prisma, mov(A, "100.00", { fonteId: "fnt-540" }))).rejects.toThrow(/passa do saldo de DEP-JUD com 12345678000195 na conta 1\.1\.3\.5\.1\.02\.00, fonte 540 \(R\$ 0,00\)/);
    await expect(baixarRealizavel(prisma, mov(A, "100.00", { data: "2026-03-05" }))).rejects.toThrow(/\(R\$ 0,00 em 05\/03\/2026\)/);
    await expect(baixarRealizavel(prisma, mov(A, "1000.01"))).rejects.toThrow(/passa do saldo .* \(R\$ 1000,00\)/);
    // No banco restam 4.000,00: constituir 4.000,01 é recusado pelo saldo da conta, como o saque.
    await expect(constituirRealizavel(prisma, mov(B, "4000.01"))).rejects.toThrow(/SALDO INSUFICIENTE na conta CC-001 .* faltam 0\.01/);
    expect(await prisma.movimentoDeRealizavel.count()).toBe(1);
  });

  it("anulação pelo estorno do movimento bancário: inverte, uma vez; constituição com baixa viva não se anula antes da baixa", async () => {
    await decidir(ATIVO);
    const c = await constituirRealizavel(prisma, mov(A, "1000.00"));
    const b = await baixarRealizavel(prisma, mov(A, "300.00", { data: "2026-03-20" }));
    await expect(anularMovimentoDeRealizavel(prisma, { movimentoId: c.movimentoId, motivo: "Guia emitida em duplicidade", data: "2026-03-21", criadoPor: POR }))
      .rejects.toThrow(/Anular a constituição de R\$ 1000,00 passa do saldo .* \(R\$ 700,00\)/);
    const ab = await anularMovimentoDeRealizavel(prisma, { movimentoId: b.movimentoId, motivo: "Baixa registrada na conta errada", data: "2026-03-21", criadoPor: POR });
    expect(await saldo(A)).toBe("1000.00");
    const l = await prisma.lancamentoContabil.findUniqueOrThrow({ where: { id: ab.lancamentoId }, select: { partidas: { select: { tipo: true, conta: { select: { codigo: true } } } } } });
    expect(l.partidas.map((p) => `${p.tipo} ${p.conta.codigo}`).sort()).toEqual([`CREDITO ${CAIXA}`, `DEBITO ${ATIVO}`]);
    await expect(anularMovimentoDeRealizavel(prisma, { movimentoId: b.movimentoId, motivo: "De novo, por engano", data: "2026-03-21", criadoPor: POR })).rejects.toThrow(/já foi anulado/);
    await expect(anularMovimentoDeRealizavel(prisma, { movimentoId: ab.movimentoId, motivo: "Anular a anulação", data: "2026-03-21", criadoPor: POR })).rejects.toThrow(/anulação não se anula/);
    await expect(anularMovimentoDeRealizavel(prisma, { movimentoId: c.movimentoId, motivo: "Guia emitida em duplicidade", data: "2099-01-01", criadoPor: POR })).rejects.toThrow(/ainda não chegou/);
    await expect(anularMovimentoDeRealizavel(prisma, { movimentoId: c.movimentoId, motivo: "Guia emitida em duplicidade", data: "2026-02-30", criadoPor: POR })).rejects.toThrow(/não existe/);
    await anularMovimentoDeRealizavel(prisma, { movimentoId: c.movimentoId, motivo: "Guia emitida em duplicidade", data: "2026-03-22", criadoPor: POR });
    expect(await saldo(A)).toBe("0.00");
    expect([await saldoNoRazao(ATIVO), await saldoNoRazao(CAIXA)]).toEqual(["0.00", "5000.00"]);
  });

  it("a linha do tempo: baixa com data antiga não deixa negativo um ponto posterior; o estorno da tesouraria não desfaz o realizável", async () => {
    await decidir(ATIVO);
    const c1 = await constituirRealizavel(prisma, mov(A, "100.00", { data: "2026-03-02" }));
    await baixarRealizavel(prisma, mov(A, "100.00", { data: "2026-03-20" }));
    await constituirRealizavel(prisma, mov(A, "100.00", { data: "2026-03-25" }));
    // Em 10/03 havia 100, e hoje há 100 — mas a baixa de 20/03 ficaria sem origem.
    await expect(baixarRealizavel(prisma, mov(A, "100.00", { data: "2026-03-10" }))).rejects.toThrow(/\(R\$ 0,00 em 20\/03\/2026\)/);
    // O movimento bancário do realizável não se estorna pela movimentação bancária.
    const mb = await prisma.movimentoDeRealizavel.findUniqueOrThrow({ where: { id: c1.movimentoId }, select: { movimentoBancarioId: true } });
    await expect(estornarMovimentoBancario(prisma, { movimentoId: mb.movimentoBancarioId ?? "", motivo: "Estorno pela tesouraria", data: DIA_DE_BORDA(2026, 3, 28), criadoPor: POR }))
      .rejects.toThrow(/se anula em Financeiro › Valores a receber de volta/);
    expect(await saldo(A)).toBe("100.00");
  });

  it("decisão nova e suspensão: o saldo fica na conta antiga; suspensa, a baixa ainda deixa o dinheiro voltar", async () => {
    await decidir(ATIVO);
    await constituirRealizavel(prisma, mov(A, "500.00"));
    await decidir(ATIVO_2);
    await expect(baixarRealizavel(prisma, mov(A, "100.00"))).rejects.toThrow(/na conta 1\.1\.3\.1\.1\.99\.00, fonte 500 \(R\$ 0,00\)/);
    expect(await saldo(A)).toBe("500.00");
    await decidir(ATIVO, false);
    await baixarRealizavel(prisma, mov(A, "100.00"));
    expect(await saldo(A)).toBe("400.00");
  });

  it("recusas com o motivo: sem permissão, documento inválido, dia inexistente e valor zero", async () => {
    await decidir(ATIVO);
    await expect(constituirRealizavel(prisma, mov(A, "10.00", { criadoPor: SO_CONSULTA }))).rejects.toThrow(/não tem permissão para MOVIMENTAR_REALIZAVEL/);
    await expect(decidirContaDoRealizavel(prisma, { categoriaId, contaAtivoCodigo: ATIVO, ativa: true, fundamento: "Tentativa sem permissão", criadoPor: SO_CONSULTA })).rejects.toThrow(/não tem permissão para PARAMETRIZAR_REALIZAVEL/);
    await expect(constituirRealizavel(prisma, mov("12345678000100", "10.00"))).rejects.toThrow(/não é CPF nem CNPJ válido/);
    await expect(constituirRealizavel(prisma, mov(A, "10.00", { data: "2026-02-30" }))).rejects.toThrow(/30\/02\/2026 não existe/);
    await expect(constituirRealizavel(prisma, mov(A, "0.00"))).rejects.toThrow(/maior que zero/);
    expect(await prisma.movimentoDeRealizavel.count()).toBe(0);
  });

  it("A TRAVA DO SALDO EXISTE: com o saldo do devedor travado por outra transação, a baixa espera", async () => {
    await decidir(ATIVO);
    await constituirRealizavel(prisma, mov(A, "1000.00"));
    let liberar: () => void = () => undefined;
    const presa = new Promise<void>((x) => { liberar = x; });
    let travado: () => void = () => undefined;
    const jaTravou = new Promise<void>((x) => { travado = x; });
    const segurando = prisma.$transaction(async (tx) => { await travar(tx, "SaldoDeRealizavel", [`${categoriaId}:${A}`]); travado(); await presa; }, { timeout: 20_000 });
    await jaTravou;
    let terminou = false;
    const b = baixarRealizavel(prisma, mov(A, "100.00")).then(() => { terminou = true; });
    let cedo = true;
    try {
      await new Promise((x) => setTimeout(x, 800));
      cedo = terminou;
    } finally {
      liberar();
      await segurando;
      await b;
    }
    expect([cedo, terminou]).toEqual([false, true]);
  });
});
