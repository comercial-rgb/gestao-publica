import { type NextRequest, NextResponse } from "next/server";
import { recorteDePagina, type RecorteDaPagina } from "../../../../../lib/portas/contexto";
import { faseDoFiltro, lerAPagar, origemDoFiltro, ROTULO_DA_FASE } from "../../../../../lib/portas/a-pagar";
import { respostaDaRecusaDeLeitura } from "../../../../../lib/rotas/recusa";
import { emitir, montarPdfAPagar } from "../../../../../lib/pdf/operacionais";
import { formatarDocumento } from "../../../../../packages/documento/index";

/**
 * V33 — A PAGAR EM PDF. A MESMA autorização (CONSULTAR_DESPESA, recorte de unidade de quem lê), os MESMOS filtros
 * (credor, fase, origem) e a MESMA leitura (`lerAPagar`) da tela; o motor de PDF é o único do sistema.
 * ⚠️ nodejs runtime: o puppeteer é Node, nunca edge.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  let recorte: RecorteDaPagina;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const credor = (sp["credor"] ?? "").replace(/\D/g, "");
  const fase = faseDoFiltro(sp["fase"] ?? "");
  const origem = origemDoFiltro(sp["origem"] ?? "");
  const dados = await lerAPagar({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo, fase, origem, ...(credor !== "" ? { credorCpfCnpj: credor } : {}) });
  const filtros = [
    credor !== "" ? `Credor: ${dados.opcoesDeCredor.find((o) => o.documento === credor)?.nome ?? formatarDocumento(credor)}` : null,
    fase !== "" ? `Fase: ${ROTULO_DA_FASE[fase].toLowerCase()}` : null,
    origem !== "" ? `Origem: ${origem === "exercicio" ? "só o exercício" : "só restos a pagar"}` : null,
  ].filter((f): f is string => f !== null);
  const doc = await montarPdfAPagar(dados, { unidade: recorte.unidadeCodigo !== undefined ? `Unidade orçamentária ${recorte.unidadeCodigo}` : undefined, filtros });
  const r = await emitir(doc, `a-pagar-${String(recorte.exercicio)}`);
  return new NextResponse(Buffer.from(r.pdf), {
    status: 200,
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${r.nomeArquivo}"`, "cache-control": "no-store" },
  });
}
