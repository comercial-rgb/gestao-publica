import "dotenv/config";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { semearSagresPoc } from "../prisma/seed/sagres-poc.js";
import { cadastrarUnidadeGestora, vincularUnidadeOrcamentariaAUg } from "../modules/m01-core-contabil/unidade-gestora.js";
import { declararTitularDaContaBancaria } from "../modules/m01-core-contabil/entidade-contabil.js";
import { estornarMovimentoExtra, registrarDispendioExtra, registrarIngressoExtra } from "../modules/m07-extraorcamentario/extraorcamentario.js";
import { roteiroDispendioExtra, roteiroIngressoExtra } from "../modules/m07-extraorcamentario/dominio.js";
import { atribuirEntidadeAoMovimentoExtra } from "../modules/m07-extraorcamentario/atribuicao-de-entidade.js";
import { atribuirEntidadeAArrecadacao } from "../modules/m04-receita/atribuicao-de-entidade.js";
import { designarOrdenador } from "../modules/m05-despesa/ordenador.js";
import { importarPlanoDoTribunal } from "../adapters/tribunais/tce-pb/sagres/plano-do-tribunal.js";
import {
  gerarDespesaExtra,
  gerarEstornoReceitaExtraOuRecusa,
  gerarReceitaExtraOuRecusa,
  gerarReceitaOrcamentaria,
} from "../adapters/tribunais/tce-pb/sagres/gerador.js";
import { gerarOrdenador } from "../adapters/tribunais/tce-pb/sagres/gerador-v26.js";
import { aplicarAbrangencia, posicaoDoCampo, type ArquivoDoPacote } from "../adapters/tribunais/tce-pb/sagres/abrangencia.js";
import { criarResolvedorDeUgs, type ResolvedorDeUgs } from "../adapters/tribunais/tce-pb/sagres/ug-do-registro.js";
import { cliente } from "../lib/portas/cliente.js";
import { contextoDasUgs } from "../lib/portas/sagres.js";

