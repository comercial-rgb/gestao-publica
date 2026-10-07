import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import {
  bloquearLinhaParaEmendas,
  bloqueiosDaPeca,
  cadastrarEmendaAoPlanejamento,
  emendasDaPeca,
  revogarBloqueioDeEmendaAoPlanejamento,
  sancionarEmendaAoPlanejamento,
} from "./emendas-do-planejamento.js";
import { criarLdo, criarMetaAnualLdo, criarPlanoPlurianual, criarPrevisaoReceitaPpa } from "./servico.js";

/**
 * V36 — EMENDAS AO PPA E À LDO (TR 5.9.1.21-23 e 5.9.2.11-13). Contas à mão:
 *
 *   PPA 2026-2029, previsões de 2027: A (IPTU) 1.000.000,00 e B (ISS) 400.000,00.
 *   LDO 2026, metas de 2026: receita total 10.000.000,00 e primária 9.000.000,00.
 *
 *   Emenda 1 do PPA: A +100.000,00 e B −50.000,00. Aprovada pela Lei 31/2027 → ato 31/2027 com os dois itens;
 *     A vigente 1.100.000,00, B 350.000,00.
 *   Emenda 2 do PPA: A +10,00 e B −20,00. Parcial (só A) pela MESMA Lei 31/2027 → o mesmo ato, agora com três itens.
 *   Emenda à LDO: receita primária +2.000.000,00 sozinha passaria a total (11 > 10) — a sanção recusa e nada grava;
 *     com a total também +2.000.000,00, aprova.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "m02@cg.pb.gov.br";
const D = (s: string): Date => new Date(`${s}T12:00:00.000Z`);
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    const m = (e as Error).message;
    // O erro do Prisma traz um trecho do CÓDIGO-FONTE junto ("invocation in ... → 197 ..."), e esse trecho pode conter a
    // própria mensagem de negócio da linha vizinha: casar com ele seria atestar pela papelada. Erro do banco não é recusa.
    return /invocation in/.test(m) ? `(erro do banco) ${m.trim().split(/\r?\n/).pop() ?? ""}` : m;
  }
  return "(nao recusou)";
};

async function usuarioCom(identificador: string, acoes: readonly string[]): Promise<string> {
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "TESTE" }, select: { id: true } });
  const p = await prisma.perfil.create({
    data: { nome: `PERFIL-${identificador}`, descricao: "perfil restrito do teste", criadoPor: "TESTE", permissoes: { create: acoes.map((acao) => ({ acao: acao as "CADASTRAR_LOA", criadoPor: "TESTE" })) } },
    select: { id: true },
  });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
  return identificador;
}

describe("M02b — emendas ao PPA e à LDO", () => {
  let planoId: string;
  let ldoId: string;
  let a: string;
  let b: string;
  let meta: string;

  const emenda = { data: "2027-05-02", objetivo: "Reforço da arrecadação própria", justificativa: "Atualização da base do IPTU", vereador: "Vereador Fictício", textoJuridico: "Art. 1º Fica alterado o anexo de receitas.", criadoPor: POR };
  const doPpa = (itens: { alvoId: string; valor: string }[]) =>
    cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "PPA", pecaId: planoId, itens: itens.map((i) => ({ alvo: "PREVISAO_RECEITA_PPA" as const, alvoId: i.alvoId, grandeza: "valor", valor: i.valor })) });
  const lei = { leiNumero: "31", leiAno: 2027, data: "2027-06-10", dataPublicacao: "2027-06-12", criadoPor: POR };

  beforeEach(async () => {
    await limparBanco(prisma);
    planoId = (await criarPlanoPlurianual(prisma, { anoInicio: 2026, anoFim: 2029, leiRef: "Lei Municipal 1.234/2025", dataPublicacao: D("2025-12-20"), criadoPor: POR })).planoId;
    const iptu = await prisma.naturezaReceita.create({ data: { codigo: "11130111", descricao: "IPTU" }, select: { id: true } });
    const iss = await prisma.naturezaReceita.create({ data: { codigo: "11140211", descricao: "ISS" }, select: { id: true } });
    const fonte = await prisma.fonteRecurso.create({ data: { codigo: "500", descricao: "Livre", codigoTce: "500" }, select: { id: true } });
    a = (await criarPrevisaoReceitaPpa(prisma, { planoId, naturezaReceitaId: iptu.id, fonteId: fonte.id, ano: 2027, valor: "1000000.00", criadoPor: POR })).previsaoId;
    b = (await criarPrevisaoReceitaPpa(prisma, { planoId, naturezaReceitaId: iss.id, fonteId: fonte.id, ano: 2027, valor: "400000.00", criadoPor: POR })).previsaoId;
    ldoId = (await criarLdo(prisma, { exercicio: 2026, inicioVigencia: new Date("2026-01-01T00:00:00Z"), fimVigencia: new Date("2026-12-31T23:59:59Z"), criadoPor: POR })).ldoId;
    meta = (
      await criarMetaAnualLdo(prisma, {
        ldoId, ano: 2026, receitaTotal: "10000000.00", receitaPrimaria: "9000000.00", despesaTotal: "9800000.00", despesaPrimaria: "9500000.00", resultadoNominal: "-200000.00",
        dividaPublicaConsolidada: "3000000.00", dividaConsolidadaLiquida: "2500000.00", receitaPrimariaPpp: "0.00", despesaPrimariaPpp: "0.00", impactoSaldoPpp: "0.00", criadoPor: POR,
      })
    ).metaAnualId;
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: o cadastro numera por peça e guarda os itens com sinal", async () => {
    const e1 = await doPpa([{ alvoId: a, valor: "100000.00" }, { alvoId: b, valor: "-50000.00" }]);
    const e2 = await doPpa([{ alvoId: a, valor: "10.00" }]);
    const l1 = await cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "LDO", pecaId: ldoId, itens: [{ alvo: "META_ANUAL_LDO", alvoId: meta, grandeza: "receitaPrimaria", valor: "2000000.00" }] });
    expect([e1.numero, e2.numero, l1.numero]).toEqual([1, 2, 1]);
    const lidas = await emendasDaPeca(prisma, "PPA", planoId);
    expect(lidas.map((e) => [e.numero, e.situacao, e.acrescimos.toFixed(2), e.reducoes.toFixed(2), e.vereador])).toEqual([
      [1, "AGUARDANDO_SANCAO", "100000.00", "50000.00", "Vereador Fictício"],
      [2, "AGUARDANDO_SANCAO", "10.00", "0.00", "Vereador Fictício"],
    ]);
    expect(lidas[0]?.itens.map((i) => i.rotulo)).toEqual(["previsão de receita 11130111 fonte 500 em 2027 — previsão de receita", "previsão de receita 11140211 fonte 500 em 2027 — previsão de receita"]);
  });

  it("t2: o cadastro recusa item zero, linha repetida, linha de outra peça, valor fora da linha e data impossível", async () => {
    expect(await recusa(() => doPpa([{ alvoId: a, valor: "0.00" }]))).toMatch(/valor zero/);
    expect(await recusa(() => doPpa([{ alvoId: a, valor: "1.00" }, { alvoId: a, valor: "2.00" }]))).toMatch(/aparece duas vezes/);
    expect(await recusa(() => cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "PPA", pecaId: planoId, itens: [{ alvo: "META_ANUAL_LDO", alvoId: meta, grandeza: "receitaTotal", valor: "1.00" }] }))).toMatch(/aponta uma linha da LDO/);
    expect(await recusa(() => cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "PPA", pecaId: planoId, itens: [{ alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "receitaTotal", valor: "1.00" }] }))).toMatch(/não pertence à linha escolhida/);
    expect(await recusa(() => cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "LDO", pecaId: ldoId, itens: [{ alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", valor: "1.00" }] }))).toMatch(/aponta uma linha do PPA/);
    expect(await recusa(() => cadastrarEmendaAoPlanejamento(prisma, { ...emenda, data: "2027-02-30", peca: "PPA", pecaId: planoId, itens: [{ alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", valor: "1.00" }] }))).toMatch(/não existe no calendário/);
    expect(await prisma.emendaAoPlanejamento.count()).toBe(0);
  });

  it("t3: a linha bloqueada não recebe emenda; a liberação é registro novo, e não se repete", async () => {
    const bl = await bloquearLinhaParaEmendas(prisma, { alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", motivo: "Receita vinculada por convênio", criadoPor: POR });
    expect(await recusa(() => doPpa([{ alvoId: a, valor: "5.00" }]))).toMatch(/está bloqueada para emendas/);
    expect(await recusa(() => bloquearLinhaParaEmendas(prisma, { alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", motivo: "de novo, por engano", criadoPor: POR }))).toMatch(/já está bloqueada/);
    // A outra linha não é afetada pelo bloqueio da primeira.
    await doPpa([{ alvoId: b, valor: "5.00" }]);
    expect((await bloqueiosDaPeca(prisma, "PPA", planoId)).map((x) => x.motivo)).toEqual(["Receita vinculada por convênio"]);
    await revogarBloqueioDeEmendaAoPlanejamento(prisma, { bloqueioId: bl.id, motivo: "Convênio encerrado", criadoPor: POR });
    expect(await recusa(() => revogarBloqueioDeEmendaAoPlanejamento(prisma, { bloqueioId: bl.id, motivo: "liberar de novo", criadoPor: POR }))).toMatch(/já foi liberado/);
    expect(await bloqueiosDaPeca(prisma, "PPA", planoId)).toEqual([]);
    await doPpa([{ alvoId: a, valor: "5.00" }]);
  });

  it("t4: aprovação total e parcial pela mesma lei — um ato só, com os itens aprovados, e o valor vigente muda", async () => {
    const e1 = await doPpa([{ alvoId: a, valor: "100000.00" }, { alvoId: b, valor: "-50000.00" }]);
    const e2 = await doPpa([{ alvoId: a, valor: "10.00" }, { alvoId: b, valor: "-20.00" }]);
    const s1 = await sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e1.id, resultado: "APROVADA" });
    const itensE2 = await prisma.itemDaEmendaAoPlanejamento.findMany({ where: { emendaId: e2.id }, select: { id: true, valor: true }, orderBy: { valor: "desc" } });
    const s2 = await sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e2.id, resultado: "PARCIAL", itensAprovados: [itensE2[0]!.id] });
    expect([s1.itensAprovados, s2.itensAprovados, s2.atoId === s1.atoId]).toEqual([2, 1, true]);
    const ato = await prisma.atoDeAlteracaoDoPlanejamento.findUniqueOrThrow({ where: { id: s1.atoId! }, select: { numero: true, ano: true, planoId: true, itens: { select: { previsaoReceitaPpaId: true, valorAjuste: true } } } });
    expect([ato.numero, ato.ano, ato.planoId, ato.itens.length]).toEqual(["31", 2027, planoId, 3]);
    const soma = (id: string): string => ato.itens.filter((i) => i.previsaoReceitaPpaId === id).reduce((s, i) => s + Number(i.valorAjuste), 0).toFixed(2);
    expect([soma(a), soma(b)]).toEqual(["100010.00", "-50000.00"]);
    const lidas = await emendasDaPeca(prisma, "PPA", planoId);
    expect(lidas.map((e) => [e.situacao, e.lei, e.itens.map((i) => i.sancionado)])).toEqual([
      ["APROVADA", "31/2027", [true, true]],
      ["PARCIAL", "31/2027", lidas[1]!.itens.map((i) => i.valor.toFixed(2) === "10.00")],
    ]);
  });

  it("t5: a mesma lei com outra data é recusada; veto não grava ato; e a emenda não se sanciona duas vezes", async () => {
    const e1 = await doPpa([{ alvoId: a, valor: "100.00" }]);
    const e2 = await doPpa([{ alvoId: b, valor: "200.00" }]);
    const e3 = await doPpa([{ alvoId: a, valor: "300.00" }]);
    await sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e1.id, resultado: "APROVADA" });
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, data: "2027-06-11", emendaId: e2.id, resultado: "APROVADA" }))).toMatch(/Lei nº 31\/2027 já está registrada nesta peça com outra data/i);
    const veto = await sancionarEmendaAoPlanejamento(prisma, { ...lei, leiNumero: "32", emendaId: e3.id, resultado: "REJEITADA" });
    expect(veto.atoId).toBeNull();
    expect(await prisma.atoDeAlteracaoDoPlanejamento.count({ where: { numero: "32" } })).toBe(0);
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e1.id, resultado: "REJEITADA" }))).toMatch(/já foi sancionada ou vetada/);
    expect(await prisma.sancaoDaEmendaAoPlanejamento.count({ where: { emendaId: e2.id } })).toBe(0);
  });

  it("t6: o guard do ato decide na sanção — redução maior que a linha e primária acima da total são recusadas, e nada é gravado", async () => {
    const e = await doPpa([{ alvoId: b, valor: "-500000.00" }]);
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e.id, resultado: "APROVADA" }))).toMatch(/ALTERAÇÃO RECUSADA na previsão de receita 11140211.*Previsão de receita ficaria -100000\.00/);
    const soPrimaria = await cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "LDO", pecaId: ldoId, itens: [{ alvo: "META_ANUAL_LDO", alvoId: meta, grandeza: "receitaPrimaria", valor: "2000000.00" }] });
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: soPrimaria.id, resultado: "APROVADA" }))).toMatch(/a primária não pode exceder a total/);
    expect([await prisma.sancaoDaEmendaAoPlanejamento.count(), await prisma.atoDeAlteracaoDoPlanejamento.count(), await prisma.alteracaoDeValorPlanejado.count()]).toEqual([0, 0, 0]);
    const asDuas = await cadastrarEmendaAoPlanejamento(prisma, { ...emenda, peca: "LDO", pecaId: ldoId, itens: [{ alvo: "META_ANUAL_LDO", alvoId: meta, grandeza: "receitaPrimaria", valor: "2000000.00" }, { alvo: "META_ANUAL_LDO", alvoId: meta, grandeza: "receitaTotal", valor: "2000000.00" }] });
    const s = await sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: asDuas.id, resultado: "APROVADA" });
    expect(await prisma.atoDeAlteracaoDoPlanejamento.findUniqueOrThrow({ where: { id: s.atoId! }, select: { ldoId: true } })).toEqual({ ldoId });
  });

  it("t7: a sanção parcial exige a escolha certa", async () => {
    const e = await doPpa([{ alvoId: a, valor: "1.00" }, { alvoId: b, valor: "2.00" }]);
    const outra = await doPpa([{ alvoId: a, valor: "3.00" }]);
    const itens = await prisma.itemDaEmendaAoPlanejamento.findMany({ where: { emendaId: e.id }, select: { id: true } });
    const daOutra = await prisma.itemDaEmendaAoPlanejamento.findFirstOrThrow({ where: { emendaId: outra.id }, select: { id: true } });
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e.id, resultado: "PARCIAL", itensAprovados: [] }))).toMatch(/informe quais linhas foram sancionadas/);
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e.id, resultado: "PARCIAL", itensAprovados: itens.map((i) => i.id) }))).toMatch(/isso é aprovação total/);
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, emendaId: e.id, resultado: "PARCIAL", itensAprovados: [daOutra.id] }))).toMatch(/não é desta emenda/);
  });

  it("t8: cada autoridade no seu ato — quem cadastra não sanciona, e quem cadastra a LOA não emenda", async () => {
    const soEmenda = await usuarioCom("so-emenda-plan@cg.pb.gov.br", ["CADASTRAR_EMENDA_AO_ORCAMENTO"]);
    const soLoa = await usuarioCom("so-loa-plan@cg.pb.gov.br", ["CADASTRAR_LOA"]);
    const e = await cadastrarEmendaAoPlanejamento(prisma, { ...emenda, criadoPor: soEmenda, peca: "PPA", pecaId: planoId, itens: [{ alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", valor: "1.00" }] });
    expect(await recusa(() => sancionarEmendaAoPlanejamento(prisma, { ...lei, criadoPor: soEmenda, emendaId: e.id, resultado: "APROVADA" }))).toMatch(/SANCIONAR_EMENDA_AO_ORCAMENTO/);
    expect(await recusa(() => cadastrarEmendaAoPlanejamento(prisma, { ...emenda, criadoPor: soLoa, peca: "PPA", pecaId: planoId, itens: [{ alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", valor: "1.00" }] }))).toMatch(/CADASTRAR_EMENDA_AO_ORCAMENTO/);
    expect(await recusa(() => bloquearLinhaParaEmendas(prisma, { alvo: "PREVISAO_RECEITA_PPA", alvoId: a, grandeza: "valor", motivo: "tentativa sem poder", criadoPor: soLoa }))).toMatch(/CADASTRAR_EMENDA_AO_ORCAMENTO/);
  });
});
