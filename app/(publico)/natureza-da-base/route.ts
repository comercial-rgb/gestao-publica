import { cliente } from "../../../lib/portas/cliente";
import { naturezaDaBase } from "../../../modules/m16-travamento/natureza-da-base";

/**
 * A NATUREZA DA BASE (V39-001/002) — o que o banco declara: OFICIAL, DEMONSTRACAO, ENSAIO ou NAO_DECLARADA.
 *
 * Quem pergunta é o percurso que grava (`scripts/percursos-navegador.ts`, `entrar`): ele recusa o que não for
 * demonstração ou ensaio. A resposta é a mesma que o rodapé já anuncia por ambiente; não devolve host, conexão nem
 * quem declarou. Falha de leitura responde 503 com NAO_DECLARADA — o percurso recusa, nunca presume.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cabecalhos = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
  try {
    const d = await naturezaDaBase(cliente());
    return new Response(JSON.stringify({ natureza: d.natureza, declaracao: d.numero }), { status: 200, headers: cabecalhos });
  } catch {
    return new Response(JSON.stringify({ natureza: "NAO_DECLARADA", declaracao: null }), { status: 503, headers: cabecalhos });
  }
}
