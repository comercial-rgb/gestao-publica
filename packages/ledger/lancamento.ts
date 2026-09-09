import type { Money } from "../contracts/index.js";

/**
 * DOMAIN PURO — zero I/O. Tipos do motor de partidas dobradas.
 *
 * PERNA ÚNICA (INVARIANTE 4): cada Partida toca UMA conta, como DEBITO ou
 * CREDITO — nunca os dois. O balanceamento (ΣDEBITO == ΣCREDITO) passa a ser
 * um invariante REAL a validar, e não uma consequência estrutural do formato.
 *
 * INVARIANTE 2 (append-only): estes tipos são imutáveis (readonly).
 * Correção/estorno = novo lançamento referenciando o original.
 */

export type TipoPartida = "DEBITO" | "CREDITO";

/** Subsistemas contábeis do MCASP. Cada um se equilibra sozinho. */
export type Subsistema = "ORCAMENTARIO" | "PATRIMONIAL" | "CONTROLE";

export const SUBSISTEMAS: readonly Subsistema[] = [
  "ORCAMENTARIO",
  "PATRIMONIAL",
  "CONTROLE",
] as const;

/** Uma perna do lançamento: uma conta, um tipo, um valor. */
export interface Partida {
  /** Código hierárquico PCASP da conta. Só conta ANALÍTICA recebe partida. */
  readonly conta: string;
  readonly tipo: TipoPartida;
  readonly subsistema: Subsistema;
  /** SEMPRE Decimal — nunca number (INVARIANTE 1). */
  readonly valor: Money;
}

export interface LancamentoContabil {
  readonly id: string;
  /**
   * Agrupa o fato contábil (TR pág. 2, item 2.5). NÃO é único: um mesmo fato
   * pode gerar lançamentos em subsistemas distintos sob o mesmo número.
   */
  readonly numeroControle: string;
  readonly partidas: readonly Partida[];
  /**
   * A data do FATO — e ela é a ÚNICA data de negócio do lançamento.
   *
   * ⚠️ NÃO HÁ `competencia` AQUI, e a ausência é uma decisão: ela existia, era herdada pelos
   * estornos, divergia desta, e NINGUÉM a lia. Tudo neste repositório corta por
   * `dataTransacao` — o travamento (M16), a MSC (M14), os balanços (M12). A competência
   * contábil real (fato gerador) renasce no 5.87/5.88, na entidade dona, com leitor nomeado.
   */
  readonly dataTransacao: Date;
  readonly historico: string;
  /** Se este lançamento É um estorno, aponta para o original. Imutável. */
  readonly estornoDeId?: string;
  /**
   * INVARIANTE 3: ids dos lançamentos que estornam ESTE. DERIVADO da relação
   * inversa `estornos` — não existe campo `estornadoPorId` no original, porque
   * marcá-lo exigiria um UPDATE nele.
   * "Está estornado?" == `estornos.length > 0`.
   */
  readonly estornos: readonly string[];
}
