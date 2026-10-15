import { paraCsv } from "../../../../lib/csv/csv";
import { lerConsulta, TAMANHO_DE_PAGINA, type ParametrosBrutos } from "../../../../lib/molde/consulta";
import type { LinhaDoMolde } from "../../../../lib/molde/tipos";
import { EXPORTACOES_DO_MOLDE } from "../../../../lib/portas/recursos/exportacao";

/**
 * V39-R3 (R3-029) — O CSV DO CONJUNTO FILTRADO INTEIRO de uma lista do molde, não só da página visível.
 *
 * ⚠️ A MESMA LEITURA DA TELA: a mesma ação de consulta, o mesmo lister, os mesmos filtros e a mesma ordem, lidos página
 * a página até o total que o próprio lister informa. Nenhuma consulta nova, nenhuma segunda regra de filtro.
 * ⚠️ E O ARQUIVO CONFERE A SI MESMO antes de sair: as linhas lidas, sem repetição pelo identificador, têm de ser
 * exatamente o total. Se o conjunto mudou durante a leitura (alguém gravou no meio), a rota RECUSA com o motivo em vez de
 * entregar um arquivo com linha faltando ou repetida. Acima do teto, recusa dizendo quanto há e como recortar.
 * `GET` só lê.
 */
export const dynamic = "force-dynamic";

const TETO_DE_LINHAS = 20000;
const texto = (corpo: string, status: number): Response => new Response(corpo, { status, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });

export async function GET(req: Request, { params }: { readonly params: Promise<{ readonly recurso: string }> }): Promise<Response> {
  const { recurso } = await params;
  const exportacao = EXPORTACOES_DO_MOLDE[recurso];
  if (exportacao === undefined) return texto("Esta lista não tem exportação.", 404);
  const listar = await exportacao.abrir();
  const d = exportacao.definicao;
  const brutos: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => {
    brutos[k] = v;
  });
  const consulta = lerConsulta(d, brutos as ParametrosBrutos);

  const primeira = await listar({ ...consulta, pagina: 1 });
  const total = primeira.total;
  if (total > TETO_DE_LINHAS) {
    return texto(`A consulta tem ${total.toLocaleString("pt-BR")} linhas, acima do limite de ${TETO_DE_LINHAS.toLocaleString("pt-BR")} por arquivo. Use os filtros da lista para recortar o conjunto e exporte de novo.`, 413);
  }
  const linhas: LinhaDoMolde[] = [...primeira.linhas];
  const paginas = Math.ceil(total / TAMANHO_DE_PAGINA);
  for (let p = 2; p <= paginas; p += 1) linhas.push(...(await listar({ ...consulta, pagina: p })).linhas);
  const ids = new Set(linhas.map((l) => l.id));
  if (ids.size !== total || linhas.length !== total) {
    return texto("O conjunto mudou enquanto o arquivo era montado (houve gravação no meio da leitura). Nada foi exportado; exporte de novo.", 409);
  }

  const csv = paraCsv(
    d.colunas.map((c) => c.cabecalho),
    linhas.map((l) => d.colunas.map((c) => l[c.nome] ?? ""))
  );
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${d.nome}.csv"`,
      "cache-control": "no-store",
    },
  });
}