/**
 * V34 — O SAGRES COM DUAS UGS PARA A RECEITA, OS EXTRAORÇAMENTÁRIOS E O ORDENADOR, pelos geradores reais, pelo
 * contexto real da porta (`contextoDasUgs`) e pelo recorte real — o mesmo encadeamento de `montarPreviewSagres`.
 *
 * As duas UGs têm movimentos e referências distintos:
 *   · Prefeitura (201001): a retenção de ISS da POC (14/09, receita extra nº 1, pela unidade 99001 do empenho) e o
 *     recolhimento parcial dela pela conta da Prefeitura (21/09, despesa extra nº 2);
 *   · Câmara (201002): a caução na conta da Câmara (16/09, receita extra nº 2), o estorno dela (18/09, estorno nº 1),
 *     e um recolhimento PARCIAL da retenção da Prefeitura pela conta da Câmara (22/09, despesa extra nº 3) — a
 *     referência leva a UG DA RECEITA (201001), não a de quem recolheu;
 *   · sem titular: a caução numa conta sem titular declarado (16/09, receita extra nº 3) — omitida e nomeada nos dois
 *     pacotes, até a regularização, quando entra na Câmara COM O MESMO NÚMERO.
 * E entre exercícios: o recolhimento de 10/01/2027 (despesa extra nº 1 de 2027) aponta a receita extra nº 1 de 2026.
 *
 * Numeração: os números são os do exercício do ente inteiro (literais pela ordem de gravação: na POC, a retenção é o
 * 1º ingresso e o recolhimento de 20/09 o 1º dispêndio). A prova de que nenhum recorte renumera é a comparação com a
 * exportação COMPLETA (o gerador sem resolvedor, o regime de uma UG): cada número que sai numa UG sai igual nela.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const PREF = "201001";
const CAM = "201002";
const CNPJ = "12345678000195";
const D = (mes: number, dia: number, ano = 2026): Date => new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
const PCASP = readFileSync("docs/oficial/tce-pb/Pcasp_2025.xlsx");
const CONTA_BANCOS = "1.1.1.1.1.19.00";
const ISS = "2.1.8.8.1.02.00";
const ATO = { atoTipo: "LEI" as const, atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1" };
const linhas = (b: Buffer): string[] => b.toString("utf8").split("\r\n").filter((l) => l !== "");
let fonte = "";
let ids: { cauCam: string; cauSem: string; ret: string; issTipo: string } = { cauCam: "", cauSem: "", ret: "", issTipo: "" };

async function entidade(id: string, codigo: string, nome: string): Promise<void> {
  await prisma.entidadeContabil.create({ data: { id, codigo, criadoPor: POR } });
  await prisma.versaoDaEntidadeContabil.create({
    data: { entidadeId: id, versao: 1, nome, tipoManad: codigo === "0001" ? "01" : "02", ...ATO, atoCitacao: "Lei orgânica", criadoPor: POR },
  });
}
const titular = (conta: string, ent: string, nome: string) =>
  declararTitularDaContaBancaria(prisma, { contaBancariaId: conta, entidadeId: ent, ...ATO, atoCitacao: `A conta é da ${nome}.`, criadoPor: POR }, new Date());

beforeEach(async () => {
  await limparBanco(prisma);
  await semearSagresPoc(prisma, { criadoPor: POR });
  await entidade("ent-pref", "0001", "Prefeitura Municipal");
  await entidade("ent-cam", "0002", "Câmara Municipal");
  const base = { cnpj: null, vigenteDesde: D(1, 1), fundamento: "Cadastro de UG do Tribunal (fixture do teste)", criadoPor: POR };
  const ugPref = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: PREF, nome: "Prefeitura Municipal", naturezaJuridica: "PREFEITURA_OU_SECRETARIA", entidadeContabilId: "ent-pref" })).id;
  const ugCam = (await cadastrarUnidadeGestora(prisma, { ...base, codigoTce: CAM, nome: "Câmara Municipal", naturezaJuridica: "CAMARA_MUNICIPAL", entidadeContabilId: "ent-cam" })).id;
  await prisma.orgao.create({ data: { id: "org-cam", codigo: "98", nome: "CÂMARA MUNICIPAL - TESTE" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-cam", codigo: "98001", descricao: "CÂMARA MUNICIPAL - TESTE", orgaoId: "org-cam" } });
  const uoPoc = await prisma.unidadeOrcamentaria.findUniqueOrThrow({ where: { codigo: "99001" }, select: { id: true } });
  const fund = "Quadro de unidades da LOA 2026 (fixture)";
  await vincularUnidadeOrcamentariaAUg(prisma, { unidadeOrcId: uoPoc.id, ugId: ugPref, vigenteDesde: D(1, 1), fundamento: fund, criadoPor: POR });
  await vincularUnidadeOrcamentariaAUg(prisma, { unidadeOrcId: "uo-cam", ugId: ugCam, vigenteDesde: D(1, 1), fundamento: fund, criadoPor: POR });

  fonte = (await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "DISPENDIO" }, select: { fonteId: true } })).fonteId!;
  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-cam", codigo: "CC-CAM", descricao: "MOVIMENTO DA CAMARA", fonteId: fonte, banco: "001", agencia: "4321", digitoAgencia: "0", conta: "33333", digitoConta: "3" },
      { id: "cb-sem", codigo: "CC-SEM", descricao: "CONTA SEM TITULAR", fonteId: fonte, banco: "001", agencia: "4321", digitoAgencia: "0", conta: "44444", digitoConta: "4" },
    ],
  });
  // A conta da POC ganha titular DEPOIS dos fatos dela: antes da primeira declaração, vale a primeira.
  await titular("cb-poc-a", "ent-pref", "Prefeitura Municipal");
  await titular("cb-cam", "ent-cam", "Câmara Municipal");
  for (const ano of [2026, 2027]) {
    await importarPlanoDoTribunal(prisma, { exercicio: ano, anoDaTabela: 2024, arquivoNome: "Pcasp_2025.xlsx", conteudo: PCASP, fundamento: "Tabela de 2024 do Tribunal (teste).", criadoPor: POR });
  }
  await prisma.contaPcasp.createMany({
    data: [{ codigo: "2.1.8.8.1.04.01", nome: "Depositos e caucoes", naturezaSaldo: "CREDORA", nivel: 7, analitica: true, indicadorSuperavit: "F" }],
    skipDuplicates: true,
  });
  const caucao = await prisma.tipoConsignacao.upsert({ where: { codigo: "CAUCAO" }, update: {}, create: { codigo: "CAUCAO", descricao: "Caução", criadoPor: POR } });
  const rot = roteiroIngressoExtra({ disponibilidade: CONTA_BANCOS, consignacaoAPagar: "2.1.8.8.1.04.01" });
  const cau = (conta: string, valor: string, quem: string) =>
    registrarIngressoExtra(prisma, { tipoConsignacaoId: caucao.id, credorConsignatario: quem, documentoDoContribuinte: "11222333000181", contaBancaria: conta, fonteId: fonte, valor, data: D(9, 16), historico: "Caucao do contrato", criadoPor: POR }, rot);
  const cauCam = (await cau("CC-CAM", "300.00", "Construtora X")).movimentoId;
  const cauSem = (await cau("CC-SEM", "50.00", "Construtora Y")).movimentoId;
  await estornarMovimentoExtra(prisma, { movimentoId: cauCam, data: D(9, 18), motivo: "Caucao registrada em duplicidade", criadoPor: POR });
  const ret = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { tipo: "INGRESSO", pagamentoId: { not: null } }, select: { id: true, tipoConsignacaoId: true } });
  const recolher = (conta: string, valor: string, data: Date) =>
    registrarDispendioExtra(
      prisma,
      { tipoConsignacaoId: ret.tipoConsignacaoId, credorConsignatario: "Municipio de Campina Grande", documentoDoFavorecido: "12345678000195", contaBancaria: conta, fonteId: fonte, valor, data, historico: "Recolhimento parcial do ISS", criadoPor: POR, alocacoes: [{ ingressoId: ret.id, valor }] },
      roteiroDispendioExtra({ consignacaoAPagar: ISS, disponibilidade: CONTA_BANCOS })
    );
  await recolher("CC-POC-A", "100.00", D(9, 21));
  await recolher("CC-CAM", "60.00", D(9, 22));
  await recolher("CC-POC-A", "40.00", D(1, 10, 2027));
  ids = { cauCam, cauSem, ret: ret.id, issTipo: ret.tipoConsignacaoId };
}, 240000);

/** O encadeamento da porta: o resolvedor nos geradores, o contexto real com `ugPorRegistro`, o recorte. */
async function pacote(ug: string, dia: Date, gerar: (r: ResolvedorDeUgs | undefined) => Promise<ArquivoDoPacote | null>) {
  const r = criarResolvedorDeUgs(prisma);
  const arq = await gerar(r);
  const ctx = { ...(await contextoDasUgs(cliente(), dia, ug)), ugPorRegistro: true };
  const abr = aplicarAbrangencia(arq === null ? [] : [arq], ctx);
  return { linhas: abr.arquivos.flatMap((a) => linhas(a.conteudo)), fora: abr.fora, omitidos: r.omitidos() };
}
const campo = (tabela: string, nome: string, l: string): string => {
  const p = posicaoDoCampo(tabela, nome);
  if (p === null) throw new Error(`${tabela}.${nome} fora do leiaute`);
  return l.slice(p.ini - 1, p.fim);
};
const receitaExtra = (ug: string, dia: Date) => (r: ResolvedorDeUgs | undefined) =>
  gerarReceitaExtraOuRecusa(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia, ...(r ? { ugs: r } : {}) }).then((x) => {
    if (!("arquivo" in x)) throw new Error(x.recusa);
    return x.arquivo;
  });
