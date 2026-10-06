import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import { criarM05Deps } from "../../modules/m05-despesa/adapter-prisma";
import { criarM04Deps } from "../../modules/m04-receita/adapter-prisma";
import { anularEmpenho } from "../../modules/m05-despesa/servico";
import { anularLiquidacao, anularPagamento } from "../../modules/m05-despesa/servico-bloco2";
import {
  anularEmpenhoParcial,
  anularLiquidacaoParcial,
  anularPagamentoParcial,
} from "../../modules/m05-despesa/anulacao-parcial";
import { anularArrecadacao } from "../../modules/m04-receita/servico";
import { listarPagamentos, type PagamentoNaLista } from "../../modules/m05-despesa/consultas";

/**
 * PORTA — ANULAÇÕES (TR 5.35 despesa · TR 4.61 receita).
 *
 * ═══ O ESTORNO NASCE NO DOMÍNIO, JAMAIS NA BORDA ═══
 * A porta NÃO monta lançamento nenhum: ela encaminha ao serviço, que inverte o lançamento original
 * dentro da transação. A borda só resolve o `criadoPor` real (sessão), grava o `RegistroDeOperacao`
 * e traduz `FormData` → tipos. Todo guard — saldo anulável, retenção que proíbe parcial, cascatas
 * (almoxarifado, dívida) — é do domínio, e a mensagem dele sobe intacta para a tela.
 *
 * ═══ ⚠️ TOTAL × PARCIAL — a decisão é do chamador, o guard é do domínio ═══
 * Total (estorno): o fato SOME de toda soma líquida. Parcial: o fato FICA, valendo menos. A tela
 * escolhe `total` quando o valor esgota o saldo E o nível de baixo está vazio (`estornavel`); senão
 * parcial. Se a escolha estiver velha (o saldo mudou entre a leitura e o clique), o domínio reprova
 * — um estorno total de empenho já liquidado deixa a liquidação órfã, e o serviço recusa.
 */

export { PortaSemBancoError };

export type TipoAnulavel = "empenho" | "liquidacao" | "pagamento";

/** A ação do censo — a mesma string que o serviço do domínio exige (audita e autoriza o mesmo ato). */
const ACAO: Record<TipoAnulavel, { total: string; parcial: string }> = {
  empenho: { total: "ANULAR_EMPENHO", parcial: "ANULAR_EMPENHO_PARCIAL" },
  liquidacao: { total: "ANULAR_LIQUIDACAO", parcial: "ANULAR_LIQUIDACAO_PARCIAL" },
  pagamento: { total: "ANULAR_PAGAMENTO", parcial: "ANULAR_PAGAMENTO_PARCIAL" },
};

/**
 * ANULA um empenho/liquidação/pagamento — escrita autenticada.
 *
 * `total` escolhe entre estorno (o fato inteiro) e redução (parcial). `historico`/`motivo` é a
 * mesma justificativa: o serviço total a recebe como `historico`; o parcial, como `motivo` (que
 * exige ao menos 10 caracteres — por isso a tela cobra 10 dos dois).
 */
export async function anularExecucao(input: {
  readonly tipo: TipoAnulavel;
  readonly id: string;
  readonly numero: string;
  readonly valor: string;
  readonly motivo: string;
  readonly data: Date;
  readonly total: boolean;
}): Promise<{ readonly lancamentoId: string }> {
  // V33 — devolve o LANÇAMENTO do fato novo: a tela abre o original e a anulação depois de gravada.
  const acao = input.total ? ACAO[input.tipo].total : ACAO[input.tipo].parcial;
  return comEscritaAutenticada(acao, async (criadoPor) => {
    const deps = criarM05Deps(cliente());
    if (input.total) {
      const base = { numero: input.numero, data: input.data, historico: input.motivo, criadoPor };
      if (input.tipo === "empenho") return { lancamentoId: (await anularEmpenho({ empenhoId: input.id, ...base }, deps)).lancamentoId };
      if (input.tipo === "liquidacao") return { lancamentoId: (await anularLiquidacao({ liquidacaoId: input.id, ...base }, deps)).lancamentoId };
      return { lancamentoId: (await anularPagamento({ pagamentoId: input.id, ...base }, deps)).lancamentoId };
    }
    const base = { originalId: input.id, numero: input.numero, valor: input.valor, data: input.data, motivo: input.motivo, criadoPor };
    if (input.tipo === "empenho") return { lancamentoId: (await anularEmpenhoParcial(base, deps)).lancamentoId };
    if (input.tipo === "liquidacao") return { lancamentoId: (await anularLiquidacaoParcial(base, deps)).lancamentoId };
    return { lancamentoId: (await anularPagamentoParcial(base, deps)).lancamentoId };
  });
}

/**
 * ANULA uma arrecadação (TR 4.61) — TOTAL apenas (o serviço não tem parcial). O `numeroReceita` é o
 * da GUIA DE ANULAÇÃO. Dispara, no domínio, a cascata do M10 (dívida ativa, operação de crédito).
 */
export async function anularReceita(input: {
  readonly receitaId: string;
  readonly numeroReceita: string;
  readonly data: Date;
}): Promise<void> {
  await comEscritaAutenticada("ANULAR_ARRECADACAO", async (criadoPor) => {
    await anularArrecadacao(
      { receitaId: input.receitaId, numeroReceita: input.numeroReceita, dataAnulacao: input.data, criadoPor },
      criarM04Deps(cliente())
    );
  });
}

