import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import {
  gerarEstorno,
  validarLancamento,
  type LancamentoContabil,
  type Partida,
} from "../../packages/ledger/index.js";
import { travar } from "../../packages/locks/index.js";
// A apuração de saldo é do M01 — uma aritmética, muitos recortes.
import { saldosPorConta } from "../m01-core-contabil/adapter-prisma.js";
import type { Tx } from "./guard-exercicio.js";
// ⚠️ O FUNIL DO RAZÃO (M01). Todo lançamento passa por ele — e é lá que mora o
// travamento de competência (M16). Ver `m01-funil.test.ts`: o grep-teste proíbe o
// `lancamentoContabil.create` fora dele.
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { janelaCivilDoAno } from "../../packages/datas/index.js";

/**
 * APURAÇÃO DO RESULTADO DO EXERCÍCIO (MCASP) — o encerramento das contas de
 * resultado.
 *
 * ═══ A DÍVIDA ESTRUTURAL QUE ISTO PAGA ═══
 * As contas de VARIAÇÃO (classes 3 e 4) são do EXERCÍCIO: elas contam o que
 * aconteceu naquele ano. Sem apurá-las, elas seguem acumulando — e o Balanço do
 * ano 2 mostraria, na linha do resultado, a soma de DOIS anos. O resultado de 2026
 * apareceria de novo em 2027, como se tivesse acontecido duas vezes.
 *
 * A apuração ZERA as classes 3 e 4 e joga o líquido no Patrimônio Líquido
 * (Resultados Acumulados). A partir daí, o ano seguinte começa do zero.
 *
 * ═══ NATUREZA PRÓPRIA (e é o coração do desenho) ═══
 * O lançamento de apuração NÃO é um fato novo: ele apenas TRANSFERE. Por isso ele
 * nasce com `natureza = ENCERRAMENTO`:
 *   · o BALANÇO o inclui   — saldo é saldo;
 *   · a DVP o EXCLUI       — senão a mesma receita seria contada duas vezes: uma
 *                            quando aconteceu, outra quando foi transferida.
 *
 * ═══ IDEMPOTÊNCIA DERIVADA ═══
 * Não há flag nem índice de "já apurado". A segunda chamada simplesmente NÃO ACHA
 * saldo para apurar (as classes 3/4 já estão zeradas) e cai no erro "nada a
 * apurar". O SALDO governa — o mesmo padrão do vínculo do M09 e da competência do
 * M10. E é por isso que, DEPOIS DE ESTORNADA, a apuração pode ser refeita: o saldo
 * voltou, e com ele a permissão.
 */

export const zApurarResultadoInput = z.object({
  exercicioId: z.string().min(1),
  criadoPor: z.string().min(1),
});
export type ApurarResultadoInput = z.input<typeof zApurarResultadoInput>;

export const zEstornarApuracaoInput = z.object({
  operacaoId: z.string().min(1),
  motivo: z
    .string()
    .trim()
    .min(10, "O motivo do estorno da apuração precisa de ao menos 10 caracteres"),
  criadoPor: z.string().min(1),
});
export type EstornarApuracaoInput = z.input<typeof zEstornarApuracaoInput>;

export const ORIGEM_APURACAO = "APURACAO_RESULTADO";

export interface ResultadoApuracao {
  readonly operacaoId: string;
  readonly lancamentoId: string;
  /** VPA − VPD zerado. Positivo = superávit; negativo = déficit. */
  readonly resultadoApurado: Money;
  readonly contasZeradas: number;
}

/**
 * A data do fato "apuração": o ÚLTIMO instante do exercício.
 *
 * Não é o `criadoEm` do encerramento (que é quando alguém CLICOU): é 31/12, que é
 * quando o exercício de fato acabou. O corte dos relatórios é pela data do FATO —
 * a lição do `campoData` do M09.
 */
function ultimoInstanteDoExercicio(ano: number): Date {
  // ⚠️ CIVIL, não UTC: `Date.UTC(ano, 11, 31, 23:59:59)` é 31/12 às 20:59:59 em São Paulo,
  // e as três horas que sobram são exatamente onde mora o lançamento de véspera de virada.
  return janelaCivilDoAno(ano).fim;
}

