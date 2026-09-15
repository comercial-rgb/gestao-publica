import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { diaCivil } from "../../packages/datas/index.js";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { vincularPessoaAoUsuario } from "../../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { cadastrarItemDoContrato, designarNoContrato } from "../../modules/m11-licitacoes/fiscalizacao.js";
import {
  cancelarSaldoDaOrdemDeServico, criarRascunhoDeOrdemDeServico, decidirControversia, descartarRascunhoDeOrdemDeServico, emitirOrdemDeServico,
  estornarMedicaoDaOrdem, movimentarExecucaoDaOrdemDeServico, registrarMedicaoDaOrdem, registrarRecebimentoDefinitivo, registrarRecebimentoProvisorio,
} from "../../modules/m11-licitacoes/ordem-de-servico.js";
import { execucaoDoContrato } from "../../modules/m11-licitacoes/execucao-do-contrato.js";
import { estornarAditivoPorItens, preverAditivoPorItens, registrarAditivoPorItens } from "../../modules/m11-licitacoes/aditivo-por-itens.js";

/**
 * ═══ A ORDEM DE SERVIÇO E OS RECEBIMENTOS PELO PAPEL DE RUNTIME (V7 M2 U1/U2 — RT02) ═══
 *
 * Todos os atos pela conexão `gestao_app` (sem posse, sem superusuário): rascunho, descarte, emissão, suspensão e
 * retomada, medição, provisório com controvérsia, decisão, definitivo, cancelamento de saldo e a leitura. E as
 * negativas do banco: nenhum desses fatos se reescreve nem se apaga.
 */
const dono = criarPrismaDeTeste();
const app = criarPrismaDoPapelDeRuntime();
await exigirBanco(dono);
await exigirBanco(app);
afterAll(async () => { await dono.$disconnect(); await app.$disconnect(); });

const ADMIN = "contratos.rt-os@teste.local";
const GESTORA = "gestora.rt-os@teste.local";
const FISCAL = "fiscal.rt-os@teste.local";
const RECEBEDOR = "recebedor.rt-os@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const negado = /permission denied|permissão negada/i;
let itemA = "";
let itemB = "";
let fiscal = "";

