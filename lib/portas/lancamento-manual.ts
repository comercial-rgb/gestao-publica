import { cliente } from "./cliente";
import { toMoney } from "../../packages/contracts/index.js";
import { comEscritaAutenticada } from "./sessao";
import { exigirLeituraDoEnte } from "./leitura";
import { subsistemaDaConta } from "../../packages/ledger/index.js";
import { meioDiaCivil } from "../../packages/datas/index";
import { criarM01Deps } from "../../modules/m01-core-contabil/adapter-prisma";
import { estornarLancamento, registrarLancamento } from "../../modules/m01-core-contabil/servico";
import { ORIGEM_IMPLANTACAO } from "../../modules/m01-core-contabil/implantacao-de-saldos";

/**
 * PORTA — O LANÇAMENTO CONTÁBIL MANUAL (V22 rodada 7).
 *
 * ═══ POR QUE EXISTE ═══
 * O caso de uso do M01 (`registrarLancamento`/`estornarLancamento`) existia, testado e com as ações no
 * censo (REGISTRAR_LANCAMENTO_MANUAL, ESTORNAR_LANCAMENTO_MANUAL) — e sem caminho de tela. O contador
 * não tinha como escriturar um ajuste, uma reclassificação ou uma abertura. Esta porta é esse caminho.
 *
 * ⚠️ AS REGRAS SÃO DO DOMÍNIO, E NENHUMA MORA AQUI: ΣD == ΣC no lançamento e em cada subsistema, valor
 * positivo, conta existente e ANALÍTICA, subsistema coerente com a classe, período aberto (o funil
 * `lancarNoRazao`), autorização GLOBAL (quem lança partidas arbitrárias reescreve qualquer número).
 * O que esta porta faz é traduzir a tela: o dia civil vira meio-dia civil, e o SUBSISTEMA sai do código
 * da conta (`subsistemaDaConta`, a mesma tabela que o motor confere) — não é perguntado ao operador.
 *
 * ⚠️ O ESTORNO POR AQUI É SÓ DE LANÇAMENTO MANUAL. O lançamento de um empenho, de um pagamento ou de uma
 * arrecadação se desfaz pela anulação DO FATO; estornar só o razão deixaria a despesa dizendo uma coisa
 * e o razão outra.
 */

export const ORIGEM_MANUAL = "MANUAL";

export interface PartidaDaTela {
  readonly conta: string;
  readonly tipo: "DEBITO" | "CREDITO";
  /** String decimal com ponto ("1234.56"): a tela normaliza antes de enviar. */
  readonly valor: string;
}

export async function registrarLancamentoManual(input: {
  readonly numeroControle: string;
  /** Dia civil do fato, "AAAA-MM-DD". */
  readonly dia: string;
  readonly historico: string;
  readonly partidas: readonly PartidaDaTela[];
}): Promise<string> {
  // A classe da conta vira subsistema ANTES do envelope: código sem classe é recusado com o motivo.
  const partidas = input.partidas.map((p) => ({ conta: p.conta.trim(), tipo: p.tipo, subsistema: subsistemaDaConta(p.conta), valor: p.valor }));
  return comEscritaAutenticada("REGISTRAR_LANCAMENTO_MANUAL", (criadoPor) =>
    registrarLancamento(
      { numeroControle: input.numeroControle, dataTransacao: meioDiaCivil(input.dia), historico: input.historico, origemTipo: ORIGEM_MANUAL, criadoPor, partidas },
      criarM01Deps(cliente())
    )
  );
}

export class EstornoDeLancamentoDeFatoError extends Error {
  constructor(numeroControle: string, origem: string) {
    super(
      `O lançamento ${numeroControle} nasceu de ${origem.toLowerCase()} e se desfaz pela anulação desse registro, ` +
        `não pelo estorno do razão — senão a despesa (ou a receita) diria uma coisa e o razão outra. Nada foi gravado.`
    );
    this.name = "EstornoDeLancamentoDeFatoError";
  }
}

export async function estornarLancamentoManual(input: { readonly lancamentoId: string; readonly numeroControle: string; readonly dia: string }): Promise<string> {
  const original = await cliente().lancamentoContabil.findUnique({ where: { id: input.lancamentoId }, select: { numeroControle: true, origemTipo: true } });
  if (original === null) throw new Error("Lançamento não encontrado.");
  // V32 — a implantação dos saldos iniciais também se corrige pelo estorno do razão (não há registro de origem a anular).
  if (original.origemTipo !== ORIGEM_MANUAL && original.origemTipo !== ORIGEM_IMPLANTACAO) throw new EstornoDeLancamentoDeFatoError(original.numeroControle, original.origemTipo);
  return comEscritaAutenticada("ESTORNAR_LANCAMENTO_MANUAL", (criadoPor) =>
    estornarLancamento(
      { lancamentoId: input.lancamentoId, numeroControleEstorno: input.numeroControle, dataEstorno: meioDiaCivil(input.dia), criadoPor },
      criarM01Deps(cliente())
    )
  );
}

export interface LancamentoManualEstornavel {
  readonly id: string;
  readonly numeroControle: string;
  readonly data: Date;
  readonly historico: string;
  readonly valor: string;
}

/** Os lançamentos manuais ainda não estornados — a lista curta que o formulário de estorno oferece. */
export async function lancamentosManuaisEstornaveis(): Promise<readonly LancamentoManualEstornavel[]> {
  await exigirLeituraDoEnte("CONSULTAR_CONTABILIDADE");
  const l = await cliente().lancamentoContabil.findMany({
    where: { origemTipo: ORIGEM_MANUAL, estornoDeId: null, estornos: { none: {} } },
    orderBy: { dataTransacao: "desc" },
    take: 200,
    select: { id: true, numeroControle: true, dataTransacao: true, historico: true, partidas: { where: { tipo: "DEBITO" }, select: { valor: true } } },
  });
  return l.map((x) => ({
    id: x.id,
    numeroControle: x.numeroControle,
    data: x.dataTransacao,
    historico: x.historico,
    // Σ dos débitos em Decimal (dinheiro nunca é number).
    valor: x.partidas.reduce((acc, p) => toMoney(acc.plus(toMoney(p.valor.toFixed(2)))), toMoney("0.00")).toFixed(2),
  }));
}
