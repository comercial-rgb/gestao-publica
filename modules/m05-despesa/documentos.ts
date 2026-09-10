import { toMoney, type Money } from "../../packages/contracts/index.js";

/**
 * OS DOCUMENTOS DA DESPESA — nota de empenho, nota de liquidação e ordem de pagamento.
 * PURO: zero I/O, zero banco.
 *
 * ═══ ⚠️ POR QUE ELES EXISTEM COMO TEXTO CANÔNICO ═══
 * Até o ENT03a, só o borderô entrava na fila de assinaturas do M22 — e a assimetria era
 * arbitrária. A **nota de empenho** é o documento que o ordenador de despesa assina, e é
 * ela que o controle externo pede assinada; o borderô é instrumento bancário, e entrou
 * primeiro só porque foi o que o lote precisou.
 *
 * ═══ ⚠️ "CANÔNICO" É UMA EXIGÊNCIA, NÃO UM ADJETIVO ═══
 * Duas gerações do mesmo empenho têm de produzir **o mesmo byte**. Sem isso, o
 * `hashConteudo` da assinatura não tem resposta estável: reabrir o documento amanhã daria
 * outro hash, e "a assinatura confere?" viraria "depende de quando você perguntou".
 *
 * Por isso, aqui:
 *   · nada de `new Date()` — toda data vem do FATO, passada por quem chama;
 *   · nada de `toLocaleString` — o formato do número e da data é fixo e explícito, porque
 *     o *locale* da máquina que gerou o documento não pode entrar no conteúdo assinado;
 *   · nenhuma linha depende de ordem de chave de objeto.
 *
 * ═══ ⚠️ E NENHUM RÓTULO DE CATÁLOGO ENTRA AQUI ═══
 * O vocabulário é o de negócio — empenho, liquidação, ordem de pagamento, credor,
 * dotação. É documento operacional: ele vai para a mão de quem assina.
 */

/** Data no formato brasileiro, a partir do instante em UTC. Determinística. */
function dia(d: Date): string {
  const iso = d.toISOString().slice(0, 10);
  const [ano, mes, dd] = iso.split("-") as [string, string, string];
  return `${dd}/${mes}/${ano}`;
}

/** Valor com duas casas e separador de milhar — sem depender do locale da máquina. */
export function reais(v: Money): string {
  const [inteiro, centavos] = v.toFixed(2).split(".") as [string, string];
  const negativo = inteiro.startsWith("-");
  const digitos = negativo ? inteiro.slice(1) : inteiro;
  const comMilhar = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${comMilhar},${centavos}`;
}

/** Uma linha `rótulo: valor`, com o rótulo alinhado — o documento é lido por pessoas. */
function linha(rotulo: string, valor: string): string {
  return `${rotulo.padEnd(24, " ")}${valor}`;
}

function moldura(titulo: string, corpo: readonly string[]): string {
  const regua = "=".repeat(72);
  return [regua, titulo, regua, ...corpo, regua].join("\n");
}

export interface DadosDaNotaDeEmpenho {
  readonly numero: string;
  readonly data: Date;
  readonly tipo: string;
  readonly valor: Money;
  readonly credorCpfCnpj: string;
  readonly historico: string;
  readonly ficha: { readonly numero: number; readonly exercicio: number };
  readonly dotacao: string;
  readonly fonte: string;
}

export function conteudoDaNotaDeEmpenho(d: DadosDaNotaDeEmpenho): string {
  return moldura(`NOTA DE EMPENHO No ${d.numero}`, [
    linha("Data", dia(d.data)),
    linha("Tipo", d.tipo),
    linha("Ficha", `${d.ficha.numero}/${d.ficha.exercicio}`),
    linha("Dotacao", d.dotacao),
    linha("Fonte de recurso", d.fonte),
    linha("Credor", d.credorCpfCnpj),
    linha("Valor", reais(d.valor)),
    "",
    "Historico:",
    d.historico,
  ]);
}

export interface DadosDaNotaDeLiquidacao {
  readonly numero: string;
  readonly data: Date;
  readonly valor: Money;
  readonly responsavelAtesto: string;
  readonly empenho: {
    readonly numero: string;
    readonly valor: Money;
    /** `Liquidacao` não tem histórico próprio: o do fato é o do empenho. */
    readonly historico: string;
  };
  readonly credorCpfCnpj: string;
  /**
   * ⚠️ A NOTA FISCAL ENTRA QUANDO EXISTE, E A AUSÊNCIA É DITA.
   *
   * Nem toda liquidação tem NF (folha, diária, sentença) — o modelo a deixa opcional. Um
   * documento que simplesmente OMITISSE a linha quando não há nota deixaria quem assina
   * sem saber se a nota falta ou se ninguém a digitou. Aqui a linha aparece sempre, e
   * diz "nao informada" quando é o caso.
   */
  readonly notaFiscal:
    | { readonly numero: string; readonly serie: string | null; readonly data: Date | null }
    | null;
}

export function conteudoDaNotaDeLiquidacao(d: DadosDaNotaDeLiquidacao): string {
  const nf =
    d.notaFiscal === null
      ? "nao informada"
      : [
          d.notaFiscal.numero,
          d.notaFiscal.serie === null ? null : `serie ${d.notaFiscal.serie}`,
          d.notaFiscal.data === null ? null : `de ${dia(d.notaFiscal.data)}`,
        ]
          .filter((x): x is string => x !== null)
          .join(" · ");

  return moldura(`NOTA DE LIQUIDACAO No ${d.numero}`, [
    linha("Data", dia(d.data)),
    linha("Empenho", `${d.empenho.numero} (${reais(d.empenho.valor)})`),
    linha("Credor", d.credorCpfCnpj),
    linha("Valor liquidado", reais(d.valor)),
    // ⚠️ O ATESTO VAI NO DOCUMENTO. Quem assina a liquidação assina que o bem foi
    // entregue ou o serviço prestado — e quem atestou é parte do que se está afirmando.
    linha("Responsavel pelo atesto", d.responsavelAtesto),
    linha("Nota fiscal", nf),
    "",
    "Historico do empenho:",
    d.empenho.historico,
  ]);
}

export interface DadosDaOrdemDePagamento {
  readonly numero: string;
  readonly dataPrevista: Date;
  readonly valor: Money;
  readonly contaBancaria: string;
  readonly fonte: string;
  readonly historico: string;
  readonly liquidacao: { readonly numero: string };
  readonly empenho: { readonly numero: string };
  readonly credorCpfCnpj: string;
}

export function conteudoDaOrdemDePagamento(d: DadosDaOrdemDePagamento): string {
  return moldura(`ORDEM DE PAGAMENTO No ${d.numero}`, [
    linha("Data prevista", dia(d.dataPrevista)),
    linha("Empenho", d.empenho.numero),
    linha("Liquidacao", d.liquidacao.numero),
    linha("Credor", d.credorCpfCnpj),
    linha("Conta bancaria", d.contaBancaria),
    linha("Fonte de recurso", d.fonte),
    linha("Valor", reais(d.valor)),
    "",
    "Historico:",
    d.historico,
  ]);
}

/** Reexportado para quem monta os dados a partir de `Decimal`. */
export { toMoney };