/** O pagamento como a TELA de anulação o consome — dinheiro em string. */
export interface PagamentoDaTela {
  /** V36 — o lançamento do pagamento e o empenho de origem (links da linha). */
  readonly lancamentoId: string;
  readonly empenhoId: string;
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly pagoLiquido: string;
  readonly anulado: boolean;
  readonly liquidacaoNumero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteCodigo: string;
}

/** Os pagamentos executados do exercício/unidade — o que a fila (M06) não mostra. */
export async function listarPagamentosDaExecucao(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly PagamentoDaTela[]> {
  const linhas = await listarPagamentos(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
  return linhas.map((l: PagamentoNaLista) => ({
    id: l.id,
    numero: l.numero,
    data: l.data,
    valor: l.valor.toFixed(2),
    pagoLiquido: l.pagoLiquido.toFixed(2),
    anulado: l.anulado,
    liquidacaoNumero: l.liquidacaoNumero,
    empenhoNumero: l.empenhoNumero,
    credorCpfCnpj: l.credorCpfCnpj,
    fonteCodigo: l.fonteCodigo,
    lancamentoId: l.lancamentoId,
    empenhoId: l.empenhoId,
  }));
}

/**
 * V33 — AS ANULAÇÕES REGISTRADAS NO EXERCÍCIO (empenho, liquidação, pagamento), cada uma com o original e o
 * lançamento — a metade "depois" da central de anulações. Leitura direta das linhas de anulação: são fatos
 * próprios (estorno total ou parcial apontando o original), nunca uma alteração do original.
 */
export interface AnulacaoRegistrada {
  readonly tipo: TipoAnulavel;
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly valor: string;
  readonly integral: boolean;
  readonly motivo: string;
  readonly lancamentoId: string;
  readonly originalId: string;
  readonly originalNumero: string;
  /** Onde o original abre (o dossiê do empenho, na âncora da liquidação ou do pagamento). */
  readonly originalHref: string;
  readonly criadoPor: string;
}

export async function listarAnulacoesDoExercicio(p: { readonly exercicio: number; readonly unidadeCodigo?: string | undefined }): Promise<readonly AnulacaoRegistrada[]> {
  const db = cliente();
  const ficha = { exercicio: p.exercicio, ...(p.unidadeCodigo !== undefined ? { unidadeOrc: { codigo: p.unidadeCodigo } } : {}) };
  const ehAnulacao = { OR: [{ estornoDeId: { not: null } }, { anulacaoParcialDeId: { not: null } }] };
  const [emp, liq, pag] = await Promise.all([
    db.empenho.findMany({
      where: { ...ehAnulacao, ficha },
      select: { id: true, numero: true, data: true, valor: true, historico: true, lancamentoId: true, criadoPor: true, estornoDe: { select: { id: true, numero: true, anulacaoParcialDeId: true } }, anulacaoParcialDe: { select: { id: true, numero: true } } },
    }),
    db.liquidacao.findMany({
      where: { ...ehAnulacao, empenho: { ficha } },
      select: { id: true, numero: true, data: true, valor: true, motivo: true, lancamentoId: true, criadoPor: true, empenhoId: true, estornoDe: { select: { id: true, numero: true } }, anulacaoParcialDe: { select: { id: true, numero: true } } },
    }),
    db.pagamento.findMany({
      where: { ...ehAnulacao, liquidacao: { empenho: { ficha } } },
      select: { id: true, numero: true, data: true, valor: true, motivo: true, lancamentoId: true, criadoPor: true, liquidacao: { select: { empenhoId: true } }, estornoDe: { select: { id: true, numero: true } }, anulacaoParcialDe: { select: { id: true, numero: true } } },
    }),
  ]);
  const linhas: AnulacaoRegistrada[] = [
    ...emp.flatMap((e) => {
      // O estorno de uma anulação PARCIAL aponta a parcial; o original é o pai dela.
      const original = e.anulacaoParcialDe ?? e.estornoDe;
      if (original === null) return [];
      return [{ tipo: "empenho" as const, id: e.id, numero: e.numero, data: e.data, valor: e.valor.toFixed(2), integral: e.estornoDe !== null, motivo: e.historico, lancamentoId: e.lancamentoId, originalId: original.id, originalNumero: original.numero, originalHref: `/despesa/empenhos/${e.estornoDe?.anulacaoParcialDeId ?? original.id}`, criadoPor: e.criadoPor }];
    }),
    ...liq.flatMap((l) => {
      const original = l.anulacaoParcialDe ?? l.estornoDe;
      if (original === null) return [];
      return [{ tipo: "liquidacao" as const, id: l.id, numero: l.numero, data: l.data, valor: l.valor.toFixed(2), integral: l.estornoDe !== null, motivo: l.motivo ?? "", lancamentoId: l.lancamentoId, originalId: original.id, originalNumero: original.numero, originalHref: `/despesa/empenhos/${l.empenhoId}#liquidacao-${original.id}`, criadoPor: l.criadoPor }];
    }),
    ...pag.flatMap((x) => {
      const original = x.anulacaoParcialDe ?? x.estornoDe;
      if (original === null) return [];
      return [{ tipo: "pagamento" as const, id: x.id, numero: x.numero, data: x.data, valor: x.valor.toFixed(2), integral: x.estornoDe !== null, motivo: x.motivo ?? "", lancamentoId: x.lancamentoId, originalId: original.id, originalNumero: original.numero, originalHref: `/despesa/empenhos/${x.liquidacao.empenhoId}#pagamento-${original.id}`, criadoPor: x.criadoPor }];
    }),
  ];
  return linhas.sort((a, b) => b.data.getTime() - a.data.getTime() || a.numero.localeCompare(b.numero));
}
