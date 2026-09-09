import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada } from "./sessao";
import {
  autorizarOrdemDePagamento,
  cancelarOrdemDePagamento,
  liquidacoesParaOrdem,
  listarOrdensDePagamento,
  prepararOrdemDePagamento,
  type OrdemNaLista,
} from "../../modules/m05-despesa/ordem-pagamento";
// O estado do canal bancário é do M17 — a porta o LÊ, não o decide.
import { estadoDoModoBb } from "../../modules/m17-banco-bb/modos";

/**
 * PORTA — T07: AS QUATRO ETAPAS DO PAGAMENTO.
 *
 *   1. preparar / autorizar a ordem  → M05 (`ordem-pagamento.ts`)
 *   2. registrar o pagamento          → M05 (`pagar`), consumindo a ordem
 *   3. enviar ao banco                → **NÃO EXISTE** — ver `estadoDoEnvioAoBanco`
 *   4. confirmação bancária           → M09 (`VinculoConciliacao`), lido pela consulta
 *
 * ⚠️ A PORTA NÃO INVENTA A ETAPA 3. O incremento é explícito: *"sem configuração, o envio
 * real deve ficar indisponível com motivo; não substituir por retorno de sucesso local"*.
 * É o que ela faz — declara indisponível, nomeia o motivo, e não oferece rota.
 */

export { PortaSemBancoError };

export interface OrdemDaTela {
  readonly id: string;
  readonly numero: string;
  readonly estado: string;
  readonly valor: string;
  readonly dataPrevista: Date;
  readonly contaBancaria: string;
  readonly fonteCodigo: string;
  readonly historico: string;
  readonly liquidacaoNumero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly preparadaPor: string;
  readonly preparadaEm: Date;
  readonly autorizadaPor: string | null;
  readonly autorizadaEm: Date | null;
  readonly canceladaPor: string | null;
  readonly motivoDoCancelamento: string | null;
  readonly pagamentoNumero: string | null;
  readonly pagamentoEm: Date | null;
  readonly confirmacaoBancaria: string;
}

export interface LiquidacaoParaOrdemDaTela {
  readonly id: string;
  readonly numero: string;
  readonly empenhoNumero: string;
  readonly credorCpfCnpj: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly disponivelParaOrdem: string;
}

