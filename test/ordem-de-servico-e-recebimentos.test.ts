import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil, inicioDoDiaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { cadastrarItemDoContrato, designarNoContrato, registrarOcorrencia, resolverOcorrencia } from "../modules/m11-licitacoes/fiscalizacao.js";
import {
  cancelarSaldoDaOrdemDeServico,
  criarRascunhoDeOrdemDeServico,
  decidirControversia,
  descartarRascunhoDeOrdemDeServico,
  emitirOrdemDeServico,
  estornarRecebimentoDefinitivo,
  manifestoCanonico,
  movimentarExecucaoDaOrdemDeServico,
  registrarMedicaoDaOrdem,
  registrarRecebimentoDefinitivo,
  registrarRecebimentoProvisorio,
} from "../modules/m11-licitacoes/ordem-de-servico.js";
import { execucaoDoContrato } from "../modules/m11-licitacoes/execucao-do-contrato.js";

/**
 * ═══ A ORDEM DE SERVIÇO E OS RECEBIMENTOS POR PARCELA (V7 M2 U1/U2) ═══
 *
 * O cenário aritmético de referência dos critérios de aceite, SINTÉTICO (nenhum preço, índice ou tabela real):
 *   item A — visita, 10 × R$ 100,00; item B — hora, 20 × R$ 50,00; total R$ 2.000,00.
 *   A ordem autoriza 6 visitas e 10 horas: R$ 1.100,00.
 *   A medição informa 6 visitas e 8 horas: R$ 1.000,00.
 *   A conferência aceita 5 visitas e 8 horas (R$ 900,00); 1 visita (R$ 100,00) fica em controvérsia; 2 horas
 *   (R$ 100,00) não foram executadas na ordem.
 * Os valores esperados estão ESCRITOS aqui (não saem do calculador testado). Contrato B independente na mesma data;
 * quatro contas: gestora, fiscal, recebedor e outro setor (as mesmas ações, sem designação).
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "contratos.admin@teste.local";
const GESTORA = "gestora.os@teste.local";
const FISCAL = "fiscal.os@teste.local";
const RECEBEDOR = "recebedor.os@teste.local";
const OUTRO = "outro.setor.os@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);
const TODAS = ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_MEDICAO_DE_OBRA", "REGISTRAR_RECEBIMENTO_PROVISORIO", "REGISTRAR_RECEBIMENTO_DEFINITIVO", "ESTORNAR_RECEBIMENTO_DEFINITIVO", "REGISTRAR_OCORRENCIA_DE_FISCALIZACAO", "RESOLVER_OCORRENCIA_DE_FISCALIZACAO"];

async function conta(identificador: string, acoes: readonly string[], documento?: string): Promise<void> {
  const p = await prisma.perfil.create({ data: { nome: `P-${identificador}`, descricao: "teste", criadoPor: "SEED", permissoes: { create: acoes.map((acao) => ({ acao: acao as never, criadoPor: "SEED" })) } }, select: { id: true } });
  const u = await prisma.usuario.create({ data: { identificador, nome: identificador, criadoPor: "SEED" }, select: { id: true } });
  await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "SEED" } });
  if (documento !== undefined) {
    await prisma.pessoa.create({ data: { documento, tipo: "FISICA", criadoPor: "SEED", versoes: { create: { nome: identificador.split("@")[0]!, criadoPor: "SEED" } } } });
    await vincularPessoaAoUsuario(prisma, { usuarioId: u.id, documento, motivo: "Conferido pelo documento.", criadoPor: "SEED" });
  }
}

const it_: Record<string, { a: string; b: string }> = {};
const fiscalDe: Record<string, string> = {};

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO"]);
  await conta(GESTORA, TODAS, "11144477735");
  await conta(FISCAL, TODAS, "52998224725");
  await conta(RECEBEDOR, TODAS, "86288366757");
  await conta(OUTRO, TODAS, "39053344705");
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0500", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços técnicos mensuráveis", valorLicitado: "4000.00", criadoPor: "SEED" } });
  for (const [id, numero] of [["ctr-a", "CT-A"], ["ctr-b", "CT-B"]] as const) {
    await prisma.contrato.create({ data: { id, numeroContrato: numero, processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Serviços Técnicos Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
    it_[id] = {
      a: (await cadastrarItemDoContrato(prisma, { contratoId: id, descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId,
      b: (await cadastrarItemDoContrato(prisma, { contratoId: id, descricao: "Hora técnica", unidade: "hora", quantidade: "20", valorUnitario: "50", criadoPor: ADMIN })).itemId,
    };
    await designarNoContrato(prisma, { contratoId: id, papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: `Portaria G-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
    fiscalDe[id] = (await designarNoContrato(prisma, { contratoId: id, papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: `Portaria F-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
    await designarNoContrato(prisma, { contratoId: id, papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: `Portaria R-${numero}`, vigenciaInicio: dia(-30), criadoPor: ADMIN });
  }
}, 120_000);

const rascunho = (contrato: "ctr-a" | "ctr-b", a: string | null, b: string | null, extra: Record<string, unknown> = {}) =>
  criarRascunhoDeOrdemDeServico(prisma, {
    contratoId: contrato, finalidade: "Manutenção preventiva das unidades de saúde", inicioPrevisto: dia(-20), fimPrevisto: dia(20),
    condicoesDeRecebimento: "Relatório de visitas assinado e planilha de horas", fiscalDesignacaoId: fiscalDe[contrato]!,
    itens: [...(a === null ? [] : [{ itemDoContratoId: it_[contrato]!.a, quantidade: a }]), ...(b === null ? [] : [{ itemDoContratoId: it_[contrato]!.b, quantidade: b }])],
    criadoPor: GESTORA, ...extra,
  } as never);

async function ordemEmitida(contrato: "ctr-a" | "ctr-b" = "ctr-a", a = "6", b: string | null = "10"): Promise<{ ordemId: string; itemA: string; itemB: string }> {
  const r = await rascunho(contrato, a, b);
  await emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
  const itens = await prisma.itemDaOrdemDeServico.findMany({ where: { ordemId: r.ordemId }, select: { id: true, itemDoContratoId: true } });
  return { ordemId: r.ordemId, itemA: itens.find((i) => i.itemDoContratoId === it_[contrato]!.a)?.id ?? "", itemB: itens.find((i) => i.itemDoContratoId === it_[contrato]!.b)?.id ?? "" };
}

async function medicaoConferida(): Promise<{ ordemId: string; medicaoId: string; mA: string; mB: string; confA: string }> {
  const o = await ordemEmitida();
  const m = await registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-10), diaFim: dia(-3), itens: [{ itemDaOrdemId: o.itemA, quantidade: "6" }, { itemDaOrdemId: o.itemB, quantidade: "8" }], criadoPor: FISCAL });
  const itens = await prisma.itemMedidoNaOrdem.findMany({ where: { medicaoId: m.medicaoId }, select: { id: true, itemDaOrdemId: true } });
  const mA = itens.find((i) => i.itemDaOrdemId === o.itemA)!.id;
  const mB = itens.find((i) => i.itemDaOrdemId === o.itemB)!.id;
  await registrarRecebimentoProvisorio(prisma, { medicaoId: m.medicaoId, data: dia(-2), verificacoes: "Relatórios de visita conferidos com as unidades", itens: [{ itemMedidoId: mA, quantidadeConforme: "5", quantidadeEmControversia: "1", motivo: "Visita à UBS Centro sem assinatura do responsável" }, { itemMedidoId: mB, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL });
  const conf = await prisma.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId: mA }, select: { id: true } });
  return { ordemId: o.ordemId, medicaoId: m.medicaoId, mA, mB, confA: conf.id };
}

describe("U1 — a ordem de serviço", () => {
  it("OS01: duas linhas com origem contratual; a emissão compromete o saldo, recarrega com unitário e fornecedor do contrato e grava o espelho", async () => {
    const r = await rascunho("ctr-a", "6", "10");
    expect(r).toMatchObject({ numero: 1, valor: "1100.00" });
    // Rascunho não compromete saldo.
    expect((await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).itensDoContrato.map((i) => i.aAutorizar)).toEqual(["10.0000", "20.0000"]);
    const e = await emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
    expect(e.valor).toBe("1100.00");
    const x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    expect(x.itensDoContrato.map((i) => [i.aAutorizar, i.valorUnitario])).toEqual([["4.0000", "100.0000"], ["10.0000", "50.0000"]]);
    expect(x.ordens[0]).toMatchObject({ numero: 1, situacao: "EMITIDA", valores: { previsto: "1100.00", autorizado: "1100.00", medido: "0.00", recebido: "0.00", liquidado: "0.00" }, sha256: e.sha256 });
    const emissao = await prisma.emissaoDaOrdemDeServico.findUniqueOrThrow({ where: { ordemId: r.ordemId }, select: { manifesto: true, sha256: true } });
    expect(manifestoCanonico(emissao.manifesto).sha256).toBe(emissao.sha256);
    expect(emissao.manifesto).toMatchObject({ contrato: { contratado: "Serviços Técnicos Beta", documentoDoContratado: "12345678000199" }, total: "1100.00" });
    await expect(emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA })).rejects.toThrow(/ORDEM-JA-EMITIDA/);
  });

  it("OS02: preço ou fornecedor adulterado e item de outro contrato — recusa pelo motivo, nada gravado; outro setor sem designação não cria", async () => {
    await expect(rascunho("ctr-a", "6", null, { itens: [{ itemDoContratoId: it_["ctr-a"]!.a, quantidade: "6", valorUnitario: "1" }] })).rejects.toThrow(/Unrecognized key|valorUnitario/);
    await expect(rascunho("ctr-a", "6", null, { fornecedorId: "outro-fornecedor" })).rejects.toThrow(/Unrecognized key|fornecedorId/);
    await expect(rascunho("ctr-a", "6", null, { itens: [{ itemDoContratoId: it_["ctr-b"]!.a, quantidade: "6" }] })).rejects.toThrow(/ITEM-DE-OUTRO-CONTRATO/);
    await expect(criarRascunhoDeOrdemDeServico(prisma, { contratoId: "ctr-a", finalidade: "Tentativa de outro setor", inicioPrevisto: dia(-20), fimPrevisto: dia(20), condicoesDeRecebimento: "Qualquer coisa escrita", fiscalDesignacaoId: fiscalDe["ctr-a"]!, itens: [{ itemDoContratoId: it_["ctr-a"]!.a, quantidade: "1" }], criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-GESTOR/);
    expect(await prisma.ordemDeServicoDoContrato.count()).toBe(0);
  });

  it("OS03: duas ordens concorrentes que juntas passam do item — só uma confirma, e o saldo nunca fica negativo", async () => {
    const r1 = await rascunho("ctr-a", "6", null);
    const r2 = await rascunho("ctr-a", "5", null);
    const corrida = await Promise.allSettled([r1, r2].map((r) => emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA })));
    expect(corrida.filter((c) => c.status === "fulfilled")).toHaveLength(1);
    expect(String((corrida.find((c) => c.status === "rejected") as PromiseRejectedResult).reason)).toMatch(/SALDO-DO-ITEM-INSUFICIENTE: o item 1 \(Visita técnica\) tem 10\.0000 contratado/);
    const a = (await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).itensDoContrato[0]!;
    expect(["4.0000", "5.0000"]).toContain(a.aAutorizar);
  });

  it("OS04: emitir não reserva, não empenha, não liquida, não paga nem recebe", async () => {
    const antes = await Promise.all([prisma.reservaEmpenho.count(), prisma.empenho.count(), prisma.liquidacao.count(), prisma.pagamento.count(), prisma.recebimentoDefinitivo.count()]);
    await ordemEmitida();
    expect(await Promise.all([prisma.reservaEmpenho.count(), prisma.empenho.count(), prisma.liquidacao.count(), prisma.pagamento.count(), prisma.recebimentoDefinitivo.count()])).toEqual(antes);
  });

  it("OS05: cancelar saldo só do não executado — o medido continua comprometido; rascunho se descarta, emitida não", async () => {
    const o = await ordemEmitida();
    await registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-10), diaFim: dia(-3), itens: [{ itemDaOrdemId: o.itemA, quantidade: "6" }, { itemDaOrdemId: o.itemB, quantidade: "8" }], criadoPor: FISCAL });
    await expect(cancelarSaldoDaOrdemDeServico(prisma, { ordemId: o.ordemId, data: HOJE, motivo: "Demanda atendida", itens: [{ itemDaOrdemId: o.itemB, quantidade: "3" }], criadoPor: GESTORA })).rejects.toThrow(/CANCELAMENTO-ACIMA-DO-NAO-EXECUTADO: o item 2 \(Hora técnica\) autorizou 10\.0000, já cancelou 0\.0000 e mediu 8\.0000; só 2\.0000/);
    await expect(cancelarSaldoDaOrdemDeServico(prisma, { ordemId: o.ordemId, data: HOJE, motivo: "Demanda atendida", itens: [{ itemDaOrdemId: o.itemA, quantidade: "1" }], criadoPor: GESTORA })).rejects.toThrow(/só 0\.0000/);
    await cancelarSaldoDaOrdemDeServico(prisma, { ordemId: o.ordemId, data: HOJE, motivo: "Demanda atendida antes do previsto", itens: [{ itemDaOrdemId: o.itemB, quantidade: "2" }], criadoPor: GESTORA });
    const x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    expect(x.ordens[0]!.itens.map((i) => [i.autorizado, i.medido, i.aExecutar])).toEqual([["6.0000", "6.0000", "0.0000"], ["8.0000", "8.0000", "0.0000"]]);
    // Os 2 cancelados voltam ao saldo do contrato: B contratado 20, autorizado 8.
    expect(x.itensDoContrato[1]!.aAutorizar).toBe("12.0000");
    expect(x.ordens[0]!.valores).toMatchObject({ autorizado: "1000.00", medido: "1000.00" });
    await expect(descartarRascunhoDeOrdemDeServico(prisma, { ordemId: o.ordemId, motivo: "Tentar descartar emitida", criadoPor: GESTORA })).rejects.toThrow(/ORDEM-EMITIDA-NAO-SE-DESCARTA/);
    const r = await rascunho("ctr-a", "1", null);
    await descartarRascunhoDeOrdemDeServico(prisma, { ordemId: r.ordemId, motivo: "Criado por engano", criadoPor: GESTORA });
    await expect(emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA })).rejects.toThrow(/RASCUNHO-DESCARTADO/);
  });

  it("AC07: contrato vencido não emite nova ordem; a medição do que foi executado na vigência é tratada depois do fim", async () => {
    await prisma.contrato.create({ data: { id: "ctr-venc", numeroContrato: "CT-V", processoId: "proc", contratadoDocumento: "12345678000199", contratadoNome: "Serviços Técnicos Beta", valorInicial: "1000.00", vigenciaInicio: new Date(`${dia(-90)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(-2)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
    const item = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr-venc", descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId;
    const g = (await designarNoContrato(prisma, { contratoId: "ctr-venc", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria G-V", vigenciaInicio: dia(-60), criadoPor: ADMIN })).designacaoId;
    const f = (await designarNoContrato(prisma, { contratoId: "ctr-venc", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria F-V", vigenciaInicio: dia(-60), criadoPor: ADMIN })).designacaoId;
    const r = await criarRascunhoDeOrdemDeServico(prisma, { contratoId: "ctr-venc", finalidade: "Visitas depois do fim", inicioPrevisto: dia(-1), fimPrevisto: dia(5), condicoesDeRecebimento: "Relatório de visitas", fiscalDesignacaoId: f, itens: [{ itemDoContratoId: item, quantidade: "2" }], criadoPor: GESTORA });
    await expect(emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-1), criadoPor: GESTORA })).rejects.toThrow(/CONTRATO-FORA-DE-VIGENCIA/);
    // ⚠️ FIXTURE DECLARADA: a ordem EMITIDA DURANTE a vigência (há 40 dias) é carga histórica — não há como emitir no
    // passado pelo caso de uso, que emite hoje. O que o teste afirma é o tratamento POSTERIOR, pelo caso de uso.
    const hist = await prisma.ordemDeServicoDoContrato.create({ data: { contratoId: "ctr-venc", numero: 9, ano: 2026, finalidade: "Visitas executadas na vigência", inicioPrevisto: inicioDoDiaCivil(dia(-40)), fimPrevisto: inicioDoDiaCivil(dia(-5)), condicoesDeRecebimento: "Relatório de visitas", gestorDesignacaoId: g, fiscalDesignacaoId: f, criadoPor: GESTORA, itens: { create: [{ itemDoContratoId: item, quantidade: "3", valorUnitario: "100", criadoPor: GESTORA }] } }, select: { id: true, itens: { select: { id: true } } } });
    await prisma.emissaoDaOrdemDeServico.create({ data: { ordemId: hist.id, data: inicioDoDiaCivil(dia(-40)), inicioAutorizado: inicioDoDiaCivil(dia(-40)), designacaoId: g, manifesto: {}, sha256: "0".repeat(64), criadoPor: GESTORA } });
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: hist.id, diaInicio: dia(-30), diaFim: dia(-10), itens: [{ itemDaOrdemId: hist.itens[0]!.id, quantidade: "3" }], criadoPor: FISCAL })).resolves.toMatchObject({ valor: "300.00" });
    // Período depois do fim da vigência: nova execução — recusa.
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: hist.id, diaInicio: dia(-1), diaFim: dia(-1), itens: [{ itemDaOrdemId: hist.itens[0]!.id, quantidade: "1" }], criadoPor: FISCAL })).rejects.toThrow(/PERIODO-FORA-DA-ORDEM|CONTRATO-FORA-DE-VIGENCIA/);
  });

  it("RE07: a suspensão tem marco e motivo; o período suspenso não se mede; retomada, volta a medir", async () => {
    const o = await ordemEmitida();
    await movimentarExecucaoDaOrdemDeServico(prisma, { ordemId: o.ordemId, tipo: "SUSPENSAO", data: dia(-8), motivo: "Unidade interditada pela vigilância sanitária", criadoPor: GESTORA });
    await expect(movimentarExecucaoDaOrdemDeServico(prisma, { ordemId: o.ordemId, tipo: "SUSPENSAO", data: dia(-7), motivo: "Suspensão repetida", criadoPor: GESTORA })).rejects.toThrow(/MOVIMENTO-REPETIDO/);
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-7), diaFim: dia(-6), itens: [{ itemDaOrdemId: o.itemB, quantidade: "1" }], criadoPor: FISCAL })).rejects.toThrow(/EXECUCAO-SUSPENSA: a ordem nº 1 esteve suspensa de .* até hoje/);
    await movimentarExecucaoDaOrdemDeServico(prisma, { ordemId: o.ordemId, tipo: "RETOMADA", data: dia(-4), motivo: "Interdição levantada", criadoPor: GESTORA });
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-6), diaFim: dia(-5), itens: [{ itemDaOrdemId: o.itemB, quantidade: "1" }], criadoPor: FISCAL })).rejects.toThrow(/EXECUCAO-SUSPENSA/);
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-4), diaFim: dia(-3), itens: [{ itemDaOrdemId: o.itemB, quantidade: "1" }], criadoPor: FISCAL })).resolves.toMatchObject({ valor: "50.00" });
    expect((await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).ordens[0]!.movimentos.map((m) => m.tipo)).toEqual(["SUSPENSAO", "RETOMADA"]);
  });
});

describe("U2 — a medição da ordem e os recebimentos", () => {
  it("ME03/ME04 na ordem: a mesma parcela não se mede duas vezes; duas ordens distintas medem no mesmo dia", async () => {
    const o1 = await ordemEmitida("ctr-a", "6", "10");
    await registrarMedicaoDaOrdem(prisma, { ordemId: o1.ordemId, diaInicio: dia(-3), diaFim: dia(-3), itens: [{ itemDaOrdemId: o1.itemA, quantidade: "6" }], criadoPor: FISCAL });
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o1.ordemId, diaInicio: dia(-3), diaFim: dia(-3), itens: [{ itemDaOrdemId: o1.itemA, quantidade: "6" }], criadoPor: FISCAL })).rejects.toThrow(/ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM: o item 1 \(Visita técnica\) tem 6\.0000 visita/);
    const o2 = await ordemEmitida("ctr-a", "2", "2");
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o2.ordemId, diaInicio: dia(-3), diaFim: dia(-3), itens: [{ itemDaOrdemId: o2.itemA, quantidade: "2" }], criadoPor: FISCAL })).resolves.toMatchObject({ valor: "200.00", numero: 1 });
    await expect(registrarMedicaoDaOrdem(prisma, { ordemId: o1.ordemId, diaInicio: dia(-3), diaFim: dia(-3), itens: [{ itemDaOrdemId: o1.itemB, quantidade: "4" }], criadoPor: FISCAL })).resolves.toMatchObject({ valor: "200.00", numero: 2 });
  });

  it("RE01/RE02/RE03/RE04: o provisório identifica a parcela e a pendência; o definitivo sem designação recusa; a controvérsia bloqueia só o item; a parte regular recebe R$ 900,00", async () => {
    const c = await medicaoConferida();
    let x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    const med = x.ordens[0]!.medicoes[0]!;
    expect(med.valores).toEqual({ medido: "1000.00", conforme: "900.00", emControversia: "100.00", aceito: "0.00", glosado: "0.00", recebido: "0.00", liquidado: "0.00" });
    expect(med.itens.map((i) => [i.item, i.conforme, i.emControversia, i.elegivel, i.pendenteDeDecisao])).toEqual([[1, "5.0000", "1.0000", "5.0000", "1.0000"], [2, "8.0000", "0.0000", "8.0000", "0.0000"]]);
    expect(med.itens[0]!.motivo).toMatch(/sem assinatura/);
    // A projeção financeira não leva o motivo nem as verificações.
    const fin = (await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).ordens[0]!.medicoes[0]!;
    expect([fin.itens[0]!.motivo, fin.provisorio?.verificacoes]).toEqual([null, null]);
    expect(x.ordens[0]!.situacao).toBe("EMITIDA");
    // RE02: OUTRO tem a ação e não é recebedor designado — recusa dentro da transação, nada gravado.
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Atestado por outro setor", itens: [{ itemMedidoId: c.mB, quantidade: "8" }], criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-RECEBEDOR_DEFINITIVO/);
    // Quem recebeu provisoriamente não é recebedor: a mesma recusa (e a designação acumulada é impossível).
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Atestado pelo próprio fiscal", itens: [{ itemMedidoId: c.mB, quantidade: "8" }], criadoPor: FISCAL })).rejects.toThrow(/SEM-DESIGNACAO-DE-RECEBEDOR_DEFINITIVO/);
    // RE03: pedir as 6 visitas bloqueia o item nomeando a providência.
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Tentativa com a visita em controvérsia", itens: [{ itemMedidoId: c.mA, quantidade: "6" }, { itemMedidoId: c.mB, quantidade: "8" }], criadoPor: RECEBEDOR })).rejects.toThrow(/CONTROVERSIA-PENDENTE: no item 1 \(Visita técnica\), 1\.0000 visita estão em controvérsia sem decisão, e só 5\.0000 é elegível agora/);
    expect(await prisma.recebimentoDefinitivo.count()).toBe(0);
    // RE04: a parte regular segue — R$ 900,00 — e a pendência sai nomeada no termo.
    const d = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Visitas e horas conferidas com relatórios assinados", itens: [{ itemMedidoId: c.mA, quantidade: "5" }, { itemMedidoId: c.mB, quantidade: "8" }], criadoPor: RECEBEDOR });
    expect(d).toMatchObject({ numero: 1, valor: "900.00", pendencias: ["item 1: 1.0000 visita em controvérsia aguardando decisão"] });
    x = await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO");
    expect(x.ordens[0]!.valores).toEqual({ previsto: "1100.00", autorizado: "1100.00", medido: "1000.00", recebido: "900.00", liquidado: "0.00" });
    // As 2 horas não executadas continuam a executar NA ORDEM, e o contrato tem 4 visitas e 10 horas a autorizar (R$ 900,00).
    expect(x.ordens[0]!.itens.map((i) => i.aExecutar)).toEqual(["0.0000", "2.0000"]);
    expect(x.itensDoContrato.map((i) => i.aAutorizar)).toEqual(["4.0000", "10.0000"]);
    const termo = await prisma.recebimentoDefinitivo.findUniqueOrThrow({ where: { id: d.recebimentoId }, select: { manifesto: true, sha256: true } });
    expect(manifestoCanonico(termo.manifesto).sha256).toBe(termo.sha256);
  });

  it("o complemento: aceita a controvérsia, recebe-se R$ 100,00 (não a medição inteira); rejeitada em outra medição, é glosa e o registro fica", async () => {
    const c = await medicaoConferida();
    await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Parte regular conferida", itens: [{ itemMedidoId: c.mA, quantidade: "5" }, { itemMedidoId: c.mB, quantidade: "8" }], criadoPor: RECEBEDOR });
    await expect(decidirControversia(prisma, { conferenciaId: c.confA, resultado: "ACEITA", fundamento: "Assinatura apresentada depois", data: HOJE, criadoPor: FISCAL })).rejects.toThrow(/SEM-DESIGNACAO-DE-RECEBEDOR_DEFINITIVO/);
    const dec = await decidirControversia(prisma, { conferenciaId: c.confA, resultado: "ACEITA", fundamento: "Responsável da UBS Centro apresentou a assinatura da visita", data: HOJE, criadoPor: RECEBEDOR });
    expect(dec).toMatchObject({ quantidade: "1.0000", valor: "100.00" });
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Pedido da medição inteira de novo", itens: [{ itemMedidoId: c.mA, quantidade: "6" }], criadoPor: RECEBEDOR })).rejects.toThrow(/ACIMA-DO-ELEGIVEL: no item 1 \(Visita técnica\), elegível 1\.0000/);
    const comp = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Complemento da visita aceita", itens: [{ itemMedidoId: c.mA, quantidade: "1" }], criadoPor: RECEBEDOR });
    expect(comp).toMatchObject({ numero: 2, valor: "100.00", pendencias: [] });
    expect((await execucaoDoContrato(prisma, "ctr-a", "FINANCEIRA")).ordens[0]!.valores.recebido).toBe("1000.00");

    // A outra medição, com a controvérsia REJEITADA.
    const o2 = await ordemEmitida("ctr-b", "3", null);
    const m2 = await registrarMedicaoDaOrdem(prisma, { ordemId: o2.ordemId, diaInicio: dia(-5), diaFim: dia(-4), itens: [{ itemDaOrdemId: o2.itemA, quantidade: "3" }], criadoPor: FISCAL });
    const im = await prisma.itemMedidoNaOrdem.findFirstOrThrow({ where: { medicaoId: m2.medicaoId }, select: { id: true } });
    await registrarRecebimentoProvisorio(prisma, { medicaoId: m2.medicaoId, data: dia(-1), verificacoes: "Relatórios conferidos", itens: [{ itemMedidoId: im.id, quantidadeConforme: "2", quantidadeEmControversia: "1", motivo: "Visita não comprovada" }], criadoPor: FISCAL });
    const conf2 = await prisma.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId: im.id }, select: { id: true } });
    await decidirControversia(prisma, { conferenciaId: conf2.id, resultado: "REJEITADA", fundamento: "A visita não foi comprovada por nenhum registro", data: HOJE, criadoPor: RECEBEDOR });
    await expect(decidirControversia(prisma, { conferenciaId: conf2.id, resultado: "ACEITA", fundamento: "Mudança de ideia", data: HOJE, criadoPor: RECEBEDOR })).rejects.toThrow(/CONTROVERSIA-JA-DECIDIDA/);
    await expect(registrarRecebimentoDefinitivo(prisma, { medicaoId: m2.medicaoId, data: HOJE, conclusao: "Tentativa com a glosa", itens: [{ itemMedidoId: im.id, quantidade: "3" }], criadoPor: RECEBEDOR })).rejects.toThrow(/GLOSA-CONFIRMADA: no item 1 \(Visita técnica\), 1\.0000 visita foram rejeitados; elegível 2\.0000/);
    const x2 = (await execucaoDoContrato(prisma, "ctr-b", "FISCALIZACAO")).ordens[0]!.medicoes[0]!;
    expect(x2.valores).toMatchObject({ glosado: "100.00", conforme: "200.00" });
    expect(x2.itens[0]!.decisao).toMatchObject({ resultado: "REJEITADA" });
    // ═══ ⚠️ MUDANÇA DELIBERADA DE COMPORTAMENTO (V9 N4) — leia antes de "corrigir" ═══
    //
    // Até 16/09/2026 esta linha afirmava o contrário: `aExecutar` ficava em `0.0000`, com o
    // comentário "a glosa não libera saldo por efeito da decisão". Era a decisão do V7 M2, e a
    // pendência que ela deixou chamava-se `GLOSA-LIBERACAO-DE-SALDO`.
    //
    // O efeito dela, medido: a visita REJEITADA continuava consumindo a autorização para sempre.
    // O contratado não podia refazer o serviço dentro da mesma ordem — e refazer é justamente o
    // que a lei lhe impõe quando a execução é recusada (Lei 14.133/2021, art. 140, § 1º) — e o
    // único caminho para destravar era emitir OUTRA ordem, isto é, autorizar despesa nova por
    // causa de um serviço que já estava autorizado e apenas foi malfeito.
    //
    // Agora a decisão REJEITADA devolve a quantidade ao saldo: 3 autorizadas − (3 medidas − 1
    // glosada) = 1 a executar. A liberação é DERIVADA da decisão, que é única por conferência —
    // não há lançamento de crédito para acontecer duas vezes.
    //
    // ⚠️ E ELA NÃO AUTORIZA PAGAMENTO NENHUM: o elegível do recebimento definitivo continua em
    // 2.0000 (a asserção `GLOSA-CONFIRMADA` acima), o recebido não muda, e nada foi liquidado.
    const bGlosada = (await execucaoDoContrato(prisma, "ctr-b", "FINANCEIRA")).ordens[0]!.itens[0]!;
    expect(bGlosada.medido, "o medido passa a ser LÍQUIDO — 3 medidas menos 1 glosada").toBe("2.0000");
    expect(bGlosada.glosado, "e a tela mostra quanto foi glosado, para o número não mudar sem explicação").toBe("1.0000");
    expect(bGlosada.aExecutar, "a visita rejeitada voltou a executar dentro da MESMA ordem").toBe("1.0000");
  });

  it("ER04: o estorno do recebimento exige autoridade de recebedor, não se repete e não é anterior ao termo", async () => {
    const c = await medicaoConferida();
    const r = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Parte regular conferida", itens: [{ itemMedidoId: c.mA, quantidade: "5" }, { itemMedidoId: c.mB, quantidade: "8" }], criadoPor: RECEBEDOR });

    // ⚠️ AUTORIDADE. `OUTRO` tem as MESMAS ações e nenhuma designação neste contrato — o que o
    // separa do recebedor é o ato de designação, não o perfil.
    await expect(
      estornarRecebimentoDefinitivo(prisma, { recebimentoId: r.recebimentoId, data: HOJE, motivo: "Tentativa de quem não é recebedor designado", criadoPor: OUTRO })
    ).rejects.toThrow(/SEM-DESIGNACAO-DE-RECEBEDOR_DEFINITIVO/);
    expect(await prisma.estornoDeRecebimentoDefinitivo.count()).toBe(0);

    // ⚠️ DATA. O estorno não antecede o termo que desfaz — um documento que desfaz outro antes de
    // ele existir é a linha do tempo quebrada no papel.
    await expect(
      estornarRecebimentoDefinitivo(prisma, { recebimentoId: r.recebimentoId, data: dia(-5), motivo: "Estorno com data anterior ao termo", criadoPor: RECEBEDOR })
    ).rejects.toThrow(/ESTORNO-ANTES-DO-RECEBIMENTO/);

    const e = await estornarRecebimentoDefinitivo(prisma, { recebimentoId: r.recebimentoId, data: HOJE, motivo: "Quantidade conferida a maior no termo assinado", criadoPor: RECEBEDOR });
    expect(e).toMatchObject({ numero: 1, valor: "900.00" });

    // ⚠️ UMA VEZ SÓ, pelo `@unique` — não há coluna "estornado" para sair de sincronia com o fato.
    await expect(
      estornarRecebimentoDefinitivo(prisma, { recebimentoId: r.recebimentoId, data: HOJE, motivo: "Segunda tentativa sobre o mesmo termo", criadoPor: RECEBEDOR })
    ).rejects.toThrow(/RECEBIMENTO-JA-ESTORNADO/);
    expect(await prisma.estornoDeRecebimentoDefinitivo.count()).toBe(1);
  });

  it("ER05: estornado, o elegível volta ao que era e o termo original permanece com o seu sha256", async () => {
    const c = await medicaoConferida();
    const r = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Parte regular conferida", itens: [{ itemMedidoId: c.mA, quantidade: "5" }, { itemMedidoId: c.mB, quantidade: "8" }], criadoPor: RECEBEDOR });
    const original = await prisma.recebimentoDefinitivo.findUniqueOrThrow({ where: { id: r.recebimentoId }, select: { sha256: true, conclusao: true } });

    const antes = (await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO")).ordens[0]!.medicoes[0]!.itens.map((i) => [i.item, i.recebido, i.elegivel]);
    expect(antes).toEqual([[1, "5.0000", "0.0000"], [2, "8.0000", "0.0000"]]);

    await estornarRecebimentoDefinitivo(prisma, { recebimentoId: r.recebimentoId, data: HOJE, motivo: "Quantidade conferida a maior no termo assinado", criadoPor: RECEBEDOR });

    const depois = (await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO")).ordens[0]!.medicoes[0]!.itens.map((i) => [i.item, i.recebido, i.elegivel]);
    expect(depois, "o elegível não voltou — a quantidade estornada continua bloqueando o termo correto").toEqual([[1, "0.0000", "5.0000"], [2, "0.0000", "8.0000"]]);

    // ⚠️ APPEND-ONLY: o termo original NÃO foi apagado nem reescrito. O sha256 é o mesmo, e é por
    // ele que a segunda via continua conferindo.
    const depoisDoEstorno = await prisma.recebimentoDefinitivo.findUniqueOrThrow({ where: { id: r.recebimentoId }, select: { sha256: true, conclusao: true } });
    expect(depoisDoEstorno).toEqual(original);
  });

  it("ER06: o termo do estorno identifica o documento desfeito pelo sha256 dele", async () => {
    const c = await medicaoConferida();
    const r = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Parte regular conferida", itens: [{ itemMedidoId: c.mA, quantidade: "5" }, { itemMedidoId: c.mB, quantidade: "8" }], criadoPor: RECEBEDOR });
    await estornarRecebimentoDefinitivo(prisma, { recebimentoId: r.recebimentoId, data: HOJE, motivo: "Quantidade conferida a maior no termo assinado", criadoPor: RECEBEDOR });

    const e = await prisma.estornoDeRecebimentoDefinitivo.findFirstOrThrow({ select: { manifesto: true, sha256: true } });
    const m = e.manifesto as { documento: string; recebimentoEstornado: { sha256: string; numero: number }; valor: string; motivo: string };
    expect(m.documento).toBe("TERMO_DE_ESTORNO_DE_RECEBIMENTO_DEFINITIVO");
    // ⚠️ Sem o sha256 do termo desfeito, a segunda via do estorno não diria QUAL documento foi
    // desfeito: dois termos da mesma medição não se distinguem pelo número.
    expect(m.recebimentoEstornado.sha256).toBe(r.sha256);
    expect(m.valor).toBe("900.00");
    expect(m.motivo).toContain("conferida a maior");
    // E o estorno recalcula o seu próprio manifesto: o sha do estorno não é o do termo desfeito.
    expect(e.sha256).not.toBe(r.sha256);
  });

  it("RE06: resolver ocorrência não recebe, não aceita controvérsia e não mexe no elegível", async () => {
    const c = await medicaoConferida();
    const oc = await registrarOcorrencia(prisma, { contratoId: "ctr-a", data: dia(-1), tipo: "NAO_CONFORMIDADE", descricao: "Visita sem assinatura na UBS Centro", encaminhamento: "GESTOR", criadoPor: FISCAL });
    await resolverOcorrencia(prisma, { ocorrenciaId: oc.ocorrenciaId, texto: "Contratada notificada para apresentar a assinatura", criadoPor: GESTORA });
    expect(await prisma.recebimentoDefinitivo.count()).toBe(0);
    expect(await prisma.decisaoDeControversia.count()).toBe(0);
    const med = (await execucaoDoContrato(prisma, "ctr-a", "FISCALIZACAO")).ordens.find((o) => o.id === c.ordemId)!.medicoes[0]!;
    expect(med.itens[0]!.pendenteDeDecisao).toBe("1.0000");
  });

  it("o provisório confere tudo e fecha: item faltando, soma que não fecha e controvérsia sem motivo são recusados; outro setor não recebe", async () => {
    const o = await ordemEmitida();
    const m = await registrarMedicaoDaOrdem(prisma, { ordemId: o.ordemId, diaInicio: dia(-10), diaFim: dia(-3), itens: [{ itemDaOrdemId: o.itemA, quantidade: "6" }, { itemDaOrdemId: o.itemB, quantidade: "8" }], criadoPor: FISCAL });
    const [mA, mB] = (await prisma.itemMedidoNaOrdem.findMany({ where: { medicaoId: m.medicaoId }, orderBy: { valor: "desc" }, select: { id: true } })).map((i) => i.id);
    const base = { medicaoId: m.medicaoId, data: dia(-2), verificacoes: "Relatórios conferidos" };
    await expect(registrarRecebimentoProvisorio(prisma, { ...base, itens: [{ itemMedidoId: mA!, quantidadeConforme: "6", quantidadeEmControversia: "0" }], criadoPor: FISCAL })).rejects.toThrow(/CONFERENCIA-INCOMPLETA/);
    await expect(registrarRecebimentoProvisorio(prisma, { ...base, itens: [{ itemMedidoId: mA!, quantidadeConforme: "5", quantidadeEmControversia: "0" }, { itemMedidoId: mB!, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL })).rejects.toThrow(/CONFERENCIA-NAO-FECHA/);
    await expect(registrarRecebimentoProvisorio(prisma, { ...base, itens: [{ itemMedidoId: mA!, quantidadeConforme: "5", quantidadeEmControversia: "1" }, { itemMedidoId: mB!, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: FISCAL })).rejects.toThrow(/CONTROVERSIA-SEM-MOTIVO/);
    await expect(registrarRecebimentoProvisorio(prisma, { ...base, itens: [{ itemMedidoId: mA!, quantidadeConforme: "6", quantidadeEmControversia: "0" }, { itemMedidoId: mB!, quantidadeConforme: "8", quantidadeEmControversia: "0" }], criadoPor: OUTRO })).rejects.toThrow(/SEM-DESIGNACAO-DE-FISCAL/);
    expect(await prisma.recebimentoProvisorio.count()).toBe(0);
  });
});