export async function apurarResultadoDoExercicio(
  prisma: PrismaClient,
  input: ApurarResultadoInput
): Promise<ResultadoApuracao> {
  const dados = zApurarResultadoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    // SEM UG: o resultado do exercício é UM, do ente. Não se apura "o superávit da Saúde".
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.apurarResultadoDoExercicio, "ENTE");

    // (a) O EXERCÍCIO EXISTE E ESTÁ ENCERRADO — derivado do FATO (o registro de
    // encerramento), nunca de flag.
    const exercicio = await tx.exercicio.findUnique({
      where: { id: dados.exercicioId },
      select: {
        id: true,
        ano: true,
        encerramento: { select: { id: true } },
      },
    });
    if (exercicio === null) {
      throw new Error(`Exercício ${dados.exercicioId} não existe.`);
    }
    if (exercicio.encerramento === null) {
      throw new Error(
        `Exercício ${exercicio.ano} NÃO está encerrado — não se apura o resultado ` +
          `de um ano que ainda corre. Encerre o exercício primeiro. Nada foi gravado.`
      );
    }

    // ⚠️ O LOCK VEM ANTES DA SOMA. A apuração é uma decisão SOMA-E-GRAVA como qualquer
    // outra: ela lê o saldo das classes 3/4, decide quanto transferir ao PL e grava. Sob
    // READ COMMITTED, duas apurações concorrentes do MESMO exercício leem o mesmo saldo e
    // as DUAS gravam — e o resultado vai ao patrimônio líquido DUAS VEZES. A idempotência
    // derivada ("a segunda não acha saldo") é sequencial e não cobre a corrida.
    //
    // ⚠️ E ELE SERIALIZA A APURAÇÃO CONTRA O ENCERRAMENTO DOS CONTROLES, que trava o
    // MESMO exercício. Os dois COMUTAM (tocam conjuntos de contas disjuntos), então
    // serializá-los não custa nada — e garante que a virada de um ano seja uma coisa só.
    await travar(tx, "Exercicio", [exercicio.id]);

    // (b) O ROTEIRO — qual conta do PL recebe o resultado é dado do ENTE.
    const roteiro = await tx.roteiroEncerramento.findUnique({
      where: { chave: "PADRAO" },
      select: { contaResultadosAcumulados: { select: { id: true, codigo: true, analitica: true } } },
    });
    if (roteiro === null) {
      throw new Error(
        `ROTEIRO DE ENCERRAMENTO NÃO PARAMETRIZADO: falta a conta de RESULTADOS ` +
          `ACUMULADOS. O M08 não inventa conta — parametrize antes de apurar. ` +
          `Nada foi gravado.`
      );
    }
    if (!roteiro.contaResultadosAcumulados.analitica) {
      throw new Error(
        `A conta de Resultados Acumulados ` +
          `${roteiro.contaResultadosAcumulados.codigo} é SINTÉTICA — não recebe ` +
          `partida.`
      );
    }

    const corte = ultimoInstanteDoExercicio(exercicio.ano);

    // (c) OS SALDOS das contas de variação, no corte. TUDO incluído (inclusive
    // apurações anteriores — é justamente assim que a idempotência cai sozinha).
    const saldos = await saldosPorConta(tx, {
      classes: ["3", "4"],
      ate: corte,
      campoData: "dataTransacao",
    });
    const aZerar = saldos.filter((s) => !s.saldo.isZero());

    // (d) NADA A APURAR — e é AQUI que a segunda chamada morre.
    if (aZerar.length === 0) {
      throw new Error(
        `NADA A APURAR no exercício ${exercicio.ano}: as contas de variação ` +
          `patrimonial (classes 3 e 4) já estão ZERADAS no corte. Ou o exercício ` +
          `não teve movimento, ou o resultado JÁ FOI APURADO. (Não existe flag de ` +
          `"já apurado": o SALDO é que governa. Se a apuração foi estornada, o ` +
          `saldo volta e esta chamada passa de novo.) Nada foi gravado.`
      );
    }

    // As pernas que ZERAM cada conta. Conta de classe 4 (credora) morre com um
    // DÉBITO; conta de classe 3 (devedora), com um CRÉDITO.
    const partidas: Partida[] = [];
    let vpa = toMoney("0.00");
    let vpd = toMoney("0.00");

    for (const s of aZerar) {
      const ehVpa = s.codigo.startsWith("4");
      if (ehVpa) {
        vpa = toMoney(vpa.plus(s.saldo));
      } else {
        vpd = toMoney(vpd.plus(s.saldo));
      }
      // O saldo vem POSITIVO (com a natureza da classe). Um saldo NEGATIVO numa
      // conta de variação (VPA devedora, p.ex.) é anômalo — mas se existir, a
      // perna que a zera é a oposta.
      const positivo = s.saldo.greaterThan(0);
      partidas.push({
        conta: s.codigo,
        tipo: ehVpa === positivo ? "DEBITO" : "CREDITO",
        subsistema: "PATRIMONIAL",
        valor: toMoney(s.saldo.abs()),
      });
    }

    const resultadoApurado = toMoney(vpa.minus(vpd));

    // A CONTRAPARTIDA ÚNICA, pelo LÍQUIDO: superávit CREDITA o PL; déficit DEBITA.
    // Se o líquido for zero (VPA == VPD), as pernas acima já se equilibram e não
    // há o que levar ao PL.
    if (!resultadoApurado.isZero()) {
      partidas.push({
        conta: roteiro.contaResultadosAcumulados.codigo,
        tipo: resultadoApurado.greaterThan(0) ? "CREDITO" : "DEBITO",
        subsistema: "PATRIMONIAL",
        valor: toMoney(resultadoApurado.abs()),
      });
    }

    // O motor do M01: ΣD == ΣC no PATRIMONIAL, antes de qualquer I/O.
    const validadas = validarLancamento(partidas);

    const contas = await tx.contaPcasp.findMany({
      where: { codigo: { in: validadas.map((p) => p.conta) } },
      select: { id: true, codigo: true, analitica: true },
    });
    const porCodigo = new Map(contas.map((c) => [c.codigo, c]));
    const sinteticas = contas.filter((c) => !c.analitica);
    if (sinteticas.length > 0) {
      throw new Error(
        `Conta sintética não recebe partida: ` +
          `${sinteticas.map((c) => c.codigo).join(", ")}.`
      );
    }

    const operacaoId = randomUUID();

    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `APURACAO-${exercicio.ano}`,
      dataTransacao: corte,
      historico:
        `Apuração do resultado do exercício ${exercicio.ano}: VPA ` +
        `${vpa.toFixed(2)} − VPD ${vpd.toFixed(2)} = ` +
        `${resultadoApurado.toFixed(2)}`,
      origemTipo: ORIGEM_APURACAO,
      origemId: operacaoId,
      // ⚠️ A NATUREZA. O Balanço inclui; a DVP exclui. E é ela que ISENTA a virada do
      // travamento de competência (M16): a apuração lança em 31/12, dentro do mês que o
      // ente acabou de fechar — se não fosse isenta, travar dezembro tornaria o
      // encerramento do exercício IMPOSSÍVEL.
      natureza: "ENCERRAMENTO",
      criadoPor: dados.criadoPor,
      partidas: validadas.map((p) => ({
        contaId: porCodigo.get(p.conta)!.id,
        tipo: p.tipo,
        subsistema: p.subsistema,
        valor: p.valor.toFixed(2),
      })),
    });

    // ═══ A CONFERÊNCIA PÓS-APURAÇÃO — E POR QUE ELA É A ÚNICA REDE ═══
    //
    // Depois de apurar, as classes 3 e 4 TÊM de estar zeradas. Se sobrou saldo, a
    // apuração pulou uma conta.
    //
    // ⚠️ NENHUMA AMARRAÇÃO DOS ANEXOS PEGA ISSO — e foi PROVADO por mutação
    // (apuração pulando as contas de VPA, com esta conferência desligada):
    //   · o A1 do Balanço CONTINUA FECHANDO: o lançamento é balanceado por
    //     construção (o motor do M01 exige ΣD == ΣC), e uma apuração parcial é
    //     apenas uma transferência MENOR — ativo e passivo não mudam.
    //   · o D3 da DVP CONTINUA FECHANDO: a identidade
    //     `DVP = ΔS + ΔApurado` é ÁLGEBRA, não conferência de completude. Ela
    //     amarra o QUANTO foi transferido, nunca o SE TUDO foi transferido.
    // O único sintoma seria a linha sintética do Balanço não zerar — e ninguém
    // olha para ela esperando zero.
    //
    // Por isso a rede vive AQUI, no serviço, e não num anexo. Não remover.
    const sobrou = (
      await saldosPorConta(tx, {
        classes: ["3", "4"],
        ate: corte,
        campoData: "dataTransacao",
      })
    ).filter((s) => !s.saldo.isZero());

    if (sobrou.length > 0) {
      throw new Error(
        `APURAÇÃO INCOMPLETA no exercício ${exercicio.ano}: as contas ` +
          `${sobrou.map((s) => `${s.codigo} (${s.saldo.toFixed(2)})`).join(", ")} ` +
          `continuam com saldo depois da apuração. Nada foi gravado.`
      );
    }

    return {
      operacaoId,
      lancamentoId,
      resultadoApurado,
      contasZeradas: aZerar.length,
    };
  });
}

