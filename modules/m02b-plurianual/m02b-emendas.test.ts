import "dotenv/config";
import { declararNaturezaDaBase } from "../m16-travamento/natureza-da-base.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { semearRoteiroOrcamentario } from "../../test/roteiro-orcamentario.js";
import { criarM02Deps } from "../m02-planejamento/adapter-prisma.js";
import { criarFicha } from "../m02-planejamento/servico.js";
import { ajustarLinhaDaProposta, detalharPropostaOrcamentaria, efetivarPropostaOrcamentaria, elaborarPropostaOrcamentaria } from "../m02-planejamento/proposta-orcamentaria.js";
import {
  CLASSIFICACAO_VALIDA,
  SEED_ACOES,
  SEED_COS,
  SEED_FONTES,
  SEED_FUNCOES,
  SEED_NATUREZAS_DESPESA,
  SEED_ORGAOS,
  SEED_PROGRAMAS,
  SEED_SUBFUNCOES,
  SEED_UNIDADES,
} from "../m02-planejamento/seed-minimo.js";
import {
  bloquearDotacaoParaEmendas,
  cadastrarEmendaAoOrcamento,
  emendasDaProposta,
  revogarBloqueioDeEmenda,
  sancionarEmendaAoOrcamento,
} from "./emendas.js";
import { comparativoDasEmendas } from "./comparativo-das-emendas.js";

