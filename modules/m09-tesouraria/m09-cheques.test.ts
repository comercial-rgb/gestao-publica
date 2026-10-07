import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { criarM05Deps } from "../m05-despesa/adapter-prisma.js";
import { anularPagamento, pagar } from "../m05-despesa/servico-bloco2.js";
import { anularPagamentoParcial } from "../m05-despesa/anulacao-parcial.js";
import { empenharDe2026, liquidarDe2026, semearM08, FONTE, POR, R_PAGAMENTO } from "../m08-restos-a-pagar/fixture-m08.js";

/** A perna de caixa do roteiro da fixture (lida dele, não repetida aqui). */
const CAIXA = R_PAGAMENTO.find((p) => p.tipo === "CREDITO" && p.subsistema === "PATRIMONIAL")?.conta ?? "";
import { fimDoDiaCivil, inicioDoDiaCivil } from "../../packages/datas/index.js";
import { cancelarChequeAvulso, chequesEmitidos, registrarChequeAvulso, totaisDosCheques } from "./cheques.js";
import type { M05Deps } from "../m05-despesa/ports.js";

/**
 * V36 — CHEQUES (TR 5.10.2.42). Contas à mão:
 *
 *   NE1/NL1 1.000; NP-1 paga 1.000,00 em 01/09 com o cheque 000101 e DUAS retenções, 80,00 e 15,00
 *       → cheque de PAGAMENTO, valor de face 905,00 (o líquido, que é o que sai do banco).
 *   NE2/NL2 500; NP-2 paga 500,00 em 01/09 com o cheque 000102 e é ANULADO por inteiro em 10/09
 *       → cheque CANCELADO desde 10/09 (antes disso, emitido).
 *   NE3/NL3 300; NP-3 paga 300,00 em 01/09 com o cheque 000103 e tem anulação PARCIAL de 100,00
 *       → cheque segue EMITIDO por 300,00 (o documento emitido não muda).
 *   Avulsos em CC-001: 000104 de 250,00 em 05/09 (devolução) e 000105 de 70,00 em 06/09, cancelado em 08/09.
 *
 *   Setembro inteiro: 5 cheques; emitido 905 + 300 + 250 = 1.455,00; cancelado 500 + 70 = 570,00.
 */
const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const D = (s: string): Date => new Date(`${s}T12:00:00.000Z`);
const periodo = (de: string, ate: string) => ({ de: inicioDoDiaCivil(de), ate: fimDoDiaCivil(ate) });
const recusa = async (f: () => Promise<unknown>): Promise<string> => {
  try {
    await f();
  } catch (e) {
    return (e as Error).message;
  }
  return "(nao recusou)";
};

