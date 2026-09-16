import { consultaDoSuperavit as compor, type ConsultaDoSuperavit } from "../../modules/m12-relatorios/consulta-do-superavit.js";
import { cliente } from "./cliente";

/**
 * A PORTA DA CONSULTA DO SUPERÁVIT (V11 V3.1) — fina de propósito.
 *
 * A composição (apurado dos fatos × declarado × utilizado) mora no M12, que já é quem responde
 * a pergunta do superávit ao M03. Aqui só entra o que precisa do servidor: o client.
 */
export type { ConsultaDoSuperavit, LinhaDaConsultaDoSuperavit } from "../../modules/m12-relatorios/consulta-do-superavit.js";

export async function consultaDoSuperavit(exercicio: number): Promise<ConsultaDoSuperavit> {
  return compor(cliente(), exercicio);
}
