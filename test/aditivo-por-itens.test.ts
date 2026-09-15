import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { cadastrarItemDoContrato, designarNoContrato, projecaoPublicaDoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import { criarRascunhoDeOrdemDeServico, emitirOrdemDeServico, registrarMedicaoDaOrdem } from "../modules/m11-licitacoes/ordem-de-servico.js";
import { execucaoDoContrato } from "../modules/m11-licitacoes/execucao-do-contrato.js";
import { estornarMovimentoContratual, registrarAditivo, valorAtualizadoDoContrato } from "../modules/m11-licitacoes/contratos.js";
import { estornarAditivoPorItens, preverAditivoPorItens, registrarAditivoPorItens } from "../modules/m11-licitacoes/aditivo-por-itens.js";

/**
 * ═══ O ADITIVO POR ITENS (V7 M2 U5) ═══
 *
 * Cenário SINTÉTICO de referência: item 1 — visita, 10 × R$ 100,00; item 2 — hora, 20 × R$ 50,00; contrato R$ 2.000,00.
 * Os valores esperados estão escritos à mão em cada teste (a conta está no comentário), não saem do calculador testado.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "aditivo.admin@teste.local";
const GESTORA = "gestora.aditivo@teste.local";
const FISCAL = "fiscal.aditivo@teste.local";
const OUTRO = "outro.setor.aditivo@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);
const MOTIVO = "Aumento da demanda nas unidades de saúde apontado pela fiscalização";

async function conta(identificador: string, acoes: readonly string[], documento?: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador.split("@")[0]!, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

let itemA = "";
let itemB = "";
let fiscalId = "";

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO", "REGISTRAR_ADITIVO", "ESTORNAR_MOVIMENTO_CONTRATUAL"]);
  await conta(GESTORA, ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO"], "11144477735");
  await conta(FISCAL, ["REGISTRAR_MEDICAO_DE_OBRA"], "52998224725");
  await conta(OUTRO, ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_MEDICAO_DE_OBRA"]);
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0700", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços técnicos mensuráveis", valorLicitado: "4000.00", criadoPor: "SEED" } });
  await prisma.contrato.create({ data: { id: "ctr", numeroContrato: "CT-AD", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Serviços Técnicos Gama", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
  itemA = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr", descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId;
  itemB = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr", descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId;
  await designarNoContrato(prisma, { contratoId: "ctr", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria G-AD", vigenciaInicio: dia(-40), criadoPor: ADMIN });
  fiscalId = (await designarNoContrato(prisma, { contratoId: "ctr", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria F-AD", vigenciaInicio: dia(-40), criadoPor: ADMIN })).designacaoId;
}, 120_000);

const termo = (numero: string, alteracoes: readonly { itemDoContratoId: string; quantidade: string; valorUnitario: string }[], variacaoDoTermo: string, extra: Record<string, unknown> = {}) =>
  registrarAditivoPorItens(prisma, { contratoId: "ctr", numeroAditivo: numero, dataAssinatura: HOJE, vigenciaInicio: HOJE, fundamento: "Lei 14.133/2021, art. 124, I, b", motivo: MOTIVO, alteracoes: [...alteracoes], variacaoDoTermo, criadoPor: ADMIN, ...extra } as never);

async function ordem(quantidadeA: string, inicio = dia(-20), inicioAutorizado = dia(-20)): Promise<{ ordemId: string; itemDaOrdem: string; emitir: () => Promise<unknown> }> {
  const r = await criarRascunhoDeOrdemDeServico(prisma, { contratoId: "ctr", finalidade: "Manutenção preventiva das unidades", inicioPrevisto: inicio, fimPrevisto: dia(20), condicoesDeRecebimento: "Relatório de visitas assinado", fiscalDesignacaoId: fiscalId, itens: [{ itemDoContratoId: itemA, quantidade: quantidadeA }], criadoPor: GESTORA });
  const i = await prisma.itemDaOrdemDeServico.findFirstOrThrow({ where: { ordemId: r.ordemId }, select: { id: true } });
  return { ordemId: r.ordemId, itemDaOrdem: i.id, emitir: () => emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado, criadoPor: GESTORA }) };
}

describe("o aditivo por itens", () => {
  it("AD01: acréscimo de quantidade — a variação vira movimento do contrato e a ordem que não cabia passa a caber", async () => {
    const o = await ordem("12");
    await expect(o.emitir()).rejects.toThrow(/SALDO-DO-ITEM-INSUFICIENTE: o item 1 \(Visita técnica\) tem 10\.0000 contratado/);
    // 10 → 14 visitas a R$ 100,00: (14 − 10) × 100 = R$ 400,00.
    const previa = await preverAditivoPorItens(prisma, { contratoId: "ctr", numeroAditivo: "1", dataAssinatura: HOJE, vigenciaInicio: HOJE, fundamento: "Lei 14.133/2021, art. 124, I, b", motivo: MOTIVO, alteracoes: [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], criadoPor: ADMIN });
    expect(previa).toMatchObject({ variacao: "400.00", natureza: "ACRESCIMO", linhas: [{ item: 1, quantidadeAnterior: "10.0000", quantidade: "14.0000", variacao: "400.00" }] });
    expect(await prisma.aditivoPorItensDoContrato.count()).toBe(0); // a prévia não grava
    const r = await termo("1", [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], "400.00");
    expect(r.movimentoId).not.toBeNull();
    expect(await prisma.movimentoContratual.findUniqueOrThrow({ where: { id: r.movimentoId! }, select: { tipo: true, valor: true, numeroAditivo: true } })).toMatchObject({ tipo: "ACRESCIMO_VALOR", numeroAditivo: "1" });
    expect((await valorAtualizadoDoContrato(prisma, "ctr")).toFixed(2)).toBe("2400.00");
    await o.emitir();
    const x = await execucaoDoContrato(prisma, "ctr", "FINANCEIRA");
    expect(x.itensDoContrato[0]).toMatchObject({ original: "10.0000", contratado: "14.0000", autorizadoEmOrdens: "12.0000", aAutorizar: "2.0000" });
    // O item original não foi reescrito.
    expect((await prisma.itemDoContrato.findUniqueOrThrow({ where: { id: itemA }, select: { quantidade: true } })).quantidade.toFixed(4)).toBe("10.0000");
    // O cadastro de item enxerga o valor dos itens com o aditivo: 2.000 + 400 = 2.400; mais R$ 1,00 passaria.
    await expect(cadastrarItemDoContrato(prisma, { contratoId: "ctr", descricao: "Item avulso", unidade: "un", quantidade: "1", valorUnitario: "1", criadoPor: ADMIN })).rejects.toThrow(/ITENS-ACIMA-DO-CONTRATO: os itens somariam 2401\.00 contra o valor vigente de 2400\.00/);
  });

  it("AD02: variação do termo divergente, prévia sem permissão e alteração sem efeito — recusa pelo motivo, nada gravado", async () => {
    await expect(termo("1", [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], "300.00")).rejects.toThrow(/VARIACAO-DO-TERMO-DIVERGENTE: o termo informa 300\.00, e os itens compõem 400\.00 \(item 1: 400\.00\)/);
    await expect(termo("1", [{ itemDoContratoId: itemA, quantidade: "10", valorUnitario: "100" }], "0")).rejects.toThrow(/ALTERACAO-SEM-EFEITO/);
    await expect(registrarAditivoPorItens(prisma, { contratoId: "ctr", numeroAditivo: "1", dataAssinatura: HOJE, vigenciaInicio: HOJE, fundamento: "Lei 14.133/2021, art. 124", motivo: MOTIVO, alteracoes: [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], variacaoDoTermo: "400.00", criadoPor: OUTRO })).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_ADITIVO/);
    await expect(preverAditivoPorItens(prisma, { contratoId: "ctr", numeroAditivo: "1", dataAssinatura: HOJE, vigenciaInicio: HOJE, fundamento: "Lei 14.133/2021, art. 124", motivo: MOTIVO, alteracoes: [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], criadoPor: OUTRO })).rejects.toThrow(/ACESSO NEGADO[\s\S]*REGISTRAR_ADITIVO/);
    await expect(termo("1", [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], "400.00", { dataAssinatura: dia(1) })).rejects.toThrow(/ASSINATURA-FUTURA/);
    expect(await prisma.aditivoPorItensDoContrato.count()).toBe(0);
    expect(await prisma.movimentoContratual.count()).toBe(0);
  });

  it("AD03 (ME06): novo unitário entre a emissão e a medição — período anterior fica ao preço antigo, o posterior ao novo, o que atravessa é recusado", async () => {
    const o = await ordem("6");
    await o.emitir();
    await registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-20), diaFim: dia(-11), itens: [{ itemDaOrdemId: o.itemDaOrdem, quantidade: "4" }], criadoPor: FISCAL });
    // Vigência que alcançaria o período já medido: recusado.
    await expect(termo("2", [{ itemDoContratoId: itemA, quantidade: "10", valorUnitario: "110" }], "60.00", { vigenciaInicio: dia(-15), dataAssinatura: dia(-15) })).rejects.toThrow(/ADITIVO-RETROAGE-SOBRE-MEDICAO: o novo unitário do item 1 .*medição nº 1 da ordem/);
    // Vigência depois do período: 4 visitas medidas antes ficam a 100; (10 − 4) × 110 − (10 − 4) × 100 = R$ 60,00.
    const r = await termo("2", [{ itemDoContratoId: itemA, quantidade: "10", valorUnitario: "110" }], "60.00", { vigenciaInicio: dia(-10), dataAssinatura: dia(-10) });
    expect(r.composicao.linhas[0]).toMatchObject({ medidoAntes: "4.0000", variacao: "60.00" });
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-12), diaFim: dia(-9), itens: [{ itemDaOrdemId: o.itemDaOrdem, quantidade: "1" }], criadoPor: FISCAL })).rejects.toThrow(/PERIODO-ATRAVESSA-NOVO-PRECO: o item 1 \(Visita técnica\) passa a R\$ 110\.0000 .*aditivo nº 2/);
    const m2 = await registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-10), diaFim: dia(-5), itens: [{ itemDaOrdemId: o.itemDaOrdem, quantidade: "2" }], criadoPor: FISCAL });
    expect(m2.valor).toBe("220.00"); // 2 × 110
    const medidos = await prisma.itemMedidoNaOrdem.findMany({ orderBy: { medicao: { numero: "asc" } }, select: { valorUnitario: true, valor: true } });
    expect(medidos.map((m) => [m.valorUnitario.toFixed(4), m.valor.toFixed(2)])).toEqual([["100.0000", "400.00"], ["110.0000", "220.00"]]);
    // A ordem emitida guarda o unitário da emissão; o espelho não muda.
    const emissao = await prisma.emissaoDaOrdemDeServico.findUniqueOrThrow({ where: { ordemId: o.ordemId }, select: { manifesto: true } });
    expect(emissao.manifesto).toMatchObject({ itens: [{ valorUnitario: "100.0000", valor: "600.00" }], total: "600.00" });
    // Rascunho novo com início depois da vigência sai com o novo unitário; rascunho antigo emitido depois é recusado pelo preço.
    const antigo = await criarRascunhoDeOrdemDeServico(prisma, { contratoId: "ctr", finalidade: "Ordem com início anterior", inicioPrevisto: dia(-12), fimPrevisto: dia(20), condicoesDeRecebimento: "Relatório", fiscalDesignacaoId: fiscalId, itens: [{ itemDoContratoId: itemA, quantidade: "1" }], criadoPor: GESTORA });
    expect(antigo.valor).toBe("100.00");
    await expect(emitirOrdemDeServico(prisma, { ordemId: antigo.ordemId, inicioAutorizado: dia(-5), criadoPor: GESTORA })).rejects.toThrow(/PRECO-DA-ORDEM-DESATUALIZADO: o item 1 .*R\$ 100\.0000.*R\$ 110\.0000/);
  });

  it("AD04: supressão — não abaixo do comprometido; com vigência futura já limita o que se compromete hoje", async () => {
    const o = await ordem("6");
    await o.emitir();
    await expect(termo("3", [{ itemDoContratoId: itemA, quantidade: "5", valorUnitario: "100" }], "-500.00")).rejects.toThrow(/SUPRESSAO-ABAIXO-DO-COMPROMETIDO: o item 1 .*passaria a 5\.0000 visita, mas 6\.0000 já estão comprometidos/);
    // 10 → 7 a partir de daqui a 10 dias: (7 − 10) × 100 = −R$ 300,00.
    const r = await termo("3", [{ itemDoContratoId: itemA, quantidade: "7", valorUnitario: "100" }], "-300.00", { vigenciaInicio: dia(10) });
    expect(await prisma.movimentoContratual.findUniqueOrThrow({ where: { id: r.movimentoId! }, select: { tipo: true } })).toMatchObject({ tipo: "SUPRESSAO_VALOR" });
    expect((await valorAtualizadoDoContrato(prisma, "ctr")).toFixed(2)).toBe("1700.00");
    const dois = await ordem("2", dia(-1), HOJE);
    await expect(dois.emitir()).rejects.toThrow(/SALDO-DO-ITEM-INSUFICIENTE: o item 1 \(Visita técnica\) tem 7\.0000 contratado\(s\) vigente\(s\) de hoje em diante, 6\.0000 já comprometido/);
    const um = await ordem("1", dia(-1), HOJE);
    await um.emitir();
    const x = await execucaoDoContrato(prisma, "ctr", "FINANCEIRA");
    expect(x.itensDoContrato[0]).toMatchObject({ contratado: "10.0000", autorizadoEmOrdens: "7.0000", aAutorizar: "0.0000" });
  });

  it("AD05: inclusão de item e redução de unitário no mesmo termo; estorno enquanto nada usou devolve itens e valor", async () => {
    // Item 3 incluído: 3 × 250 = 750; item 2 de 50 para 40 em 20 horas, nada medido: 20 × 40 − 20 × 50 = −200. Total R$ 550,00.
    const r = await registrarAditivoPorItens(prisma, { contratoId: "ctr", numeroAditivo: "4", dataAssinatura: HOJE, vigenciaInicio: HOJE, fundamento: "Lei 14.133/2021, art. 124, I, a e b", motivo: MOTIVO, alteracoes: [{ itemDoContratoId: itemB, quantidade: "20", valorUnitario: "40" }], inclusoes: [{ descricao: "Relatório técnico consolidado", unidade: "relatório", quantidade: "3", valorUnitario: "250" }], variacaoDoTermo: "550.00", criadoPor: ADMIN });
    expect(r.composicao).toMatchObject({ variacao: "550.00", natureza: "ACRESCIMO" });
    const x = await execucaoDoContrato(prisma, "ctr", "FISCALIZACAO");
    expect(x.itensDoContrato.map((i) => [i.numero, i.original, i.contratado, i.valorUnitario])).toEqual([[1, "10.0000", "10.0000", "100.0000"], [2, "20.0000", "20.0000", "40.0000"], [3, "0.0000", "3.0000", "250.0000"]]);
    expect(x.aditivosPorItens).toHaveLength(1);
    const publica = await projecaoPublicaDoContrato(prisma, "ctr");
    expect(publica?.aditivosPorItens[0]).toMatchObject({ numero: "4", variacao: "550.00", estornado: false });
    expect(JSON.stringify(publica?.aditivosPorItens)).not.toContain(ADMIN);

    // O valor do aditivo por itens não se estorna avulso.
    await expect(estornarMovimentoContratual(prisma, { movimentoId: r.movimentoId!, data: new Date(), motivo: "Tentativa de estornar só o valor do termo", criadoPor: ADMIN })).rejects.toThrow(/MOVIMENTO-DE-ADITIVO-POR-ITENS/);
    const e = await estornarAditivoPorItens(prisma, { aditivoId: r.aditivoId, data: HOJE, motivo: "Termo registrado com o contrato errado", criadoPor: ADMIN });
    expect(e.movimentoEstornoId).not.toBeNull();
    expect((await valorAtualizadoDoContrato(prisma, "ctr")).toFixed(2)).toBe("2000.00");
    const y = await execucaoDoContrato(prisma, "ctr", "FISCALIZACAO");
    expect(y.itensDoContrato.map((i) => [i.numero, i.contratado, i.valorUnitario])).toEqual([[1, "10.0000", "100.0000"], [2, "20.0000", "50.0000"], [3, "0.0000", "250.0000"]]);
    await expect(estornarAditivoPorItens(prisma, { aditivoId: r.aditivoId, data: HOJE, motivo: "Segunda tentativa do mesmo estorno", criadoPor: ADMIN })).rejects.toThrow(/ADITIVO-JA-ESTORNADO/);
    await expect(termo("4", [{ itemDoContratoId: itemA, quantidade: "11", valorUnitario: "100" }], "100.00")).rejects.toThrow(/NUMERO-DE-ADITIVO-JA-USADO/);
  });

  it("AD06: aditivo já usado não se estorna; valor do mesmo termo já lançado no cadastro avulso não se soma de novo", async () => {
    const r = await termo("5", [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], "400.00");
    await ordem("1");
    await expect(estornarAditivoPorItens(prisma, { aditivoId: r.aditivoId, data: HOJE, motivo: "Tentativa depois da ordem criada", criadoPor: ADMIN })).rejects.toThrow(/ADITIVO-JA-UTILIZADO: .*ordem nº 1\//);
    expect(await prisma.estornoDeAditivoPorItens.count()).toBe(0);

    await registrarAditivo(prisma, { contratoId: "ctr", tipo: "ACRESCIMO_VALOR", valor: "100.00", data: new Date(), numeroAditivo: "6", motivo: "Acréscimo lançado pelo cadastro de aditivos", criadoPor: ADMIN });
    await expect(termo("6", [{ itemDoContratoId: itemB, quantidade: "22", valorUnitario: "50" }], "100.00")).rejects.toThrow(/VALOR-DO-TERMO-JA-REGISTRADO: o aditivo nº 6 .*acréscimo de R\$ 100\.00/);
  });

  it("AD07: dois aditivos concorrentes sobre o mesmo item — o trinco serializa e o segundo é conferido contra a versão do primeiro", async () => {
    // Os dois partem de 10: 10 → 14 (+400) e 10 → 12 (+200). Depois do primeiro, o segundo compõe 14 → 12 = −200 ≠ +200.
    const corrida = await Promise.allSettled([
      termo("7", [{ itemDoContratoId: itemA, quantidade: "14", valorUnitario: "100" }], "400.00"),
      termo("8", [{ itemDoContratoId: itemA, quantidade: "12", valorUnitario: "100" }], "200.00"),
    ]);
    expect(corrida.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    expect(String((corrida.find((c) => c.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/VARIACAO-DO-TERMO-DIVERGENTE/);
    expect(await prisma.aditivoPorItensDoContrato.count()).toBe(1);
    const valor = (await valorAtualizadoDoContrato(prisma, "ctr")).toFixed(2);
    expect(["2400.00", "2200.00"]).toContain(valor);
  });
});
