import "dotenv/config";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, criarPrismaDoPapelDeRuntime, exigirBanco } from "../banco.js";
import { limparBanco } from "../limpar-banco.js";
import { registrarMovimentoBancario } from "../../modules/m09-tesouraria/movimentacao.js";
import { abrirConciliacao, encerrarConciliacao, justificarPendencia, lerConciliacao } from "../../modules/m09-tesouraria/servico-conciliacao.js";

/**
 * V39-R2 (R2-001/002) — A CONFERÊNCIA ENCERRADA É REPRODUZÍVEL, E O FATO TARDIO CONTINUA VISÍVEL E TRATÁVEL.
 *
 * Tudo pelo PAPEL DE RUNTIME (a conta da aplicação); o dono só semeia. Três datas separadas em cada fato:
 *   · a da OCORRÊNCIA (o dia do depósito, dentro de junho);
 *   · a do REGISTRO (quando entrou no banco: antes ou depois do encerramento);
 *   · o CONJUNTO CONHECIDO no encerramento (o retrato da transação que encerrou: a foto).
 *
 * R2-002: duas conexões, sincronização DETERMINÍSTICA (o gancho segura o encerramento entre a conferência e a
 * gravação; a outra conexão grava e confirma; só então o encerramento segue). Nada de espera por tempo.
 */

const dono = criarPrismaDeTeste();
await exigirBanco(dono);
const app = criarPrismaDoPapelDeRuntime();
const outraConexao = criarPrismaDoPapelDeRuntime();
const POR = "tesouraria@cg.pb.gov.br";
const EM = (dia: string): Date => new Date(`${dia}T12:00:00Z`);

async function deposito(cliente: typeof app, valor: string, dia: string): Promise<void> {
  await registrarMovimentoBancario(cliente, { contaBancariaId: "cb", fonteId: "fnt", tipo: "DEPOSITO", valor, data: EM(dia), historico: `depósito ${valor}`, contaContrapartidaId: "cp-rec", criadoPor: POR });
}

async function junhoJustificadoEEncerrado(ganchos: Parameters<typeof encerrarConciliacao>[2] = {}): Promise<string> {
  const { conciliacaoId } = await abrirConciliacao(app, { contaBancariaId: "cb", diaInicio: "2026-06-01", diaFim: "2026-06-30", criadoPor: POR });
  for (const l of (await lerConciliacao(app, conciliacaoId)).relatorio.internoSemVinculo) {
    await justificarPendencia(app, { conciliacaoId, lado: "MOVIMENTO_BANCARIO", referencia: l.id, motivo: `depósito de ${l.residual} ainda não creditado no período`, criadoPor: POR });
  }
  await encerrarConciliacao(app, { conciliacaoId, criadoPor: POR }, ganchos);
  return conciliacaoId;
}

