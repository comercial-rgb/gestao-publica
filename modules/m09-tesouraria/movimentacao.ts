import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { lancarNoRazao } from "../m01-core-contabil/razao.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { exigirCompetenciaEmExercicioAberto } from "../m08-restos-a-pagar/guard-exercicio.js";
// ⚠️ O LOCK VEM DO REGISTRO ÚNICO (`packages/locks`), e não de um
// `pg_advisory_xact_lock` escrito à mão aqui. O registro é quem garante a ORDEM entre
// postos — um lock avulso com um número escolhido no lugar seria invisível para essa
// verificação, e o dia em que ele fosse tomado fora de ordem produziria um deadlock que
// nenhuma mensagem explicaria.
import { travar } from "../../packages/locks/index.js";
import { fatosDeCaixaDaConta } from "./caixa.js";
import {
  comSinalDoMovimentoBancario,
  exigirSaldoBancario,
  saldoDosFatosDeCaixa,
  SINAL_MOVIMENTO_BANCARIO,
  E_ATO_DO_ENTE,
  zEstornarMovimentoBancario,
  zRegistrarMovimentoBancario,
  type EstornarMovimentoBancarioInput,
  type RegistrarMovimentoBancarioInput,
} from "./dominio.js";

/**
 * MOVIMENTAÇÃO BANCÁRIA — TR 5.62. O caso de uso.
 *
 * ═══ ⚠️ O SALDO É CONFERIDO NO MOMENTO DA OPERAÇÃO, DENTRO DA TRANSAÇÃO ═══
 * O prompt pede "controle de saldo por fonte **no momento da operação**", e "no momento
 * da operação" é uma exigência técnica, não retórica. Conferir o saldo antes de abrir a
 * transação deixaria a janela clássica: dois saques de 600 numa conta com 1.000 leriam
 * ambos "há saldo" e gravariam ambos, e a conta fecharia o dia com −200.
 *
 * Aqui a leitura acontece **depois** do lock da conta, dentro da mesma transação que
 * grava. O segundo saque espera o primeiro terminar, relê o saldo já reduzido, e é
 * recusado nomeando o número que falta.
 *
 * ═══ "POR FONTE" É, NESTE MODELO, "POR CONTA" ═══
 * Toda `ContaBancaria` tem exatamente uma `fonteId`. O controle por fonte que o TR pede é,
 * portanto, o controle por conta — e o `fonteId` aparece no resultado justamente para que
 * o dia em que uma conta puder ter várias fontes seja um dia em que este ponto mude, e
 * não um dia em que ele passe despercebido.
 *
 * ═══ ⚠️ O SALDO E A CONCILIAÇÃO SOMAM OS MESMOS FATOS, PELA MESMA FUNÇÃO ═══
 * `fatosDeCaixaDaConta` (em `caixa.ts`) é a fonte única. Escrever aqui uma segunda
 * consulta que somasse pagamentos, arrecadações e movimentos extras teria produzido o
 * pior sintoma possível: o guard aprovando um saque que a conciliação, minutos depois,
 * mostraria como impossível.
 */

export interface ResultadoMovimentoBancario {
  readonly movimentoId: string;
  readonly lancamentoId: string;
  /** O saldo da conta DEPOIS do movimento — para a tela não precisar reconsultar. */
  readonly saldoResultante: string;
}

