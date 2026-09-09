// A FILA É DO M06 e o DATASET MENSAL é do M12. O M13 REEXPÕE — ele não recalcula, não
// reordena e não recorta. Ver a identidade provada no teste (t7).
import {
  ordemCronologicaMensal,
  type OrdemCronologicaMensal,
} from "../m12-relatorios/ordem-cronologica.js";
import { identificarDocumento, type LinhaSerializada } from "./dominio.js";

/**
 * ORDEM CRONOLÓGICA — A REEXPOSIÇÃO DO §3º (Lei 14.133/2021, art. 141; TR 5.34).
 *
 * ═══ ISTO É UMA IDENTIDADE, NÃO UMA CÓPIA ═══
 * `datasetOrdemCronologica === ordemCronologicaMensal`. A MESMA função, exportada pelo
 * portal. Não há wrapper que "adapte" nada, porque um wrapper é o lugar onde a cópia
 * começa: um dia alguém filtra ali, ou reordena, e o portal passa a publicar uma fila
 * que não é a fila. O M12 já disse, no cabeçalho dele, que "a UI/portal é o M13" — o
 * M13 apenas cumpre a palavra.
 *
 * ═══ MAS A SERIALIZAÇÃO É DAQUI, E ELA MASCARA ═══
 * ⚠️ ACHADO DO PASSO 0: o dataset do §3º carrega `credorCpfCnpj` EM CLARO. Faz sentido —
 * ele é um relatório INTERNO (o TCE e o controle interno precisam do documento inteiro
 * para apurar preterição, §2º). Reexpor esse objeto CRU num portal público vazaria CPF
 * de pessoa física, em lote, ordenado por quem ainda não recebeu.
 *
 * A fronteira é aqui: quem PUBLICA mascara. O relatório do M12 continua íntegro para
 * quem tem direito a ele; o portal recebe o mesmo fato com o documento tratado.
 */
export const datasetOrdemCronologica = ordemCronologicaMensal;
export type { OrdemCronologicaMensal };

/** O documento como o portal pode publicá-lo. `null` = não publicável (fail-closed). */
function documentoPublicavel(bruto: string): string | null {
  return identificarDocumento(bruto)?.documento ?? null;
}

export interface OrdemCronologicaPublicada {
  readonly filas: readonly LinhaSerializada[];
  readonly quebras: readonly LinhaSerializada[];
}

/**
 * A MESMA função de serialização para o JSON e para o CSV — uma verdade, dois formatos.
 * `Decimal` já chega como string (`Dinheiro`, do M12); as datas viram ISO aqui.
 */
export function serializarOrdemCronologica(
  d: OrdemCronologicaMensal
): OrdemCronologicaPublicada {
  const filas: LinhaSerializada[] = [];
  for (const f of d.filas) {
    for (const item of f.itens) {
      filas.push({
        ano: String(d.ano),
        mes: String(d.mes).padStart(2, "0"),
        fonteCodigo: f.fonteCodigo,
        categoria: f.categoria,
        posicao: String(item.posicao),
        numeroLiquidacao: item.numeroLiquidacao,
        numeroEmpenho: item.numeroEmpenho,
        credorDocumento: documentoPublicavel(item.credorCpfCnpj),
        dataExigibilidade: item.dataExigibilidade.toISOString(),
        valorAPagar: item.valorAPagar,
        diasNaFila: String(item.diasNaFila),
      });
    }
  }

  const quebras: LinhaSerializada[] = d.quebras.map((q) => ({
    ano: String(d.ano),
    mes: String(d.mes).padStart(2, "0"),
    numeroLiquidacao: q.numeroLiquidacao,
    credorDocumento: documentoPublicavel(q.credorCpfCnpj),
    hipotese: q.hipotese,
    justificativa: q.justificativa,
    autorizadoPor: q.autorizadoPor,
    registradaEm: q.registradaEm.toISOString(),
    posicaoNaEpoca: q.posicaoNaEpoca === null ? null : String(q.posicaoNaEpoca),
    // §2º — QUEM foi preterido. Sem isto, a justificativa é um texto solto.
    preteridaNumeroLiquidacao: q.preterida?.numeroLiquidacao ?? null,
    preteridaValorAPagar: q.preterida?.valorAPagar ?? null,
  }));

  return { filas, quebras };
}