describe("M09 — cheques de pagamento e avulsos numa consulta só", () => {
  let deps: M05Deps;
  let avulsoCancelado: string;
  /** A NL2, com o pagamento anulado, volta à cabeça da fila: é a que se paga de novo no t5b. */
  let l2: string;

  const pagarComCheque = async (liquidacaoId: string, numero: string, valor: string, cheque: string, retencoes?: readonly [string, string][]) =>
    (
      await pagar(
        { liquidacaoId, numero, valor, data: D("2026-09-01"), contaBancaria: "CC-001", fonteId: FONTE, historico: `pgto ${numero}`, criadoPor: POR, numeroDoCheque: cheque },
        R_PAGAMENTO,
        deps,
        retencoes === undefined
          ? undefined
          : { contaDisponibilidade: CAIXA, retencoes: retencoes.map(([credor, valor]) => ({ tipoConsignacaoId: "t-tc", credorConsignatario: credor, valor, contaConsignacaoAPagar: "2.1.8.8.1.01.00" })) }
      )
    ).pagamentoId;

  beforeEach(async () => {
    deps = criarM05Deps(prisma);
    await semearM08();
    await prisma.contaPcasp.create({ data: { id: "t-inss", codigo: "2.1.8.8.1.01.00", nome: "INSS a recolher", naturezaSaldo: "CREDORA", nivel: 5, analitica: true } });
    await prisma.tipoConsignacao.create({ data: { id: "t-tc", codigo: "INSS", descricao: "INSS retido (teste)", contaPassivoId: "t-inss", criadoPor: POR } });

    const l1 = await liquidarDe2026(deps, await empenharDe2026(deps, "NE1", "1000.00"), "NL1", "1000.00");
    await pagarComCheque(l1, "NP-1", "1000.00", "000101", [["INSS", "80.00"], ["Instituto de Previdência", "15.00"]]);
    l2 = await liquidarDe2026(deps, await empenharDe2026(deps, "NE2", "500.00"), "NL2", "500.00");
    const p2 = await pagarComCheque(l2, "NP-2", "500.00", "000102");
    const l3 = await liquidarDe2026(deps, await empenharDe2026(deps, "NE3", "300.00"), "NL3", "300.00");
    const p3 = await pagarComCheque(l3, "NP-3", "300.00", "000103");
    await anularPagamento({ pagamentoId: p2, numero: "NP-2-A", data: D("2026-09-10"), historico: "pagamento em duplicidade", criadoPor: POR }, deps);
    await anularPagamentoParcial({ originalId: p3, numero: "NP-3-P", valor: "100.00", data: D("2026-09-12"), motivo: "glosa de valor cobrado a maior", criadoPor: POR }, deps);

    await registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000104", data: D("2026-09-05"), valor: "250.00", favorecido: "Fulano de Tal", finalidade: "devolução de caução", criadoPor: POR });
    avulsoCancelado = (await registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000105", data: D("2026-09-06"), valor: "70.00", favorecido: "Ciclano", finalidade: "suprimento de fundos", criadoPor: POR })).chequeId;
    await cancelarChequeAvulso(prisma, { chequeId: avulsoCancelado, data: D("2026-09-08"), motivo: "cheque preenchido errado", criadoPor: POR });
  }, 120000);
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("t1: a consulta une as duas origens, com o líquido no cheque de pagamento e a situação de cada um", async () => {
    const ls = await chequesEmitidos(prisma, { ...periodo("2026-09-01", "2026-09-30"), incluirDePagamento: true });
    expect(ls.map((l) => [l.numero, l.origem, l.valor.toFixed(2), l.situacao])).toEqual([
      ["000101", "PAGAMENTO", "905.00", "EMITIDO"],
      ["000102", "PAGAMENTO", "500.00", "CANCELADO"],
      ["000103", "PAGAMENTO", "300.00", "EMITIDO"],
      ["000104", "AVULSO", "250.00", "EMITIDO"],
      ["000105", "AVULSO", "70.00", "CANCELADO"],
    ]);
    const t = totaisDosCheques(ls);
    expect([t.quantidade, t.emitido.toFixed(2), t.cancelado.toFixed(2)]).toEqual([5, "1455.00", "570.00"]);
    const np2 = ls.find((l) => l.numero === "000102");
    expect([np2?.finalidade, np2?.motivoDoCancelamento, np2?.credorCpfCnpj]).toEqual(["Pagamento NP-2 — empenho NE2", "pagamento em duplicidade", "12345678000195"]);
    expect(ls.find((l) => l.numero === "000105")?.motivoDoCancelamento).toBe("cheque preenchido errado");
  });

  it("t2: a situação é a do fim do período — antes da anulação e do cancelamento, os dois ainda estavam emitidos", async () => {
    const ate7 = await chequesEmitidos(prisma, { ...periodo("2026-09-01", "2026-09-07"), incluirDePagamento: true });
    expect(ate7.map((l) => [l.numero, l.situacao])).toEqual([
      ["000101", "EMITIDO"],
      ["000102", "EMITIDO"],
      ["000103", "EMITIDO"],
      ["000104", "EMITIDO"],
      ["000105", "EMITIDO"],
    ]);
  });

  it("t3: filtros por origem, situação e conta; sem leitura da despesa, só os avulsos", async () => {
    const set = periodo("2026-09-01", "2026-09-30");
    const nums = async (r: Partial<Parameters<typeof chequesEmitidos>[1]>) => (await chequesEmitidos(prisma, { ...set, incluirDePagamento: true, ...r })).map((l) => l.numero);
    expect(await nums({ origem: "AVULSO" })).toEqual(["000104", "000105"]);
    expect(await nums({ situacao: "CANCELADO" })).toEqual(["000102", "000105"]);
    expect(await nums({ origem: "PAGAMENTO", situacao: "EMITIDO" })).toEqual(["000101", "000103"]);
    expect(await nums({ contaBancariaId: "cb2" })).toEqual([]);
    expect(await nums({ incluirDePagamento: false })).toEqual(["000104", "000105"]);
    expect(await nums({ incluirDePagamento: false, origem: "PAGAMENTO" })).toEqual([]);
  });

  it("t4: o número é único na conta — entre pagamento e avulso — e o pagamento recusado não grava nada", async () => {
    expect(await recusa(() => registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000101", data: D("2026-09-20"), valor: "10.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: POR }))).toMatch(/O cheque 000101 já foi emitido na conta CC-001/);
    const l4 = await liquidarDe2026(deps, await empenharDe2026(deps, "NE4", "40.00"), "NL4", "40.00");
    const antes = await prisma.pagamento.count();
    expect(await recusa(() => pagarComCheque(l4, "NP-4", "40.00", "000104"))).toMatch(/O cheque 000104 já foi emitido na conta CC-001/);
    expect(await prisma.pagamento.count()).toBe(antes);
    // Na OUTRA conta o mesmo número é outro cheque (o talão é da conta).
    await registrarChequeAvulso(prisma, { contaBancariaId: "cb2", numero: "000101", data: D("2026-09-20"), valor: "10.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: POR });
    expect(await prisma.cheque.count({ where: { numero: "000101" } })).toBe(2);
  });

  it("t5: dois avulsos simultâneos com o mesmo número — um só grava", async () => {
    const um = () => registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000200", data: D("2026-09-20"), valor: "10.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: POR });
    const rs = await Promise.allSettled([um(), um()]);
    expect(rs.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const falha = rs.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((falha.reason as Error).message).toMatch(/O cheque 000200 já foi emitido/);
  });

  it("t5b: a corrida que a conferência não vê — o pagamento cai na unicidade, volta inteiro e diz o motivo", async () => {
    const pagamentosAntes = await prisma.pagamento.count();
    // Determinístico, sem depender de quem chega primeiro: uma transação grava o avulso 000600 e fica ABERTA. O
    // pagamento confere o número (não vê a linha não confirmada), segue e para no índice único, esperando. Só quando o
    // banco mostra essa espera a primeira transação confirma — e o pagamento recebe a violação de unicidade.
    let inserido = (): void => undefined;
    let liberar = (): void => undefined;
    const gravou = new Promise<void>((r) => (inserido = r));
    const segura = new Promise<void>((r) => (liberar = r));
    const avulso = prisma.$transaction(
      async (tx) => {
        await tx.cheque.create({ data: { contaBancariaId: "cb1", numero: "000600", origem: "AVULSO", data: D("2026-09-20"), valor: "10.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: POR } });
        inserido();
        await segura;
      },
      { timeout: 60000 }
    );
    await gravou;
    const pagamento = pagarComCheque(l2, "NP-2B", "500.00", "000600").then(
      () => "(pagou)",
      (e: unknown) => (e as Error).message
    );
    for (let i = 0; i < 200; i += 1) {
      const [linha] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`;
      if ((linha?.n ?? 0n) > 0n) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    liberar();
    await avulso;
    expect(await pagamento).toMatch(/^O cheque 000600 já foi emitido na conta CC-001\. Nada foi gravado\.$/);
    expect(await prisma.cheque.count({ where: { numero: "000600" } })).toBe(1);
    expect(await prisma.pagamento.count()).toBe(pagamentosAntes);
  }, 60000);

  it("t6: o cancelamento — só do avulso, uma vez, não antes da emissão, não no futuro", async () => {
    const de = await prisma.cheque.findFirstOrThrow({ where: { numero: "000101" }, select: { id: true } });
    expect(await recusa(() => cancelarChequeAvulso(prisma, { chequeId: de.id, data: D("2026-09-20"), motivo: "tentativa", criadoPor: POR }))).toMatch(/é do pagamento NP-1: ele é cancelado anulando o pagamento/);
    expect(await recusa(() => cancelarChequeAvulso(prisma, { chequeId: avulsoCancelado, data: D("2026-09-20"), motivo: "de novo", criadoPor: POR }))).toMatch(/já está cancelado/);
    const av = await prisma.cheque.findFirstOrThrow({ where: { numero: "000104" }, select: { id: true } });
    expect(await recusa(() => cancelarChequeAvulso(prisma, { chequeId: av.id, data: D("2026-09-04"), motivo: "antes da emissão", criadoPor: POR }))).toMatch(/não pode ser anterior à emissão do cheque \(05\/09\/2026\)/);
    expect(await recusa(() => cancelarChequeAvulso(prisma, { chequeId: av.id, data: D("2099-01-01"), motivo: "data errada", criadoPor: POR }))).toMatch(/é futura/);
    expect(await recusa(() => registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000300", data: D("2099-01-01"), valor: "10.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: POR }))).toMatch(/é futura/);
    expect(await recusa(() => registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000301", data: D("2026-09-20"), valor: "0.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: POR }))).toMatch(/maior que zero/);
  });

  it("t7: quem só consulta a tesouraria não registra nem cancela cheque", async () => {
    const u = await prisma.usuario.create({ data: { identificador: "so.le.cheque@cg.pb.gov.br", nome: "Só lê", criadoPor: "TESTE" }, select: { id: true } });
    const p = await prisma.perfil.create({ data: { nome: "SO_LE_CHEQUE", descricao: "x", criadoPor: "TESTE", permissoes: { create: [{ acao: "CONSULTAR_FINANCEIRO" as never, criadoPor: "TESTE" }] } }, select: { id: true } });
    await prisma.vinculoUsuarioPerfil.create({ data: { usuarioId: u.id, perfilId: p.id, criadoPor: "TESTE" } });
    expect(await recusa(() => registrarChequeAvulso(prisma, { contaBancariaId: "cb1", numero: "000400", data: D("2026-09-20"), valor: "10.00", favorecido: "Beltrano", finalidade: "devolução", criadoPor: "so.le.cheque@cg.pb.gov.br" }))).toMatch(/REGISTRAR_MOVIMENTO_BANCARIO/);
    const av = await prisma.cheque.findFirstOrThrow({ where: { numero: "000104" }, select: { id: true } });
    expect(await recusa(() => cancelarChequeAvulso(prisma, { chequeId: av.id, data: D("2026-09-20"), motivo: "tentativa de quem só consulta", criadoPor: "so.le.cheque@cg.pb.gov.br" }))).toMatch(/ESTORNAR_MOVIMENTO_BANCARIO/);
    expect(await prisma.cheque.count({ where: { numero: "000400" } })).toBe(0);
  });
});