beforeAll(async () => {
  await limparBanco(dono);
  const contas: [string, string[], string | null][] = [
    [ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO", "REGISTRAR_ADITIVO", "ESTORNAR_MOVIMENTO_CONTRATUAL"], null],
    [GESTORA, ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO"], "11144477735"],
    [FISCAL, ["REGISTRAR_MEDICAO_DE_OBRA", "REGISTRAR_RECEBIMENTO_PROVISORIO"], "52998224725"],
    [RECEBEDOR, ["REGISTRAR_RECEBIMENTO_DEFINITIVO"], "86288366757"],
  ];
  for (const [ident, acoes, doc] of contas) {
    const p = await dono.perfil.create({ data: { nome: `RT-${ident}`, descricao: "rt", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
    const u = await dono.usuario.create({ data: { identificador: ident, nome: ident, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
    if (doc !== null) {
      await dono.pessoa.create({ data: { documento: doc, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: ident, criadoPor: "SEED" } } } });
      await vincularPessoaAoUsuario(app, { usuarioId: u.id, documento: doc, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
    }
  }
  await dono.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "RT/OS", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços", valorLicitado: "2000.00", criadoPor: "SEED" } });
  await dono.contrato.create({ data: { id: "ctr", numeroContrato: "CT-RT-OS", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
  itemA = (await cadastrarItemDoContrato(app, { contratoId: "ctr", descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId;
  itemB = (await cadastrarItemDoContrato(app, { contratoId: "ctr", descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId;
  await designarNoContrato(app, { contratoId: "ctr", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria RT-G", vigenciaInicio: dia(-30), criadoPor: ADMIN });
  fiscal = (await designarNoContrato(app, { contratoId: "ctr", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria RT-F", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
  await designarNoContrato(app, { contratoId: "ctr", papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria RT-R", vigenciaInicio: dia(-30), criadoPor: ADMIN });
}, 180_000);

describe("ordem de serviço e recebimentos pelo papel de runtime", () => {
  it("todos os atos pela conexão gestao_app, e nenhum fato se reescreve", async () => {
    const base = { contratoId: "ctr", finalidade: "Manutenção preventiva", inicioPrevisto: dia(-20), fimPrevisto: dia(20), condicoesDeRecebimento: "Relatório assinado", fiscalDesignacaoId: fiscal, criadoPor: GESTORA };
    const descartavel = await criarRascunhoDeOrdemDeServico(app, { ...base, itens: [{ itemDoContratoId: itemA, quantidade: "1" }] });
    await descartarRascunhoDeOrdemDeServico(app, { ordemId: descartavel.ordemId, motivo: "Rascunho criado por engano", criadoPor: GESTORA });
    const r = await criarRascunhoDeOrdemDeServico(app, { ...base, itens: [{ itemDoContratoId: itemA, quantidade: "6" }, { itemDoContratoId: itemB, quantidade: "10" }] });
    expect((await emitirOrdemDeServico(app, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA })).valor).toBe("1100.00");
    await movimentarExecucaoDaOrdemDeServico(app, { ordemId: r.ordemId, tipo: "SUSPENSAO", data: dia(-14), motivo: "Suspensão pelo runtime", criadoPor: GESTORA });
    await movimentarExecucaoDaOrdemDeServico(app, { ordemId: r.ordemId, tipo: "RETOMADA", data: dia(-12), motivo: "Retomada pelo runtime", criadoPor: GESTORA });
    const itens = await dono.itemDaOrdemDeServico.findMany({ where: { ordemId: r.ordemId }, select: { id: true, itemDoContratoId: true } });
    const oa = itens.find((i) => i.itemDoContratoId === itemA)!.id;
    const ob = itens.find((i) => i.itemDoContratoId === itemB)!.id;
    const m = await registrarMedicaoDaOrdem(app, { ordemId: r.ordemId, diaInicio: dia(-10), diaFim: dia(-3), itens: [{ itemDaOrdemId: oa, quantidade: "6" }, { itemDaOrdemId: ob, quantidade: "8" }], criadoPor: FISCAL });
    const medidos = await dono.itemMedidoNaOrdem.findMany({ where: { medicaoId: m.medicaoId }, select: { id: true, itemDaOrdemId: true } });
    const ma = medidos.find((x) => x.itemDaOrdemId === oa)!.id;
    const mb = medidos.find((x) => x.itemDaOrdemId === ob)!.id;
    await registrarRecebimentoProvisorio(app, { medicaoId: m.medicaoId, data: dia(-2), verificacoes: "Conferido pelo runtime", itens: [{ itemMedidoId: ma, quantidadeConforme: "5", quantidadeEmControversia: "1", motivo: "Sem assinatura do responsável" }, { itemMedidoId: mb, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL });
    expect((await registrarRecebimentoDefinitivo(app, { medicaoId: m.medicaoId, data: dia(0), conclusao: "Parte regular pelo runtime", itens: [{ itemMedidoId: ma, quantidade: "5" }, { itemMedidoId: mb, quantidade: "8" }], criadoPor: RECEBEDOR })).valor).toBe("900.00");
    const conf = await dono.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId: ma }, select: { id: true } });
    await decidirControversia(app, { conferenciaId: conf.id, resultado: "ACEITA", fundamento: "Assinatura apresentada", data: dia(0), criadoPor: RECEBEDOR });
    expect((await registrarRecebimentoDefinitivo(app, { medicaoId: m.medicaoId, data: dia(0), conclusao: "Complemento pelo runtime", itens: [{ itemMedidoId: ma, quantidade: "1" }], criadoPor: RECEBEDOR })).valor).toBe("100.00");
    await cancelarSaldoDaOrdemDeServico(app, { ordemId: r.ordemId, data: dia(0), motivo: "Horas não serão executadas", itens: [{ itemDaOrdemId: ob, quantidade: "2" }], criadoPor: GESTORA });
    expect((await execucaoDoContrato(app, "ctr", "FINANCEIRA")).ordens.find((o) => o.id === r.ordemId)?.valores).toEqual({ previsto: "1100.00", autorizado: "1000.00", medido: "1000.00", recebido: "1000.00", liquidado: "0.00" });

    for (const sql of [
      `UPDATE "ItemDaOrdemDeServico" SET "valorUnitario" = 1`,
      `UPDATE "EmissaoDaOrdemDeServico" SET "sha256" = 'x'`,
      `DELETE FROM "DescarteDaOrdemDeServico"`,
      `UPDATE "ItemMedidoNaOrdem" SET "quantidade" = 99`,
      `UPDATE "ConferenciaDoItemMedido" SET "quantidadeEmControversia" = 0`,
      `DELETE FROM "DecisaoDeControversia"`,
      `UPDATE "RecebimentoDefinitivo" SET "conclusao" = 'apagada'`,
      `UPDATE "CancelamentoDeSaldoDaOrdem" SET "quantidade" = 1`,
      `DELETE FROM "MovimentoDeExecucaoDaOrdem"`,
    ]) {
      await expect(app.$executeRawUnsafe(sql), sql).rejects.toThrow(negado);
    }
  });

  it("V7 M2 U5 — o aditivo por itens (prévia, registro com movimento, inclusão e estorno) pela conexão gestao_app, sem reescrita", async () => {
    // Item 2 de 20 para 24 horas a R$ 50,00 (nada medido depois da vigência): +R$ 200,00; item incluído 2 × R$ 30,00 = R$ 60,00.
    const termo = { contratoId: "ctr", numeroAditivo: "RT-1", dataAssinatura: dia(0), vigenciaInicio: dia(0), fundamento: "Lei 14.133/2021, art. 124, I, b", motivo: "Aditivo pelo papel de runtime", alteracoes: [{ itemDoContratoId: itemB, quantidade: "24", valorUnitario: "50" }], inclusoes: [{ descricao: "Relatório final", unidade: "relatório", quantidade: "2", valorUnitario: "30" }], criadoPor: ADMIN };
    expect((await preverAditivoPorItens(app, termo)).variacao).toBe("260.00");
    const r = await registrarAditivoPorItens(app, { ...termo, variacaoDoTermo: "260.00" });
    expect(r.movimentoId).not.toBeNull();
    const e = await estornarAditivoPorItens(app, { aditivoId: r.aditivoId, data: dia(0), motivo: "Estorno pelo papel de runtime", criadoPor: ADMIN });
    expect(e.movimentoEstornoId).not.toBeNull();
    for (const sql of [
      `UPDATE "AditivoPorItensDoContrato" SET "variacao" = 1`,
      `DELETE FROM "AlteracaoDeItemPorAditivo"`,
      `DELETE FROM "EstornoDeAditivoPorItens"`,
      `UPDATE "ItemDoContrato" SET "quantidade" = 99`,
    ]) {
      await expect(app.$executeRawUnsafe(sql), sql).rejects.toThrow(negado);
    }
  });

  it("V7 M2 U7 — a medição pela planilha da obra, a evidência e o estorno da medição pela conexão gestao_app, sem reescrita", async () => {
    const { confirmarPreviaDePlanilha, gerarPreviaDePlanilha, vincularItemDaPlanilhaAoContrato } = await import("../../modules/m11-licitacoes/planilha-orcamentaria.js");
    const { medirOrdemPelaPlanilha } = await import("../../modules/m11-licitacoes/medicao-pela-planilha.js");
    const { xlsxDeTeste } = await import("../fixtures/planilhas.js");
    const ENG = "engenharia.rt-os@teste.local";
    const pe = await dono.perfil.create({ data: { nome: "RT-eng-os", descricao: "rt", criadoPor: "SEED", permissoes: { create: [{ acao: "GERIR_PLANILHA_DA_OBRA", criadoPor: "SEED" }] } }, select: { id: true } });
    const ue = await dono.usuario.create({ data: { identificador: ENG, nome: ENG, criadoPor: "SEED" }, select: { id: true } });
    await dono.vinculoUsuarioPerfil.create({ data: { usuarioId: ue.id, perfilId: pe.id, criadoPor: "SEED" } });
    await dono.obra.create({ data: { id: "obra-rt-os", identificador: "OBRA-RT-OS", descricao: "Obra do runtime", tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "SEED" } as never });
    // 1.1 visita 8 × 95,00 = 760,00 (a planilha é orçamento; o contrato paga 100,00 por visita).
    const previa = await gerarPreviaDePlanilha(app, { obraId: "obra-rt-os", nomeDoArquivo: "o.xlsx", conteudo: xlsxDeTeste("Orçamento", [["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário", "Total"], ["1", "SERVIÇOS", null, null, null, 760], ["1.1", "Visita técnica", "visita", 8, 95, 760]]), criadoPor: ENG });
    const versao = await confirmarPreviaDePlanilha(app, { previaId: previa.previaId, descricao: "Orçamento do runtime", dataBaseDosPrecos: dia(-90), referenciaDePrecos: "Tabela sintética", vigenciaInicio: dia(-40), motivo: "Projeto aprovado", numeroDoContrato: "CT-RT-OS", cienteDasDivergencias: true, criadoPor: ENG });
    const servico = await dono.itemDaPlanilhaOrcamentaria.findFirstOrThrow({ where: { planilhaId: versao.planilhaId, codigo: "1.1" }, select: { id: true } });
    await vincularItemDaPlanilhaAoContrato(app, { itemDaPlanilhaId: servico.id, itemDoContratoId: itemA, motivo: "Correspondência conferida pela engenharia", criadoPor: ENG });
    const r = await criarRascunhoDeOrdemDeServico(app, { contratoId: "ctr", finalidade: "Acompanhamento da obra pelo runtime", inicioPrevisto: dia(-20), fimPrevisto: dia(20), condicoesDeRecebimento: "Relatório assinado", fiscalDesignacaoId: fiscal, itens: [{ itemDoContratoId: itemA, quantidade: "2" }], criadoPor: GESTORA });
    await emitirOrdemDeServico(app, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const m = await medirOrdemPelaPlanilha(app, { ordemId: r.ordemId, planilhaId: versao.planilhaId, diaInicio: dia(-10), diaFim: dia(-9), itens: [{ itemDaPlanilhaId: servico.id, quantidade: "2" }], evidencias: [{ nomeOriginal: "foto.png", mimeType: "image/png", conteudo: png }], criadoPor: FISCAL });
    expect(m).toMatchObject({ valor: "200.00", valorNaPlanilha: "190.00", evidencias: 1 });
    expect((await estornarMedicaoDaOrdem(app, { medicaoId: m.medicaoId, motivo: "Estorno da medição pelo papel de runtime", criadoPor: FISCAL })).valor).toBe("200.00");
    for (const sql of [
      `UPDATE "MedicaoDaOrdemNaPlanilha" SET "sha256" = 'x'`,
      `UPDATE "ItemMedidoDaOrdemNaPlanilha" SET "quantidade" = 99`,
      `DELETE FROM "ItemMedidoDaOrdemNaPlanilha"`,
      `UPDATE "EstornoDeMedicaoDaOrdem" SET "motivo" = 'apagado'`,
      `DELETE FROM "EstornoDeMedicaoDaOrdem"`,
    ]) {
      await expect(app.$executeRawUnsafe(sql), sql).rejects.toThrow(negado);
    }
  }, 180_000);
});
