import { type NextRequest, NextResponse } from "next/server";
import { imagemInstitucional } from "../../../lib/portas/identidade";

/**
 * A IMAGEM INSTITUCIONAL VIGENTE — pública (aparece antes do login), servida dos bytes
 * guardados na apresentação do ente. Nada é buscado fora: a imagem entrou pelo formulário
 * administrativo, validada pelos bytes (PNG/JPEG, 256 KiB). `?v=<versão>` só serve para o
 * cache: a resposta é sempre a vigente. GET não muda estado.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest): Promise<NextResponse> {
  const imagem = await imagemInstitucional();
  if (imagem === null) return new NextResponse(null, { status: 404 });
  return new NextResponse(Buffer.from(imagem.bytes), {
    status: 200,
    headers: {
      "content-type": imagem.mime,
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
