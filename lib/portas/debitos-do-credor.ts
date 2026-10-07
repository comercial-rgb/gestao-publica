import { cliente } from "./cliente";
import { exigirLeituraEmAlgumEscopo } from "./leitura";
import { debitosInscritosDosDocumentos } from "../../modules/m10-patrimonial/divida-ativa";

/** Um débito do credor como a tela o mostra — dinheiro em string. */
export interface DebitoDoCredor {
  readonly inscricoes: number;
  readonly saldo: string;
}

/**
 * V36 (TR 5.10.1.38) — os débitos inscritos em dívida ativa dos credores pedidos, para o AVISO na emissão do empenho,
 * da liquidação e do pagamento. Cobra a leitura da despesa (é a quem emite que o aviso serve); a conta é do M10.
 */
export async function lerDebitosDosCredores(documentos: readonly string[]): Promise<Readonly<Record<string, DebitoDoCredor>>> {
  await exigirLeituraEmAlgumEscopo("CONSULTAR_DESPESA");
  const m = await debitosInscritosDosDocumentos(cliente(), documentos);
  return Object.fromEntries([...m.entries()].map(([doc, d]) => [doc, { inscricoes: d.inscricoes, saldo: d.saldo.toFixed(2) }]));
}
