import { type NextRequest, NextResponse } from "next/server";
import { exigirLeituraEmAlgumEscopoPara } from "../../../../lib/portas/leitura";
import { buscarOpcoes, CatalogoInexistenteError, LeituraDoCatalogoNegadaError, leituraDoCatalogo } from "../../../../lib/portas/opcoes-referenciadas";
import { sessaoAtual } from "../../../../lib/portas/sessao";
import { respostaDaRecusaDeLeitura } from "../../../../lib/rotas/recusa";

/**
 * AS OPÇÕES DO SELETOR REFERENCIADO — leitura paginada e autorizada (V6.2 U0).
 *
 * ⚠️ GET PURO: pesquisa, não reserva, não grava. `no-store` porque a resposta depende de QUEM pede
 * (a UO de uma ficha nova só entre as unidades dele) e um cache compartilhado a entregaria a outro.
 *
 * ⚠️ 401 SEM SESSÃO, e não redirecionamento: quem chama é o `fetch` da ilha, e um 307 para o login
 * chegaria a ela como uma página HTML "de sucesso".
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_CACHE = { "cache-control": "no-store" } as const;

export async function GET(req: NextRequest, ctx: { readonly params: Promise<{ readonly catalogo: string }> }): Promise<NextResponse> {
  const sessao = await sessaoAtual();
  if (sessao === null) return NextResponse.json({ erro: "Sessão encerrada. Entre de novo para consultar as opções." }, { status: 401, headers: SEM_CACHE });
  const { catalogo } = await ctx.params;
  const leitura = leituraDoCatalogo(catalogo);
  if (leitura === null) return NextResponse.json({ erro: `Não há lista de opções chamada "${catalogo}".` }, { status: 404, headers: SEM_CACHE });
  // ⚠️ A LEITURA DO CATÁLOGO, ANTES DE QUALQUER PARÂMETRO — o mesmo gate das outras rotas. A busca
  // confere de novo lá dentro: a rota não é o único caminho até a porta.
  try {
    await exigirLeituraEmAlgumEscopoPara(sessao, leitura);
  } catch (e) {
    const recusa = respostaDaRecusaDeLeitura(e);
    if (recusa !== null) return recusa;
    throw e;
  }
  const sp = req.nextUrl.searchParams;
  const contexto: Record<string, string> = {};
  for (const [k, v] of sp.entries()) if (k.startsWith("ctx.")) contexto[k.slice(4)] = v;
  const valor = sp.get("valor");
  try {
    const r = await buscarOpcoes(sessao, catalogo, {
      q: sp.get("q") ?? "",
      pagina: Number.parseInt(sp.get("pagina") ?? "1", 10) || 1,
      ...(valor !== null && valor !== "" ? { valor } : {}),
      contexto,
    });
    return NextResponse.json(r, { headers: SEM_CACHE });
  } catch (e) {
    if (e instanceof CatalogoInexistenteError) return NextResponse.json({ erro: e.message }, { status: 404, headers: SEM_CACHE });
    if (e instanceof LeituraDoCatalogoNegadaError) return NextResponse.json({ erro: e.message }, { status: 403, headers: SEM_CACHE });
    throw e;
  }
}