/**
 * V36 — EMENDAS AO PROJETO DA LOA (TR 5.9.3.13 a 5.9.3.15).
 *
 * Proposta 2027 sobre duas fichas de 2026 (1 e 7), projetada pela dotação inicial + 5%: ficha 1 = 1.050.000,00 e
 * ficha 7 = 420.000,00 (conta feita à mão). N=2 em fichas, emendas e itens; cada recusa afirma o motivo e que nada foi
 * gravado; a sanção é conferida pelo valor VIGENTE da proposta, lido pelo leitor da própria proposta.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
const ADMIN = "m02@cg.pb.gov.br";

let proposta = "";
let linha1 = "";
let linha7 = "";

async function usuarioCom(identificador: string, acoes: readonly string[]): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({
    data: {
      nome: `PERFIL-${identificador}`,
      descricao: "perfil restrito do teste",
      criadoPor: "TESTE",
      permissoes: { create: acoes.map((acao) => ({ acao: acao as "CADASTRAR_LOA", criadoPor: "TESTE" })) },
    },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

async function semear(): Promise<void> {
  await limparBanco(prisma);
  // V39-021: a base de teste é de ENSAIO — a efetivação destes testes usa esse fundamento.
  await declararNaturezaDaBase(prisma, { natureza: "ENSAIO", motivo: "banco de teste", declaradoPor: "TESTE" });
  await semearRoteiroOrcamentario(prisma);
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: "TESTE" } });
  await prisma.orgao.createMany({ data: [...SEED_ORGAOS] });
  await prisma.unidadeOrcamentaria.createMany({ data: [...SEED_UNIDADES, { id: "uo-02", codigo: "01002", descricao: "Secretaria de Saúde", orgaoId: "org-01" }] });
  await prisma.funcao.createMany({ data: [...SEED_FUNCOES] });
  await prisma.subfuncao.createMany({ data: [...SEED_SUBFUNCOES] });
  await prisma.programa.createMany({ data: [...SEED_PROGRAMAS] });
  await prisma.acao.createMany({ data: [...SEED_ACOES] });
  await prisma.naturezaDespesa.createMany({ data: [...SEED_NATUREZAS_DESPESA] });
  await prisma.fonteRecurso.createMany({ data: [...SEED_FONTES] });
  await prisma.codigoAcompanhamento.createMany({ data: [...SEED_COS] });
  const deps = criarM02Deps(prisma);
  const f1 = await criarFicha({ exercicio: 2026, numero: 1, classificacao: { ...CLASSIFICACAO_VALIDA }, exercicioFonte: 1, valorDotado: "1000000.00", criadoPor: ADMIN }, deps);
  const f7 = await criarFicha(
    { exercicio: 2026, numero: 7, classificacao: { ...CLASSIFICACAO_VALIDA, unidadeOrc: "01002", fonte: "540" }, exercicioFonte: 1, valorDotado: "400000.00", criadoPor: ADMIN },
    deps
  );
  const r = await elaborarPropostaOrcamentaria(prisma, {
    exercicio: 2027, exercicioDeOrigem: 2026, descricao: "Proposta 2027", baseDaReceita: "SEM_VALOR", percentualDaReceita: "0",
    baseDaDespesa: "DOTACAO_INICIAL", percentualDaDespesa: "5", aproveitaReceitas: false, aproveitaFichas: true, reajustaProjetos: true,
    incluiFichasAbertasPorCredito: false, criadoPor: ADMIN,
  });
  proposta = r.id;
  const linhas = await prisma.linhaDeDespesaDaProposta.findMany({ where: { propostaOrcamentariaId: proposta }, select: { id: true, fichaDeOrigemId: true } });
  linha1 = linhas.find((l) => l.fichaDeOrigemId === f1)!.id;
  linha7 = linhas.find((l) => l.fichaDeOrigemId === f7)!.id;
}

const emenda = (itens: readonly { linhaDeDespesaId: string; valor: string }[], por = ADMIN) =>
  cadastrarEmendaAoOrcamento(prisma, {
    propostaOrcamentariaId: proposta, data: "2026-11-20", objetivo: "Reforço da atenção básica", justificativa: "Demanda das audiências públicas",
    vereador: "Vereadora fictícia", textoJuridico: "Acrescenta e reduz dotações do projeto", itens: [...itens], criadoPor: por,
  });

async function vigentes(): Promise<Record<string, string>> {
  const d = await detalharPropostaOrcamentaria(prisma, proposta);
  return Object.fromEntries(d!.despesas.map((l) => [l.id === linha1 ? "f1" : "f7", l.valorVigente]));
}

async function recusa(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "gravou";
  } catch (e) {
    // Erro do Prisma traz trecho do CÓDIGO-FONTE ("invocation in ... → linha"): casar com ele seria atestar pela papelada.
    const m = e instanceof Error ? e.message : String(e);
    return /invocation in/.test(m) ? `(erro do banco) ${m.trim().split(/\r?\n/).pop() ?? ""}` : m;
  }
}

describe("M02b V36 — emendas ao projeto da LOA", () => {
  beforeEach(semear, 60000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a emenda numera em sequência e, sozinha, não muda a proposta", async () => {
    expect(await vigentes()).toEqual({ f1: "1050000.00", f7: "420000.00" });
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }, { linhaDeDespesaId: linha7, valor: "-50000.00" }]);
    const b = await emenda([{ linhaDeDespesaId: linha7, valor: "1000.00" }]);
    expect([a.numero, b.numero]).toEqual([1, 2]);
    expect(await vigentes()).toEqual({ f1: "1050000.00", f7: "420000.00" });
    const lista = await emendasDaProposta(prisma, proposta);
    expect(lista.map((e) => [e.numero, e.situacao, e.acrescimos.toFixed(2), e.reducoes.toFixed(2)])).toEqual([
      [1, "AGUARDANDO_SANCAO", "50000.00", "50000.00"],
      [2, "AGUARDANDO_SANCAO", "1000.00", "0.00"],
    ]);
  });

  it("t2: dotação bloqueada não recebe emenda; liberada, recebe; bloquear duas vezes é recusado", async () => {
    const b = await bloquearDotacaoParaEmendas(prisma, { linhaDeDespesaId: linha7, motivo: "Serviço da dívida: não se emenda", criadoPor: ADMIN });
    expect(await recusa(() => emenda([{ linhaDeDespesaId: linha1, valor: "10.00" }, { linhaDeDespesaId: linha7, valor: "-10.00" }]))).toMatch(/ficha 7 está bloqueada para emendas[\s\S]*Nada foi gravado/);
    expect(await recusa(() => bloquearDotacaoParaEmendas(prisma, { linhaDeDespesaId: linha7, motivo: "de novo, por engano", criadoPor: ADMIN }))).toMatch(/ficha 7 já está bloqueada/);
    expect(await prisma.emendaAoOrcamento.count()).toBe(0);
    await revogarBloqueioDeEmenda(prisma, { bloqueioId: b.id, motivo: "Decisão da comissão", criadoPor: ADMIN });
    expect(await recusa(() => revogarBloqueioDeEmenda(prisma, { bloqueioId: b.id, motivo: "de novo", criadoPor: ADMIN }))).toMatch(/já foi liberado/);
    expect((await emenda([{ linhaDeDespesaId: linha7, valor: "-10.00" }])).numero).toBe(1);
  });

  it("t3: aprovação total leva os dois itens à proposta, citando a emenda; não se sanciona duas vezes", async () => {
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }, { linhaDeDespesaId: linha7, valor: "-50000.00" }]);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei nº 999/2026", criadoPor: ADMIN });
    expect(await vigentes()).toEqual({ f1: "1100000.00", f7: "370000.00" });
    const motivos = await prisma.ajusteDeDespesaDaProposta.findMany({ select: { motivo: true } });
    expect(motivos.map((m) => m.motivo)).toEqual(["Emenda nº 1 sancionada em 15/12/2026 (Lei nº 999/2026)", "Emenda nº 1 sancionada em 15/12/2026 (Lei nº 999/2026)"]);
    expect(await recusa(() => sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "REJEITADA", data: "2026-12-16", ato: "veto", criadoPor: ADMIN }))).toMatch(/emenda nº 1 já foi sancionada ou vetada[\s\S]*Nada foi gravado/);
    expect((await emendasDaProposta(prisma, proposta))[0]!.situacao).toBe("APROVADA");
  });

  it("t4: sanção parcial leva só o escolhido; parcial vazia ou com todos é recusada", async () => {
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }, { linhaDeDespesaId: linha7, valor: "-50000.00" }]);
    const itens = await prisma.itemDaEmenda.findMany({ where: { emendaId: a.id }, select: { id: true, linhaDeDespesaId: true } });
    const doF1 = itens.find((i) => i.linhaDeDespesaId === linha1)!.id;
    expect(await recusa(() => sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "PARCIAL", itensAprovados: [], data: "2026-12-15", ato: "veto parcial", criadoPor: ADMIN }))).toMatch(/informe quais dotações foram sancionadas/);
    expect(await recusa(() => sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "PARCIAL", itensAprovados: itens.map((i) => i.id), data: "2026-12-15", ato: "veto parcial", criadoPor: ADMIN }))).toMatch(/isso é aprovação total/);
    expect(await prisma.sancaoDaEmenda.count()).toBe(0);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "PARCIAL", itensAprovados: [doF1], data: "2026-12-15", ato: "Lei nº 999/2026, veto ao item da ficha 7", criadoPor: ADMIN });
    expect(await vigentes()).toEqual({ f1: "1100000.00", f7: "420000.00" });
    const e = (await emendasDaProposta(prisma, proposta))[0]!;
    expect([e.situacao, e.itens.map((i) => i.sancionado)]).toEqual(["PARCIAL", e.itens.map((i) => i.id === doF1)]);
  });

  it("t5: reprovação total não toca a proposta", async () => {
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }]);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "REJEITADA", data: "2026-12-15", ato: "Veto total", criadoPor: ADMIN });
    expect(await vigentes()).toEqual({ f1: "1050000.00", f7: "420000.00" });
    expect(await prisma.ajusteDeDespesaDaProposta.count()).toBe(0);
    expect((await emendasDaProposta(prisma, proposta))[0]!.situacao).toBe("REJEITADA");
  });

  it("t6: redução maior que a linha é recusada no cadastro e, se a linha caiu depois, na sanção — sem gravar nada", async () => {
    expect(await recusa(() => emenda([{ linhaDeDespesaId: linha7, valor: "-420000.01" }]))).toMatch(/redução na ficha 7 \(420000\.01\) é maior que o valor dela na proposta \(420000\.00\)[\s\S]*Nada foi gravado/);
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "1.00" }, { linhaDeDespesaId: linha7, valor: "-400000.00" }]);
    await ajustarLinhaDaProposta(prisma, { propostaOrcamentariaId: proposta, lado: "DESPESA", linhaId: linha7, valor: "300000.00", motivo: "Reestimativa do Executivo", criadoPor: ADMIN });
    expect(await recusa(() => sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei", criadoPor: ADMIN }))).toMatch(/ficha 7 tem hoje 300000\.00 na proposta[\s\S]*negativa[\s\S]*Nada foi gravado/);
    expect([await prisma.sancaoDaEmenda.count(), await prisma.ajusteDeDespesaDaProposta.count()]).toEqual([0, 1]);
    expect(await vigentes()).toEqual({ f1: "1050000.00", f7: "300000.00" });
  });

  it("t7: proposta efetivada não recebe emenda nem sanção", async () => {
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "1.00" }]);
    await prisma.exercicio.create({ data: { ano: 2027, criadoPor: "TESTE" } });
    await efetivarPropostaOrcamentaria(prisma, { propostaOrcamentariaId: proposta, fundamento: { tipo: "ENSAIO" }, criadoPor: ADMIN });
    expect(await recusa(() => emenda([{ linhaDeDespesaId: linha1, valor: "1.00" }]))).toMatch(/orçamento de 2027 já foi efetivada[\s\S]*Nada foi gravado/);
    expect(await recusa(() => sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei", criadoPor: ADMIN }))).toMatch(/já foi efetivada/);
    expect(await prisma.sancaoDaEmenda.count()).toBe(0);
  });

  it("t8: NEGAÇÃO — quem mantém a LOA sem a ação não emenda; quem cadastra emenda não sanciona; o motivo nomeia a ação", async () => {
    const soLoa = await usuarioCom("so-loa@cg.pb.gov.br", ["CADASTRAR_LOA"]);
    const soEmenda = await usuarioCom("so-emenda@cg.pb.gov.br", ["CADASTRAR_EMENDA_AO_ORCAMENTO"]);
    expect(await recusa(() => emenda([{ linhaDeDespesaId: linha1, valor: "1.00" }], soLoa))).toMatch(/ACESSO NEGADO[\s\S]*CADASTRAR_EMENDA_AO_ORCAMENTO/);
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "1.00" }], soEmenda);
    expect(await recusa(() => sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei", criadoPor: soEmenda }))).toMatch(/ACESSO NEGADO[\s\S]*SANCIONAR_EMENDA_AO_ORCAMENTO/);
    expect([await prisma.emendaAoOrcamento.count(), await prisma.sancaoDaEmenda.count()]).toEqual([1, 0]);
  });
});

/**
 * V39-R2 (R2-024) — O EFEITO DAS EMENDAS SOBRE O PROJETO GUARDADO. Contas antes:
 *   projeto guardado (fixture da versão ligada às linhas): ficha 1 = 1.050.000,00; ficha 7 = 420.000,00.
 *   emenda A aprovada: ficha 1 +50.000, ficha 7 −50.000; emenda B pendente: ficha 1 +1.000; emenda C rejeitada: ficha 7 −2.000.
 *   ficha 1: esperado 1.100.000,00 = vigente; pendente 1.000,00.  ficha 7: esperado 370.000,00; rejeitado −2.000,00;
 *   depois de um ajuste fora das emendas (365.000,00), "outros ajustes" = −5.000,00.
 */
