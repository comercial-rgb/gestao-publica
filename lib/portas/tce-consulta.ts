import { randomUUID } from "node:crypto";
import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";
import { POC_SAGRES } from "./sagres-poc";
import { criarRegistroDeOperacaoPrisma } from "../../modules/m16-travamento/operacao";
import { lerFatosEmpenhos } from "../../adapters/tribunais/tce-pb/sagres";
import { compararEmpenhos, criarGatewayTce, estadoDoModoTce, type LinhaComparacao, type ModoTce } from "../../adapters/tribunais/tce-pb/consulta";
import { instanteCivil } from "../../packages/datas/index";

export type { LinhaComparacao, SituacaoComparacao } from "../../adapters/tribunais/tce-pb/consulta";

/**
 * PORTA — API de CONSULTA TCE (S4). A tela consome ISTO (grep trivalente). Gateway SEPARADO do
 * Captura. Modo MOCK: fixtures conformes. Cada consulta é LOGADA (RegistroDeOperacao + correlation),
 * NUNCA com token. A comparação LÊ os dois lados (local × TCE), não recalcula.
 */

export interface ResultadoComparacaoTce {
  readonly modo: ModoTce;
  readonly correlationId: string;
  readonly rota: string;
  readonly linhas: readonly LinhaComparacao[];
  readonly resumo: { readonly iguais: number; readonly divergentes: number; readonly soLocal: number; readonly soTce: number };
}

/**
 * Compara os EMPENHOS locais (o DTO da S1, da massa POC) com o que o TCE devolve (MOCK). Loga a
 * consulta. É o conteúdo da tela de comparação.
 */
export async function compararEmpenhosLocalTce(): Promise<ResultadoComparacaoTce> {
  const ident = (await exigirSessao()).identificador;
  const prisma = cliente();
  const correlationId = randomUUID();
  const modo: ModoTce = "MOCK";

  // Local: os empenhos da massa POC (leitura). TCE: o gateway MOCK (fixtures conformes).
  const locais = await lerFatosEmpenhos(prisma, { codUnidadeGestora: POC_SAGRES.codUnidadeGestora, dia: instanteCivil(2026, 7, 10, 12, 0, 0) });
  const resposta = await criarGatewayTce(modo).consultar("empenhos", { codUnidadeGestora: POC_SAGRES.codUnidadeGestora, dataMinima: "2026-07-01", dataMaxima: "2026-07-31" });

  const linhas = compararEmpenhos(locais, resposta.registros);
  const resumo = {
    iguais: linhas.filter((l) => l.situacao === "IGUAL").length,
    divergentes: linhas.filter((l) => l.situacao === "DIVERGENTE").length,
    soLocal: linhas.filter((l) => l.situacao === "SO_LOCAL").length,
    soTce: linhas.filter((l) => l.situacao === "SO_TCE").length,
  };

  // LOG da borda — sem token (no MOCK não há; e o log NUNCA carrega credencial).
  await criarRegistroDeOperacaoPrisma(prisma).registrar({
    usuarioIdent: ident,
    acao: "CONSULTAR_TCE",
    resultado: "SUCESSO",
    detalhe: `rota=empenhos modo=${modo} corr=${correlationId} registros=${resposta.registros.length} divergentes=${resumo.divergentes}`,
  });

  return { modo, correlationId, rota: "empenhos", linhas, resumo };
}

/** O estado do modo (para o card da Central e o testConnection). */
export function estadoModoTce(): { modo: string; disponivel: boolean; mensagem: string } {
  return estadoDoModoTce("SANDBOX", false); // o que o SANDBOX faria hoje (sem token)
}
