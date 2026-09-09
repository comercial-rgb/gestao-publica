import { toMoney } from "../../packages/contracts/index.js";
import type { RetencaoParaPersistir } from "./dominio.js";
import {
  exigirTipoAtivo,
  totaisDoConsignatario,
  type Tx,
} from "./extraorcamentario.js";

/**
 * RETENÇÃO NA FONTE — o lado da persistência, DENTRO da transação do pagamento.
 *
 * Vive num arquivo próprio, como os guards do M08, e recebe a `Tx` de quem paga.
 * É o que permite o adapter do M05 (e, depois, o M08) consumir o M07 sem que o
 * M07 precise conhecê-los: a seta é sempre M05 → M07, nunca o inverso.
 *
 * ═══ ATOMICIDADE ═══
 * As duas funções aqui NÃO abrem transação: elas rodam DENTRO da que já está
 * aberta. Um pagamento com retenção é UM fato — se qualquer perna falhar, nada
 * existe: nem pagamento, nem lançamento, nem movimento do consignatário.
 *
 * NENHUMA delas cria `MovimentoDotacao`. Dinheiro de terceiro não passa pelo
 * orçamento — nem quando entra retido, nem quando o estorno o devolve.
 */

export interface RegistrarRetencoesParams {
  readonly pagamentoId: string;
  /** O lançamento COMPOSTO do pagamento — o mesmo para todas as retenções. */
  readonly lancamentoId: string;
  readonly contaBancariaId: string;
  readonly data: Date;
  readonly historico: string;
  readonly criadoPor: string;
  readonly retencoes: readonly RetencaoParaPersistir[];
}

/**
 * Os N INGRESSO de um pagamento com retenção. Um por consignação — o razão do
 * M07 é por (tipo, credor), e é ele que diz quanto o ente ainda deve a cada
 * consignatário.
 *
 * Todos apontam para o MESMO `lancamentoId`: a contabilização já está lá, na
 * perna de passivo que o lançamento composto carrega para cada um deles.
 */
export async function registrarRetencoesDoPagamento(
  tx: Tx,
  p: RegistrarRetencoesParams
): Promise<readonly string[]> {
  const ids: string[] = [];

  for (const r of p.retencoes) {
    // Fail-closed: tipo inexistente ou INATIVO derruba o pagamento inteiro.
    const tipo = await exigirTipoAtivo(tx, r.tipoConsignacaoId);

    /*
      ⚠️ A CONTA DO PASSIVO É DO CADASTRO — o chamador não a escolhe.

      A perna de passivo já foi composta antes desta transação, com a conta que veio no
      parâmetro. Aqui ela é CONFRONTADA com `TipoConsignacao.contaPassivo`. Sem este
      confronto, qualquer código que chame `pagar()` — uma rota nova, um worker, um
      importador — poderia fazer o passivo do INSS nascer numa conta de despesa: o
      lançamento FECHARIA (é só mais uma conta credora), o balancete não acusaria, e a
      dívida com o consignatário sumiria do lugar onde alguém a procura.

      A borda também recusa, antes, com mensagem melhor. Mas a borda é UMA das entradas;
      esta é a que todas atravessam.
    */
    if (tipo.contaPassivo === null) {
      throw new Error(
        `Tipo de consignação ${tipo.codigo} não tem CONTA DE PASSIVO parametrizada. ` +
          `Reter é fazer nascer uma dívida com o consignatário, e sem saber em que conta ` +
          `ela nasce o passivo iria parar numa conta escolhida por quem chamou. ` +
          `Cadastre a conta antes de reter. Nada foi gravado.`
      );
    }
    if (r.contaConsignacaoAPagar !== tipo.contaPassivo) {
      throw new Error(
        `Retenção de ${tipo.codigo} composta na conta ${r.contaConsignacaoAPagar}, mas o ` +
          `cadastro diz ${tipo.contaPassivo}. Quem decide onde o passivo da consignação ` +
          `nasce é o CADASTRO, não quem chama — senão a dívida com o consignatário pode ` +
          `nascer em qualquer conta e o lançamento fecha do mesmo jeito. Nada foi gravado.`
      );
    }

    const mov = await tx.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: tipo.id,
        credorConsignatario: r.credorConsignatario,
        contaBancariaId: p.contaBancariaId,
        tipo: "INGRESSO",
        valor: r.valor.toFixed(2),
        data: p.data,
        // A marca da retenção na fonte: este ingresso nasceu num pagamento.
        pagamentoId: p.pagamentoId,
        lancamentoId: p.lancamentoId,
        historico: `Retenção de ${tipo.codigo} em ${p.historico}`,
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
    ids.push(mov.id);
  }

  return ids;
}

export interface EstornarRetencoesParams {
  readonly pagamentoOriginalId: string;
  /** O lançamento de estorno do pagamento — já com as pernas invertidas. */
  readonly lancamentoEstornoId: string;
  readonly data: Date;
  readonly motivo: string;
  readonly criadoPor: string;
}

