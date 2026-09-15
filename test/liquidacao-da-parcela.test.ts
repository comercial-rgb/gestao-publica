import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { criarFichaDeTeste } from "./ficha-teste.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { criarM05DepsComContratos } from "../modules/m11-licitacoes/adapter-m05.js";
import { roteiroEmpenho, roteiroLiquidacao, roteiroPagamento } from "../modules/m05-despesa/dominio.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { anularLiquidacao, pagar } from "../modules/m05-despesa/servico-bloco2.js";
import type { M05Deps } from "../modules/m05-despesa/ports.js";
import { conferirDocumentoFiscal, registrarDocumentoFiscal } from "../modules/m11-licitacoes/documento-fiscal.js";
import { cadastrarItemDoContrato, designarNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import { criarRascunhoDeOrdemDeServico, decidirControversia, emitirOrdemDeServico, registrarMedicaoDaOrdem, registrarRecebimentoDefinitivo, registrarRecebimentoProvisorio } from "../modules/m11-licitacoes/ordem-de-servico.js";
import { liquidarParcelasDoContrato, numeroDaLiquidacaoDaParcela } from "../modules/m11-licitacoes/liquidacao-da-parcela.js";
import { travar } from "../packages/locks/index.js";
import { xlsxDeTeste } from "./fixtures/planilhas.js";
import { medirOrdemPelaPlanilha } from "../modules/m11-licitacoes/medicao-pela-planilha.js";
import { confirmarPreviaDePlanilha, gerarPreviaDePlanilha, vincularItemDaPlanilhaAoContrato } from "../modules/m11-licitacoes/planilha-orcamentaria.js";

/**
 * ═══ A PONTE PARA A LIQUIDAÇÃO — A PARCELA RECEBIDA VIRA LIQUIDAÇÃO NO M05 (V7 M2 U3 — LI01 a LI06, ES01, ES02) ═══
 *
 * O cenário de referência continua: ordem de R$ 1.100,00; medição de R$ 1.000,00; definitivo regular de R$ 900,00 e,
 * aceita a controvérsia, o complemento de R$ 100,00. Empenho de R$ 1.100,00 no elemento 39 (serviços), credor = o
 * contratado. Esperado, escrito antes:
 *   LI01 — liquidar a parcela de R$ 900,00 grava UMA liquidação de 900,00 no M05, com a nota conferida e a alocação;
 *          uma nota de R$ 1.000,00 não torna os R$ 1.000,00 elegíveis: pedir 1.000,00 na parcela de 900,00 é recusado;
 *   LI02 — nota não conferida ou de outro fornecedor: recusa, e nenhuma linha (liquidação, lançamento, alocação);
 *   LI03 — duas liquidações concorrentes da mesma parcela (números diferentes): uma passa, a outra recusa pelo elegível;
 *   LI04 — a mesma chamada repetida (resposta perdida): devolve a mesma liquidação, sem segundo lançamento;
 *   LI05 — uma nota de R$ 1.000,00 com as duas parcelas (900,00 + 100,00): as alocações somam o liquidado;
 *   LI06 — serviço não gera estoque; parcela em empenho de material é recusada;
 *   ES01 — anulada a liquidação não paga, a parcela volta a ser elegível (e só ela);
 *   ES02 — paga, a liquidação não se anula (o M05 recusa) e a parcela continua consumida.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const POR = "contabilidade@cg.pb.gov.br";
const ADMIN = "contratos.admin@teste.local";
const GESTORA = "gestora.liq@teste.local";
const FISCAL = "fiscal.liq@teste.local";
const RECEBEDOR = "recebedor.liq@teste.local";
const CNPJ = "12345678000199";
const FONTE = "fnt-500";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);

const CAIXA = "1.1.1.1.2.00.00";
const FORNECEDOR = "2.1.3.1.1.00.00";
const VPD = "3.3.2.1.1.01.00";
const C_DISP = "6.2.2.1.1.00.00";
const C_EMP = "6.2.2.1.3.01.00";
const C_LIQ = "6.2.2.1.3.03.00";
const C_PAGO = "6.2.2.1.3.04.00";
const R_EMPENHO = roteiroEmpenho({ creditoDisponivel: C_DISP, creditoEmpenhado: C_EMP });
const R_LIQUIDACAO = roteiroLiquidacao({ variacaoDiminutiva: VPD, obrigacaoAPagar: FORNECEDOR, creditoEmpenhado: C_EMP, creditoLiquidado: C_LIQ });
const R_PAGAMENTO = roteiroPagamento({ obrigacaoAPagar: FORNECEDOR, disponibilidade: CAIXA, creditoLiquidado: C_LIQ, creditoPago: C_PAGO });

let deps: M05Deps;
let emitenteId = "";
let outroEmitenteId = "";
let empenhoServico = "";
let empenhoMaterial = "";
let receb900 = "";
let receb100 = "";

async function conta(identificador: string, acoes: readonly string[], documento: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador.split("@")[0]!, criadoPor: "SEED" } } } });
  await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
}

beforeEach(async () => {
  await limparBanco(prisma);
  deps = criarM05DepsComContratos(prisma);
  await prisma.contaPcasp.createMany({
    data: [
      { id: "c-caixa", codigo: CAIXA, nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-forn", codigo: FORNECEDOR, nome: "Fornecedores", naturezaSaldo: "CREDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "c-vpd", codigo: VPD, nome: "VPD", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "c-disp", codigo: C_DISP, nome: "Crédito Disponível", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-emp", codigo: C_EMP, nome: "Crédito Empenhado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-liq", codigo: C_LIQ, nome: "Crédito Liquidado", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      { id: "c-pago", codigo: C_PAGO, nome: "Crédito Pago", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await prisma.orgao.create({ data: { id: "org-01", codigo: "01", nome: "Prefeitura" } });
  await prisma.unidadeOrcamentaria.create({ data: { id: "uo-01", codigo: "01001", descricao: "Saúde", orgaoId: "org-01" } });
  await prisma.funcao.create({ data: { id: "fun-10", codigo: "10", nome: "Saúde" } });
  await prisma.subfuncao.create({ data: { id: "sub-301", codigo: "301", nome: "Atenção básica" } });
  await prisma.programa.create({ data: { id: "prg", codigo: "0010", descricao: "P" } });
  await prisma.acao.create({ data: { id: "aca", codigo: "2010", descricao: "A", tipo: "ATIVIDADE" } });
  await prisma.naturezaDespesa.createMany({
    data: [
      { id: "nd-39", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "39", codigoCompleto: "339039", descricao: "Serviços" },
      { id: "nd-30", codCategoria: "3", codNatureza: "3", codModalidade: "90", codElemento: "30", codigoCompleto: "339030", descricao: "Material de consumo" },
    ],
  });
  await prisma.fonteRecurso.create({ data: { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await prisma.contaBancaria.create({ data: { id: "cb1", codigo: "CC-001", descricao: "Movimento", fonteId: FONTE } });
  const base = { exercicio: 2026, orgaoId: "org-01", unidadeOrcId: "uo-01", funcaoId: "fun-10", subfuncaoId: "sub-301", programaId: "prg", acaoId: "aca", fonteId: FONTE, valorDotado: "50000.00" };
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-39", numero: 1, naturezaDespesaId: "nd-39" });
  await criarFichaDeTeste(prisma, { ...base, id: "ficha-30", numero: 2, naturezaDespesaId: "nd-30" });

  emitenteId = (await prisma.pessoa.create({ data: { documento: CNPJ, tipo: "JURIDICA", criadoPor: POR }, select: { id: true } })).id;
  outroEmitenteId = (await prisma.pessoa.create({ data: { documento: "11222333000181", tipo: "JURIDICA", criadoPor: POR }, select: { id: true } })).id;

  await conta(GESTORA, ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO"], "11144477735");
  await conta(FISCAL, ["REGISTRAR_MEDICAO_DE_OBRA", "REGISTRAR_RECEBIMENTO_PROVISORIO"], "52998224725");
  await conta(RECEBEDOR, ["REGISTRAR_RECEBIMENTO_DEFINITIVO"], "86288366757");
  const adm = await prisma.perfil.create({ data: { nome: "P-adm", descricao: "t", criadoPor: "SEED", permissoes: { create: ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO"].map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const ua = await prisma.usuario.create({ data: { identificador: ADMIN, nome: ADMIN, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: ua.id, perfilId: adm.id, criadoPor: "SEED" } });

  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0600", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços técnicos", valorLicitado: "2000.00", criadoPor: POR } });
  await prisma.homologacaoProcesso.create({ data: { processoId: "proc", data: inicioDoDiaCivil(dia(-70)), criadoPor: POR } });
  await prisma.contrato.create({ data: { id: "ctr-a", numeroContrato: "CT-A", processoId: "proc", contratadoDocumento: CNPJ, contratadoNome: "Serviços Técnicos Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR } });
  await prisma.contrato.create({ data: { id: "ctr-b", numeroContrato: "CT-B", processoId: "proc", contratadoDocumento: CNPJ, contratadoNome: "Serviços Técnicos Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: POR } });
  const a = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-a", descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId;
  const b = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-a", descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId;
  await designarNoContrato(prisma, { contratoId: "ctr-a", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria G", vigenciaInicio: dia(-30), criadoPor: ADMIN });
  const f = (await designarNoContrato(prisma, { contratoId: "ctr-a", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria F", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
  await designarNoContrato(prisma, { contratoId: "ctr-a", papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria R", vigenciaInicio: dia(-30), criadoPor: ADMIN });

  const emp = (fichaId: string, numero: string, contratoId: string, valor: string) => empenhar({ fichaId, numero, tipo: "GLOBAL", valor, data: inicioDoDiaCivil(dia(-20)), credorCpfCnpj: CNPJ, historico: "Serviços técnicos do contrato", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contratoId, criadoPor: POR }, R_EMPENHO, deps);
  empenhoServico = (await emp("ficha-39", "2026NE000100", "ctr-a", "1100.00")).empenhoId;
  empenhoMaterial = (await emp("ficha-30", "2026NE000101", "ctr-a", "900.00")).empenhoId;

  const r = await criarRascunhoDeOrdemDeServico(prisma, { contratoId: "ctr-a", finalidade: "Manutenção preventiva", inicioPrevisto: dia(-20), fimPrevisto: dia(20), condicoesDeRecebimento: "Relatório assinado", fiscalDesignacaoId: f, itens: [{ itemDoContratoId: a, quantidade: "6" }, { itemDoContratoId: b, quantidade: "10" }], criadoPor: GESTORA });
  await emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
  const itens = await prisma.itemDaOrdemDeServico.findMany({ where: { ordemId: r.ordemId }, select: { id: true, itemDoContratoId: true } });
  const oa = itens.find((i) => i.itemDoContratoId === a)!.id;
  const ob = itens.find((i) => i.itemDoContratoId === b)!.id;
  const m = await registrarMedicaoDaOrdem(prisma, { ordemId: r.ordemId, diaInicio: dia(-10), diaFim: dia(-3), itens: [{ itemDaOrdemId: oa, quantidade: "6" }, { itemDaOrdemId: ob, quantidade: "8" }], criadoPor: FISCAL });
  const med = await prisma.itemMedidoNaOrdem.findMany({ where: { medicaoId: m.medicaoId }, select: { id: true, itemDaOrdemId: true } });
  const ma = med.find((x) => x.itemDaOrdemId === oa)!.id;
  const mb = med.find((x) => x.itemDaOrdemId === ob)!.id;
  await registrarRecebimentoProvisorio(prisma, { medicaoId: m.medicaoId, data: dia(-2), verificacoes: "Relatórios conferidos", itens: [{ itemMedidoId: ma, quantidadeConforme: "5", quantidadeEmControversia: "1", motivo: "Visita sem assinatura" }, { itemMedidoId: mb, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL });
  receb900 = (await registrarRecebimentoDefinitivo(prisma, { medicaoId: m.medicaoId, data: dia(-1), conclusao: "Parte regular conferida", itens: [{ itemMedidoId: ma, quantidade: "5" }, { itemMedidoId: mb, quantidade: "8" }], criadoPor: RECEBEDOR })).recebimentoId;
  const conf = await prisma.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId: ma }, select: { id: true } });
  await decidirControversia(prisma, { conferenciaId: conf.id, resultado: "ACEITA", fundamento: "Assinatura apresentada", data: dia(-1), criadoPor: RECEBEDOR });
  receb100 = (await registrarRecebimentoDefinitivo(prisma, { medicaoId: m.medicaoId, data: dia(-1), conclusao: "Complemento da visita aceita", itens: [{ itemMedidoId: ma, quantidade: "1" }], criadoPor: RECEBEDOR })).recebimentoId;
}, 180_000);

async function nota(numero: string, total: string, opcoes: { conferir?: boolean; emitente?: string; contratoId?: string | null } = {}): Promise<string> {
  const { documentoId } = await registrarDocumentoFiscal(prisma, {
    emitenteId: opcoes.emitente ?? emitenteId, modelo: "NF_AVULSA", serie: "1", numero, dataEmissao: inicioDoDiaCivil(dia(-1)), dataRecebimento: inicioDoDiaCivil(dia(-1)),
    ...(opcoes.contratoId === null ? {} : { contratoId: opcoes.contratoId ?? "ctr-a" }), valorBruto: total, valorTotal: total,
    itens: [{ descricao: "Serviços técnicos da ordem de serviço", unidade: "SV", quantidade: "1", valorUnitario: total, valorTotal: total }], criadoPor: POR,
  });
  if (opcoes.conferir !== false) await conferirDocumentoFiscal(prisma, { documentoId, data: inicioDoDiaCivil(dia(-1)), motivo: "Nota conferida com o recebimento", criadoPor: POR });
  return documentoId;
}

const liquidarP = (documentoFiscalId: string, parcelas: { recebimentoDefinitivoId: string; valor: string }[], empenhoId = empenhoServico) =>
  liquidarParcelasDoContrato(prisma, { empenhoId, documentoFiscalId, data: HOJE, parcelas, criadoPor: POR }, R_LIQUIDACAO, deps);

const contagem = async () => [await prisma.liquidacao.count(), await prisma.lancamentoContabil.count(), await prisma.alocacaoDaLiquidacaoNaParcela.count()];

describe("a parcela recebida vira liquidação no M05", () => {
  it("LI01: R$ 900,00 da parcela regular, com a nota conferida e a alocação; a nota de R$ 1.000,00 não torna R$ 1.000,00 elegível", async () => {
    const nf = await nota("1000", "1000.00");
    await expect(liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "1000.00" }])).rejects.toThrow(/PARCELA-ACIMA-DO-ELEGIVEL: o recebimento definitivo nº 1 .* vale 900\.00, já foi liquidado em 0\.00 e resta 900\.00; a liquidação pede 1000\.00/);
    const r = await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    expect(r).toMatchObject({ valor: "900.00", jaExistia: false });
    const l = await prisma.liquidacao.findUniqueOrThrow({ where: { id: r.liquidacaoId }, select: { valor: true, documentoFiscalId: true, empenhoId: true, alocacoesNaParcela: { select: { recebimentoDefinitivoId: true, valor: true } } } });
    expect([l.valor.toFixed(2), l.documentoFiscalId, l.empenhoId]).toEqual(["900.00", nf, empenhoServico]);
    expect(l.alocacoesNaParcela.map((a) => [a.recebimentoDefinitivoId, a.valor.toFixed(2)])).toEqual([[receb900, "900.00"]]);
    // A projeção mostra o liquidado por recebimento, separado do recebido.
    const { execucaoDoContrato } = await import("../modules/m11-licitacoes/execucao-do-contrato.js");
    const def = (await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).ordens[0]!.medicoes[0]!.definitivos;
    expect(def.map((d) => [d.valor, d.liquidado, d.aLiquidar])).toEqual([["900.00", "900.00", "0.00"], ["100.00", "0.00", "100.00"]]);
    // A projeção PÚBLICA leva ordem, período e valores — não o motivo da controvérsia nem as verificações do termo.
    const { projecaoPublicaDoContrato } = await import("../modules/m11-licitacoes/fiscalizacao.js");
    const pub = await projecaoPublicaDoContrato(prisma, "ctr-a");
    expect(pub?.execucaoPorOrdens).toMatchObject({ autorizado: "1100.00", recebido: "1000.00", ordens: [{ numero: expect.stringMatching(/^1\//), autorizado: "1100.00", recebido: "1000.00" }] });
    // (Nome e ato dos responsáveis vigentes são públicos, como os do gestor e do fiscal; conta e CPF, não.)
    expect(JSON.stringify(pub)).not.toMatch(/Visita sem assinatura|Relatórios conferidos|@teste\.local|52998224725|86288366757/);
    // O complemento de R$ 100,00 segue elegível; os R$ 900,00 não.
    await expect(liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "0.01" }])).rejects.toThrow(/PARCELA-JA-LIQUIDADA/);
    await expect(liquidarP(nf, [{ recebimentoDefinitivoId: receb100, valor: "100.00" }])).resolves.toMatchObject({ valor: "100.00" });
  });

  it("LI02: nota não conferida, de outro fornecedor, de outro contrato ou sem nota — recusa com o motivo e nenhuma linha", async () => {
    const antes = await contagem();
    await expect(liquidarP(await nota("2001", "900.00", { conferir: false }), [{ recebimentoDefinitivoId: receb900, valor: "900.00" }])).rejects.toThrow(/ainda não foi conferido/);
    // Com o contrato declarado, a nota de outro fornecedor nem se registra; sem ele, o M05 recusa pelo credor.
    await expect(nota("2002", "900.00", { emitente: outroEmitenteId })).rejects.toThrow(/não é o contratado do contrato CT-A/);
    await expect(liquidarP(await nota("2004", "900.00", { emitente: outroEmitenteId, contratoId: null }), [{ recebimentoDefinitivoId: receb900, valor: "900.00" }])).rejects.toThrow(/não é o credor do empenho/);
    await expect(liquidarP(await nota("2003", "900.00", { contratoId: "ctr-b" }), [{ recebimentoDefinitivoId: receb900, valor: "900.00" }])).rejects.toThrow(/DOCUMENTO-DE-OUTRO-CONTRATO/);
    await expect(liquidarParcelasDoContrato(prisma, { empenhoId: empenhoServico, documentoFiscalId: "", data: HOJE, parcelas: [{ recebimentoDefinitivoId: receb900, valor: "900.00" }], criadoPor: POR }, R_LIQUIDACAO, deps)).rejects.toThrow();
    expect(await contagem()).toEqual(antes);
  });

  it("LI03: duas liquidações concorrentes da mesma parcela, por pedidos diferentes — uma passa, a outra recusa pelo elegível", async () => {
    const [n1, n2] = [await nota("3001", "900.00"), await nota("3002", "900.00")];
    const corrida = await Promise.allSettled([liquidarP(n1, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]), liquidarP(n2, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }])]);
    expect(corrida.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    expect(String((corrida.find((c) => c.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/PARCELA-JA-LIQUIDADA/);
    expect((await prisma.alocacaoDaLiquidacaoNaParcela.aggregate({ where: { recebimentoDefinitivoId: receb900 }, _sum: { valor: true } }))._sum.valor?.toFixed(2)).toBe("900.00");
  });

  it("LI03 (o trinco): a liquidação da parcela ESPERA o trinco do contrato — quem soma o consumido não lê um número velho", async () => {
    const nf = await nota("3101", "900.00");
    // Uma transação segura o trinco do contrato por 2 s (o que uma liquidação concorrente em curso faria).
    let liberou = 0;
    const segurando = prisma.$transaction(async (tx) => {
      await travar(tx, "Contrato", ["ctr-a"]);
      await tx.$queryRawUnsafe("SELECT pg_sleep(2)::text AS dormiu");
      liberou = Date.now();
    }, { timeout: 20_000 });
    await new Promise((r) => setTimeout(r, 300));
    const inicio = Date.now();
    await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    const fim = Date.now();
    await segurando;
    // Sem o trinco, a liquidação terminaria antes de a outra transação liberar.
    expect(fim - inicio).toBeGreaterThanOrEqual(1_200);
    expect(fim).toBeGreaterThanOrEqual(liberou);
  });

  it("LI04: a mesma chamada repetida devolve a mesma liquidação — sem segundo lançamento nem segunda alocação", async () => {
    const nf = await nota("4001", "900.00");
    const r1 = await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    const depois = await contagem();
    const r2 = await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    expect(r2).toEqual({ ...r1, jaExistia: true });
    expect(await contagem()).toEqual(depois);
    expect(r1.numero).toBe(numeroDaLiquidacaoDaParcela({ empenhoId: empenhoServico, documentoFiscalId: nf, parcelas: [{ recebimentoDefinitivoId: receb900, valor: "900" }] }));
  });

  it("LI05: uma nota de R$ 1.000,00 com as duas parcelas — as alocações somam o liquidado e a nota fica sem saldo", async () => {
    const nf = await nota("5001", "1000.00");
    // A liquidação usa R$ 950,00 da nota: toda a parcela regular e metade do complemento — e diz isso nas alocações.
    const r = await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }, { recebimentoDefinitivoId: receb100, valor: "50.00" }]);
    expect(r.valor).toBe("950.00");
    const aloc = await prisma.alocacaoDaLiquidacaoNaParcela.findMany({ where: { liquidacaoId: r.liquidacaoId }, orderBy: { valor: "desc" }, select: { valor: true } });
    expect(aloc.map((a) => a.valor.toFixed(2))).toEqual(["900.00", "50.00"]);
    // O remanescente é explicado dos dois lados: R$ 50,00 da nota e R$ 50,00 do complemento — nada além.
    await expect(liquidarP(nf, [{ recebimentoDefinitivoId: receb100, valor: "60.00" }])).rejects.toThrow(/PARCELA-ACIMA-DO-ELEGIVEL: .* vale 100\.00, já foi liquidado em 50\.00 e resta 50\.00/);
    await expect(liquidarP(nf, [{ recebimentoDefinitivoId: receb100, valor: "50.00" }])).resolves.toMatchObject({ valor: "50.00" });
    const outra = await nota("5002", "900.00");
    await expect(liquidarP(outra, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }])).rejects.toThrow(/PARCELA-JA-LIQUIDADA/);
  });

  it("LI06: serviço não gera estoque; parcela em empenho de material, de outro contrato ou de outro credor é recusada", async () => {
    const nf = await nota("6001", "900.00");
    await expect(liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }], empenhoMaterial)).rejects.toThrow(/PARCELA-EM-EMPENHO-DE-MATERIAL/);
    const eOutro = (await empenhar({ fichaId: "ficha-39", numero: "2026NE000102", tipo: "GLOBAL", valor: "900.00", data: inicioDoDiaCivil(dia(-20)), credorCpfCnpj: CNPJ, historico: "Outro contrato", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contratoId: "ctr-b", criadoPor: POR }, R_EMPENHO, deps)).empenhoId;
    const nfB = await nota("6002", "900.00", { contratoId: "ctr-b" });
    await expect(liquidarP(nfB, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }], eOutro)).rejects.toThrow(/EMPENHO-DE-OUTRO-CONTRATO|DOCUMENTO-DE-OUTRO-CONTRATO/);
    const antesEstoque = [await prisma.movimentoFisicoDeEstoque.count(), await prisma.movimentoAlmoxarifado.count()];
    await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    expect([await prisma.movimentoFisicoDeEstoque.count(), await prisma.movimentoAlmoxarifado.count()]).toEqual(antesEstoque);
  });

  it("ES01/ES02: anulada a liquidação não paga, a parcela volta a ser elegível; paga, o M05 não anula e a parcela segue consumida", async () => {
    const nf = await nota("7001", "900.00");
    const r = await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    await anularLiquidacao({ liquidacaoId: r.liquidacaoId, numero: "NLA-7001", data: inicioDoDiaCivil(HOJE), historico: "Nota substituída", criadoPor: POR }, deps);
    // Só a parcela desta liquidação é liberada — e a nota também volta a ter saldo.
    const r2 = await liquidarP(nf, [{ recebimentoDefinitivoId: receb900, valor: "900.00" }]);
    expect(r2).toMatchObject({ jaExistia: false, numero: `${r.numero}-2`, valor: "900.00" });
    await pagar({ liquidacaoId: r2.liquidacaoId, numero: "NP-7001", valor: "900.00", data: inicioDoDiaCivil(HOJE), contaBancaria: "CC-001", fonteId: FONTE, historico: "Pagamento da parcela", criadoPor: POR }, R_PAGAMENTO, deps);
    await expect(anularLiquidacao({ liquidacaoId: r2.liquidacaoId, numero: "NLA-7002", data: inicioDoDiaCivil(HOJE), historico: "Tentativa depois de pago", criadoPor: POR }, deps)).rejects.toThrow(/pag/i);
    await expect(liquidarP(await nota("7003", "900.00"), [{ recebimentoDefinitivoId: receb900, valor: "900.00" }])).rejects.toThrow(/PARCELA-JA-LIQUIDADA/);
  });

  it("LI07 (V7 M2 U7): a parcela medida PELA PLANILHA da obra liquida pelo mesmo caminho — R$ 900,00 e, aceita a controvérsia, R$ 100,00", async () => {
    // Contrato B com a mesma fixture: 2 itens, ordem de R$ 1.100,00; a planilha da obra (preços de orçamento diferentes)
    // declara o contrato B e liga 1.1 → visita e 1.2 → hora. A medição pela planilha (6 visitas + 8 horas) vale R$ 1.000,00
    // no contrato; o recebimento separa R$ 900,00 regulares e R$ 100,00 em controvérsia.
    const ENG = "engenharia.liq@teste.local";
    const pe = await prisma.perfil.create({ data: { nome: "P-eng-liq", descricao: "t", criadoPor: "SEED", permissoes: { create: [{ acao: "GERIR_PLANILHA_DA_OBRA", criadoPor: "SEED" }] } }, select: { id: true } });
    const ue = await prisma.usuario.create({ data: { identificador: ENG, nome: ENG, criadoPor: "SEED" }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: ue.id, perfilId: pe.id, criadoPor: "SEED" } });
    const a = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-b", descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId;
    const b = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-b", descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId;
    await designarNoContrato(prisma, { contratoId: "ctr-b", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria G-B", vigenciaInicio: dia(-30), criadoPor: ADMIN });
    const f = (await designarNoContrato(prisma, { contratoId: "ctr-b", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria F-B", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
    await designarNoContrato(prisma, { contratoId: "ctr-b", papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria R-B", vigenciaInicio: dia(-30), criadoPor: ADMIN });
    const empB = (await empenhar({ fichaId: "ficha-39", numero: "2026NE000200", tipo: "GLOBAL", valor: "1100.00", data: inicioDoDiaCivil(dia(-20)), credorCpfCnpj: CNPJ, historico: "Serviços técnicos do contrato B", categoriaOrdemCronologica: "PRESTACAO_SERVICOS", contratoId: "ctr-b", criadoPor: POR }, R_EMPENHO, deps)).empenhoId;
    await prisma.obra.create({ data: { id: "obra-liq", identificador: "OBRA-LIQ", descricao: "Obra sintética da liquidação", tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "SEED" } as never });
    const previa = await gerarPreviaDePlanilha(prisma, { obraId: "obra-liq", nomeDoArquivo: "o.xlsx", conteudo: xlsxDeTeste("Orçamento", [["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário", "Total"], ["1", "SERVIÇOS", null, null, null, 1720], ["1.1", "Visita técnica", "visita", 8, 95, 760], ["1.2", "Hora técnica", "hora", 20, 48, 960]]), criadoPor: ENG });
    const versao = await confirmarPreviaDePlanilha(prisma, { previaId: previa.previaId, descricao: "Orçamento", dataBaseDosPrecos: dia(-90), referenciaDePrecos: "Tabela sintética", vigenciaInicio: dia(-40), motivo: "Projeto aprovado", numeroDoContrato: "CT-B", cienteDasDivergencias: true, criadoPor: ENG });
    const servicos = await prisma.itemDaPlanilhaOrcamentaria.findMany({ where: { planilhaId: versao.planilhaId }, select: { id: true, codigo: true } });
    const s = (c: string) => servicos.find((x) => x.codigo === c)!.id;
    await vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: s("1.1"), itemDoContratoId: a, motivo: "Correspondência conferida pela engenharia", criadoPor: ENG });
    await vincularItemDaPlanilhaAoContrato(prisma, { itemDaPlanilhaId: s("1.2"), itemDoContratoId: b, motivo: "Correspondência conferida pela engenharia", criadoPor: ENG });
    const r = await criarRascunhoDeOrdemDeServico(prisma, { contratoId: "ctr-b", finalidade: "Acompanhamento técnico da obra", inicioPrevisto: dia(-20), fimPrevisto: dia(20), condicoesDeRecebimento: "Relatório assinado", fiscalDesignacaoId: f, itens: [{ itemDoContratoId: a, quantidade: "6" }, { itemDoContratoId: b, quantidade: "10" }], criadoPor: GESTORA });
    await emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
    const m = await medirOrdemPelaPlanilha(prisma, { ordemId: r.ordemId, planilhaId: versao.planilhaId, diaInicio: dia(-10), diaFim: dia(-3), itens: [{ itemDaPlanilhaId: s("1.1"), quantidade: "6" }, { itemDaPlanilhaId: s("1.2"), quantidade: "8" }], criadoPor: FISCAL });
    expect([m.valor, m.valorNaPlanilha]).toEqual(["1000.00", "954.00"]);
    const med = await prisma.itemMedidoNaOrdem.findMany({ where: { medicaoId: m.medicaoId }, select: { id: true, origemNaPlanilha: { select: { codigo: true } } } });
    const ma = med.find((x) => x.origemNaPlanilha?.codigo === "1.1")!.id;
    const mb = med.find((x) => x.origemNaPlanilha?.codigo === "1.2")!.id;
    await registrarRecebimentoProvisorio(prisma, { medicaoId: m.medicaoId, data: dia(-2), verificacoes: "Relatórios conferidos", itens: [{ itemMedidoId: ma, quantidadeConforme: "5", quantidadeEmControversia: "1", motivo: "Visita sem assinatura" }, { itemMedidoId: mb, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL });
    const r900 = (await registrarRecebimentoDefinitivo(prisma, { medicaoId: m.medicaoId, data: dia(-1), conclusao: "Parte regular", itens: [{ itemMedidoId: ma, quantidade: "5" }, { itemMedidoId: mb, quantidade: "8" }], criadoPor: RECEBEDOR })).recebimentoId;
    const { documentoId: nfB } = await registrarDocumentoFiscal(prisma, { emitenteId, modelo: "NF_AVULSA", serie: "1", numero: "7000", dataEmissao: inicioDoDiaCivil(dia(-1)), dataRecebimento: inicioDoDiaCivil(dia(-1)), contratoId: "ctr-b", valorBruto: "1000.00", valorTotal: "1000.00", itens: [{ descricao: "Serviços medidos pela planilha", unidade: "SV", quantidade: "1", valorUnitario: "1000.00", valorTotal: "1000.00" }], criadoPor: POR });
    await conferirDocumentoFiscal(prisma, { documentoId: nfB, data: inicioDoDiaCivil(dia(-1)), motivo: "Nota conferida com o recebimento", criadoPor: POR });
    await expect(liquidarP(nfB, [{ recebimentoDefinitivoId: r900, valor: "1000.00" }], empB)).rejects.toThrow(/PARCELA-ACIMA-DO-ELEGIVEL/);
    await expect(liquidarP(nfB, [{ recebimentoDefinitivoId: r900, valor: "900.00" }], empB)).resolves.toMatchObject({ valor: "900.00" });
    const conf = await prisma.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId: ma }, select: { id: true } });
    await decidirControversia(prisma, { conferenciaId: conf.id, resultado: "ACEITA", fundamento: "Assinatura apresentada", data: HOJE, criadoPor: RECEBEDOR });
    const r100 = (await registrarRecebimentoDefinitivo(prisma, { medicaoId: m.medicaoId, data: HOJE, conclusao: "Complemento aceito", itens: [{ itemMedidoId: ma, quantidade: "1" }], criadoPor: RECEBEDOR })).recebimentoId;
    await expect(liquidarP(nfB, [{ recebimentoDefinitivoId: r100, valor: "100.00" }], empB)).resolves.toMatchObject({ valor: "100.00" });
    const { execucaoDoContrato } = await import("../modules/m11-licitacoes/execucao-do-contrato.js");
    const o = (await execucaoDoContrato(prisma, "ctr-b", "FINANCEIRA")).ordens[0]!;
    expect(o.valores).toMatchObject({ autorizado: "1100.00", medido: "1000.00", recebido: "1000.00", liquidado: "1000.00" });
    // As 2 horas não executadas não viram crédito: continuam a executar na ordem, e o empenho tem R$ 100,00 não liquidados.
    expect(o.itens.map((i) => i.aExecutar)).toEqual(["0.0000", "2.0000"]);
    const liqB = await prisma.liquidacao.findMany({ where: { empenhoId: empB, estornoDeId: null }, select: { valor: true } });
    expect(liqB.map((l) => l.valor.toFixed(2)).sort()).toEqual(["100.00", "900.00"]);
  }, 180_000);
});
