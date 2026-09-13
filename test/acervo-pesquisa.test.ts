import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { lerConsulta } from "../lib/molde/consulta.js";
import { BENS_PATRIMONIAIS } from "../lib/portas/recursos/acervo.js";
import { listarBensPatrimoniais } from "../lib/portas/recursos/acervo-dados.js";
import { meusBensPara } from "../lib/portas/recursos/meus-bens-dados.js";
import { estadoDoBem, registrarMovimentoDeGestao, estornarMovimentoDeGestao } from "../modules/m10-patrimonial/gestao-do-bem.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";

/**
 * A PESQUISA DO ACERVO E "MEUS BENS" (V3, pacote 2) — pelas portas de verdade.
 *
 * FIXTURE N=2 em tudo: dois bens, duas localizações, duas pessoas (homônimas — o vínculo é pelo
 * documento), dois usuários. O estado é DERIVADO: o SQL da listagem e `estadoDoBem` do domínio
 * são confrontados contra a mesma fixture, inclusive depois de um ESTORNO — que é onde um
 * "último movimento" ingênuo erra.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "patrimonio@cg.pb.gov.br"; // fixture ADMIN
const ADMIN = "orcamento@cg.pb.gov.br";
const CPF_A = "11144477735";
const CPF_B = "52998224725";
let pessoaA = "";
let pessoaB = "";
let locSala = "";
let locGalpao = "";
let bemOnibus = "";
let bemArmario = "";
let usuarioA = "";

function consulta(filtros: Record<string, string>) {
  return lerConsulta(BENS_PATRIMONIAIS, filtros);
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  await prisma.contaPcasp.create({
    data: { id: "c-imob", codigo: "1.2.3.1.1.01.00", nome: "Bens moveis", naturezaSaldo: "DEVEDORA", nivel: 6, analitica: true, indicadorSuperavit: "P" },
  });
  await prisma.classeDeBens.createMany({
    data: [
      { id: "cl-veic", codigo: "1.2.3.1.1.01", descricao: "Veículos", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
      { id: "cl-mov", codigo: "1.2.3.1.1.02", descricao: "Móveis e utensílios", especie: "MOVEL", contaContabilAtivoId: "c-imob", criadoPor: POR },
    ],
  });
  const onibus = await prisma.bemPatrimonial.create({ data: { numeroTombamento: "TOMB-0001", descricao: "Ônibus escolar", classeDeBensId: "cl-veic", dataAquisicao: new Date("2026-02-01T12:00:00Z"), criadoPor: POR }, select: { id: true } });
  const armario = await prisma.bemPatrimonial.create({ data: { numeroTombamento: "TOMB-0002", descricao: "Armário de aço", classeDeBensId: "cl-mov", dataAquisicao: new Date("2026-03-01T12:00:00Z"), criadoPor: POR }, select: { id: true } });
  bemOnibus = onibus.id;
  bemArmario = armario.id;
  const sala = await prisma.localizacaoFisica.create({ data: { codigo: "SEC-101", descricao: "Sala 101 da Secretaria", criadoPor: POR }, select: { id: true } });
  const galpao = await prisma.localizacaoFisica.create({ data: { codigo: "GAR-01", descricao: "Garagem central", criadoPor: POR }, select: { id: true } });
  locSala = sala.id;
  locGalpao = galpao.id;
  const pa = await prisma.pessoa.create({ data: { documento: CPF_A, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: "Maria Souza", criadoPor: POR } } }, select: { id: true } });
  const pb = await prisma.pessoa.create({ data: { documento: CPF_B, tipo: "FISICA", criadoPor: POR, versoes: { create: { nome: "Maria Souza", criadoPor: POR } } }, select: { id: true } });
  pessoaA = pa.id;
  pessoaB = pb.id;
  const ua = await prisma.usuario.create({ data: { identificador: "maria.a@cg.pb.gov.br", nome: "Maria A", criadoPor: POR }, select: { id: true } });
  usuarioA = ua.id;

  const em = (dia: string) => new Date(`2026-04-${dia}T12:00:00Z`);
  const mov = (bemId: string, tipo: "LOCALIZACAO" | "RESPONSAVEL" | "ESTADO" | "SITUACAO", extra: Record<string, string>, dia: string) =>
    registrarMovimentoDeGestao(prisma, { bemId, tipo, dataMovimento: em(dia), motivo: `fixture ${tipo}`, criadoPor: POR, ...extra });
  await mov(bemOnibus, "LOCALIZACAO", { localizacaoId: locGalpao }, "01");
  await mov(bemOnibus, "RESPONSAVEL", { responsavelId: pessoaA }, "02");
  await mov(bemOnibus, "SITUACAO", { situacao: "EM_USO" }, "03");
  await mov(bemOnibus, "ESTADO", { estado: "BOM" }, "03");
  await mov(bemArmario, "LOCALIZACAO", { localizacaoId: locSala }, "01");
  await mov(bemArmario, "RESPONSAVEL", { responsavelId: pessoaB }, "02");
  await mov(bemArmario, "SITUACAO", { situacao: "EM_DESUSO" }, "05");
}

describe("a pesquisa do acervo — por localização, responsável, classe, situação, estado e identificadores", () => {
  beforeEach(semear);

  it("sem filtro lista os dois, com o estado ATUAL derivado de cada um", async () => {
    const r = await listarBensPatrimoniais(consulta({}));
    expect(r.total).toBe(2);
    const onibus = r.linhas.find((l) => l["numeroTombamento"] === "TOMB-0001")!;
    expect(onibus["localizacao"]).toBe("GAR-01 — Garagem central");
    expect(onibus["responsavel"]).toBe(`Maria Souza (${CPF_A})`);
    expect(onibus["situacao"]).toBe("Em uso");
    const armario = r.linhas.find((l) => l["numeroTombamento"] === "TOMB-0002")!;
    expect(armario["situacao"]).toBe("Em desuso");
  });

  it("filtra por localização, classe e situação — cada filtro acha só o seu (N=2)", async () => {
    expect((await listarBensPatrimoniais(consulta({ localizacao: "garagem" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0001"]);
    expect((await listarBensPatrimoniais(consulta({ localizacao: "SEC-101" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0002"]);
    expect((await listarBensPatrimoniais(consulta({ classe: "utens" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0002"]);
    expect((await listarBensPatrimoniais(consulta({ situacao: "EM_USO" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0001"]);
    expect((await listarBensPatrimoniais(consulta({ estado: "BOM" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0001"]);
    expect((await listarBensPatrimoniais(consulta({ estado: "RUIM" }))).total).toBe(0);
  });

  it("o responsável por NOME acha as duas homônimas; por DOCUMENTO acha uma só — o vínculo é o documento", async () => {
    expect((await listarBensPatrimoniais(consulta({ responsavel: "maria" }))).total).toBe(2);
    expect((await listarBensPatrimoniais(consulta({ responsavel: "111.444" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0001"]);
  });

  it("identificadores: tombamento, código de barras e descrição", async () => {
    await prisma.bemPatrimonial.update({ where: { id: bemArmario }, data: { codigoDeBarras: "TOMB-0002" } });
    expect((await listarBensPatrimoniais(consulta({ q: "0002" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0002"]);
    expect((await listarBensPatrimoniais(consulta({ q: "escolar" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0001"]);
  });

  it("o ESTORNO anula o original: a listagem volta ao estado anterior, igual ao domínio", async () => {
    const r = await registrarMovimentoDeGestao(prisma, { bemId: bemOnibus, tipo: "LOCALIZACAO", localizacaoId: locSala, dataMovimento: new Date("2026-04-10T12:00:00Z"), motivo: "mudou de sala", criadoPor: POR });
    expect((await listarBensPatrimoniais(consulta({ localizacao: "SEC-101" }))).total).toBe(2);
    await estornarMovimentoDeGestao(prisma, { movimentoId: r.movimentoId, dataMovimento: new Date("2026-04-11T12:00:00Z"), motivo: "lançado no bem errado", criadoPor: POR });
    expect((await listarBensPatrimoniais(consulta({ localizacao: "SEC-101" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0002"]);
    // ...e o domínio diz o mesmo sobre o ônibus.
    expect((await estadoDoBem(prisma, bemOnibus)).localizacaoId).toBe(locGalpao);
  });

  it("dois movimentos no MESMO dia civil: vence o registrado por último, como no domínio (N=2)", async () => {
    // O movimento das 15h é registrado ANTES do das 9h do mesmo dia. Pelo timestamp bruto o
    // das 15h venceria; pela regra do domínio (dia civil, depois o instante do registro), vence
    // o das 9h — o último registrado. Os dois leitores têm de concordar.
    await registrarMovimentoDeGestao(prisma, { bemId: bemArmario, tipo: "LOCALIZACAO", localizacaoId: locGalpao, dataMovimento: new Date("2026-04-20T18:00:00Z"), motivo: "às 15h", criadoPor: POR });
    await registrarMovimentoDeGestao(prisma, { bemId: bemArmario, tipo: "LOCALIZACAO", localizacaoId: locSala, dataMovimento: new Date("2026-04-20T12:00:00Z"), motivo: "às 9h, registrado depois", criadoPor: POR });
    expect((await estadoDoBem(prisma, bemArmario)).localizacaoId).toBe(locSala);
    const r = await listarBensPatrimoniais(consulta({ q: "TOMB-0002" }));
    expect(r.linhas[0]?.["localizacao"]).toBe("SEC-101 — Sala 101 da Secretaria");
  });

  it("a situação 'sem registro' acha o bem que nunca teve situação", async () => {
    await prisma.bemPatrimonial.create({ data: { numeroTombamento: "TOMB-0003", descricao: "Cadeira", classeDeBensId: "cl-mov", dataAquisicao: new Date("2026-03-01T12:00:00Z"), criadoPor: POR } });
    expect((await listarBensPatrimoniais(consulta({ situacao: "SEM_REGISTRO" }))).linhas.map((l) => l["numeroTombamento"])).toEqual(["TOMB-0003"]);
  });
});

describe("meus bens — a pessoa do usuário, depois os bens sob a responsabilidade dela", () => {
  beforeEach(semear);

  it("sem vínculo: pessoa nula e lista vazia — nada é inferido do nome do usuário", async () => {
    const r = await meusBensPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    expect(r).toEqual({ pessoa: null, bens: [] });
  });

  it("com vínculo: só os bens da pessoa vinculada — a homônima não entra (N=2)", async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "é a servidora", criadoPor: ADMIN });
    const r = await meusBensPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    expect(r.pessoa).toEqual({ nome: "Maria Souza", documento: CPF_A });
    expect(r.bens.map((b) => b.numeroTombamento)).toEqual(["TOMB-0001"]);
    expect(r.bens[0]).toMatchObject({ localizacao: "GAR-01 — Garagem central", situacao: "em uso", estado: "bom" });
  });

  it("a responsabilidade muda de pessoa: o bem sai da lista de quem deixou de responder", async () => {
    await vincularPessoaAoUsuario(prisma, { usuarioId: usuarioA, documento: CPF_A, motivo: "é a servidora", criadoPor: ADMIN });
    await registrarMovimentoDeGestao(prisma, { bemId: bemOnibus, tipo: "RESPONSAVEL", responsavelId: pessoaB, dataMovimento: new Date("2026-05-01T12:00:00Z"), motivo: "novo termo", criadoPor: POR });
    const r = await meusBensPara({ usuarioId: usuarioA, identificador: "maria.a@cg.pb.gov.br" });
    expect(r.bens).toEqual([]);
  });
});
