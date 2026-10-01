import { toMoney, type Decimal, type Money } from "../../packages/contracts/index.js";
import type { RetencaoParaPersistir } from "./dominio.js";
import {
  exigirTipoAtivo,
  totaisDoConsignatario,
  type Tx,
} from "./extraorcamentario.js";
import { ehTributoDoProprioTesouro } from "./retencao-propria.js";

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
    // V26 — IR/ISS do próprio Tesouro, no mesmo perímetro, é receita: não nasce como dívida com terceiro.
    // O caminho calculado já o encaminha como retenção própria; esta é a porta que toda entrada atravessa.
    const proprio = await ehTributoDoProprioTesouro(tx, {
      tipoConsignacaoId: tipo.id,
      credorConsignatario: r.credorConsignatario,
      contaBancariaId: p.contaBancariaId,
      data: p.data,
    });
    if (proprio !== null) {
      throw new Error(
        `${tipo.codigo} retido para ${r.credorConsignatario} é imposto do próprio município: ele entra como receita do ` +
          `pagamento, não como consignação. Calcule as retenções do pagamento (o sistema reconhece a receita). Nada foi gravado.`
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

/**
 * V24 — A MEMÓRIA DO CÁLCULO de cada tributo avaliado no pagamento (retido ou não), gravada DENTRO da
 * transação do pagamento, depois dos movimentos do consignatário.
 *
 * ⚠️ A CONFERÊNCIA É AQUI, E NÃO NA BORDA. Cada cálculo que retém tem de casar com UM movimento do
 * mesmo tipo de consignação e do MESMO valor; e, havendo memória, nenhum movimento pode ficar sem
 * cálculo. Sem isso, um chamador poderia gravar "INSS retido: 110,00" ao lado de um movimento de 11,00
 * — a memória diria uma coisa e o razão do consignatário outra, e as duas pareceriam ter procedência.
 */
export interface CalculoDaRetencaoParaPersistir {
  readonly tributo: "IRRF" | "INSS" | "ISS";
  readonly resultado: "RETIDO" | "NAO_RETIDO" | "INFORMADO";
  readonly base: Money | null;
  readonly aliquota: Decimal | null;
  readonly valor: Money;
  readonly fundamento: string;
  /** As entradas do cálculo, para reproduzi-lo. */
  readonly entrada: Record<string, unknown>;
  /** O tipo de consignação que recebe a retenção (nulo quando nada é retido). */
  readonly tipoConsignacaoId: string | null;
}

/** Marca, no mapa de vínculos, o tributo que casou com uma retenção própria. */
const PROPRIA = "__retencao_propria__";

/** V26 — o fato da retenção própria que o cálculo de cada tributo do pagamento de fornecedor produz. */
const FATO_PROPRIO_DO_TRIBUTO: Readonly<Record<CalculoDaRetencaoParaPersistir["tributo"], string | null>> = {
  IRRF: "IRRF_FORNECEDOR_PJ",
  ISS: "ISS",
  INSS: null,
};

export async function registrarCalculosDaRetencao(
  tx: Tx,
  p: {
    readonly pagamentoId: string;
    readonly criadoPor: string;
    readonly calculos: readonly CalculoDaRetencaoParaPersistir[];
    /** Os movimentos que `registrarRetencoesDoPagamento` acabou de criar, com tipo e valor. */
    readonly movimentos: readonly { readonly id: string; readonly tipoConsignacaoId: string; readonly valor: Money }[];
    /**
     * V26 — as retenções PRÓPRIAS do Tesouro deste pagamento (IR e ISS do ente). O cálculo que retém o
     * tributo casa com UMA delas, do mesmo tributo e do mesmo valor, em vez de um movimento de consignação.
     */
    readonly proprias?: readonly { readonly fato: string; readonly valor: Money }[] | undefined;
  }
): Promise<void> {
  const usados = new Set<string>();
  const vinculo = new Map<string, string | null>();
  const propriasUsadas = new Set<number>();
  const proprias = p.proprias ?? [];
  for (const c of p.calculos) {
    const retem = c.valor.greaterThan(0);
    if (!retem) {
      vinculo.set(c.tributo, null);
      continue;
    }
    // O IR retido de PJ e o ISS: a retenção própria do MESMO tributo e do MESMO valor.
    const i = proprias.findIndex((r, k) => !propriasUsadas.has(k) && r.fato === FATO_PROPRIO_DO_TRIBUTO[c.tributo] && r.valor.equals(c.valor));
    if (c.tipoConsignacaoId === null && i >= 0) {
      propriasUsadas.add(i);
      vinculo.set(c.tributo, PROPRIA);
      continue;
    }
    const mov = p.movimentos.find((m) => !usados.has(m.id) && m.tipoConsignacaoId === c.tipoConsignacaoId && m.valor.equals(c.valor));
    if (mov === undefined) {
      throw new Error(`O cálculo do ${c.tributo} (${c.valor.toFixed(2)}) não casa com nenhuma retenção do pagamento. Nada foi gravado.`);
    }
    usados.add(mov.id);
    vinculo.set(c.tributo, mov.id);
  }
  const soltos = p.movimentos.filter((m) => !usados.has(m.id));
  if (soltos.length > 0) {
    throw new Error(`Há ${soltos.length} retenção(ões) sem o cálculo que as justifica. Nada foi gravado.`);
  }
  // V26 — a do IR da folha não vem da memória do pagamento de fornecedor; as demais próprias, sim.
  const propriasSoltas = proprias.filter((r, k) => !propriasUsadas.has(k) && r.fato !== "IRRF_FOLHA");
  if (propriasSoltas.length > 0) {
    throw new Error(`Há ${propriasSoltas.length} retenção(ões) de imposto do próprio município sem o cálculo que as justifica. Nada foi gravado.`);
  }
  for (const c of p.calculos) {
    // V26 — a memória do tributo retido como receita própria vai com o elo da retenção própria (a trava desta
    // tabela exige movimento de consignação para "retido"); aqui ficam a consignação e os não retidos.
    if (vinculo.get(c.tributo) === PROPRIA) continue;
    await tx.calculoDaRetencao.create({
      data: {
        pagamentoId: p.pagamentoId,
        tributo: c.tributo,
        resultado: c.resultado,
        base: c.base === null ? null : c.base.toFixed(2),
        aliquota: c.aliquota === null ? null : c.aliquota.toString(),
        valor: c.valor.toFixed(2),
        fundamento: c.fundamento,
        entrada: c.entrada as object,
        movimentoId: vinculo.get(c.tributo) ?? null,
        criadoPor: p.criadoPor,
      },
    });
  }
}