/**
 * Estorna as retenções de um pagamento que está sendo ANULADO. Simétrica de
 * `registrarRetencoesDoPagamento` — e nasceu JUNTO com ela.
 *
 * ═══ POR QUE ELA EXISTE DESDE O PRIMEIRO COMMIT ═══
 * O lançamento de estorno do pagamento já inverte as pernas de passivo sozinho
 * (o `gerarEstorno` inverte TODAS as pernas do lançamento composto). A
 * contabilidade, portanto, fecharia sem esta função — e é justamente aí que mora
 * a armadilha: o RAZÃO DO M07 continuaria dizendo que o ente deve 100 ao INSS,
 * de um pagamento que não existe mais. O saldo do consignatário ficaria inflado,
 * o repasse seguinte pagaria um valor que ninguém reteve, e nada disso apareceria
 * no balanço — porque o balanço fecha.
 *
 * É a mesma classe do bug do M08 (345af7d): o estorno contábil veio, o do razão
 * não. Aqui os dois nascem no mesmo commit.
 *
 * Pagamento SEM retenção: não faz nada (devolve lista vazia) — o caminho de
 * sempre segue idêntico.
 */
export async function estornarRetencoesDoPagamento(
  tx: Tx,
  p: EstornarRetencoesParams
): Promise<readonly string[]> {
  const retencoes = await tx.movimentoExtraorcamentario.findMany({
    where: { pagamentoId: p.pagamentoOriginalId, tipo: "INGRESSO" },
    select: {
      id: true,
      tipoConsignacaoId: true,
      credorConsignatario: true,
      contaBancariaId: true,
      valor: true,
      estornos: { select: { id: true } },
      tipoConsignacao: { select: { codigo: true } },
    },
    orderBy: { criadoEm: "asc" },
  });

  const ids: string[] = [];

  for (const r of retencoes) {
    // Defensivo: `estornarMovimentoExtra` já rejeita estornar uma retenção
    // avulsa, e o `uq_estorno_extra_unico` fecha a porta no banco. Se ainda
    // assim houver estorno, a anulação PARA — devolver o saldo duas vezes daria
    // ao consignatário mais dinheiro do que se reteve dele.
    if (r.estornos.length > 0) {
      throw new Error(
        `A retenção ${r.id} (${r.tipoConsignacao.codigo}) do pagamento ` +
          `${p.pagamentoOriginalId} já foi estornada — a anulação devolveria o ` +
          `saldo duas vezes.`
      );
    }

    const valor = toMoney(r.valor.toFixed(2));

    // ═══ O REPASSE JÁ FEITO BLOQUEIA A ANULAÇÃO ═══
    // Anular o pagamento desfaz o ingresso da retenção. Se o dinheiro do INSS já
    // foi REPASSADO ao INSS, desfazer o ingresso deixaria o saldo do
    // consignatário NEGATIVO: o ente teria repassado dinheiro que, no sistema,
    // nunca reteve. E o dinheiro real já foi — não volta por anular um registro.
    // O caminho certo é o inverso: estorne o repasse primeiro (o dinheiro volta
    // a ser devido), e só então anule o pagamento.
    const totais = await totaisDoConsignatario(
      tx,
      r.tipoConsignacaoId,
      r.credorConsignatario
    );
    if (valor.greaterThan(totais.saldo)) {
      throw new Error(
        `Não dá para anular o pagamento: a retenção de ` +
          `${valor.toFixed(2)} (${r.tipoConsignacao.codigo}, ` +
          `${r.credorConsignatario}) JÁ FOI REPASSADA — o saldo do ` +
          `consignatário é ${totais.saldo.toFixed(2)}. Anular agora deixaria o ` +
          `saldo NEGATIVO: o ente teria repassado dinheiro que não reteve. ` +
          `Estorne o DISPÊNDIO do repasse primeiro (estornarMovimentoExtra) e ` +
          `só então anule o pagamento.`
      );
    }

    // O saldo VOLTA a zero pelo SUM: ESTORNO_INGRESSO subtrai
    // (SINAL_MOVIMENTO_EXTRA). `uq_estorno_extra_unico` protege a devolução dupla.
    const mov = await tx.movimentoExtraorcamentario.create({
      data: {
        tipoConsignacaoId: r.tipoConsignacaoId,
        credorConsignatario: r.credorConsignatario,
        contaBancariaId: r.contaBancariaId,
        tipo: "ESTORNO_INGRESSO",
        valor: r.valor,
        data: p.data,
        // Segue apontando para o pagamento ORIGINAL: é dele que a retenção veio.
        pagamentoId: p.pagamentoOriginalId,
        estornoDeId: r.id,
        lancamentoId: p.lancamentoEstornoId,
        historico: `Estorno da retenção de ${r.tipoConsignacao.codigo}`,
        motivo: p.motivo,
        criadoPor: p.criadoPor,
      },
      select: { id: true },
    });
    ids.push(mov.id);
  }

  return ids;
}
