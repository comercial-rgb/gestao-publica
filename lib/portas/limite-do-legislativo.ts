import { apurarLimiteDoLegislativo, declararParametroDoLimiteDoLegislativo, type ApuracaoDoLimite } from "../../modules/m12-relatorios/limite-do-legislativo.js";
import { diaCivil, fimDoDiaCivil } from "../../packages/datas/index.js";
import { cliente } from "./cliente";
import { exigirLeituraDoEnte } from "./leitura";
import { comEscritaAutenticada } from "./sessao";

/** V35 — o limite do repasse ao Legislativo (CF 29-A) na tela: apuração até hoje (ou 31/12 de exercício passado). */
export async function lerLimiteDoLegislativo(exercicio: number): Promise<ApuracaoDoLimite> {
  await exigirLeituraDoEnte("CONSULTAR_RELATORIOS");
  const hoje = diaCivil(new Date());
  const ate = Number(hoje.slice(0, 4)) > exercicio ? fimDoDiaCivil(`${String(exercicio)}-12-31`) : fimDoDiaCivil(hoje);
  return apurarLimiteDoLegislativo(cliente(), { exercicio, ate });
}

export async function declararLimite(input: {
  readonly exercicio: number;
  readonly populacao: number;
  readonly fontePopulacao: string;
  readonly baseDeclarada: string | null;
  readonly documentoDaBase: string | null;
}): Promise<string> {
  const r = await comEscritaAutenticada("CADASTRAR_LINHA_DEMONSTRATIVO", (criadoPor) => declararParametroDoLimiteDoLegislativo(cliente(), { ...input, criadoPor }));
  return `Parâmetros do limite de ${String(input.exercicio)} declarados (versão ${String(r.versao)}).`;
}
