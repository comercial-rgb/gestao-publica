import { cliente } from "./cliente";
import { autorizarLeituraDoRegistro, exigirLeituraDoEnte } from "./leitura";

/**
 * V36 — DUPLICAR NAS ROTINAS DE PAGAMENTO, MOVIMENTO BANCÁRIO, RECEITA, DEDUÇÃO E TRANSFERÊNCIA (TR 5.10.2.5).
 *
 * ═══ DUPLICAR É PREENCHER, NÃO GRAVAR ═══
 * O "duplicar" de cada lista abre o formulário de inclusão da mesma tela com os dados do registro escolhido. Quem
 * grava é a action de sempre, com todas as guardas dela (saldo, fonte da conta, período, ordem cronológica,
 * idempotência). Não existe caminho novo de escrita — e por isso não existe gravação que pule uma guarda.
 *
 * O que NÃO vem do original, em todos: a DATA (é a do fato novo, informada) e o NÚMERO do documento. Os vínculos de
 * uso único também não vêm: a ordem de pagamento (única por pagamento), o crédito lançado e a dívida que a guia quitou.
 *
 * Cada leitura cobra a mesma leitura da tela de origem. Registro inexistente ou que é ele mesmo um estorno devolve
 * `null`, e a tela diz que não há o que duplicar.
 */

export interface CopiaDaArrecadacao {
  readonly origem: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly contaBancaria: string;
  readonly co: string;
  readonly exercicioFonte: 1 | 2;
  readonly valor: string;
}

export async function lerCopiaDaArrecadacao(id: string): Promise<CopiaDaArrecadacao | null> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const r = await cliente().receitaArrecadada.findUnique({
    where: { id },
    select: {
      tipo: true,
      numeroReceita: true,
      valor: true,
      exercicioFonte: true,
      naturezaReceita: { select: { codigo: true } },
      fonte: { select: { codigo: true } },
      co: { select: { codigo: true } },
      contaBancaria: { select: { codigo: true } },
    },
  });
  if (r === null || r.tipo !== "ARRECADACAO") return null;
  return {
    origem: `guia ${r.numeroReceita}`,
    natureza: r.naturezaReceita.codigo,
    fonte: r.fonte.codigo,
    contaBancaria: r.contaBancaria?.codigo ?? "",
    co: r.co?.codigo ?? "",
    exercicioFonte: r.exercicioFonte === 2 ? 2 : 1,
    valor: r.valor.toFixed(2),
  };
}

export interface CopiaDaDeducao {
  readonly origem: string;
  readonly natureza: string;
  readonly fonte: string;
  readonly contaBancaria: string;
  readonly valor: string;
  readonly documento: string;
}

export async function lerCopiaDaDeducao(id: string): Promise<CopiaDaDeducao | null> {
  await exigirLeituraDoEnte("CONSULTAR_RECEITA");
  const d = await cliente().deducaoDaReceitaRealizada.findUnique({
    where: { id },
    select: {
      estornoDeId: true,
      valor: true,
      documento: true,
      naturezaReceita: { select: { codigo: true } },
      fonte: { select: { codigo: true } },
      contaBancaria: { select: { codigo: true } },
    },
  });
  if (d === null || d.estornoDeId !== null) return null;
  return {
    origem: `dedução de ${d.valor.toFixed(2).replace(".", ",")} da natureza ${d.naturezaReceita.codigo}`,
    natureza: d.naturezaReceita.codigo,
    fonte: d.fonte.codigo,
    contaBancaria: d.contaBancaria.codigo,
    valor: d.valor.toFixed(2),
    documento: d.documento,
  };
}

export interface CopiaDoMovimento {
  readonly origem: string;
  readonly contaId: string;
  readonly fonteId: string;
  readonly tipo: string;
  readonly valor: string;
  readonly contrapartidaId: string;
  readonly historico: string;
}