export async function registrarMovimentoBancario(
  prisma: PrismaClient,
  input: RegistrarMovimentoBancarioInput
): Promise<ResultadoMovimentoBancario> {
  const dados = zRegistrarMovimentoBancario.parse(input);
  const valorStr = dados.valor.toFixed(2);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.registrarMovimentoBancario,
      "ENTE"
    );

    // ⚠️ PERÍODO ABERTO, PELA DATA DO FATO. Escrita financeira em exercício encerrado
    // moveria um saldo cujos demonstrativos já foram publicados.
    await exigirCompetenciaEmExercicioAberto(
      tx,
      dados.data,
      `movimento bancário ${dados.tipo}`
    );

    const conta = await tx.contaBancaria.findUnique({
      where: { id: dados.contaBancariaId },
      select: {
        id: true,
        codigo: true,
        descricao: true,
        fonteId: true,
        contaContabilId: true,
      },
    });
    if (conta === null) {
      throw new Error(`Conta bancária ${dados.contaBancariaId} não cadastrada.`);
    }

    // FAIL-CLOSED: sem mapeamento contábil não há como lançar. A mesma doutrina da
    // conciliação e da transferência — é o operador que sabe qual conta é qual.
    if (conta.contaContabilId === null) {
      throw new Error(
        `A conta bancária "${conta.codigo}" não tem CONTA CONTÁBIL mapeada ` +
          `(contaContabilId). Um movimento bancário sem contrapartida no razão moveria o ` +
          `extrato e deixaria a contabilidade parada — que é exatamente o buraco que a ` +
          `movimentação bancária veio fechar. Parametrize o mapeamento. Nada foi gravado.`
      );
    }

    // ⚠️ A CONTRAPARTIDA NÃO PODE SER A PRÓPRIA CONTA. D e C na mesma conta é um
    // lançamento de saldo líquido zero: o razão não registraria movimento nenhum, o
    // extrato registraria, e a conciliação passaria a acusar uma diferença permanente.
    if (dados.contaContrapartidaId === conta.contaContabilId) {
      throw new Error(
        `A contrapartida é a MESMA conta contábil da conta bancária. O lançamento teria ` +
          `saldo líquido zero — o razão não se moveria e o extrato sim, e a conciliação ` +
          `acusaria uma diferença que ninguém conseguiria nomear. Informe a contrapartida ` +
          `real (despesa financeira para tarifa, receita financeira para rendimento, ` +
          `a conta de aplicações para aplicação e resgate).`
      );
    }

    const contrapartida = await tx.contaPcasp.findUnique({
      where: { id: dados.contaContrapartidaId },
      select: { id: true, codigo: true, analitica: true },
    });
    if (contrapartida === null) {
      throw new Error(
        `Conta de contrapartida ${dados.contaContrapartidaId} não existe no PCASP.`
      );
    }
    if (!contrapartida.analitica) {
      throw new Error(
        `Conta SINTÉTICA ${contrapartida.codigo} como contrapartida — conta sintética ` +
          `não recebe partida.`
      );
    }

    // ⚠️ O LOCK VEM ANTES DA LEITURA DO SALDO. Invertido, o guard leria um saldo que
    // outra transação já está gastando.
    await travar(tx, "ContaBancaria", [conta.id]);

    // ⚠️ O GUARD SÓ VALE PARA O QUE O ENTE PROVOCA — ver `E_ATO_DO_ENTE`. O banco credita
    // rendimento e debita tarifa por conta própria; recusar o REGISTRO de uma tarifa por
    // falta de saldo não desfaz o débito, apenas deixa o sistema mais longe do extrato.
    if (E_ATO_DO_ENTE[dados.tipo] && SINAL_MOVIMENTO_BANCARIO[dados.tipo] === -1) {
      const fatos = await fatosDeCaixaDaConta(tx as PrismaClient, conta, dados.data);
      const saldo = saldoDosFatosDeCaixa(
        fatos.map((f) => ({ sentido: f.sentido, valor: f.teto }))
      );
      exigirSaldoBancario(
        saldo,
        dados.valor,
        `${conta.codigo} (${conta.descricao})`,
        `${dados.tipo} de ${valorStr}`
      );
    }

    // ⚠️ AS DUAS PERNAS, NA MESMA TRANSAÇÃO — "lançamento simultâneo". Entrada debita a
    // conta bancária (ativo sobe) e credita a contrapartida; saída faz o inverso.
    const entrada = SINAL_MOVIMENTO_BANCARIO[dados.tipo] === 1;
    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `MB-${dados.tipo}-${conta.codigo}-${dados.data
        .toISOString()
        .slice(0, 10)}`,
      dataTransacao: dados.data,
      historico: dados.historico,
      origemTipo: "MOVIMENTO_BANCARIO",
      criadoPor: dados.criadoPor,
      partidas: [
        {
          contaId: entrada ? conta.contaContabilId : contrapartida.id,
          tipo: "DEBITO",
          subsistema: "PATRIMONIAL",
          valor: valorStr,
        },
        {
          contaId: entrada ? contrapartida.id : conta.contaContabilId,
          tipo: "CREDITO",
          subsistema: "PATRIMONIAL",
          valor: valorStr,
        },
      ],
    });

    const movimento = await tx.movimentoBancario.create({
      data: {
        contaBancariaId: conta.id,
        tipo: dados.tipo,
        valor: valorStr,
        data: dados.data,
        historico: dados.historico,
        lancamentoId,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    // O saldo depois — relido dos fatos, nunca somado à mão a partir do anterior.
    const depois = await fatosDeCaixaDaConta(tx as PrismaClient, conta, dados.data);
    const saldoResultante = saldoDosFatosDeCaixa(
      depois.map((f) => ({ sentido: f.sentido, valor: f.teto }))
    );

    return {
      movimentoId: movimento.id,
      lancamentoId,
      saldoResultante: saldoResultante.toFixed(2),
    };
  });
}

