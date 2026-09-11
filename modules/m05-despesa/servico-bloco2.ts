import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { gerarEstorno } from "../../packages/ledger/index.js";
// M05 -> M07 (nunca o inverso): quem paga é que retém.
import {
  comporPagamentoComRetencoes,
  type RetencoesDoPagamento,
} from "../m07-extraorcamentario/dominio.js";
import {
  comporPartidas,
  statusDoEmpenho,
  zAnularLiquidacaoInput,
  zAnularPagamentoInput,
  zLiquidarInput,
  zPagarInput,
  type AnularLiquidacaoInput,
  type AnularPagamentoInput,
  type LiquidarInput,
  type PagarInput,
  type RoteiroContabil,
  type StatusEmpenho,
} from "./dominio.js";
import { resolverContas } from "./servico.js";
import type { M05Deps } from "./ports.js";

/**
 * BLOCO 2 do M05 — liquidação e pagamento.
 *
 * Mesma disciplina do bloco 1: a checagem de limite (liquidar <= empenhado,
 * pagar <= liquidado) e a TR 5.23 leem o SUM REAL DENTRO da transação, no
 * adapter. Duas requisições concorrentes não podem liquidar o mesmo saldo.
 */

/** Estado do empenho, DERIVADO dos SUMs. Não existe coluna `status`. */
export async function statusDeEmpenho(
  empenhoId: string,
  deps: M05Deps
): Promise<StatusEmpenho> {
  const totais = await deps.despesa.totaisDoEmpenho(empenhoId);
  if (totais === null) {
    throw new Error(`Empenho ${empenhoId} não encontrado.`);
  }
  return statusDoEmpenho(totais);
}