const despesaExtra = (ug: string, dia: Date) => (r: ResolvedorDeUgs | undefined) =>
  gerarDespesaExtra(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: CNPJ, codFonteRecursoExtra: "869", dia, ...(r ? { ugs: r } : {}) });

describe("V34 — SAGRES por registro com duas UGs", () => {
  it("t1: receita extra do dia 16/09 — a caução da Câmara só na Câmara (nº 2), a sem titular omitida e nomeada nas duas", async () => {
    const pref = await pacote(PREF, D(9, 16), receitaExtra(PREF, D(9, 16)));
    const cam = await pacote(CAM, D(9, 16), receitaExtra(CAM, D(9, 16)));
    expect(pref.fora).toEqual([]);
    expect(pref.linhas).toEqual([]);
    expect(cam.linhas.map((l) => `${campo("ReceitaExtra", "codUnidadeGestora", l)}|${campo("ReceitaExtra", "numero", l)}|${campo("ReceitaExtra", "valor", l)}`)).toEqual([`${CAM}|0000002|0000000000300,00`]);
    for (const p of [pref, cam]) {
      expect(p.omitidos).toEqual([{ arquivo: "ReceitaExtra", documento: "receita extra nº 3 de 16/09/2026 (50.00)", motivo: "a conta CC-SEM não tem titular declarado, e o movimento não foi atribuído a nenhuma entidade" }]);
    }
    // A exportação COMPLETA (sem resolvedor) tem os mesmos números: o recorte não renumera.
    const completo = linhas((await receitaExtra(CAM, D(9, 16))(undefined)).conteudo).map((l) => campo("ReceitaExtra", "numero", l));
    expect(completo).toEqual(["0000002", "0000003"]);
  });

  it("t2: regularizada a caução sem titular, ela entra na Câmara com o MESMO número; a recusa da segunda atribuição diz por quê", async () => {
    await atribuirEntidadeAoMovimentoExtra(prisma, { movimentoId: ids.cauSem, entidadeId: "ent-cam", motivo: "caução do contrato da Câmara depositada na conta errada", ...ATO, atoCitacao: "Resolução da Câmara Municipal sobre as cauções", criadoPor: POR }, new Date());
    const cam = await pacote(CAM, D(9, 16), receitaExtra(CAM, D(9, 16)));
    expect(cam.omitidos).toEqual([]);
    expect(cam.linhas.map((l) => campo("ReceitaExtra", "numero", l))).toEqual(["0000002", "0000003"]);
    // Retenção, estorno e conta com titular não se atribuem: o vínculo deles já existe, e a recusa diz qual.
    const atribuir = (movimentoId: string) => atribuirEntidadeAoMovimentoExtra(prisma, { movimentoId, entidadeId: "ent-cam", motivo: "tentativa de sobrepor o vínculo", ...ATO, atoCitacao: "Resolução da Câmara Municipal", criadoPor: POR }, new Date());
    await expect(atribuir(ids.ret)).rejects.toThrow(/é uma RETENÇÃO: a unidade dele é a da unidade orçamentária do empenho/);
    await expect(atribuir(ids.cauCam)).rejects.toThrow(/conta CC-CAM, que tem titular declarado/);
    await expect(atribuir(ids.cauSem)).rejects.toThrow(/já foi atribuído à entidade 0002/);
    const estorno = await prisma.movimentoExtraorcamentario.findFirstOrThrow({ where: { estornoDeId: ids.cauCam }, select: { id: true } });
    await expect(atribuir(estorno.id)).rejects.toThrow(/é um ESTORNO/);
    expect(await prisma.atribuicaoDeEntidadeDoMovimentoExtra.count()).toBe(1);
  });

  it("t3: a retenção da Prefeitura vai à Prefeitura com a UG da retenção; o estorno da caução vai à Câmara apontando o nº 2", async () => {
    const pref = await pacote(PREF, D(9, 14), receitaExtra(PREF, D(9, 14)));
    expect(pref.linhas.map((l) => `${campo("ReceitaExtra", "codUnidadeGestora", l)}|${campo("ReceitaExtra", "numero", l)}|${campo("ReceitaExtra", "codUnidadeGestoraRetencao", l)}`)).toEqual([`${PREF}|0000001|${PREF}`]);
    expect((await pacote(CAM, D(9, 14), receitaExtra(CAM, D(9, 14)))).linhas).toEqual([]);
    const est = (ug: string) =>
      pacote(ug, D(9, 18), (r) => gerarEstornoReceitaExtraOuRecusa(prisma, { codUnidadeGestora: ug, dia: D(9, 18), ...(r ? { ugs: r } : {}) }).then((x) => ("arquivo" in x ? x.arquivo : Promise.reject(new Error(x.recusa)))));
    expect((await est(PREF)).linhas).toEqual([]);
    expect((await est(CAM)).linhas.map((l) => `${campo("EstornoReceitaExtra", "codUnidadeGestora", l)}|${campo("EstornoReceitaExtra", "numReceitaExtra", l)}|${campo("EstornoReceitaExtra", "numero", l)}`)).toEqual([`${CAM}|0000002|0000001`]);
  });

  it("t4: pagamentos parciais da mesma retenção por UGs diferentes — cada despesa na sua UG, a referência com a UG DA RECEITA", async () => {
    const ref = (l: string) => `${campo("DespesaExtra", "codUnidadeGestora", l)}|${campo("DespesaExtra", "numero", l)}|${campo("DespesaExtra", "codUnidadeGestoraReceitaExtra", l)}|${campo("DespesaExtra", "exercicioReceitaExtra", l)}|${campo("DespesaExtra", "numReceitaExtra", l)}`;
    const d21 = await pacote(PREF, D(9, 21), despesaExtra(PREF, D(9, 21)));
    expect(d21.linhas.map(ref)).toEqual([`${PREF}|0000002|${PREF}|2026|0000001`]);
    expect((await pacote(CAM, D(9, 21), despesaExtra(CAM, D(9, 21)))).linhas).toEqual([]);
    const d22 = await pacote(CAM, D(9, 22), despesaExtra(CAM, D(9, 22)));
    expect(d22.linhas.map(ref)).toEqual([`${CAM}|0000003|${PREF}|2026|0000001`]);
    // Entre exercícios: o recolhimento de 2027 é o nº 1 de 2027 e aponta a receita nº 1 de 2026.
    const j10 = await pacote(PREF, D(1, 10, 2027), despesaExtra(PREF, D(1, 10, 2027)));
    expect(j10.linhas.map(ref)).toEqual([`${PREF}|0000001|${PREF}|2026|0000001`]);
  });

  it("t5: a troca posterior de titular da conta não reescreve o histórico; reexecutar dá os mesmos bytes", async () => {
    const antes = await pacote(CAM, D(9, 22), despesaExtra(CAM, D(9, 22)));
    // A conta da Câmara passa à Prefeitura hoje (versão 2): o recolhimento de 22/09 continua da Câmara.
    await titular("cb-cam", "ent-pref", "Prefeitura Municipal");
    const depois = await pacote(CAM, D(9, 22), despesaExtra(CAM, D(9, 22)));
    expect(depois.linhas).toEqual(antes.linhas);
    expect(depois.linhas).toHaveLength(1);
    expect((await pacote(PREF, D(9, 22), despesaExtra(PREF, D(9, 22)))).linhas).toEqual([]);
    // E o recorte da conta (cadastro e saldo) lê o titular do DIA, não o atual.
    const ctx = await contextoDasUgs(cliente(), D(9, 22), CAM);
    expect(ctx.ugDaConta.get("1|43210|333333")).toBe(CAM);
  });

  it("t6: a guia sem entidade fica omitida e nomeada; atribuída, vai à UG da entidade e só a ela", async () => {
    const receita = (ug: string) => (r: ResolvedorDeUgs | undefined) =>
      gerarReceitaOrcamentaria(prisma, { codUnidadeGestora: ug, cnpjGerenciadora: CNPJ, codContaArrecadadora: "CC-POC-A", dia: D(7, 5), ...(r ? { ugs: r } : {}) });
    const p1 = await pacote(PREF, D(7, 5), receita(PREF));
    expect(p1.linhas).toEqual([]);
    expect(p1.omitidos).toEqual([{ arquivo: "ReceitaOrcamentaria", documento: "guia 7 (ARRECADACAO) de 05/07/2026", motivo: "a guia 7 não declara a entidade titular e não foi atribuída a nenhuma" }]);
    const guia = await prisma.receitaArrecadada.findFirstOrThrow({ where: { numeroReceita: "7" }, select: { id: true } });
    await atribuirEntidadeAArrecadacao(prisma, { receitaArrecadadaId: guia.id, entidadeId: "ent-pref", motivo: "guia anterior ao carimbo da entidade", ...ATO, atoCitacao: "Lei orgânica da Prefeitura Municipal", criadoPor: POR }, new Date());
    const pref = await pacote(PREF, D(7, 5), receita(PREF));
    expect(pref.omitidos).toEqual([]);
    expect(pref.linhas.map((l) => `${campo("ReceitaOrcamentaria", "codUnidadeGestora", l)}|${campo("ReceitaOrcamentaria", "numeroReceita", l)}`)).toEqual([`${PREF}|0000007`]);
    expect((await pacote(CAM, D(7, 5), receita(CAM))).linhas).toEqual([]);
  });

  it("t7: ordenador — a designação da unidade da Câmara vai à Câmara; a do ente, só à UG cujos empenhos a citam", async () => {
    await designarOrdenador(prisma, { cpf: "52998224725", nome: "PREFEITO DO TESTE", escopo: "ENTE", unidadeOrcId: null, tipoDoAto: "NOMEACAO", ato: "Termo de posse 1/2026", vigenteDesde: D(9, 10), criadoPor: POR });
    await designarOrdenador(prisma, { cpf: "86288366757", nome: "PRESIDENTE DA CAMARA", escopo: "UNIDADE_ORCAMENTARIA", unidadeOrcId: "uo-cam", tipoDoAto: "NOMEACAO", ato: "Ato da Mesa 1/2026", vigenteDesde: D(9, 10), criadoPor: POR });
    const ord = (ug: string) => (r: ResolvedorDeUgs | undefined) => gerarOrdenador(prisma, { codUnidadeGestora: ug, dia: D(9, 10), ...(r ? { ugs: r } : {}) });
    const doArquivo = (ls: readonly string[]) => ls.map((l) => `${campo("Ordenador", "codUnidadeGestora", l)}|${campo("Ordenador", "cpf", l)}`);
    expect(doArquivo((await pacote(PREF, D(9, 10), ord(PREF))).linhas)).toEqual([`${PREF}|52998224725`]);
    expect(doArquivo((await pacote(CAM, D(9, 10), ord(CAM))).linhas)).toEqual([`${CAM}|86288366757`]);
  });

  it("t8: sem o resolvedor (ugPorRegistro ausente) as tabelas por registro continuam fora com duas UGs — fail-closed", async () => {
    const arq = await receitaExtra(CAM, D(9, 16))(undefined);
    const r = aplicarAbrangencia([arq], await contextoDasUgs(cliente(), D(9, 16), CAM));
    expect(r.arquivos).toEqual([]);
    expect(r.fora[0]).toMatchObject({ arquivo: "ReceitaExtra", regra: "RECORTE_POR_UG_INDISPONIVEL" });
  });
});
