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
}): Promise<void> {
  const acao = input.total ? ACAO[input.tipo].total : ACAO[input.tipo].parcial;
  await comEscritaAutenticada(acao, async (criadoPor) => {
    const deps = criarM05Deps(cliente());
    if (input.total) {
      const base = { numero: input.numero, data: input.data, historico: input.motivo, criadoPor };
      if (input.tipo === "empenho") await anularEmpenho({ empenhoId: input.id, ...base }, deps);
      else if (input.tipo === "liquidacao") await anularLiquidacao({ liquidacaoId: input.id, ...base }, deps);
      else await anularPagamento({ pagamentoId: input.id, ...base }, deps);
    } else {
      const base = { originalId: input.id, numero: input.numero, valor: input.valor, data: input.data, motivo: input.motivo, criadoPor };
      if (input.tipo === "empenho") await anularEmpenhoParcial(base, deps);
      else if (input.tipo === "liquidacao") await anularLiquidacaoParcial(base, deps);
      else await anularPagamentoParcial(base, deps);
    }
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
  }));
}
