/**
 * OS TIPOS COMPARTILHADOS DOS DEMONSTRATIVOS SIMPLIFICADOS (RGF Anexo 6, RREO Anexo 14).
 *
 * ═══ ⚠️ A DOUTRINA: UM DONO, ZERO RECÁLCULO ═══
 * O simplificado é uma CAPA. Cada linha LÊ um campo de um motor analítico (o dono do número) e o
 * repete — nunca reabre a conta. Se o simplificado recalculasse o percentual da dívida, ele
 * PODERIA divergir do Anexo 2 no dia em que a fórmula mudasse num só lugar, e o cidadão veria dois
 * números para a mesma coisa. Por isso os campos aqui são os MESMOS strings que o motor de origem
 * serializou, e o `situacao` é DERIVADO dos mesmos booleanos de limite — o simplificado nunca
 * discorda do analítico porque não tem opinião própria.
 */

/**
 * O estado de um limite — o mesmo que os Badges dos anexos analíticos exibem.
 * ⚠️ TETO e PISO falham em direções OPOSTAS: um teto estourado é "excedido"; um piso não atingido é
 * "insuficiente". Os dois são vermelhos, mas a palavra importa — dizer "acima do limite" para um
 * mínimo de saúde não atingido seria mentira.
 */
export type SituacaoLimite = "ok" | "alerta" | "excedido" | "insuficiente" | "neutro";

export interface LinhaSimplificada {
  readonly chave: string;
  readonly rotulo: string;
  /** O anexo de origem — "o detalhe mora lá". */
  readonly fonte: string;
  /** O caminho do anexo de origem, para o link. */
  readonly fonteHref: string;
  readonly valor: string;
  /** `null` quando a linha não tem percentual (valor puro) ou a base é zero. */
  readonly percentual: string | null;
  /** `null` quando a linha não tem limite (linha informativa). */
  readonly limite: string | null;
  /** `null` quando a linha não julga limite (informativa/parâmetro sem base). */
  readonly situacao: SituacaoLimite | null;
  /** `true` quando é interruptor vazio nomeado (sem cadastro/fato). */
  readonly interruptor: boolean;
}

/**
 * O estado de um limite-TETO (dívida, garantias, operações de crédito) a partir dos MESMOS
 * booleanos que o anexo de origem calculou. Não recomputa faixa nenhuma — só traduz.
 */
export function situacaoDeTeto(
  excedeu: boolean | null,
  emAlerta: boolean | null
): SituacaoLimite {
  if (excedeu === true) return "excedido";
  if (emAlerta === true) return "alerta";
  if (excedeu === false) return "ok";
  return "neutro"; // sem RCL — não há limite a medir
}

/**
 * O estado de um limite-PISO (educação/saúde usam "atingiu o mínimo").
 * Um piso NÃO atingido é violação (vermelho) — mas "insuficiente", não "excedido".
 */
export function situacaoDePiso(atingiu: boolean): SituacaoLimite {
  return atingiu ? "ok" : "insuficiente";
}

/** A faixa do limite de pessoal, já calculada pelo Anexo 1 (abaixo/alerta/acima). Só traduz. */
export function situacaoDePessoal(faixa: "abaixo" | "alerta" | "acima"): SituacaoLimite {
  if (faixa === "abaixo") return "ok";
  if (faixa === "acima") return "excedido";
  return "alerta";
}
