import "dotenv/config";
import { beforeEach, describe, expect, it } from "vitest";
import { criarPrismaDeTeste, exigirBanco } from "../../test/banco.js";
import { limparBanco } from "../../test/limpar-banco.js";
import { saldoDaContaBancaria } from "./caixa.js";
import { conciliacaoBancaria } from "./conciliacao.js";
import {
  estornarMovimentoBancario,
  registrarMovimentoBancario,
} from "./movimentacao.js";
import { transferirEntreContas } from "./transferencia.js";
import {
  E_ATO_DO_ENTE,
  SENTIDO_MOVIMENTO_BANCARIO,
  SINAL_MOVIMENTO_BANCARIO,
  saldoDosFatosDeCaixa,
} from "./dominio.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * M09 — MOVIMENTAÇÃO BANCÁRIA (TR 5.62), ENT03a item 2.
 *
 * ═══ ⚠️ O QUE ESTE ARQUIVO PRECISA PROVAR, E POR QUE CADA FIXTURE É N=2 ═══
 * O prompt do lote diz: *"Fixture mínima é N=2 em toda regra que só se manifesta em
 * conjunto."* Aqui isso vale em três lugares, e em nenhum deles é cerimônia:
 *
 *   · **saldo** — com UM único fato, "o saldo é a soma dos fatos" e "o saldo é o valor
 *     do último fato" dão a MESMA resposta. Só com dois um saldo errado aparece;
 *   · **guard de saldo** — com um só movimento, qualquer teto passa. É preciso um
 *     primeiro que consome e um segundo que estoura;
 *   · **transferência** — a regra de inclusão depende de as duas contas terem contas
 *     contábeis IGUAIS ou DIFERENTES. Uma conta só não tem como expressar a regra.
 */

const prisma = criarPrismaDeTeste();
await exigirBanco(prisma);

const POR = "tesouraria@cg.pb.gov.br";
const FONTE = "fnt-mb";
const FONTE_B = "fnt-mb-b";

const BANCOS = "1.1.1.1.2.00.00";
const APLICACOES = "1.1.3.1.1.00.00";
const DESPESA_FIN = "3.4.1.1.1.00.00";
const RECEITA_FIN = "4.4.1.1.1.00.00";

/** Conta movimento. */
const CONTA_A = "CC-MB-A";
/** Segunda conta, MESMA conta contábil de A — o caso "líquido zero" no razão. */
const CONTA_B = "CC-MB-B";
/** Terceira conta, conta contábil DIFERENTE — o caso que move o razão. */
const CONTA_C = "CC-MB-C";

async function semear(): Promise<void> {
  await limparBanco(prisma);

  await prisma.contaPcasp.createMany({
    data: [
      { id: "mb-bancos", codigo: BANCOS, nome: "Bancos Conta Movimento", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "mb-aplic", codigo: APLICACOES, nome: "Aplicações Financeiras", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true, indicadorSuperavit: "F" },
      { id: "mb-desp", codigo: DESPESA_FIN, nome: "Despesas Financeiras", naturezaSaldo: "DEVEDORA", nivel: 5, analitica: true },
      { id: "mb-rec", codigo: RECEITA_FIN, nome: "Receitas Financeiras", naturezaSaldo: "CREDORA", nivel: 5, analitica: true },
      // Sintética, para o teste que prova que ela não recebe partida.
      { id: "mb-sintetica", codigo: "1.1.1.0.0.00.00", nome: "Caixa e Equivalentes", naturezaSaldo: "DEVEDORA", nivel: 2, analitica: false },
    ],
  });
  await prisma.fonteRecurso.createMany({
    data: [
      { id: FONTE, codigo: "500", descricao: "Livre", codigoTce: "500" },
      { id: FONTE_B, codigo: "501", descricao: "Vinculada", codigoTce: "501" },
    ],
  });
  await prisma.exercicio.create({ data: { ano: 2026, criadoPor: POR } });

  await prisma.contaBancaria.createMany({
    data: [
      { id: "cb-a", codigo: CONTA_A, descricao: "Movimento A", fonteId: FONTE, contaContabilId: "mb-bancos" },
      // MESMA conta contábil de A.
      { id: "cb-b", codigo: CONTA_B, descricao: "Movimento B", fonteId: FONTE, contaContabilId: "mb-bancos" },
      // Conta contábil DIFERENTE — é a aplicação.
      { id: "cb-c", codigo: CONTA_C, descricao: "Aplicação C", fonteId: FONTE_B, contaContabilId: "mb-aplic" },
    ],
  });

  // ⚠️ O ROL DE FONTES DE CADA CONTA (TR 5.10.2.6). A conta A é MULTIFONTE de
  // propósito: é o caso que o ADR descreve — recurso livre e vinculado na mesma conta,
  // que é como um município pequeno opera. As outras duas têm uma só.
  await prisma.fonteDaContaBancaria.createMany({
    data: [
      { contaBancariaId: "cb-a", fonteId: FONTE, criadoPor: POR },
      { contaBancariaId: "cb-a", fonteId: FONTE_B, criadoPor: POR },
      { contaBancariaId: "cb-b", fonteId: FONTE, criadoPor: POR },
      { contaBancariaId: "cb-c", fonteId: FONTE_B, criadoPor: POR },
    ],
  });
}