export async function liquidar(
  input: LiquidarInput,
  roteiro: RoteiroContabil,
  deps: M05Deps
): Promise<{ readonly liquidacaoId: string; readonly lancamentoId: string }> {
  const dados = zLiquidarInput.parse(input);

  // A UG vem do EMPENHO -> ficha. LIQUIDAR é ação PRÓPRIA (não é "executar despesa"): o 6.4
  // existe para que quem empenha não seja necessariamente quem atesta o recebimento.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.liquidar, {
    empenho: dados.empenhoId,
  });

  const empenho = await deps.despesa.buscarEmpenho(dados.empenhoId);
  if (empenho === null) {
    throw new Error(`Empenho ${dados.empenhoId} não encontrado.`);
  }

  // Motor puro: partidas balanceadas por subsistema, antes de qualquer I/O.
  const partidas = comporPartidas(dados.valor, roteiro);
  const partidasParaPersistir = await resolverContas(
    partidas,
    empenho.fichaId,
    deps
  );

  const liquidacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  await deps.despesa.liquidar(
    {
      liquidacaoId,
      empenhoId: dados.empenhoId,
      numero: dados.numero,
      valor: dados.valor,
      data: dados.data,
      responsavelAtesto: dados.responsavelAtesto,
      ...(dados.notaFiscalChave !== undefined ? { notaFiscalChave: dados.notaFiscalChave } : {}),
      ...(dados.notaFiscalNum !== undefined ? { notaFiscalNum: dados.notaFiscalNum } : {}),
      ...(dados.notaFiscalSerie !== undefined ? { notaFiscalSerie: dados.notaFiscalSerie } : {}),
      ...(dados.notaFiscalData !== undefined ? { notaFiscalData: dados.notaFiscalData } : {}),
      ...(dados.notaFiscalValor !== undefined ? { notaFiscalValor: dados.notaFiscalValor } : {}),
      ...(dados.medicaoId !== undefined ? { medicaoId: dados.medicaoId } : {}),
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: dados.historico,
      origemTipo: "LIQUIDACAO",
      origemId: liquidacaoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { liquidacaoId, lancamentoId };
}

/**
 * Paga. `dados.valor` é o BRUTO — sempre.
 *
 * ═══ M07: RETENÇÃO NA FONTE (parâmetro `retencoes`, opcional) ═══
 * Com retenções, o lançamento vira COMPOSTO: as pernas do pagamento (o caixa
 * paga o LÍQUIDO; obrigação e orçamentário seguem no BRUTO, nunca deduzidos) +
 * uma perna de passivo por consignação. Quem prova que fecha é o motor do ledger,
 * sobre o lançamento final: ΣD == ΣC dentro de cada subsistema.
 *
 * O `Pagamento` continua sendo gravado pelo BRUTO: é ele que quita a liquidação,
 * que anda a fila do art. 141 (M06) e que baixa o resto a pagar (M08). Nenhum dos
 * três sabe — nem precisa saber — que houve retenção.
 *
 * SEM `retencoes` (ausente ou vazio): caminho IDÊNTICO ao de sempre, partida por
 * partida.
 */
export async function pagar(
  input: PagarInput,
  roteiro: RoteiroContabil,
  deps: M05Deps,
  retencoes?: RetencoesDoPagamento
): Promise<{ readonly pagamentoId: string; readonly lancamentoId: string }> {
  const dados = zPagarInput.parse(input);

  // A UG vem da LIQUIDAÇÃO -> empenho -> ficha.
  //
  // ⚠️ E O `pagar` É O CASO QUE MAIS PEDE A SEGREGAÇÃO POR UNIDADE (6.5): é aqui que o dinheiro
  // SAI. Um tesoureiro da Saúde paga na Saúde; a permissão dele não alcança a Educação, e o
  // teste t4 prova isso com duas fichas de unidades distintas — o mesmo serviço, o mesmo
  // usuário, e o segundo pagamento negado nomeando a unidade.
  //
  // A retenção (M07) e a amortização de dívida (M10) que nascem DENTRO desta transação são
  // pernas deste mesmo ato: elas não pedem permissão própria — quem paga, retém.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.pagar, {
    liquidacao: dados.liquidacaoId,
  });

  const liquidacao = await deps.despesa.buscarLiquidacao(dados.liquidacaoId);
  if (liquidacao === null) {
    throw new Error(`Liquidação ${dados.liquidacaoId} não encontrada.`);
  }

  // Motor puro do M07 (fail-closed) — sem retenção, devolve exatamente as mesmas
  // partidas que `comporPartidas(valor, roteiro)` devolvia.
  const composto = comporPagamentoComRetencoes({
    valorBruto: dados.valor,
    roteiro,
    ...(retencoes !== undefined
      ? { contaDisponibilidade: retencoes.contaDisponibilidade }
      : {}),
    retencoes: retencoes?.retencoes ?? [],
  });

  const partidasParaPersistir = [
    ...(await resolverContas(
      composto.partidasPagamento,
      liquidacao.fichaId,
      deps
    )),
    // As pernas do passivo do consignatário NÃO têm ficha: dinheiro de terceiro
    // não é execução orçamentária da ficha — ele só transita pelo caixa dela.
    ...(composto.partidasRetencao.length > 0
      ? await resolverContas(composto.partidasRetencao, undefined, deps)
      : []),
  ];

  const pagamentoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  await deps.despesa.pagar(
    {
      pagamentoId,
      liquidacaoId: dados.liquidacaoId,
      numero: dados.numero,
      // BRUTO. O líquido vive só na perna do caixa.
      valor: dados.valor,
      data: dados.data,
      contaBancaria: dados.contaBancaria,
      fonteId: dados.fonteId,
      ...(dados.justificativaOrdemConstitucional !== undefined
        ? { justificativaOrdemConstitucional: dados.justificativaOrdemConstitucional }
        : {}),
      criadoPor: dados.criadoPor,
      // M06 (art. 141): só necessária para pagar fora da ordem.
      ...(dados.justificativaQuebraOrdem !== undefined
        ? { justificativaQuebraOrdem: dados.justificativaQuebraOrdem }
        : {}),
      // T07: a ordem que autoriza. O adapter a confere DENTRO da transação —
      // conferir aqui seria conferir um estado que pode mudar antes da gravação.
      ...(dados.ordemDePagamentoId !== undefined
        ? { ordemDePagamentoId: dados.ordemDePagamentoId }
        : {}),
      // M07: os movimentos do consignatário nascem na MESMA transação.
      ...(composto.retencoes.length > 0
        ? { retencoes: composto.retencoes }
        : {}),
    },
    {
      id: lancamentoId,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: dados.historico,
      origemTipo: "PAGAMENTO",
      origemId: pagamentoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { pagamentoId, lancamentoId };
}

/**
 * Anula uma liquidação. REJEITA se ela já tiver pagamento vivo — anular a
 * liquidação sob um pagamento deixaria o pagamento órfão, apontando para um
 * fato que "não aconteceu".
 */
export async function anularLiquidacao(
  input: AnularLiquidacaoInput,
  deps: M05Deps
): Promise<{ readonly liquidacaoId: string; readonly lancamentoId: string }> {
  const dados = zAnularLiquidacaoInput.parse(input);

  // ⚠️ ESTA AUTORIZAÇÃO COBRE A CASCATA DO ALMOXARIFADO — e é a decisão 0(c) deste bloco.
  //
  // Anular a liquidação dispara, DENTRO desta transação, o `AoAnularLiquidacaoPort` (M10): o
  // material que entrou no estoque por esta liquidação SAI. A cascata roda com a autorização
  // do ATO ORIGINAL (`ANULAR_LIQUIDACAO`), e não pede uma sua.
  //
  // Exigir permissão própria para a perna do estoque partiria a anulação ao meio: o razão
  // estornado e o estoque ainda cheio, numa transação que não pode voltar atrás. A cascata é
  // CONSEQUÊNCIA do ato, não um ato novo — e quem pode desfazer a liquidação já está desfazendo
  // tudo o que ela causou. Ver t3.
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.anularLiquidacao, {
    liquidacao: dados.liquidacaoId,
  });

  const original = await deps.despesa.buscarLiquidacao(dados.liquidacaoId);
  if (original === null) {
    throw new Error(`Liquidação ${dados.liquidacaoId} não encontrada.`);
  }
  if (original.estornoDeId !== null) {
    throw new Error(
      `Liquidação ${dados.liquidacaoId} JÁ É uma anulação.`
    );
  }
  if (original.estornos.length > 0) {
    throw new Error(`Liquidação ${dados.liquidacaoId} já foi anulada.`);
  }

  const anulacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  const lancamentoOriginal = await deps.despesa.buscarLancamentoDaLiquidacao(
    original.id
  );
  const estorno = gerarEstorno(lancamentoOriginal, {
    idEstorno: lancamentoId,
    numeroControleEstorno: dados.numero,
    dataEstorno: dados.data,
  });

  const partidasParaPersistir = await resolverContas(
    estorno.partidas,
    original.fichaId,
    deps
  );

  await deps.despesa.anularLiquidacao(
    {
      anulacaoId,
      liquidacaoOriginalId: original.id,
      numero: dados.numero,
      data: dados.data,
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: estorno.historico,
      origemTipo: "LIQUIDACAO_ANULADA",
      origemId: anulacaoId,
      estornoDeId: original.lancamentoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { liquidacaoId: anulacaoId, lancamentoId };
}

export async function anularPagamento(
  input: AnularPagamentoInput,
  deps: M05Deps
): Promise<{ readonly pagamentoId: string; readonly lancamentoId: string }> {
  const dados = zAnularPagamentoInput.parse(input);

  // A UG vem do PAGAMENTO -> liquidação -> empenho -> ficha. (E, como no anular da liquidação,
  // as pernas que morrem junto — retenção do M07, amortização do M10 — vão nesta autorização.)
  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.anularPagamento, {
    pagamento: dados.pagamentoId,
  });

  const original = await deps.despesa.buscarPagamento(dados.pagamentoId);
  if (original === null) {
    throw new Error(`Pagamento ${dados.pagamentoId} não encontrado.`);
  }
  if (original.estornoDeId !== null) {
    throw new Error(`Pagamento ${dados.pagamentoId} JÁ É uma anulação.`);
  }
  if (original.estornos.length > 0) {
    throw new Error(`Pagamento ${dados.pagamentoId} já foi anulado.`);
  }

  const anulacaoId = deps.ids.novo();
  const lancamentoId = deps.ids.novo();

  const lancamentoOriginal = await deps.despesa.buscarLancamentoDoPagamento(
    original.id
  );
  const estorno = gerarEstorno(lancamentoOriginal, {
    idEstorno: lancamentoId,
    numeroControleEstorno: dados.numero,
    dataEstorno: dados.data,
  });

  const partidasParaPersistir = await resolverContas(
    estorno.partidas,
    original.fichaId,
    deps
  );

  await deps.despesa.anularPagamento(
    {
      anulacaoId,
      pagamentoOriginalId: original.id,
      numero: dados.numero,
      data: dados.data,
      criadoPor: dados.criadoPor,
    },
    {
      id: lancamentoId,
      numeroControle: dados.numero,
      dataTransacao: dados.data,
      historico: estorno.historico,
      origemTipo: "PAGAMENTO_ANULADO",
      origemId: anulacaoId,
      estornoDeId: original.lancamentoId,
      criadoPor: dados.criadoPor,
      partidas: partidasParaPersistir,
    }
  );

  return { pagamentoId: anulacaoId, lancamentoId };
}