describe("V39-R2 (R2-024) — comparativo das emendas contra a versão guardada do projeto", () => {
  beforeEach(semear, 60000);

  it("sem versão guardada com a proposta, o comparativo diz que não há base e não reconstrói nada", async () => {
    await emenda([{ linhaDeDespesaId: linha1, valor: "10.00" }]);
    const c = await comparativoDasEmendas(prisma, proposta);
    expect([c.versao, c.linhas.length]).toEqual([null, 0]);
    expect(c.motivoSemVersao).toMatch(/Nenhuma versão do projeto foi guardada com esta proposta/);
  });

  it("aprovadas, rejeitadas e pendentes por linha (N=2), contra o projeto guardado; ajuste fora das emendas aparece à parte", async () => {
    const lei = await prisma.leiOrcamentariaAnual.create({ data: { exercicio: 2027, numeroDoProjeto: "PL 1/2026", dataDoEnvio: new Date("2026-09-30T15:00:00Z"), ementa: "LOA 2027 (fixture)", criadoPor: ADMIN }, select: { id: true } });
    const v = await prisma.versaoDoProjetoDaLoa.create({ data: { leiId: lei.id, numero: 1, tipo: "ENCAMINHADO", dataDoEncaminhamento: new Date("2026-09-30T15:00:00Z"), competenciaDaRemessa: "2026-09", documento: "Mensagem 1/2026", fundamento: "Encaminhamento (fixture)", propostaOrcamentariaId: proposta, criadoPor: ADMIN }, select: { id: true } });
    const dot = { codUnidadeOrcamentaria: "01001", codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", exercicioFonte: 1, codFonte: "500" };
    await prisma.dotacaoDoProjetoDaLoa.createMany({ data: [{ versaoId: v.id, ...dot, valor: "1050000.00", linhaDaPropostaId: linha1 }, { versaoId: v.id, ...dot, codUnidadeOrcamentaria: "01002", codFonte: "540", valor: "420000.00", linhaDaPropostaId: linha7 }] });
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }, { linhaDeDespesaId: linha7, valor: "-50000.00" }]);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei nº 999/2026", criadoPor: ADMIN });
    await emenda([{ linhaDeDespesaId: linha1, valor: "1000.00" }]);
    const c = await emenda([{ linhaDeDespesaId: linha7, valor: "-2000.00" }]);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: c.id, resultado: "REJEITADA", data: "2026-12-15", ato: "Veto", criadoPor: ADMIN });
    let r = await comparativoDasEmendas(prisma, proposta);
    expect(r.versao?.numero).toBe(1);
    expect(r.linhas.map((l) => [l.rotulo, l.projeto, l.aprovadas, l.rejeitadas, l.pendentes, l.esperado, l.vigente, l.outrosAjustes])).toEqual([
      ["ficha 1", "1050000.00", "50000.00", "0.00", "1000.00", "1100000.00", "1100000.00", "0.00"],
      ["ficha 7", "420000.00", "-50000.00", "-2000.00", "0.00", "370000.00", "370000.00", "0.00"],
    ]);
    await prisma.ajusteDeDespesaDaProposta.create({ data: { linhaId: linha7, valor: "365000.00", motivo: "Ajuste do Executivo fora das emendas (fixture)", criadoPor: ADMIN, criadoEm: new Date(Date.now() + 60_000) } });
    r = await comparativoDasEmendas(prisma, proposta);
    expect(r.linhas.find((l) => l.rotulo === "ficha 7")?.outrosAjustes).toBe("-5000.00");
    // a versão guardada não mudou
    expect((await prisma.dotacaoDoProjetoDaLoa.findMany({ where: { versaoId: v.id }, orderBy: { valor: "asc" }, select: { valor: true } })).map((d) => d.valor.toFixed(2))).toEqual(["420000.00", "1050000.00"]);
  });

  it("a emenda aprovada ANTES da base (mensagem modificativa guardada depois da sanção) já está no projeto e não soma de novo", async () => {
    const lei = await prisma.leiOrcamentariaAnual.create({ data: { exercicio: 2027, numeroDoProjeto: "PL 1/2026", dataDoEnvio: new Date("2026-09-30T15:00:00Z"), ementa: "LOA 2027 (fixture)", criadoPor: ADMIN }, select: { id: true } });
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }, { linhaDeDespesaId: linha7, valor: "-50000.00" }]);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei nº 999/2026", criadoPor: ADMIN });
    // a mensagem modificativa é guardada no mesmo dia da sanção, depois dela: a cópia já traz o valor emendado
    const v = await prisma.versaoDoProjetoDaLoa.create({ data: { leiId: lei.id, numero: 2, tipo: "MENSAGEM_MODIFICATIVA", dataDoEncaminhamento: new Date(), competenciaDaRemessa: "2026-12", documento: "Mensagem modificativa 2/2026", fundamento: "Mensagem modificativa (fixture)", propostaOrcamentariaId: proposta, criadoPor: ADMIN }, select: { id: true } });
    const dot = { codUnidadeOrcamentaria: "01001", codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", exercicioFonte: 1, codFonte: "500" };
    await prisma.dotacaoDoProjetoDaLoa.createMany({ data: [{ versaoId: v.id, ...dot, valor: "1100000.00", linhaDaPropostaId: linha1 }, { versaoId: v.id, ...dot, codUnidadeOrcamentaria: "01002", codFonte: "540", valor: "370000.00", linhaDaPropostaId: linha7 }] });
    const r = await comparativoDasEmendas(prisma, proposta);
    expect(r.linhas.map((l) => [l.rotulo, l.situacao, l.projeto, l.jaNoProjeto, l.aprovadas, l.esperado, l.vigente, l.outrosAjustes])).toEqual([
      ["ficha 1", "NO_PROJETO", "1100000.00", "50000.00", "0.00", "1100000.00", "1100000.00", "0.00"],
      ["ficha 7", "NO_PROJETO", "370000.00", "-50000.00", "0.00", "370000.00", "370000.00", "0.00"],
    ]);
  });

  it("versão com dotação sem ligação: a linha citada que não aparece ligada fica sem esperado e sem diferença (N=2: uma ligada, uma não)", async () => {
    const lei = await prisma.leiOrcamentariaAnual.create({ data: { exercicio: 2027, numeroDoProjeto: "PL 1/2026", dataDoEnvio: new Date("2026-09-30T15:00:00Z"), ementa: "LOA 2027 (fixture)", criadoPor: ADMIN }, select: { id: true } });
    const v = await prisma.versaoDoProjetoDaLoa.create({ data: { leiId: lei.id, numero: 1, tipo: "ENCAMINHADO", dataDoEncaminhamento: new Date("2026-09-30T15:00:00Z"), competenciaDaRemessa: "2026-09", documento: "Mensagem 1/2026", fundamento: "Encaminhamento (fixture)", propostaOrcamentariaId: proposta, criadoPor: ADMIN }, select: { id: true } });
    const dot = { codUnidadeOrcamentaria: "01001", codFuncao: "04", codSubfuncao: "122", codPrograma: "0001", codAcao: "2001", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", exercicioFonte: 1, codFonte: "500" };
    await prisma.dotacaoDoProjetoDaLoa.createMany({ data: [{ versaoId: v.id, ...dot, valor: "1050000.00", linhaDaPropostaId: linha1 }, { versaoId: v.id, ...dot, codUnidadeOrcamentaria: "01002", codFonte: "540", valor: "420000.00", linhaDaPropostaId: null }] });
    const a = await emenda([{ linhaDeDespesaId: linha1, valor: "50000.00" }, { linhaDeDespesaId: linha7, valor: "-50000.00" }]);
    await sancionarEmendaAoOrcamento(prisma, { emendaId: a.id, resultado: "APROVADA", data: "2026-12-15", ato: "Lei nº 999/2026", criadoPor: ADMIN });
    const r = await comparativoDasEmendas(prisma, proposta);
    expect(r.versao?.dotacoesSemLigacao).toBe(1);
    expect(r.linhas.map((l) => [l.rotulo, l.situacao, l.projeto, l.aprovadas, l.esperado, l.outrosAjustes])).toEqual([
      ["ficha 1", "NO_PROJETO", "1050000.00", "50000.00", "1100000.00", "0.00"],
      ["ficha 7", "SEM_LIGACAO", null, "-50000.00", null, null],
    ]);
  });
});