const EM = (dia: string): Date => new Date(`${dia}T12:00:00Z`);

/** Um depósito, que é como o dinheiro entra na conta neste cenário. */
async function depositar(valor: string, dia: string): Promise<string> {
  const r = await registrarMovimentoBancario(prisma, {
    contaBancariaId: "cb-a", fonteId: FONTE,
    tipo: "DEPOSITO",
    valor,
    data: EM(dia),
    historico: `depósito de ${valor}`,
    contaContrapartidaId: "mb-rec",
    criadoPor: POR,
  });
  return r.movimentoId;
}

describe("M09 — movimentação bancária (TR 5.62)", () => {
  beforeEach(semear);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. O SALDO — N=2, porque com um fato só ele não prova nada
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ DOIS DEPÓSITOS E UM SAQUE, e os três valores são diferentes de propósito.
   *
   * Com um único fato, "o saldo é a soma" e "o saldo é o último valor" dão a mesma
   * resposta — e um saldo implementado errado passaria verde. Com 1.000 + 250 − 300, só
   * a soma dá 950: nem o último valor, nem o maior, nem a média chegam lá.
   */
  it("t1: o saldo é a SOMA dos fatos, com o sinal do tipo — 1.000 + 250 − 300 = 950", async () => {
    await depositar("1000.00", "2026-03-01");
    await depositar("250.00", "2026-03-02");
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "SAQUE", valor: "300.00",
      data: EM("2026-03-03"), historico: "saque para suprimento",
      contaContrapartidaId: "mb-desp", criadoPor: POR,
    });

    const s = await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"));
    expect(s.saldo.toFixed(2)).toBe("950.00");
    expect(s.fatos.length).toBe(3);
    // ⚠️ E A FONTE VIAJA JUNTO: "por fonte" é, neste modelo, "por conta" — e o campo
    // existe para que o dia em que isso mudar seja um dia em que alguém veja.
    expect(s.fonteId).toBe(FONTE);
  });

  /**
   * ⚠️ O CORTE É PELA DATA DO FATO, e o teste prova pelo caso que dói: um movimento de
   * 05/03 não conta no saldo de 28/02. Se o corte fosse por `criadoEm`, os dois teriam
   * sido gravados agora e os dois entrariam — e o saldo de fevereiro estaria errado sem
   * nada avisar.
   */
  it("t2: o saldo respeita o corte pela DATA DO FATO, não pela gravação", async () => {
    await depositar("1000.00", "2026-02-10");
    await depositar("400.00", "2026-03-05");

    expect((await saldoDaContaBancaria(prisma, "cb-a", EM("2026-02-28"))).saldo.toFixed(2)).toBe("1000.00");
    expect((await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"))).saldo.toFixed(2)).toBe("1400.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. O GUARD DE SALDO — no momento da operação
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ N=2 OBRIGATÓRIO. O primeiro saque CONSOME o saldo; é o segundo que estoura. Com um
   * único saque contra o depósito inteiro, qualquer implementação de guard passaria —
   * inclusive uma que não descontasse o que já saiu.
   */
  it("t3: o segundo saque é RECUSADO, e a mensagem diz quanto falta", async () => {
    await depositar("1000.00", "2026-03-01");

    // O primeiro cabe: sobra 400.
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "SAQUE", valor: "600.00",
      data: EM("2026-03-02"), historico: "primeiro saque",
      contaContrapartidaId: "mb-desp", criadoPor: POR,
    });

    // O segundo não: pede 700 e há 400.
    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-a", fonteId: FONTE, tipo: "SAQUE", valor: "700.00",
        data: EM("2026-03-03"), historico: "segundo saque",
        contaContrapartidaId: "mb-desp", criadoPor: POR,
      })
    ).rejects.toThrow(/SALDO INSUFICIENTE.*faltam 300\.00/s);

    // ⚠️ E NADA FICOU GRAVADO — nem o movimento, nem o lançamento. A recusa dentro da
    // transação é o que garante isso; uma conferência antes de abrir a transação teria
    // deixado o lançamento órfão.
    expect(await prisma.movimentoBancario.count()).toBe(2);
    expect((await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"))).saldo.toFixed(2)).toBe("400.00");
  });

  /**
   * ⚠️ TARIFA E RENDIMENTO NÃO PASSAM PELO GUARD, e isto é decisão, não esquecimento.
   *
   * O banco debita a tarifa por conta própria: quando o extrato chega, o débito JÁ
   * aconteceu. Recusar o REGISTRO por falta de saldo não desfaz nada — só deixa o sistema
   * mais longe do extrato, que é o oposto do que a conciliação precisa. Ver `E_ATO_DO_ENTE`.
   */
  it("t4: TARIFA entra mesmo sem saldo — o banco já debitou, recusar não desfaz", async () => {
    // Conta zerada de propósito.
    expect((await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"))).saldo.toFixed(2)).toBe("0.00");

    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "TARIFA", valor: "45.00",
      data: EM("2026-03-10"), historico: "tarifa de manutenção",
      contaContrapartidaId: "mb-desp", criadoPor: POR,
    });

    const s = await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"));
    expect(s.saldo.toFixed(2)).toBe("-45.00");

    // Mas o SAQUE, que é ato do ente, continua recusado na mesma conta zerada.
    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-a", fonteId: FONTE, tipo: "SAQUE", valor: "10.00",
        data: EM("2026-03-11"), historico: "saque",
        contaContrapartidaId: "mb-desp", criadoPor: POR,
      })
    ).rejects.toThrow(/SALDO INSUFICIENTE/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. O LANÇAMENTO SIMULTÂNEO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * "Lançamento simultâneo" do prompt é literal: as duas pernas na MESMA transação, ou
   * nenhuma. Este teste confere o par de partidas e o sentido de cada uma.
   */
  it("t5: cada movimento tem lançamento no razão, com as pernas na ordem certa", async () => {
    const dep = await depositar("800.00", "2026-03-01");
    const m = await prisma.movimentoBancario.findUniqueOrThrow({
      where: { id: dep },
      select: {
        lancamento: {
          select: {
            dataTransacao: true,
            partidas: { select: { tipo: true, valor: true, conta: { select: { codigo: true } } } },
          },
        },
      },
    });
    const partidas = m.lancamento.partidas
      .map((p) => `${p.tipo}:${p.conta.codigo}:${p.valor.toFixed(2)}`)
      .sort();
    // ENTRADA: debita a conta bancária (ativo sobe), credita a contrapartida.
    expect(partidas).toEqual([
      `CREDITO:${RECEITA_FIN}:800.00`,
      `DEBITO:${BANCOS}:800.00`,
    ]);
    // ⚠️ A DATA DO LANÇAMENTO É A DO FATO, não a da gravação.
    expect(m.lancamento.dataTransacao.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("t6: a SAÍDA inverte as pernas — credita a conta bancária", async () => {
    await depositar("500.00", "2026-03-01");
    const r = await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "APLICACAO", valor: "500.00",
      data: EM("2026-03-02"), historico: "aplicação em fundo",
      contaContrapartidaId: "mb-aplic", criadoPor: POR,
    });
    const l = await prisma.lancamentoContabil.findUniqueOrThrow({
      where: { id: r.lancamentoId },
      select: { partidas: { select: { tipo: true, conta: { select: { codigo: true } } } } },
    });
    const porConta = Object.fromEntries(
      l.partidas.map((p) => [p.conta.codigo, p.tipo])
    );
    expect(porConta[BANCOS]).toBe("CREDITO");
    expect(porConta[APLICACOES]).toBe("DEBITO");
    expect(r.saldoResultante).toBe("0.00");
  });

  /**
   * ⚠️ A CONTRAPARTIDA IGUAL À PRÓPRIA CONTA É RECUSADA — e o motivo é o que a recusa
   * evita: D e C na mesma conta é um lançamento de saldo líquido zero. O razão não se
   * moveria, o extrato sim, e a conciliação acusaria uma diferença que ninguém saberia
   * nomear.
   */
  it("t7: contrapartida igual à conta contábil da própria conta é RECUSADA", async () => {
    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-a", fonteId: FONTE, tipo: "DEPOSITO", valor: "100.00",
        data: EM("2026-03-01"), historico: "depósito",
        contaContrapartidaId: "mb-bancos", criadoPor: POR,
      })
    ).rejects.toThrow(/MESMA conta contábil/);
    expect(await prisma.movimentoBancario.count()).toBe(0);
  });

  it("t8: conta SINTÉTICA como contrapartida é recusada", async () => {
    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-a", fonteId: FONTE, tipo: "DEPOSITO", valor: "100.00",
        data: EM("2026-03-01"), historico: "depósito",
        contaContrapartidaId: "mb-sintetica", criadoPor: POR,
      })
    ).rejects.toThrow(/SINTÉTICA/);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. O ESTORNO — fato novo, nunca UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  it("t9: o estorno devolve o valor ao saldo e inverte as pernas do razão", async () => {
    await depositar("1000.00", "2026-03-01");
    const saque = await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "SAQUE", valor: "300.00",
      data: EM("2026-03-02"), historico: "saque indevido",
      contaContrapartidaId: "mb-desp", criadoPor: POR,
    });
    expect((await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"))).saldo.toFixed(2)).toBe("700.00");

    const est = await estornarMovimentoBancario(prisma, {
      movimentoId: saque.movimentoId,
      motivo: "saque lançado na conta errada pelo operador",
      data: EM("2026-03-05"),
      criadoPor: POR,
    });
    expect(est.saldoResultante).toBe("1000.00");

    // ⚠️ O ORIGINAL NÃO FOI ALTERADO — append-only. Ele some do saldo porque tem estorno,
    // não porque alguém mexeu nele.
    const original = await prisma.movimentoBancario.findUniqueOrThrow({
      where: { id: saque.movimentoId },
      select: { valor: true, tipo: true, motivo: true },
    });
    expect(original.valor.toFixed(2)).toBe("300.00");
    expect(original.tipo).toBe("SAQUE");
    expect(original.motivo).toBeNull();

    // ⚠️ O ESTORNO GUARDA O MESMO TIPO DO ORIGINAL. Inverter (SAQUE viraria DEPOSITO)
    // faria um relatório de "quanto se sacou no mês" contar um depósito que nunca houve.
    const estorno = await prisma.movimentoBancario.findUniqueOrThrow({
      where: { id: est.movimentoId },
      select: { tipo: true, estornoDeId: true },
    });
    expect(estorno.tipo).toBe("SAQUE");
    expect(estorno.estornoDeId).toBe(saque.movimentoId);
  });

  /**
   * ⚠️ N=2 DE NOVO, e aqui a segunda tentativa é o teste inteiro: um estorno único
   * sempre funciona. O que precisa ser provado é que o SEGUNDO não passa — senão o valor
   * voltaria duas vezes ao saldo.
   */
  it("t10: o segundo estorno do mesmo movimento é recusado, e o estorno do estorno também", async () => {
    await depositar("1000.00", "2026-03-01");
    const saque = await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "SAQUE", valor: "300.00",
      data: EM("2026-03-02"), historico: "saque",
      contaContrapartidaId: "mb-desp", criadoPor: POR,
    });
    const est = await estornarMovimentoBancario(prisma, {
      movimentoId: saque.movimentoId, motivo: "primeiro estorno legítimo aqui",
      data: EM("2026-03-05"), criadoPor: POR,
    });

    await expect(
      estornarMovimentoBancario(prisma, {
        movimentoId: saque.movimentoId, motivo: "segunda tentativa sobre o mesmo",
        data: EM("2026-03-06"), criadoPor: POR,
      })
    ).rejects.toThrow(/já foi ESTORNADO/);

    await expect(
      estornarMovimentoBancario(prisma, {
        movimentoId: est.movimentoId, motivo: "tentando estornar o estorno",
        data: EM("2026-03-07"), criadoPor: POR,
      })
    ).rejects.toThrow(/JÁ É um estorno/);

    expect((await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"))).saldo.toFixed(2)).toBe("1000.00");
  });

  it("t11: estorno sem motivo de verdade é recusado pelo Zod", async () => {
    await depositar("100.00", "2026-03-01");
    const m = await prisma.movimentoBancario.findFirstOrThrow({ select: { id: true } });
    await expect(
      estornarMovimentoBancario(prisma, {
        movimentoId: m.id, motivo: "erro", data: EM("2026-03-02"), criadoPor: POR,
      })
    ).rejects.toThrow(/motivo/i);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. A TRANSFERÊNCIA NO SALDO — a regra que exige DUAS contas para existir
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ O CRITÉRIO NÃO É "TUDO QUE TOCA A CONTA", e este par de testes é a razão.
   *
   * A conciliação vale por uma identidade que só fecha se o lado interno espelhar o que o
   * razão registrou NA CONTA CONTÁBIL desta conta bancária. Uma transferência entre duas
   * contas mapeadas para a MESMA conta contábil é, no razão, um lançamento de saldo
   * líquido zero — ela não pode entrar no lado interno, ou a identidade quebra.
   *
   * Ver a álgebra completa no cabeçalho de `caixa.ts`.
   */
  it("t12: transferência entre contas de MESMA conta contábil NÃO entra no lado interno", async () => {
    await depositar("1000.00", "2026-03-01");
    await transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-b", valor: "400.00",
      data: EM("2026-03-02"), codigo: "TR1", historico: "remanejamento interno",
      criadoPor: POR,
    });

    const s = await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"));
    // O depósito, e só ele: a transferência não move a conta contábil de A.
    expect(s.fatos.map((f) => f.tipoInterno)).toEqual(["MOVIMENTO_BANCARIO"]);
    expect(s.saldo.toFixed(2)).toBe("1000.00");
  });

  it("t13: transferência entre contas contábeis DIFERENTES entra, e com o sentido certo", async () => {
    await depositar("1000.00", "2026-03-01");
    await transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-c", valor: "400.00",
      data: EM("2026-03-02"), codigo: "TR2", historico: "aplicação via transferência",
      criadoPor: POR,
    });

    // Na ORIGEM é saída: 1.000 − 400.
    const a = await saldoDaContaBancaria(prisma, "cb-a", EM("2026-03-31"));
    expect(a.fatos.map((f) => f.tipoInterno).sort()).toEqual([
      "MOVIMENTO_BANCARIO",
      "TRANSFERENCIA",
    ]);
    expect(a.saldo.toFixed(2)).toBe("600.00");

    // No DESTINO é entrada — a MESMA transferência, o sentido oposto.
    const c = await saldoDaContaBancaria(prisma, "cb-c", EM("2026-03-31"));
    expect(c.saldo.toFixed(2)).toBe("400.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. A CONCILIAÇÃO CONTINUA FECHANDO — a amarração é auto-executável
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ ESTE É O TESTE QUE PROTEGE A MUDANÇA INTEIRA.
   *
   * `conciliacaoBancaria` **lança** quando a identidade não fecha — ela não devolve
   * relatório com diferença sem nome. Então um erro no critério de inclusão dos dois tipos
   * novos não passa despercebido aqui: o relatório simplesmente não sai.
   *
   * Os dois casos da transferência estão no mesmo teste de propósito: é o par que prova
   * que a regra não é "incluir sempre" nem "nunca incluir".
   */
  it("t14: com movimento bancário e as DUAS espécies de transferência, a conciliação ainda fecha", async () => {
    await depositar("1000.00", "2026-03-01");
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "TARIFA", valor: "45.00",
      data: EM("2026-03-03"), historico: "tarifa",
      contaContrapartidaId: "mb-desp", criadoPor: POR,
    });
    // mesma conta contábil
    await transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-b", valor: "100.00",
      data: EM("2026-03-04"), codigo: "TR3", historico: "interno",
      criadoPor: POR,
    });
    // conta contábil diferente
    await transferirEntreContas(prisma, {
      contaOrigemId: "cb-a", contaDestinoId: "cb-c", valor: "200.00",
      data: EM("2026-03-05"), codigo: "TR4", historico: "para aplicação",
      criadoPor: POR,
    });

    // Sem extrato importado, o lado do banco é zero — e a identidade tem de fechar
    // mesmo assim, com todo o interno aparecendo como pendência.
    const rel = await conciliacaoBancaria(prisma, "cb-a", EM("2026-03-31"));
    expect(rel.relatorio).toBe("CONCILIAÇÃO BANCÁRIA");

    // ⚠️ A CONFERÊNCIA REFEITA AQUI, à mão. O motor já lança se não fechar; repetir a
    // conta no teste é o que impede que um dia alguém "conserte" o motor afrouxando a
    // amarração e a suíte continue verde.
    const soma = (linhas: readonly { residual: string }[]): string =>
      linhas
        .reduce((acc, l) => toMoney(acc.plus(toMoney(l.residual))), toMoney("0.00"))
        .toFixed(2);
    const explicado = toMoney(
      toMoney(soma(rel.noExtratoSemVinculo)).minus(toMoney(soma(rel.internoSemVinculo)))
    );
    expect(explicado.toFixed(2)).toBe(
      toMoney(toMoney(rel.saldoExtrato).minus(toMoney(rel.saldoContabil))).toFixed(2)
    );

    // E a transferência de mesma conta contábil NÃO está no lado interno.
    const codigos = rel.internoSemVinculo.map((l) => l.descricao).join(" | ");
    expect(codigos).toContain("TR4");
    expect(codigos).not.toContain("TR3");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 7. OS RECORDS EXAUSTIVOS — o guard que impede tipo novo sem decisão
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ TRÊS RECORDS SOBRE O MESMO ENUM, e eles TÊM de cobrir as mesmas chaves. O
   * compilador garante a exaustividade de cada um sozinho; o que ele não garante é que os
   * três falem do mesmo conjunto — e um tipo que existisse no sinal e faltasse no sentido
   * entraria na conciliação com `undefined` como sentido.
   */
  it("t15: os três Records do movimento bancário cobrem exatamente os mesmos tipos", () => {
    const sinais = Object.keys(SINAL_MOVIMENTO_BANCARIO).sort();
    expect(Object.keys(SENTIDO_MOVIMENTO_BANCARIO).sort()).toEqual(sinais);
    expect(Object.keys(E_ATO_DO_ENTE).sort()).toEqual(sinais);

    // E o sentido concorda com o sinal, um a um — sem isso os dois poderiam divergir e o
    // saldo somaria numa direção enquanto a conciliação explicaria na outra.
    for (const tipo of sinais as (keyof typeof SINAL_MOVIMENTO_BANCARIO)[]) {
      const esperado = SINAL_MOVIMENTO_BANCARIO[tipo] === 1 ? "ENTRADA" : "SAIDA";
      expect(SENTIDO_MOVIMENTO_BANCARIO[tipo], `sentido de ${tipo}`).toBe(esperado);
    }
  });

  it("t16: `saldoDosFatosDeCaixa` é pura e soma com sinal — N=2, e os dois sentidos", () => {
    expect(
      saldoDosFatosDeCaixa([
        { sentido: "ENTRADA", valor: toMoney("1000.00") },
        { sentido: "SAIDA", valor: toMoney("250.50") },
      ]).toFixed(2)
    ).toBe("749.50");
    // Vazio é zero, e não `NaN` nem erro: uma conta sem fato nenhum tem saldo zero.
    expect(saldoDosFatosDeCaixa([]).toFixed(2)).toBe("0.00");
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // 8. PERÍODO ABERTO
  // ═══════════════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // 9. O ROL DE FONTES DA CONTA — TR 5.10.2.6
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * ⚠️ N=2 NA CONTA: `cb-a` comporta DUAS fontes, e é isso que torna o teste possível.
   *
   * Com uma fonte por conta, "a fonte está no rol?" e "a fonte é a da conta?" são a mesma
   * pergunta, e qualquer implementação passa. Com duas, o guard precisa realmente olhar o
   * rol — e a terceira fonte (a de `cb-c`, que NÃO está no rol de `cb-a`) prova a recusa.
   */
  it("t18: a conta multifonte aceita as fontes do ROL, e recusa a de fora", async () => {
    // As duas do rol de `cb-a` passam.
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE, tipo: "DEPOSITO", valor: "1000.00",
      data: EM("2026-03-01"), historico: "recurso livre",
      contaContrapartidaId: "mb-rec", criadoPor: POR,
    });
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE_B, tipo: "DEPOSITO", valor: "500.00",
      data: EM("2026-03-02"), historico: "recurso vinculado",
      contaContrapartidaId: "mb-rec", criadoPor: POR,
    });
    expect(await prisma.movimentoBancario.count()).toBe(2);

    // ⚠️ E A FONTE DE FORA DO ROL É RECUSADA, nomeando as permitidas. `cb-b` só comporta
    // FONTE; tentar movimentar FONTE_B nela é o caso que o controle de destinação existe
    // para impedir.
    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-b", fonteId: FONTE_B, tipo: "DEPOSITO", valor: "10.00",
        data: EM("2026-03-03"), historico: "vinculado na conta errada",
        contaContrapartidaId: "mb-rec", criadoPor: POR,
      })
    ).rejects.toThrow(/FONTE FORA DO ROL \(TR 5\.23\).*500/s);

    expect(await prisma.movimentoBancario.count()).toBe(2);
  });

  /**
   * ⚠️ ROL VAZIO CAI PARA A FONTE PADRÃO — e o fallback é ESTRITAMENTE SEGURO.
   *
   * A primeira versão recusava toda movimentação numa conta sem rol, com o argumento de
   * que "conta sem rol é conta mal parametrizada". O argumento é bom e a consequência é
   * ruim: uma conta criada por fora (fixture, seed, `INSERT` de manutenção) ficaria
   * **inutilizável**, em vez de continuar se comportando como antes da decisão. Trocar
   * "funciona com uma fonte" por "não funciona" não é endurecer — é quebrar.
   *
   * ⚠️ E ESTE TESTE PROVA QUE O FALLBACK NÃO É PERMISSIVO: ele admite exatamente UMA
   * fonte, a padrão da conta. A outra continua recusada. N=2, e é o segundo caso que
   * distingue "cai para a padrão" de "aceita qualquer uma".
   */
  it("t19: conta SEM rol aceita a fonte PADRÃO — e só ela", async () => {
    await prisma.contaBancaria.create({
      data: {
        id: "cb-sem-rol", codigo: "CC-SEM-ROL", descricao: "Sem rol",
        fonteId: FONTE, contaContabilId: "mb-bancos",
      },
    });

    // A padrão passa.
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-sem-rol", fonteId: FONTE, tipo: "DEPOSITO", valor: "10.00",
      data: EM("2026-03-01"), historico: "deposito",
      contaContrapartidaId: "mb-rec", criadoPor: POR,
    });
    expect(await prisma.movimentoBancario.count()).toBe(1);

    // Qualquer outra, não.
    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-sem-rol", fonteId: FONTE_B, tipo: "DEPOSITO", valor: "10.00",
        data: EM("2026-03-02"), historico: "outra fonte",
        contaContrapartidaId: "mb-rec", criadoPor: POR,
      })
    ).rejects.toThrow(/FONTE FORA DO ROL/);
    expect(await prisma.movimentoBancario.count()).toBe(1);
  });

  /**
   * ⚠️ A MIGRATION FEZ O BACKFILL, e este teste prova que ele significou o que devia:
   * a fonte única de antes virou a PRIMEIRA linha do rol. Sem o backfill, toda conta
   * existente ficaria com rol vazio e o guard acima recusaria TODA movimentação no dia
   * seguinte à migration — um "aditivo" que quebra o sistema em produção.
   */
  it("t20: o movimento grava a fonte informada, e ela é conferível depois", async () => {
    await registrarMovimentoBancario(prisma, {
      contaBancariaId: "cb-a", fonteId: FONTE_B, tipo: "DEPOSITO", valor: "700.00",
      data: EM("2026-03-01"), historico: "vinculado",
      contaContrapartidaId: "mb-rec", criadoPor: POR,
    });
    const m = await prisma.movimentoBancario.findFirstOrThrow({
      select: { fonteId: true, fonte: { select: { codigo: true } } },
    });
    expect(m.fonteId).toBe(FONTE_B);
    expect(m.fonte.codigo).toBe("501");
  });

  it("t17: movimento com data em exercício ENCERRADO é recusado no caso de uso", async () => {
    await prisma.exercicio.create({ data: { ano: 2025, criadoPor: POR } });
    await prisma.encerramentoExercicio.create({
      data: {
        exercicio: { connect: { ano: 2025 } },
        encerradoPor: POR,
      },
    });

    await expect(
      registrarMovimentoBancario(prisma, {
        contaBancariaId: "cb-a", fonteId: FONTE, tipo: "DEPOSITO", valor: "100.00",
        data: EM("2025-12-20"), historico: "depósito antedatado",
        contaContrapartidaId: "mb-rec", criadoPor: POR,
      })
    ).rejects.toThrow(/ENCERRADO/);
    expect(await prisma.movimentoBancario.count()).toBe(0);
  });
});
