import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { diaCivil } from "../packages/datas/index.js";
import { criarPrismaDeTeste, exigirBanco } from "./banco.js";
import { limparBanco } from "./limpar-banco.js";
import { vincularPessoaAoUsuario } from "../modules/m16-travamento/servico-pessoa-do-usuario.js";
import { cadastrarItemDoContrato, designarNoContrato } from "../modules/m11-licitacoes/fiscalizacao.js";
import {
  cancelarSaldoDaOrdemDeServico,
  criarRascunhoDeOrdemDeServico,
  decidirControversia,
  emitirOrdemDeServico,
  glosadoDoItemDaOrdem,
  medidoLiquido,
  registrarMedicaoDaOrdem,
  registrarRecebimentoDefinitivo,
  registrarRecebimentoProvisorio,
} from "../modules/m11-licitacoes/ordem-de-servico.js";
import { execucaoDoContrato } from "../modules/m11-licitacoes/execucao-do-contrato.js";

/**
 * ═══ A GLOSA DEVOLVE SALDO À ORDEM (V9 N4 — `GLOSA-LIBERACAO-DE-SALDO`) ═══
 *
 * ⚠️ A CARACTERIZAÇÃO QUE MOTIVOU A MUDANÇA, medida em 16/09/2026 ANTES de tocar em qualquer
 * linha. Ordem com 6 visitas autorizadas; 6 medidas; conferência aceita 4 e aponta 2 em
 * controvérsia; o recebedor decide **REJEITADA**:
 *
 *     autorizado 6,0000 · medido 6,0000 · a executar 0,0000
 *     nova medição das 2 glosadas → ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM
 *
 * A quantidade recusada consumia a autorização **para sempre**. Refazer o serviço — que é o que a
 * Lei 14.133/2021, art. 140, § 1º impõe ao contratado quando a execução é recusada — exigiria
 * emitir outra ordem, ou seja, autorizar despesa nova por causa de um serviço já autorizado e
 * apenas malfeito.
 *
 * ═══ O QUE ESTE ARQUIVO IMPEDE ═══
 *
 * · **Liberar cedo demais** (G3). Controvérsia SEM decisão não libera nada: liberar antes
 *   permitiria remedir o que ainda pode ser aceito, e a mesma parcela seria medida duas vezes.
 * · **Liberar por acaso** (G4). Decisão ACEITA não libera — ela torna a quantidade elegível a
 *   receber, que é o oposto.
 * · **Liberar duas vezes** (G5). A liberação é DERIVADA da decisão, que é única por conferência.
 * · **Liberar dinheiro junto com a quantidade** (G2). O elegível ao recebimento definitivo
 *   continua sendo conforme + aceito: saldo de EXECUÇÃO liberado não é pagamento autorizado.
 * · **Dois leitores discordando** (G6). O guard da medição, a `aExecutar` da planilha e a tela
 *   passam pela MESMA derivação; um leitor que some o bruto volta a ignorar a glosa em silêncio.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);
afterAll(async () => {
  await prisma.$disconnect();
});

const ADMIN = "g.admin@teste.local";
const GESTORA = "g.gestora@teste.local";
const FISCAL = "g.fiscal@teste.local";
const RECEBEDOR = "g.recebedor@teste.local";
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);
const TODAS = ["EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO", "REGISTRAR_MEDICAO_DE_OBRA", "REGISTRAR_RECEBIMENTO_PROVISORIO", "REGISTRAR_RECEBIMENTO_DEFINITIVO"];

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
let fiscalId = "";

beforeEach(async () => {
  await limparBanco(prisma);
  await conta(ADMIN, ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO"]);
  // Cancelar saldo usa a MESMA ação de emitir a ordem (ver `ACAO_DO_SERVICO`): é ato do gestor.
  await conta(GESTORA, TODAS, "11144477735");
  await conta(FISCAL, TODAS, "52998224725");
  await conta(RECEBEDOR, TODAS, "86288366757");
  await prisma.processoLicitatorio.create({ data: { id: "proc", numeroProcesso: "2026/0900", modalidade: "PREGAO_ELETRONICO", objeto: "Serviços técnicos mensuráveis", valorLicitado: "4000.00", criadoPor: "SEED" } });
  await prisma.contrato.create({ data: { id: "ctr", numeroContrato: "CT-G", processoId: "proc", contratadoDocumento: "12345678000195", contratadoNome: "Serviços Técnicos Beta", valorInicial: "2000.00", vigenciaInicio: new Date(`${dia(-60)}T15:00:00Z`), vigenciaFimInicial: new Date(`${dia(60)}T15:00:00Z`), categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: "SEED" } });
  itemA = (await cadastrarItemDoContrato(prisma, { contratoId: "ctr", descricao: "Visita técnica", unidade: "visita", quantidade: "10", valorUnitario: "100", criadoPor: ADMIN })).itemId;
  await designarNoContrato(prisma, { contratoId: "ctr", papel: "GESTOR", usuarioIdentificador: GESTORA, atoDesignacao: "Portaria G", vigenciaInicio: dia(-30), criadoPor: ADMIN });
  fiscalId = (await designarNoContrato(prisma, { contratoId: "ctr", papel: "FISCAL", usuarioIdentificador: FISCAL, atoDesignacao: "Portaria F", vigenciaInicio: dia(-30), criadoPor: ADMIN })).designacaoId;
  await designarNoContrato(prisma, { contratoId: "ctr", papel: "RECEBEDOR_DEFINITIVO", usuarioIdentificador: RECEBEDOR, atoDesignacao: "Portaria R", vigenciaInicio: dia(-30), criadoPor: ADMIN });
}, 120_000);

async function ordemComMedicaoConferida(conforme: string, controversia: string): Promise<{ ordemId: string; itemDaOrdemId: string; medicaoId: string; itemMedidoId: string; conferenciaId: string }> {
  const r = await criarRascunhoDeOrdemDeServico(prisma, {
    contratoId: "ctr", finalidade: "Manutenção preventiva das unidades de saúde", inicioPrevisto: dia(-20), fimPrevisto: dia(20),
    condicoesDeRecebimento: "Relatório de visitas assinado", fiscalDesignacaoId: fiscalId,
    itens: [{ itemDoContratoId: itemA, quantidade: "6" }], criadoPor: GESTORA,
  } as never);
  await emitirOrdemDeServico(prisma, { ordemId: r.ordemId, inicioAutorizado: dia(-15), criadoPor: GESTORA });
  const itemDaOrdemId = (await prisma.itemDaOrdemDeServico.findFirstOrThrow({ where: { ordemId: r.ordemId }, select: { id: true } })).id;
  const m = await registrarMedicaoDaOrdem(prisma, { ordemId: r.ordemId, diaInicio: dia(-10), diaFim: dia(-8), itens: [{ itemDaOrdemId, quantidade: "6" }], criadoPor: FISCAL });
  const itemMedidoId = (await prisma.itemMedidoNaOrdem.findFirstOrThrow({ where: { medicaoId: m.medicaoId }, select: { id: true } })).id;
  await registrarRecebimentoProvisorio(prisma, {
    medicaoId: m.medicaoId, data: dia(-7), verificacoes: "Relatórios de visita conferidos com as unidades",
    itens: [{ itemMedidoId, quantidadeConforme: conforme, quantidadeEmControversia: controversia, motivo: "Duas visitas sem assinatura do responsável da unidade" }],
    criadoPor: FISCAL,
  });
  const conferenciaId = (await prisma.conferenciaDoItemMedido.findUniqueOrThrow({ where: { itemMedidoId }, select: { id: true } })).id;
  return { ordemId: r.ordemId, itemDaOrdemId, medicaoId: m.medicaoId, itemMedidoId, conferenciaId };
}

const itemNaTela = async (): Promise<{ medido: string; glosado: string; aExecutar: string; autorizado: string }> => {
  const t = await execucaoDoContrato(prisma, "ctr", "FISCALIZACAO");
  const i = t.ordens[0]!.itens[0]!;
  return { medido: i.medido, glosado: i.glosado, aExecutar: i.aExecutar, autorizado: i.autorizado };
};

describe("a decisão REJEITADA devolve a quantidade ao saldo da ordem", () => {
  it("G1: glosadas 2 de 6, a ordem volta a ter 2 a executar — e elas se medem de novo", async () => {
    const c = await ordemComMedicaoConferida("4", "2");
    await decidirControversia(prisma, { conferenciaId: c.conferenciaId, resultado: "REJEITADA", fundamento: "As duas visitas não foram comprovadas por registro nenhum", data: dia(-6), criadoPor: RECEBEDOR });

    expect(await itemNaTela()).toEqual({ autorizado: "6.0000", medido: "4.0000", glosado: "2.0000", aExecutar: "2.0000" });

    // ⚠️ E A LIBERAÇÃO É DE VERDADE: a medição nova PASSA. Antes, ela batia em
    // ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM — o contratado não podia refazer o que a lei o obriga a
    // refazer sem uma ordem nova.
    const refeita = await registrarMedicaoDaOrdem(prisma, { ordemId: c.ordemId, diaInicio: dia(-5), diaFim: dia(-4), itens: [{ itemDaOrdemId: c.itemDaOrdemId, quantidade: "2" }], criadoPor: FISCAL });
    expect(refeita.valor).toBe("200.00");
    expect(await itemNaTela()).toMatchObject({ medido: "6.0000", aExecutar: "0.0000" });
  });

  it("G2: o saldo de EXECUÇÃO volta, o de PAGAMENTO não — o elegível continua sem a glosa", async () => {
    const c = await ordemComMedicaoConferida("4", "2");
    await decidirControversia(prisma, { conferenciaId: c.conferenciaId, resultado: "REJEITADA", fundamento: "As duas visitas não foram comprovadas por registro nenhum", data: dia(-6), criadoPor: RECEBEDOR });

    await expect(
      registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Tentativa de receber a medição inteira", itens: [{ itemMedidoId: c.itemMedidoId, quantidade: "6" }], criadoPor: RECEBEDOR }),
      "a liberação do saldo de execução virou autorização de pagamento — é o erro que transforma " +
        "serviço recusado em despesa"
    ).rejects.toThrow(/GLOSA-CONFIRMADA/);

    const r = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Parte regular", itens: [{ itemMedidoId: c.itemMedidoId, quantidade: "4" }], criadoPor: RECEBEDOR });
    expect(r.valor, "recebe-se o conforme, e só ele").toBe("400.00");
  });

  it("G3: controvérsia SEM decisão não libera nada — só a decisão libera", async () => {
    await ordemComMedicaoConferida("4", "2");
    expect(
      await itemNaTela(),
      "a controvérsia pendente liberou saldo. Remedir agora duplicaria a parcela que ainda pode " +
        "ser aceita pelo recebedor"
    ).toEqual({ autorizado: "6.0000", medido: "6.0000", glosado: "0.0000", aExecutar: "0.0000" });
  });

  it("G4: decisão ACEITA não libera — ela torna a quantidade elegível a receber, que é o oposto", async () => {
    const c = await ordemComMedicaoConferida("4", "2");
    await decidirControversia(prisma, { conferenciaId: c.conferenciaId, resultado: "ACEITA", fundamento: "As assinaturas foram apresentadas depois pela unidade", data: dia(-6), criadoPor: RECEBEDOR });
    expect(await itemNaTela()).toEqual({ autorizado: "6.0000", medido: "6.0000", glosado: "0.0000", aExecutar: "0.0000" });

    const r = await registrarRecebimentoDefinitivo(prisma, { medicaoId: c.medicaoId, data: HOJE, conclusao: "Tudo aceito", itens: [{ itemMedidoId: c.itemMedidoId, quantidade: "6" }], criadoPor: RECEBEDOR });
    expect(r.valor).toBe("600.00");
  });

  it("G5: a liberação acontece UMA vez — a decisão é única, e não há crédito para repetir", async () => {
    const c = await ordemComMedicaoConferida("4", "2");
    await decidirControversia(prisma, { conferenciaId: c.conferenciaId, resultado: "REJEITADA", fundamento: "As duas visitas não foram comprovadas por registro nenhum", data: dia(-6), criadoPor: RECEBEDOR });

    // Uma segunda decisão sobre a MESMA conferência é recusada — é daí que vem a unicidade da
    // liberação, sem precisar de contador nem de registro de "já liberado".
    await expect(
      decidirControversia(prisma, { conferenciaId: c.conferenciaId, resultado: "REJEITADA", fundamento: "Segunda tentativa de glosar o mesmo item", data: dia(-6), criadoPor: RECEBEDOR })
    ).rejects.toThrow(/CONTROVERSIA-JA-DECIDIDA/);

    expect(await itemNaTela(), "o saldo dobrou — a liberação foi contada duas vezes").toMatchObject({ aExecutar: "2.0000" });

    // E o teto continua valendo: 3 não cabem em 2.
    await expect(
      registrarMedicaoDaOrdem(prisma, { ordemId: c.ordemId, diaInicio: dia(-5), diaFim: dia(-4), itens: [{ itemDaOrdemId: c.itemDaOrdemId, quantidade: "3" }], criadoPor: FISCAL })
    ).rejects.toThrow(/ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM/);
  });

  it("G6: o saldo liberado também pode ser CANCELADO — é saldo de verdade, não número de tela", async () => {
    const c = await ordemComMedicaoConferida("4", "2");
    await decidirControversia(prisma, { conferenciaId: c.conferenciaId, resultado: "REJEITADA", fundamento: "As duas visitas não foram comprovadas por registro nenhum", data: dia(-6), criadoPor: RECEBEDOR });

    // ⚠️ O ENTE PODE DESISTIR do serviço recusado em vez de exigir a repetição. Se o saldo
    // liberado não fosse cancelável, ele seria um número que aparece na tela e não faz nada.
    const r = await cancelarSaldoDaOrdemDeServico(prisma, {
      ordemId: c.ordemId, data: HOJE, motivo: "O ente decidiu não exigir a repetição das visitas recusadas",
      itens: [{ itemDaOrdemId: c.itemDaOrdemId, quantidade: "2" }], criadoPor: GESTORA,
    });
    expect(r.cancelados).toBe(1);
    expect(await itemNaTela()).toMatchObject({ autorizado: "4.0000", medido: "4.0000", aExecutar: "0.0000" });
  });
});

describe("a derivação pura do medido líquido", () => {
  const conf = (controversia: string, resultado: string | null) => ({
    quantidadeEmControversia: { toFixed: () => controversia },
    decisao: resultado === null ? null : { resultado },
  });
  const linha = (q: string, c: ReturnType<typeof conf> | null) => ({ quantidade: { toFixed: () => q }, conferencia: c });

  it("soma o bruto e desconta só o rejeitado", () => {
    expect(medidoLiquido([linha("6.0000", conf("2.0000", "REJEITADA"))]).toFixed(4)).toBe("4.0000");
    expect(medidoLiquido([linha("6.0000", conf("2.0000", "ACEITA"))]).toFixed(4)).toBe("6.0000");
    expect(medidoLiquido([linha("6.0000", conf("2.0000", null))]).toFixed(4)).toBe("6.0000");
    expect(medidoLiquido([linha("6.0000", null)]).toFixed(4)).toBe("6.0000");
  });

  it("N=2: duas medições, uma glosada e outra não, somam certo", () => {
    const r = medidoLiquido([linha("6.0000", conf("2.0000", "REJEITADA")), linha("3.0000", conf("1.0000", "ACEITA"))]);
    expect(r.toFixed(4), "6 − 2 + 3 = 7").toBe("7.0000");
    expect(glosadoDoItemDaOrdem([linha("6.0000", conf("2.0000", "REJEITADA")), linha("3.0000", conf("1.0000", "ACEITA"))]).toFixed(4)).toBe("2.0000");
  });

  it("lista vazia é zero, não NaN", () => {
    expect(medidoLiquido([]).toFixed(4)).toBe("0.0000");
    expect(glosadoDoItemDaOrdem([]).toFixed(4)).toBe("0.0000");
  });
});