/**
 * ESTORNA um movimento bancário — FATO NOVO, nunca UPDATE.
 *
 * ⚠️ O ESTORNO NÃO CONFERE SALDO, e é deliberado: ele DEVOLVE o dinheiro no caso da
 * saída e o retira no caso da entrada, e recusar a correção de um lançamento errado por
 * falta de saldo deixaria o sistema preso ao erro. Quem conta a verdade é o extrato.
 *
 * ⚠️ E O ESTORNO DO ESTORNO É RECUSADO. Sem isso, a cadeia A ← estorno(A) ← estorno(do
 * estorno) somaria três vezes o mesmo dinheiro no saldo.
 */
export async function estornarMovimentoBancario(
  prisma: PrismaClient,
  input: EstornarMovimentoBancarioInput
): Promise<ResultadoMovimentoBancario> {
  const dados = zEstornarMovimentoBancario.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(
      tx,
      dados.criadoPor,
      ACAO_DO_SERVICO.estornarMovimentoBancario,
      "ENTE"
    );
    await exigirCompetenciaEmExercicioAberto(
      tx,
      dados.data,
      "estorno de movimento bancário"
    );

    const original = await tx.movimentoBancario.findUnique({
      where: { id: dados.movimentoId },
      select: {
        id: true,
        tipo: true,
        valor: true,
        historico: true,
        estornoDeId: true,
        estornos: { select: { id: true } },
        contaBancariaId: true,
        contaBancaria: {
          select: {
            id: true,
            codigo: true,
            descricao: true,
            fonteId: true,
            contaContabilId: true,
          },
        },
        lancamento: {
          select: {
            partidas: {
              select: { contaId: true, tipo: true, subsistema: true, valor: true },
            },
          },
        },
      },
    });
    if (original === null) {
      throw new Error(`Movimento bancário ${dados.movimentoId} não encontrado.`);
    }
    if (original.estornoDeId !== null) {
      throw new Error(
        `O movimento ${dados.movimentoId} JÁ É um estorno. Estornar um estorno somaria ` +
          `o mesmo dinheiro uma terceira vez no saldo da conta. Se o estorno foi ` +
          `indevido, registre o movimento original de novo, com histórico que o explique.`
      );
    }
    if (original.estornos.length > 0) {
      throw new Error(
        `O movimento ${dados.movimentoId} já foi ESTORNADO (estorno ` +
          `${original.estornos[0]!.id}). Um segundo estorno devolveria o valor duas vezes.`
      );
    }

    await travar(tx, "ContaBancaria", [original.contaBancariaId]);

    // ⚠️ AS PERNAS INVERTIDAS, UMA A UMA — cada uma preserva o SEU valor. É a mesma
    // lição do estorno do M05: recarimbar um valor único desfaria errado o que o
    // lançamento original fez certo quando as pernas têm valores diferentes.
    const lancamentoId = await lancarNoRazao(tx, {
      numeroControle: `MB-EST-${original.id}`,
      dataTransacao: dados.data,
      historico: `Estorno de ${original.tipo}: ${dados.motivo}`,
      origemTipo: "ESTORNO_MOVIMENTO_BANCARIO",
      criadoPor: dados.criadoPor,
      partidas: original.lancamento.partidas.map((p) => ({
        contaId: p.contaId,
        tipo: p.tipo === "DEBITO" ? ("CREDITO" as const) : ("DEBITO" as const),
        subsistema: p.subsistema,
        valor: p.valor.toFixed(2),
      })),
    });

    const estorno = await tx.movimentoBancario.create({
      data: {
        contaBancariaId: original.contaBancariaId,
        // ⚠️ O TIPO É O MESMO DO ORIGINAL, e o que desfaz é o `estornoDeId`. Inverter o
        // tipo (SAQUE viraria DEPOSITO) faria um relatório de "quanto se sacou no mês"
        // contar um depósito que nunca houve.
        tipo: original.tipo,
        valor: original.valor.toFixed(2),
        data: dados.data,
        historico: `Estorno de ${original.tipo}: ${dados.motivo}`,
        lancamentoId,
        estornoDeId: original.id,
        motivo: dados.motivo,
        criadoPor: dados.criadoPor,
      },
      select: { id: true },
    });

    const depois = await fatosDeCaixaDaConta(
      tx as PrismaClient,
      original.contaBancaria,
      dados.data
    );
    const saldoResultante = saldoDosFatosDeCaixa(
      depois.map((f) => ({ sentido: f.sentido, valor: f.teto }))
    );

    return {
      movimentoId: estorno.id,
      lancamentoId,
      saldoResultante: saldoResultante.toFixed(2),
    };
  });
}

/** Reexportado para quem monta a tela — o sinal é sempre o do domínio. */
export { comSinalDoMovimentoBancario, toMoney };