/**
 * ESTORNA a apuração inteira. Simétrico, e nascido no mesmo commit.
 *
 * O lançamento de estorno TAMBÉM nasce com `natureza = ENCERRAMENTO` — se nascesse
 * NORMAL, a DVP passaria a contar a reversão como se fosse receita/despesa nova, e
 * o ano ganharia um resultado que ninguém gerou.
 *
 * Depois do estorno, os saldos das classes 3/4 VOLTAM — e a apuração pode ser
 * refeita. O saldo governa, não uma flag.
 */
export async function estornarApuracao(
  prisma: PrismaClient,
  input: EstornarApuracaoInput
): Promise<{ readonly lancamentos: readonly string[] }> {
  const dados = zEstornarApuracaoInput.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, dados.criadoPor, ACAO_DO_SERVICO.estornarApuracao, "ENTE");

    const originais = await tx.lancamentoContabil.findMany({
      where: { origemId: dados.operacaoId, origemTipo: ORIGEM_APURACAO },
      select: {
        id: true,
        numeroControle: true,
        dataTransacao: true,
        historico: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        partidas: {
          select: {
            tipo: true,
            subsistema: true,
            valor: true,
            conta: { select: { codigo: true } },
          },
        },
      },
    });

    if (originais.length === 0) {
      throw new Error(
        `Apuração ${dados.operacaoId} não encontrada.`
      );
    }
    const jaEstornado = originais.find((l) => l.estornos.length > 0);
    if (jaEstornado !== undefined) {
      throw new Error(
        `A apuração ${dados.operacaoId} já foi estornada ` +
          `(lançamento ${jaEstornado.numeroControle}).`
      );
    }

    const criados: string[] = [];

    for (const original of originais) {
      const dominio: LancamentoContabil = {
        id: original.id,
        numeroControle: original.numeroControle,
        partidas: original.partidas.map((p) => ({
          conta: p.conta.codigo,
          tipo: p.tipo,
          subsistema: p.subsistema,
          valor: toMoney(p.valor.toFixed(2)),
        })),
        dataTransacao: original.dataTransacao,
        historico: original.historico,
        ...(original.estornoDeId !== null
          ? { estornoDeId: original.estornoDeId }
          : {}),
        estornos: original.estornos.map((e) => e.id),
      };

      // O motor puro inverte as pernas — VALOR A VALOR, nunca recarimbado.
      const estorno = gerarEstorno(dominio, {
        idEstorno: randomUUID(),
        numeroControleEstorno: `${original.numeroControle}-EST`,
        dataEstorno: original.dataTransacao,
      });

      const contas = await tx.contaPcasp.findMany({
        where: { codigo: { in: estorno.partidas.map((p) => p.conta) } },
        select: { id: true, codigo: true },
      });
      const porCodigo = new Map(contas.map((c) => [c.codigo, c.id]));

      const criado = await lancarNoRazao(tx, {
        id: estorno.id,
        numeroControle: estorno.numeroControle,
        // ⚠️ ELE RETROAGE: a data do estorno é a do ORIGINAL (31/12) — ver o
        // `gerarEstorno` acima. É por isso que a isenção de ENCERRAMENTO no guard de
        // travamento (M16) não é conveniência: SEM ela, estornar uma apuração seria
        // impossível depois de dezembro fechado.
        dataTransacao: estorno.dataTransacao,
        historico: `${estorno.historico} — ${dados.motivo}`,
        origemTipo: `${ORIGEM_APURACAO}_ESTORNADA`,
        origemId: dados.operacaoId,
        // TAMBÉM ENCERRAMENTO — ver a nota acima.
        natureza: "ENCERRAMENTO",
        // uq_estorno_unico (M01) protege a dupla anulação do lançamento.
        estornoDeId: original.id,
        criadoPor: dados.criadoPor,
        partidas: estorno.partidas.map((p) => ({
          contaId: porCodigo.get(p.conta)!,
          tipo: p.tipo,
          subsistema: p.subsistema,
          valor: p.valor.toFixed(2),
        })),
      });
      criados.push(criado);
    }

    return { lancamentos: criados };
  });
}