export async function lerOrdensDePagamento(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly OrdemDaTela[]> {
  const linhas = await listarOrdensDePagamento(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
  return linhas.map(paraTela);
}

export async function lerLiquidacoesParaOrdem(p: {
  readonly exercicio: number;
  readonly unidadeCodigo?: string | undefined;
}): Promise<readonly LiquidacaoParaOrdemDaTela[]> {
  const linhas = await liquidacoesParaOrdem(cliente(), {
    exercicio: p.exercicio,
    ...(p.unidadeCodigo !== undefined ? { unidadeCodigo: p.unidadeCodigo } : {}),
  });
  return linhas.map((l) => ({
    id: l.id,
    numero: l.numero,
    empenhoNumero: l.empenhoNumero,
    credorCpfCnpj: l.credorCpfCnpj,
    fonteId: l.fonteId,
    fonteCodigo: l.fonteCodigo,
    disponivelParaOrdem: l.disponivelParaOrdem.toFixed(2),
  }));
}

/** ETAPA 1a — preparar. Escrita autenticada, ação própria no censo. */
export async function prepararOrdem(input: {
  readonly liquidacaoId: string;
  readonly numero: string;
  readonly valor: string;
  readonly dataPrevista: Date;
  readonly contaBancaria: string;
  readonly fonteId: string;
  readonly historico: string;
}): Promise<string> {
  return comEscritaAutenticada("PREPARAR_ORDEM_PAGAMENTO", async (criadoPor) => {
    const r = await prepararOrdemDePagamento(cliente(), { ...input, criadoPor });
    return r.ordemId;
  });
}

/**
 * ETAPA 1b — autorizar.
 *
 * ⚠️ A PORTA NÃO CONFERE QUEM PREPAROU. A segregação é do domínio: um guard aqui
 * conferiria um estado que pode mudar antes da gravação, e — pior — daria a impressão de
 * que a regra é da borda. Quem chamar o caso de uso por outro caminho encontra a mesma
 * recusa.
 */
export async function autorizarOrdem(input: {
  readonly ordemId: string;
  readonly motivo?: string | undefined;
}): Promise<string> {
  return comEscritaAutenticada("AUTORIZAR_ORDEM_PAGAMENTO", async (criadoPor) => {
    const r = await autorizarOrdemDePagamento(cliente(), {
      ordemId: input.ordemId,
      ...(input.motivo !== undefined && input.motivo !== "" ? { motivo: input.motivo } : {}),
      criadoPor,
    });
    return r.movimentoId;
  });
}

/** ETAPA 1c — cancelar. Motivo obrigatório (o domínio cobra 10 caracteres). */
export async function cancelarOrdem(input: {
  readonly ordemId: string;
  readonly motivo: string;
}): Promise<string> {
  return comEscritaAutenticada("CANCELAR_ORDEM_PAGAMENTO", async (criadoPor) => {
    const r = await cancelarOrdemDePagamento(cliente(), { ...input, criadoPor });
    return r.movimentoId;
  });
}

/** O estado da ETAPA 3, para a tela dizer a verdade sobre ela. */
export interface EnvioAoBanco {
  readonly disponivel: false;
  readonly motivo: string;
  readonly detalhe: string;
}

/**
 * ETAPA 3 — ENVIAR AO BANCO. **INDISPONÍVEL**, e o motivo é declarado.
 *
 * ═══ ⚠️ POR QUE O TIPO DE RETORNO É `disponivel: false` LITERAL ═══
 * Não é `boolean`. Enquanto o envio não existir, **nenhum código consegue escrever o
 * caminho feliz** — o compilador recusa. É a diferença entre "hoje está desligado" e
 * "não há o que ligar": um `boolean` convidaria alguém a escrever o `if (disponivel)` com
 * um `return { ok: true }` dentro, e o botão de "enviar" nasceria devolvendo sucesso
 * local para um dinheiro que ninguém mandou.
 *
 * ═══ O QUE EXISTE, E O QUE NÃO ═══
 * O M17 é **só leitura** — extrato e saldo. A escrita bancária (o pagamento de fato, TR
 * 5.38) é o M17-b, e ele não foi construído. Além disso, o modo LIVE está bloqueado por
 * decisão do lote: nenhuma chamada financeira real.
 *
 * A tela mostra a etapa CINZA, com este texto. Sem rota, sem botão.
 */
export function estadoDoEnvioAoBanco(): EnvioAoBanco {
  const live = estadoDoModoBb("LIVE");
  return {
    disponivel: false,
    motivo: "canal de envio ao banco não implementado",
    detalhe:
      "A integração bancária existente é somente de LEITURA (extrato e saldo). O envio " +
      "de ordens ao banco é módulo próprio e ainda não foi construído. Enquanto isso, o " +
      "pagamento registrado aqui é administrativo: ele produz o efeito contábil e " +
      `documental, e a transferência é feita pelo canal do banco. (${live.mensagem})`,
  };
}

function paraTela(o: OrdemNaLista): OrdemDaTela {
  return {
    id: o.id,
    numero: o.numero,
    estado: o.estado,
    valor: o.valor.toFixed(2),
    dataPrevista: o.dataPrevista,
    contaBancaria: o.contaBancaria,
    fonteCodigo: o.fonteCodigo,
    historico: o.historico,
    liquidacaoNumero: o.liquidacaoNumero,
    empenhoNumero: o.empenhoNumero,
    credorCpfCnpj: o.credorCpfCnpj,
    preparadaPor: o.preparadaPor,
    preparadaEm: o.preparadaEm,
    autorizadaPor: o.autorizadaPor,
    autorizadaEm: o.autorizadaEm,
    canceladaPor: o.canceladaPor,
    motivoDoCancelamento: o.motivoDoCancelamento,
    pagamentoNumero: o.pagamentoNumero,
    pagamentoEm: o.pagamentoEm,
    confirmacaoBancaria: o.confirmacaoBancaria,
  };
}