beforeEach(async () => {
  await limparBanco(dono);
  await dono.contaPcasp.createMany({
    data: [
      { id: "cp-bancos", codigo: "1.1.1.1.2.00.00", nome: "Bancos", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "cp-rec", codigo: "4.4.1.1.1.00.00", nome: "Receitas Financeiras", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
    ],
  });
  await dono.fonteRecurso.create({ data: { id: "fnt", codigo: "500", descricao: "Livre", codigoTce: "500" } });
  await dono.exercicio.create({ data: { ano: 2026, criadoPor: POR } });
  await dono.contaBancaria.create({ data: { id: "cb", codigo: "CC-FOTO", descricao: "Movimento", fonteId: "fnt", contaContabilId: "cp-bancos" } });
  await dono.fonteDaContaBancaria.create({ data: { contaBancariaId: "cb", fonteId: "fnt", criadoPor: POR } });
}, 60_000);

afterAll(async () => {
  await Promise.all([app.$disconnect(), outraConexao.$disconnect(), dono.$disconnect()]);
});

describe("V39-R2 — a foto do encerramento (papel de runtime)", () => {
  it("R2-001: o fato registrado DEPOIS do encerramento, com data em junho, não muda a conferência de junho; aparece como tardio e, em julho, como retroativo a junho", async () => {
    await deposito(app, "100.00", "2026-06-10");
    const junho = await junhoJustificadoEEncerrado();
    const antes = await lerConciliacao(app, junho);
    expect([antes.fonteDoRelatorio, antes.relatorio.saldoContabil, antes.relatorio.internoSemVinculo.map((l) => l.residual)]).toEqual(["FOTO_DO_ENCERRAMENTO", "100.00", ["100.00"]]);
    expect(antes.fatosTardios).toEqual([]);

    // O fato tardio: OCORREU em 20/06, foi REGISTRADO agora (depois do encerramento). A data não é alterada.
    await deposito(app, "250.00", "2026-06-20");
    const tardio = await dono.movimentoBancario.findFirstOrThrow({ where: { valor: "250.00" }, select: { id: true, data: true, criadoEm: true } });
    expect(tardio.data.toISOString()).toBe("2026-06-20T12:00:00.000Z");

    const depois = await lerConciliacao(app, junho);
    // a conferência histórica é reproduzível: mesma composição e mesmos saldos
    expect([depois.relatorio.saldoContabil, depois.relatorio.internoSemVinculo.map((l) => [l.id, l.residual])]).toEqual([antes.relatorio.saldoContabil, antes.relatorio.internoSemVinculo.map((l) => [l.id, l.residual])]);
    // e o fato tardio aparece à parte, identificado
    expect(depois.fatosTardios.map((x) => [x.lado, x.referencia, x.residual])).toEqual([["MOVIMENTO_BANCARIO", tardio.id, "250.00"]]);

    // Julho: herda exatamente a foto (100), e o tardio aparece como pendência de julho, RETROATIVA a junho.
    const julho = await abrirConciliacao(app, { contaBancariaId: "cb", diaInicio: "2026-07-01", diaFim: "2026-07-31", criadoPor: POR });
    const j = await lerConciliacao(app, julho.conciliacaoId);
    expect(j.herdadasDaAnterior.map((h) => h.residual)).toEqual(["100.00"]);
    expect(j.relatorio.internoSemVinculo.map((l) => l.residual).sort()).toEqual(["100.00", "250.00"]);
    expect(j.retroativas).toEqual([{ lado: "MOVIMENTO_BANCARIO", referencia: tardio.id, periodoAfetado: "01/06/2026 a 30/06/2026" }]);
    // no razão atual o fato está lá: o saldo de julho já o conta
    expect(j.relatorio.saldoContabil).toBe("350.00");
  });

  it("R2-002: com o encerramento parado depois do retrato e antes da conferência, outra conexão grava um fato de junho; o encerramento grava o retrato consistente e o fato aparece como tardio", async () => {
    await deposito(app, "100.00", "2026-06-10");
    let avisarQueConferiu: () => void = () => undefined;
    const conferiu = new Promise<void>((r) => { avisarQueConferiu = r; });
    let liberar: () => void = () => undefined;
    const liberado = new Promise<void>((r) => { liberar = r; });

    const encerrando = junhoJustificadoEEncerrado({
      depoisDoRetrato: async () => {
        avisarQueConferiu();
        await liberado;
      },
    });
    await conferiu; // o retrato está tomado (primeiras leituras feitas); a conferência ainda NÃO rodou
    await deposito(outraConexao, "75.00", "2026-06-25"); // a outra conexão grava e CONFIRMA
    const concorrente = await dono.movimentoBancario.findFirstOrThrow({ where: { valor: "75.00" }, select: { id: true } });
    liberar();
    const junho = await encerrando;

    const foto = await dono.fotoDoEncerramentoDaConciliacao.findUniqueOrThrow({ where: { conciliacaoId: junho } });
    const naFoto = (foto.pendencias as unknown as { referencia: string }[]).map((x) => x.referencia);
    expect(naFoto).not.toContain(concorrente.id);
    expect(foto.saldoContabil.toFixed(2)).toBe("100.00");
    const lido = await lerConciliacao(app, junho);
    expect(lido.fatosTardios.map((x) => [x.referencia, x.residual])).toEqual([[concorrente.id, "75.00"]]);
  });
});
