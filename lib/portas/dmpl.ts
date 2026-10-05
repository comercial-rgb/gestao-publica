import { dmpl, type Dmpl } from "../../modules/m12-relatorios/dmpl.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";

export type { Dmpl, LinhaDaDmpl } from "../../modules/m12-relatorios/dmpl.js";

/** V35 — a Demonstração das Mutações no Patrimônio Líquido do exercício, lida do razão. */
export async function gerarDmpl(exercicio: number): Promise<Dmpl> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  return dmpl(cliente(), { exercicio });
}
