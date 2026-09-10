import { type NextRequest, NextResponse } from "next/server";
import {
  entregarLoteDaPessoa,
  entregarLoteDoProcesso,
  type LoteDeAnexos,
} from "../../../../lib/portas/documentos";

/**
 * DOWNLOAD EM LOTE — um .zip com os anexos de um processo ou de uma pessoa.
 *
 * ═══ ⚠️ O LOTE NÃO É UM ATALHO PARA FORA DA AUTORIZAÇÃO ═══
 * Ele monta o zip com exatamente os arquivos que a rota individual entregaria, um a um,
 * para ESTE usuário — a mesma pergunta ao mesmo registro dono. Um lote que consultasse a
 * tabela direto seria a segunda verdade sobre o acesso que o M22 recusa desde o cabeçalho
 * do schema, e ela vazaria em bloco, que é pior do que vazar um arquivo.
 *
 * ⚠️ SEM ANEXOS E SEM PERMISSÃO DÃO A MESMA RESPOSTA: 404. Distingui-los diria a quem
 * varre identificadores quais processos existem e quais têm documentos — que é metade do
 * que se quer esconder num processo sigiloso.
 *
 * ⚠️ O `dono` VEM NA QUERY, E É ELE QUEM DECIDE A REGRA. `?processo=<id>` pergunta ao M21;
 * `?pessoa=<id>` pergunta ao cadastro do ENTE. Uma rota só com um parâmetro `id` genérico
 * obrigaria o servidor a ADIVINHAR de quem é o id — e adivinhar errado, aqui, é aplicar a
 * regra de acesso do registro errado.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const processoId = req.nextUrl.searchParams.get("processo");
  const pessoaId = req.nextUrl.searchParams.get("pessoa");

  const informados = [processoId, pessoaId].filter(
    (v) => v !== null && v !== ""
  ).length;
  if (informados !== 1) {
    return NextResponse.json(
      {
        erro:
          "Informe EXATAMENTE um dono do lote: ?processo=<id> ou ?pessoa=<id>. Sem dono " +
          "não há regra de acesso a aplicar; com dois, não se sabe qual delas vale.",
      },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  let lote: LoteDeAnexos | null;
  try {
    lote =
      processoId !== null && processoId !== ""
        ? await entregarLoteDoProcesso(processoId)
        : await entregarLoteDaPessoa(pessoaId as string);
  } catch (e) {
    // Teto do lote estourado, ou integridade de um dos arquivos. As duas mensagens foram
    // escritas para quem lê — e a segunda é um incidente que alguém precisa ver.
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao montar o lote." },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }

  if (lote === null) {
    return NextResponse.json(
      { erro: "Nenhum anexo a baixar." },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  }

  return new NextResponse(new Uint8Array(lote.zip), {
    status: 200,
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${lote.nome}"`,
      "content-length": String(lote.zip.byteLength),
      "x-content-type-options": "nosniff",
      "x-anexos-no-lote": String(lote.arquivos),
      "cache-control": "no-store, private",
    },
  });
}
