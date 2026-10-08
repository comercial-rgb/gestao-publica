"use server";

import { lerDebitosDosCredores } from "../../../../lib/portas/debitos-do-credor";
import { lerDisponivelDaFichaNaData } from "../../../../lib/portas/empenho";

/**
 * AS LEITURAS DO FORMULÁRIO DO EMPENHO, em arquivo próprio: nenhuma grava, então nenhuma passa pelo envelope de escrita
 * autenticada (a chave de comando). Ficam fora de `actions.ts` para a guarda da chave continuar contando ali só as
 * escritas. Quem autoriza cada leitura é a porta (leitura da despesa); se a consulta falhar, a tela DIZ que não
 * consultou ("indisponivel") — silêncio pareceria "sem débito" ou "saldo zero".
 */

/** V36 (TR 5.10.1.38) — os débitos do credor em dívida ativa, para o aviso. Quem soma é o M10. */
export async function debitosDoCredorAction(documento: string): Promise<{ readonly inscricoes: number; readonly saldo: string } | "indisponivel" | null> {
  try {
    const r = await lerDebitosDosCredores([documento]);
    return r[documento] ?? null;
  } catch {
    return "indisponivel";
  }
}

/** V36 (TR 5.10.1.10) — o disponível da ficha na data de emissão e o de agora. Quem soma é o M05. */
export async function disponivelNaDataAction(fichaId: string, dia: string): Promise<{ readonly naData: string; readonly atual: string } | "indisponivel" | null> {
  try {
    return await lerDisponivelDaFichaNaData(fichaId, dia);
  } catch {
    return "indisponivel";
  }
}