export async function lerCopiaDoMovimento(id: string): Promise<CopiaDoMovimento | null> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const m = await cliente().movimentoBancario.findUnique({
    where: { id },
    select: {
      estornoDeId: true,
      contaBancariaId: true,
      fonteId: true,
      tipo: true,
      valor: true,
      historico: true,
      contaBancaria: { select: { codigo: true, contaContabilId: true } },
      lancamento: { select: { partidas: { select: { contaId: true } } } },
    },
  });
  if (m === null || m.estornoDeId !== null) return null;
  // A contrapartida é a perna do lançamento que NÃO é a conta contábil do banco. Se houver mais de uma (ou nenhuma),
  // o campo fica vazio e o operador escolhe — não se adivinha conta.
  const outras = [...new Set(m.lancamento.partidas.map((p) => p.contaId).filter((c) => c !== m.contaBancaria.contaContabilId))];
  return {
    origem: `movimento de ${m.valor.toFixed(2).replace(".", ",")} na conta ${m.contaBancaria.codigo}`,
    contaId: m.contaBancariaId,
    fonteId: m.fonteId,
    tipo: m.tipo,
    valor: m.valor.toFixed(2),
    contrapartidaId: outras.length === 1 ? (outras[0] ?? "") : "",
    historico: m.historico,
  };
}

export interface CopiaDaTransferencia {
  readonly origem: string;
  readonly tipo: string;
  readonly valor: string;
  readonly ugOrigemId: string;
  readonly ugDestinoId: string;
  readonly contaOrigemId: string;
  readonly contaDestinoId: string;
  readonly vinculo: string;
}

export async function lerCopiaDaTransferencia(id: string): Promise<CopiaDaTransferencia | null> {
  await exigirLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const t = await cliente().transferenciaEntreUgs.findUnique({
    where: { id },
    select: { estornoDeId: true, tipo: true, valor: true, ugOrigemId: true, ugDestinoId: true, contaOrigemId: true, contaDestinoId: true, vinculo: true },
  });
  if (t === null || t.estornoDeId !== null) return null;
  return {
    origem: `transferência de ${t.valor.toFixed(2).replace(".", ",")} (${t.vinculo})`,
    tipo: t.tipo,
    valor: t.valor.toFixed(2),
    ugOrigemId: t.ugOrigemId,
    ugDestinoId: t.ugDestinoId,
    contaOrigemId: t.contaOrigemId ?? "",
    contaDestinoId: t.contaDestinoId ?? "",
    vinculo: t.vinculo,
  };
}

export interface CopiaDoPagamento {
  readonly origem: string;
  readonly liquidacaoId: string;
  readonly contaBancaria: string;
  readonly valor: string;
  readonly historico: string;
}

export async function lerCopiaDoPagamento(id: string): Promise<CopiaDoPagamento | null> {
  const p = await cliente().pagamento.findUnique({
    where: { id },
    select: {
      numero: true,
      estornoDeId: true,
      anulacaoParcialDeId: true,
      liquidacaoId: true,
      contaBancaria: true,
      valor: true,
      lancamento: { select: { historico: true } },
      liquidacao: { select: { empenho: { select: { ficha: { select: { unidadeOrc: { select: { codigo: true } } } } } } } },
    },
  });
  // A leitura é a da despesa NA UNIDADE do pagamento; um id inexistente cobra a leitura de algum escopo, para a
  // resposta "não há" não sair para quem não lê a despesa.
  await autorizarLeituraDoRegistro("CONSULTAR_DESPESA", p?.liquidacao.empenho.ficha.unidadeOrc.codigo);
  if (p === null || p.estornoDeId !== null || p.anulacaoParcialDeId !== null) return null;
  return {
    origem: `pagamento ${p.numero}`,
    liquidacaoId: p.liquidacaoId,
    contaBancaria: p.contaBancaria,
    valor: p.valor.toFixed(2),
    historico: p.lancamento.historico,
  };
}
