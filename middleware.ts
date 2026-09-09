import { NextResponse, type NextRequest } from "next/server";

/**
 * MIDDLEWARE — SÓ expõe o caminho atual num header (`x-pathname`), para o layout (Server Component)
 * montar o `?retorno=` do redirect de sessão expirada. NÃO toca banco (o Prisma não roda no edge)
 * — validar a sessão é papel do layout, com a borda. Um middleware que consultasse o banco a cada
 * request seria caro e frágil; este é uma linha de metadado.
 */
export function middleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  headers.set("x-pathname", request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // roda em tudo, menos assets estáticos e o próprio /_next.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
