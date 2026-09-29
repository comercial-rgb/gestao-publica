import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { xlsxDeTeste, type CelulaDeTeste } from "./fixtures/planilhas.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { ComandoEmConflitoError, ComandoJaConcluidoError, comOperacaoRegistrada, criarRegistroDeOperacaoPrisma } from "../modules/m16-travamento/operacao.js";
import { registrarAditivoPorItens } from "../modules/m11-licitacoes/aditivo-por-itens.js";
import { execucaoDoContrato } from "../modules/m11-licitacoes/execucao-do-contrato.js";
import { cadastrarItemDoContrato, designarNoContrato, revogarDesignacaoNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import { andamentoDaPlanilha, conciliarServico, medirOrdemPelaPlanilha, versoesParaMedirAOrdem } from "../modules/m11-licitacoes/medicao-pela-planilha.js";
import {
  criarRascunhoDeOrdemDeServico,
  decidirControversia,
  emitirOrdemDeServico,
  estornarMedicaoDaOrdem,
  manifestoCanonico,
  registrarMedicaoDaOrdem,
  registrarRecebimentoDefinitivo,
  registrarRecebimentoProvisorio,
} from "../modules/m11-licitacoes/ordem-de-servico.js";
import { confirmarPreviaDePlanilha, gerarPreviaDePlanilha, revogarVinculoDaPlanilha, vincularItemDaPlanilhaAoContrato } from "../modules/m11-licitacoes/planilha-orcamentaria.js";

/**
 * ═══ A MEDIÇÃO DA ORDEM DE SERVIÇO PELA PLANILHA DA OBRA (V7 M2 U7) ═══
 *
 * O cenário de referência da ponte, SINTÉTICO, agora com a planilha da obra por cima:
 *   contrato A (R$ 2.000,00): item 1 visita 10 × R$ 100,00; item 2 hora 20 × R$ 50,00.
 *   planilha da obra, versão 1 (vale desde 40 dias atrás), declarando o contrato A — preços de ORÇAMENTO, não do contrato:
 *     1   SERVIÇOS TÉCNICOS
 *     1.1 visita técnica     visita  8 × 95,00 = 760,00   ← vínculo ao item 1 (a planilha prevê MENOS que o contrato)
 *     1.2 hora técnica       hora   20 × 48,00 = 960,00   ← vínculo ao item 2
 *     1.3 relatório fotog.   un      2 × 150,00 = 300,00  ← sem vínculo
 *   ordem nº 1: 6 visitas e 10 horas (R$ 1.100,00).
 *   medição pela planilha: 1.1 = 6 e 1.2 = 8 → no CONTRATO 6 × 100 + 8 × 50 = R$ 1.000,00; na PLANILHA 6 × 95 + 8 × 48 =
 *   570 + 384 = R$ 954,00. Recebimento: 5 visitas conformes e 1 em controvérsia, 8 horas conformes → R$ 900,00 conforme e
 *   R$ 100,00 em controvérsia; definitivo R$ 900,00; aceita a controvérsia, complemento R$ 100,00. As 2 horas não
 *   executadas (R$ 100,00) continuam a executar na ordem — não viram crédito.
 * Todos os valores esperados estão ESCRITOS aqui, calculados à mão.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "contratos.admin.u7@teste.local";
const ENG = "engenharia.u7@teste.local";
const GESTORA = "gestora.u7@teste.local";
const FISCAL = "fiscal.u7@teste.local";
const RECEBEDOR = "recebedor.u7@teste.local";
const OUTRO = "outro.setor.u7@teste.local";
const SO_NA_UG = "fiscal.so.na.ug.u7@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);
const TODAS = ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_MEDICAO_DE_OBRA", "REGISTRAR_RECEBIMENTO_PROVISORIO", "REGISTRAR_RECEBIMENTO_DEFINITIVO"];
const MOTIVO = "Correspondência conferida pela engenharia com o termo de referência";

async function conta(identificador: string, acoes: readonly string[], documento?: string, unidadeOrcId: string | null = null): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED" }, select: { id: true } });
  for (const acao of acoes) await prisma.permissaoDePerfil.create({ data: { perfilId: p.id, acao: acao as never, unidadeOrcId, criadoPor: "SEED" } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador.split("@")[0]!, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

const CABECALHO: CelulaDeTeste[] = ["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário", "Total"];
const linhasDaPlanilha = (visitas: number): CelulaDeTeste[][] => [
  CABECALHO,
  ["1", "SERVIÇOS TÉCNICOS", null, null, null, visitas * 95 + 960 + 300],
  ["1.1", "Visita técnica às unidades", "visita", visitas, 95, visitas * 95],
  ["1.2", "Hora técnica de engenharia", "hora", 20, 48, 960],
  ["1.3", "Relatório fotográfico", "un", 2, 150, 300],
];

const it_: Record<string, { a: string; b: string }> = {};
const fiscalDe: Record<string, string> = {};

async function versaoDaPlanilha(obraId: string, contrato: string, visitas: number, vigencia: string): Promise<{ planilhaId: string; s: Record<string, string> }> {
  const p = await gerarPreviaDePlanilha(prisma, { obraId, nomeDoArquivo: "orcamento.xlsx", conteudo: xlsxDeTeste("Orçamento", linhasDaPlanilha(visitas)), criadoPor: ENG });
  const v = await confirmarPreviaDePlanilha(prisma, { previaId: p.previaId, descricao: "Orçamento da obra", dataBaseDosPrecos: dia(-90), referenciaDePrecos: "Tabela sintética de teste", vigenciaInicio: vigencia, motivo: "Planilha do projeto aprovado", numeroDoContrato: contrato, cienteDasDivergencias: true, criadoPor: ENG });
  const itens = await prisma.itemDaPlanilhaOrcamentaria.findMany({ where: { planilhaId: v.planilhaId }, select: { id: true, codigo: true } });
  return { planilhaId: v.planilhaId, s: Object.fromEntries(itens.map((i) => [i.codigo, i.id])) };
}

const vincular = (itemDaPlanilhaId: string, itemDoContratoId: string) => vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId, itemDoContratoId, motivo: MOTIVO, criadoPor: ENG });

let v1: { planilhaId: string; s: Record<string, string> };

beforeEach(async () => {
  await limparBanco(prisma);
  await prisma.orgao.create({ data: { id: "u7-org", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "u7-uo", codigo: "01001", descricao: "Obras", orgaoId: "u7-org" } });
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO", "REGISTRAR_ADITIVO"]);
  await conta(ENG, ["GERIR_PLANILHA_DA_OBRA"]);
  await conta(GESTORA, TODAS, "11144477735");
  await conta(FISCAL, TODAS, "52998224725");
  await conta(RECEBEDOR, TODAS, "86288366757");
  await conta(OUTRO, TODAS, "39053344705");
  // A ação de medir concedida SÓ numa unidade orçamentária: o contrato é ato do ENTE, e a permissão de uma UG não o alcança.
  await conta(SO_NA_UG, TODAS, "71428793860", "u7-uo");
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0700", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços técnicos de engenharia na obra", valorLicitado: "4000.00", criadoPor: "SEED" } });
  for (const [id, numero, obra] of [["ctr-a", "CT-U7-A", "obra-a"], ["ctr-b", "CT-U7-B", "obra-b"]] as const) {
    await prisma.contrato.create({ data: { id, numeroContrato: numero, processoId: "proc", contratadoDocumento: "12345678000195", contratadoNome: "Engenharia Técnica Gama", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "REALIZACAO_OBRAS", criadoPor: "SEED" } });
    it_[id] = {
      a: (await cadastrarItemDoContrato(prisma, { contratoId: id, descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId,
      b: (await cadastrarItemDoContrato(prisma, { contratoId: id, descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId,
    };
    await designarNoContrato(prisma, { contratoId: id, papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: `Portaria G-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
    fiscalDe[id] = (await designarNoContrato(prisma, { contratoId: id, papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: `Portaria F-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
    await designarNoContrato(prisma, { contratoId: id, papel: "FISCAL", usuarioIdentificador: SO_NA_UG, atoDesignacao: `Portaria F2-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
    await designarNoContrato(prisma, { contratoId: id, papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: `Portaria R-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
    await prisma.obra.create({ data: { id: obra, identificador: `OBRA-${numero}`, descricao: "Reforma sintética da unidade de saúde", tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "SEED" } as never });
  }
  v1 = await versaoDaPlanilha("obra-a", "CT-U7-A", 8, dia(-40));
  await vincular(v1.s["1.1"]!, it_["ctr-a"]!.a);
  await vincular(v1.s["1.2"]!, it_["ctr-a"]!.b);
}, 120_000);

async function ordemEmitida(contrato: "ctr-a" | "ctr-b" = "ctr-a", a: string | null = "6", b: string | null = "10"): Promise<{ ordemId: string }> {
  const r = await criarRascunhoDeOrdemDeServico(prisma, {
    contratoId: contrato, finalidade: "Acompanhamento técnico da reforma", inicioPrevisto: dia(-20), fimPrevisto: dia(20),
    condicoesDeRecebimento: "Relatório de visitas assinado e planilha de horas", fiscalDesignacaoId: fiscalDe[contrato]!,
    itens: [...(a === null ? [] : [{ itemDoContratoId: it_[contrato]!.a, quantidade: a }]), ...(b === null ? [] : [{ itemDoContratoId: it_[contrato]!.b, quantidade: b }])],
    criadoPor: GESTORA,
  });
  await emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
  return { ordemId: r.ordemId };
}

const medir = (ordemId: string, planilhaId: string, de: string, ate: string, itens: { itemDaPlanilhaId: string; quantidade: string }[], quem = FISCAL, extra: Record<string, unknown> = {}) =>
  medirOrdemPelaPlanilha(prisma, { ordemId, planilhaId, diaInicio: de, diaFim: ate, itens, criadoPor: quem, ...extra } as never);

const contagem = async () => [await prisma.medicaoDaOrdemDeServico.count(), await prisma.medicaoDaOrdemNaPlanilha.count(), await prisma.itemMedidoNaOrdem.count(), await prisma.anexo.count()];

describe("U7 — a medição da ordem pela planilha", () => {
  it("MP01: mede pelos serviços da versão, valora pelo contrato, guarda a memória e segue para os recebimentos (900 + 100)", async () => {
    const o = await ordemEmitida();
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7, 7]);
    const r = await medir(o.ordemId, v1.planilhaId, dia(-10), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "6" }, { itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "8" }], FISCAL, { evidencias: [{ nomeOriginal: "foto-visita.png", mimeType: "image/png", conteudo: png }] });
    expect(r).toMatchObject({
      numero: 1, versao: 1, valor: "1000.00", valorNaPlanilha: "954.00", evidencias: 1,
      itens: [{ codigo: "1.1", item: 1, quantidade: "6.0000", acumulado: "6.0000", saldoNaPlanilha: "2.0000", aExecutarNaOrdem: "0.0000" }, { codigo: "1.2", item: 2, quantidade: "8.0000", acumulado: "8.0000", saldoNaPlanilha: "12.0000", aExecutarNaOrdem: "2.0000" }],
    });
    // O item medido da ordem é o de sempre: quantidade do serviço, unitário do CONTRATO.
    const medidos = await prisma.itemMedidoNaOrdem.findMany({ where: { medicaoId: r.medicaoId }, orderBy: { valor: "desc" }, select: { id: true, quantidade: true, valorUnitario: true, valor: true, origemNaPlanilha: { select: { codigo: true, precoDaPlanilha: true, valorNaPlanilha: true } } } });
    expect(medidos.map((m) => [m.quantidade.toFixed(0), m.valorUnitario.toFixed(2), m.valor.toFixed(2), m.origemNaPlanilha?.codigo, m.origemNaPlanilha?.precoDaPlanilha.toFixed(2), m.origemNaPlanilha?.valorNaPlanilha.toFixed(2)])).toEqual([["6", "100.00", "600.00", "1.1", "95.00", "570.00"], ["8", "50.00", "400.00", "1.2", "48.00", "384.00"]]);
    // A memória: o sha256 é o do manifesto gravado, com a versão, a referência de preços, os dois unitários e a evidência.
    const mem = await prisma.medicaoDaOrdemNaPlanilha.findUniqueOrThrow({ where: { medicaoId: r.medicaoId }, select: { manifesto: true, sha256: true } });
    expect(manifestoCanonico(mem.manifesto).sha256).toBe(mem.sha256);
    expect(mem.manifesto).toMatchObject({
      documento: "MEMORIA_DA_MEDICAO", planilha: { versao: 1, referenciaDePrecos: "Tabela sintética de teste" }, totais: { contrato: "1000.00", planilha: "954.00" },
      itens: [{ codigo: "1.1", previstoNaVersao: "8.0000", anteriorNaObra: "0.0000", atual: "6.0000", acumulado: "6.0000", saldoNaPlanilha: "2.0000", precoDaPlanilha: "95.0000", unitarioDoContrato: "100.0000", valorNoContrato: "600.00", valorNaPlanilha: "570.00", itemDoContrato: { numero: 1 } }, { codigo: "1.2" }],
      evidencias: [{ nome: "foto-visita.png" }],
    });

    // Recebimentos pelo caminho existente.
    const mA = medidos.find((m) => m.origemNaPlanilha?.codigo === "1.1")!.id;
    const mB = medidos.find((m) => m.origemNaPlanilha?.codigo === "1.2")!.id;
    await expect(registrarRecebimentoProvisorio(prisma, { medicaoId: r.medicaoId, data: dia(-2), verificacoes: "Relatórios de visita conferidos in loco", itens: [{ itemMedidoId: mA, quantidadeConforme: "5", quantidadeEmControversia: "1", motivo: "Visita sem assinatura do responsável da unidade" }, { itemMedidoId: mB, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL })).resolves.toMatchObject({ conforme: "900.00", emControversia: "100.00" });
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: r.medicaoId, data: HOJE, conclusao: "Parcela regular recebida", itens: [{ itemMedidoId: mA, quantidade: "5" }, { itemMedidoId: mB, quantidade: "8" }], criadoPor: RECEBEDOR })).resolves.toMatchObject({ valor: "900.00" });
    // O complemento só depois da aceitação, e só os R$ 100,00 da controvérsia.
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: r.medicaoId, data: HOJE, conclusao: "Complemento antes da decisão", itens: [{ itemMedidoId: mA, quantidade: "1" }], criadoPor: RECEBEDOR })).rejects.toThrow(/CONTROVERSIA-PENDENTE/);
    const conf = await prisma.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId: mA }, select: { id: true } });
    await decidirControversia(prisma, { conferenciaId: conf.id, resultado: "ACEITA", fundamento: "Assinatura apresentada depois da conferência", data: HOJE, criadoPor: RECEBEDOR });
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: r.medicaoId, data: HOJE, conclusao: "Complemento da controvérsia aceita", itens: [{ itemMedidoId: mA, quantidade: "1" }], criadoPor: RECEBEDOR })).resolves.toMatchObject({ valor: "100.00" });
    const x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    expect(x.ordens[0]!.valores).toMatchObject({ autorizado: "1100.00", medido: "1000.00", recebido: "1000.00" });
    expect(x.ordens[0]!.itens.map((i) => [i.item, i.aExecutar])).toEqual([[1, "0.0000"], [2, "2.0000"]]);
    expect(x.ordens[0]!.medicoes[0]).toMatchObject({ pelaPlanilha: { versao: 1, sha256: mem.sha256 }, estorno: null, evidencias: [{ nome: "foto-visita.png" }] });
    // Na visão financeira não saem as evidências.
    expect((await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).ordens[0]!.medicoes[0]!.evidencias).toEqual([]);
    // O andamento físico da obra por serviço.
    const and = (await andamentoDaPlanilha(prisma, v1.planilhaId))!;
    expect(and.servicos.map((s) => [s.codigo, s.previsto, s.medido, s.saldo, s.valorMedidoNaPlanilha])).toEqual([["1.1", "8.0000", "6.0000", "2.0000", "570.00"], ["1.2", "20.0000", "8.0000", "12.0000", "384.00"], ["1.3", "2.0000", "0.0000", "2.0000", "0.00"]]);
    expect(and.medicoes).toMatchObject([{ numero: 1, versao: 1, valorNoContrato: "1000.00", valorNaPlanilha: "954.00", situacao: "COM_RECEBIMENTO_DEFINITIVO" }]);
  });

  it("MP02: duas medições legítimas no mesmo dia; a mesma parcela de novo e o excesso sobre a planilha recusados pelo motivo certo", async () => {
    const o = await ordemEmitida();
    await expect(medir(o.ordemId, v1.planilhaId, dia(-10), dia(-6), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "3" }])).resolves.toMatchObject({ numero: 1, valor: "300.00" });
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "3" }])).resolves.toMatchObject({ numero: 2, valor: "300.00", itens: [{ acumulado: "6.0000", saldoNaPlanilha: "2.0000" }] });
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "10" }])).resolves.toMatchObject({ numero: 3, valor: "500.00" });
    const antes = await contagem();
    // A MESMA parcela das horas com outra chave: a planilha ainda comporta (20), a ordem não (10 autorizadas, 10 medidas).
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "10" }])).rejects.toThrow(/ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM: o item 2 \(Hora técnica\) tem 10\.0000 hora autorizado\(s\) na ordem nº 1, já mediu 10\.0000/);
    // Outra ordem autoriza as 4 visitas restantes do contrato; a PLANILHA prevê 8 e já mediu 6 na obra: 3 não cabem.
    const o2 = await ordemEmitida("ctr-a", "4", null);
    await expect(medir(o2.ordemId, v1.planilhaId, dia(-2), dia(-1), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "3" }])).rejects.toThrow(/ACIMA-DO-PREVISTO-NA-PLANILHA: o serviço 1\.1 \(Visita técnica às unidades\) prevê 8\.0000 visita na versão 1, já mediu 6\.0000 na obra e esta medição levaria a 9\.0000/);
    expect(await contagem()).toEqual(antes);
    await expect(medir(o2.ordemId, v1.planilhaId, dia(-2), dia(-1), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "2" }])).resolves.toMatchObject({ itens: [{ acumulado: "8.0000", saldoNaPlanilha: "0.0000", aExecutarNaOrdem: "2.0000" }] });
  });

  it("MP03: conciliação — sem vínculo, vínculo revogado, vínculo ambíguo, item fora da ordem, planilha de outro contrato e a medição avulsa do item vinculado", async () => {
    const o = await ordemEmitida("ctr-a", "6", null);
    const vazio = await contagem();
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.3"]!, quantidade: "1" }])).rejects.toThrow(/SERVICO-SEM-VINCULO: o serviço 1\.3 não tem vínculo vivo/);
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "1" }])).rejects.toThrow(/ITEM-FORA-DA-ORDEM: o serviço 1\.2 corresponde ao item 2 do contrato, que não está autorizado na ordem nº 1/);
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "1", valorUnitario: "1" } as never])).rejects.toThrow(/Unrecognized key|valorUnitario/);
    // O avulso do item ligado à planilha é recusado nomeando o serviço.
    const itemDaOrdem = await prisma.itemDaOrdemDeServico.findFirstOrThrow({ where: { ordemId: o.ordemId }, select: { id: true } });
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-5), diaFim: dia(-3), itens: [{ itemDaOrdemId: itemDaOrdem.id, quantidade: "1" }], criadoPor: FISCAL })).rejects.toThrow(/MEDICAO-PELA-PLANILHA: o item 1 \(Visita técnica\) está vinculado ao serviço 1\.1 da planilha da obra OBRA-CT-U7-A \(versão 1\)/);
    // Ambíguo: o item 1 do contrato ganha um segundo serviço na mesma versão.
    const segundo = await vincular(v1.s["1.3"]!, it_["ctr-a"]!.a);
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "1" }])).rejects.toThrow(/VINCULO-AMBIGUO: o item 1 do contrato está vinculado a 2 serviços desta versão \(1\.1, 1\.3\)/);
    await revogarVinculoDaPlanilha(prisma, { vinculoId: segundo.vinculoId, motivo: "Vínculo feito por engano no serviço de relatório", criadoPor: ENG });
    // Revogado o vínculo do próprio serviço, ele deixa de ser mensurável.
    const vivo = await prisma.vinculoDeItemDaPlanilhaAoContrato.findFirstOrThrow({ where: { itemDaPlanilhaId: v1.s["1.1"]!, revogacao: null }, select: { id: true } });
    await revogarVinculoDaPlanilha(prisma, { vinculoId: vivo.id, motivo: "Serviço será remedido por outro item após revisão", criadoPor: ENG });
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "1" }])).rejects.toThrow(/SERVICO-SEM-VINCULO: o serviço 1\.1/);
    // Planilha que declara OUTRO contrato.
    const vb = await versaoDaPlanilha("obra-b", "CT-U7-B", 8, dia(-40));
    await vincular(vb.s["1.1"]!, it_["ctr-b"]!.a);
    await expect(medir(o.ordemId, vb.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: vb.s["1.1"]!, quantidade: "1" }])).rejects.toThrow(/PLANILHA-DE-OUTRO-CONTRATO: a versão 1 da planilha da obra OBRA-CT-U7-B não declara o contrato CT-U7-A/);
    expect(await contagem()).toEqual(vazio);
  });

  it("MP03b: a conciliação pura — grupo e unidade diferente (a tela usa a mesma função)", () => {
    const item = { id: "i1", numero: 1, descricao: "Visita técnica", unidade: "visita" };
    const base = { id: "s", codigo: "1.1", tipo: "SERVICO", descricao: "Visita", unidade: "visita", vinculosVivos: [{ id: "v", motivo: MOTIVO, itemDoContrato: item }] };
    const mapa = new Map([["i1", ["1.1"]]]);
    const ordem = new Map([["i1", "io1"]]);
    expect(conciliarServico(base, mapa, ordem, "1/2026")).toMatchObject({ apto: true, itemDaOrdemId: "io1", vinculoId: "v" });
    expect(conciliarServico({ ...base, unidade: " Visita " }, mapa, ordem, "1/2026")).toMatchObject({ apto: true });
    expect(conciliarServico({ ...base, unidade: "visitas" }, mapa, ordem, "1/2026")).toMatchObject({ apto: false, recusa: "UNIDADE-NAO-CONCILIADA" });
    expect(conciliarServico({ ...base, tipo: "GRUPO" }, mapa, ordem, "1/2026")).toMatchObject({ apto: false, recusa: "MEDICAO-DE-GRUPO" });
    expect(conciliarServico({ ...base, vinculosVivos: [...base.vinculosVivos, { id: "v2", motivo: MOTIVO, itemDoContrato: { ...item, id: "i2", numero: 2 } }] }, mapa, ordem, "1/2026")).toMatchObject({ apto: false, recusa: "VINCULO-AMBIGUO" });
  });

  it("MP04 (ME06 da obra): aditivo e nova versão entre a emissão e a medição — cada período mede pela versão e pelo preço do seu primeiro dia, e a medição anterior não muda", async () => {
    const o = await ordemEmitida();
    const m1 = await medir(o.ordemId, v1.planilhaId, dia(-12), dia(-8), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "2" }]);
    expect(m1.valor).toBe("200.00"); // 2 × 100
    const memAntes = await prisma.medicaoDaOrdemNaPlanilha.findUniqueOrThrow({ where: { medicaoId: m1.medicaoId }, select: { manifesto: true, sha256: true } });
    // Aditivo: a visita passa a R$ 120,00 desde 5 dias atrás. M = 2 (período inteiramente anterior): (10 − 2) × 120 − (10 − 2) × 100 = 160,00.
    await registrarAditivoPorItens(prisma, { contratoId: "ctr-a", numeroAditivo: "1", dataAssinatura: HOJE, vigenciaInicio: dia(-5), fundamento: "Lei 14.133/2021, art. 124, II, d", motivo: "Reequilíbrio do preço da visita técnica comprovado", alteracoes: [{ itemDoContratoId: it_["ctr-a"]!.a, quantidade: "10", valorUnitario: "120" }], variacaoDoTermo: "160.00", criadoPor: ADMIN });
    // Nova versão da planilha no mesmo dia: a visita passa a prever 9; os vínculos são refeitos na versão 2.
    const v2 = await versaoDaPlanilha("obra-a", "CT-U7-A", 9, dia(-5));
    await vincular(v2.s["1.1"]!, it_["ctr-a"]!.a);
    await vincular(v2.s["1.2"]!, it_["ctr-a"]!.b);
    await expect(medir(o.ordemId, v2.planilhaId, dia(-7), dia(-6), [{ itemDaPlanilhaId: v2.s["1.1"]!, quantidade: "1" }])).rejects.toThrow(/VERSAO-NAO-APLICAVEL: o período começa em .*vale a versão 1/);
    await expect(medir(o.ordemId, v1.planilhaId, dia(-7), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "1" }])).rejects.toThrow(/PERIODO-ATRAVESSA-NOVA-VERSAO: a versão 2 da planilha vale desde/);
    await expect(medir(o.ordemId, v1.planilhaId, dia(-4), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "1" }])).rejects.toThrow(/VERSAO-NAO-APLICAVEL: .*vale a versão 2/);
    const m2 = await medir(o.ordemId, v2.planilhaId, dia(-4), dia(-2), [{ itemDaPlanilhaId: v2.s["1.1"]!, quantidade: "2" }]);
    // 2 × 120 (unitário do contrato em vigor no primeiro dia); acumulado do código 1.1 na obra 2 + 2 = 4; versão 2 prevê 9 → saldo 5.
    expect(m2).toMatchObject({ versao: 2, valor: "240.00", valorNaPlanilha: "190.00", itens: [{ acumulado: "4.0000", saldoNaPlanilha: "5.0000", aExecutarNaOrdem: "2.0000" }] });
    const memDepois = await prisma.medicaoDaOrdemNaPlanilha.findUniqueOrThrow({ where: { medicaoId: m1.medicaoId }, select: { manifesto: true, sha256: true } });
    expect(memDepois).toEqual(memAntes);
    expect(manifestoCanonico(memDepois.manifesto).sha256).toBe(memAntes.sha256);
    expect(memDepois.manifesto).toMatchObject({ planilha: { versao: 1 }, itens: [{ unitarioDoContrato: "100.0000", valorNoContrato: "200.00" }] });
    const itens1 = await prisma.itemMedidoNaOrdem.findMany({ where: { medicaoId: m1.medicaoId }, select: { valorUnitario: true, valor: true } });
    expect(itens1.map((i) => [i.valorUnitario.toFixed(2), i.valor.toFixed(2)])).toEqual([["100.00", "200.00"]]);
    // A tela oferece as duas versões, cada uma com a vigência e o limite do período.
    const opcoes = await versoesParaMedirAOrdem(prisma, o.ordemId);
    expect(opcoes.map((v) => [v.versao, v.vigenciaInicio, v.ateAntesDe])).toEqual([[1, dia(-40), dia(-5)], [2, dia(-5), null]]);
    expect(opcoes[1]!.linhas.map((l) => [l.codigo, l.previsto, l.anterior, l.saldo, l.conciliacao.apto])).toEqual([["1.1", "9.0000", "4.0000", "5.0000", true], ["1.2", "20.0000", "0.0000", "20.0000", true], ["1.3", "2.0000", "0.0000", "2.0000", false]]);
  });

  it("MP05: designação — outro setor sem designação, designação revogada e a permissão só de uma unidade orçamentária", async () => {
    const o = await ordemEmitida();
    const pedido = [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "1" }];
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), pedido, OUTRO)).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), pedido, SO_NA_UG)).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_MEDICAO_DE_OBRA/);
    await revogarDesignacaoNoContrato(prisma, { designacaoId: fiscalDe["ctr-a"]!, dataEfeito: HOJE, motivo: "Fiscal removido do contrato", criadoPor: ADMIN });
    await expect(medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), pedido, FISCAL)).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    expect(await prisma.medicaoDaOrdemDeServico.count()).toBe(0);
  });

  it("MP06: concorrência — duas ordens medem o mesmo serviço ao mesmo tempo e juntas passariam do previsto: uma grava", async () => {
    const o1 = await ordemEmitida("ctr-a", "6", null);
    const o2 = await ordemEmitida("ctr-a", "4", null);
    const corrida = await Promise.allSettled([
      medir(o1.ordemId, v1.planilhaId, dia(-10), dia(-6), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "5" }]),
      medir(o2.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "4" }]),
    ]);
    expect(corrida.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    expect(String((corrida.find((c) => c.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/ACIMA-DO-PREVISTO-NA-PLANILHA: o serviço 1\.1/);
    expect((await andamentoDaPlanilha(prisma, v1.planilhaId))!.servicos[0]!.medido).toMatch(/^(5|4)\.0000$/);
  });

  it("MP07: estorno — sem dependente estorna e devolve o saldo; com recebimento provisório é recusado nomeando o dependente; estornada não se recebe", async () => {
    const o = await ordemEmitida();
    const m1 = await medir(o.ordemId, v1.planilhaId, dia(-10), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "6" }]);
    await expect(estornarMedicaoDaOrdem(prisma, { medicaoId: m1.medicaoId, motivo: "Quantidade lançada na ordem errada", criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    await expect(estornarMedicaoDaOrdem(prisma, { medicaoId: m1.medicaoId, motivo: "curto", criadoPor: FISCAL })).rejects.toThrow(/pelo menos 10 caracteres/);
    await expect(estornarMedicaoDaOrdem(prisma, { medicaoId: m1.medicaoId, motivo: "Quantidade lançada na ordem errada", criadoPor: FISCAL })).resolves.toMatchObject({ numero: 1, valor: "600.00" });
    await expect(estornarMedicaoDaOrdem(prisma, { medicaoId: m1.medicaoId, motivo: "Quantidade lançada na ordem errada", criadoPor: FISCAL })).rejects.toThrow(/MEDICAO-JA-ESTORNADA/);
    // O saldo volta: a ordem tem 6 visitas a executar, a planilha 8 a medir, e a medição continua no histórico, estornada.
    let x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    expect(x.ordens[0]!.itens[0]!.aExecutar).toBe("6.0000");
    expect(x.ordens[0]!.valores.medido).toBe("0.00");
    expect(x.ordens[0]!.medicoes[0]).toMatchObject({ numero: 1, estorno: { motivo: "Quantidade lançada na ordem errada" } });
    expect((await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).ordens[0]!.medicoes[0]!.estorno).toMatchObject({ motivo: null });
    expect((await andamentoDaPlanilha(prisma, v1.planilhaId))!.servicos[0]).toMatchObject({ medido: "0.0000", saldo: "8.0000" });
    const itemMedido1 = await prisma.itemMedidoNaOrdem.findFirstOrThrow({ where: { medicaoId: m1.medicaoId }, select: { id: true } });
    await expect(registrarRecebimentoProvisorio(prisma, { medicaoId: m1.medicaoId, data: HOJE, verificacoes: "Tentativa sobre a estornada", itens: [{ itemMedidoId: itemMedido1.id, quantidadeConforme: "6", quantidadeEmControversia: "0" }], criadoPor: FISCAL })).rejects.toThrow(/MEDICAO-ESTORNADA/);
    // Mede de novo (a numeração continua) e recebe provisoriamente: agora o estorno tem dependente.
    const m2 = await medir(o.ordemId, v1.planilhaId, dia(-10), dia(-3), [{ itemDaPlanilhaId: v1.s["1.1"]!, quantidade: "6" }]);
    expect(m2).toMatchObject({ numero: 2, itens: [{ acumulado: "6.0000" }] });
    const itemMedido2 = await prisma.itemMedidoNaOrdem.findFirstOrThrow({ where: { medicaoId: m2.medicaoId }, select: { id: true } });
    await registrarRecebimentoProvisorio(prisma, { medicaoId: m2.medicaoId, data: dia(-2), verificacoes: "Relatórios conferidos", itens: [{ itemMedidoId: itemMedido2.id, quantidadeConforme: "6", quantidadeEmControversia: "0" }], criadoPor: FISCAL });
    const recusa = estornarMedicaoDaOrdem(prisma, { medicaoId: m2.medicaoId, motivo: "Tentativa de estorno depois do recebimento", criadoPor: FISCAL });
    await expect(recusa).rejects.toThrow(/MEDICAO-COM-RECEBIMENTO: a medição nº 2 da ordem nº 1\/\d{4} já tem recebimento provisório de \d{2}\/\d{2}\/\d{4}/);
    x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    expect(x.ordens[0]!.valores.medido).toBe("600.00");
    expect(await prisma.estornoDeMedicaoDaOrdem.count()).toBe(1);
  });

  it("MP08: o comando — mesma chave e mesmo conteúdo não medem duas vezes; mesma chave com outro conteúdo é conflito", async () => {
    const o = await ordemEmitida();
    const porta = criarRegistroDeOperacaoPrisma(prisma);
    const envelope = <T>(chave: string, fingerprint: string, ato: () => Promise<T>) => comOperacaoRegistrada(porta, { usuarioIdent: FISCAL, acao: "REGISTRAR_MEDICAO_DE_OBRA", chave, fingerprint, revalidar: async () => {} }, ato);
    const pedido = [{ itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "4" }];
    await expect(envelope("u7-chave", "c1", () => medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), pedido))).resolves.toMatchObject({ valor: "200.00" });
    await expect(envelope("u7-chave", "c1", () => medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), pedido))).rejects.toBeInstanceOf(ComandoJaConcluidoError);
    await expect(envelope("u7-chave", "c2", () => medir(o.ordemId, v1.planilhaId, dia(-5), dia(-3), [{ itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "1" }]))).rejects.toBeInstanceOf(ComandoEmConflitoError);
    const corrida = await Promise.allSettled([1, 2].map(() => envelope("u7-concorrente", "c3", () => medir(o.ordemId, v1.planilhaId, dia(-2), dia(-1), [{ itemDaPlanilhaId: v1.s["1.2"]!, quantidade: "2" }]))));
    expect(corrida.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    expect((await andamentoDaPlanilha(prisma, v1.planilhaId))!.servicos[1]!.medido).toBe("6.0000");
  });
});
