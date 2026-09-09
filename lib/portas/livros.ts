import { cliente, PortaSemBancoError } from "./cliente";
import {
  balancete,
  diario,
  razaoAnalitico,
  type Balancete,
  type FiltrosDoDiario,
  type LancamentoDoDiario,
  type RazaoAnalitico,
} from "../../modules/m12-relatorios/livros";

/**
 * PORTA — LIVROS OBRIGATÓRIOS (Diário, Razão analítico, Balancete). Os motores já existem desde
 * 3b13574; esta borda só os liga à tela. Mesma disciplina das outras portas: dinheiro em string,
 * cliente compartilhado, `PortaSemBancoError` nomeado. Zero mudança no domínio.
 */

export { PortaSemBancoError };

/**
 * O DIÁRIO — todo lançamento da janela, em ordem cronológica estável, com filtros opcionais.
 *
 * ⚠️ CADA LANÇAMENTO TRAZ `origemTipo` **E** `origemId` (este último aditivo). O tipo diz a espécie
 * do fato; o id diz QUAL documento. É o par que permite o drill da consulta analítica de
 * `/contabilidade/lancamentos` — a rota de destino é escolhida por quem apresenta, não aqui.
 */
export async function gerarDiario(p: {
  readonly desde: Date;
  readonly ate: Date;
  readonly filtros?: FiltrosDoDiario;
}): Promise<readonly LancamentoDoDiario[]> {
  return diario(cliente(), { desde: p.desde, ate: p.ate }, p.filtros ?? {});
}

/** O RAZÃO de UMA conta: saldo anterior, cada movimento com saldo corrente, saldo final. */
export async function gerarRazao(p: {
  readonly conta: string;
  readonly desde: Date;
  readonly ate: Date;
}): Promise<RazaoAnalitico> {
  return razaoAnalitico(cliente(), p.conta, { desde: p.desde, ate: p.ate });
}

/** O BALANCETE de verificação — analítico ou sintético; `fecha` nomeia diferença se não bater. */
export async function gerarBalancete(p: {
  readonly desde: Date;
  readonly ate: Date;
  readonly modo: "ANALITICO" | "SINTETICO";
}): Promise<Balancete> {
  return balancete(cliente(), { desde: p.desde, ate: p.ate, modo: p.modo });
}

export type { Balancete, LancamentoDoDiario, RazaoAnalitico, FiltrosDoDiario };
/**
 * OS TOTAIS POR SUBSISTEMA — reexportados do M12, nunca recalculados aqui.
 *
 * ⚠️ A TENTAÇÃO É SOMAR NA TELA. Ela parece inofensiva (é só um `reduce`), e é assim que
 * nasce a segunda aritmética do razão: no dia em que o módulo mudar o corte por natureza
 * ou o tratamento do estorno, a tela continuará somando do jeito antigo — e vai discordar
 * do relatório, com a mesma cara de certeza.
 */
export { totaisPorSubsistema } from "../../modules/m12-relatorios/livros";
export type { TotalDeSubsistema } from "../../modules/m12-relatorios/livros";
export type { LinhaDoRazao } from "../../modules/m12-relatorios/livros";
export type { LinhaDoBalancete } from "../../modules/m12-relatorios/livros";
export type { PartidaDoDiario } from "../../modules/m12-relatorios/livros";
