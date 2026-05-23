import { NextRequest, NextResponse } from 'next/server'

const ADMIN_PROTECTED = ['/admin/tenants', '/admin/dashboard']
const TENANT_PROTECTED = ['/tenant']

// Rotas públicas (não precisam de auth)
const PUBLIC = ['/admin/login', '/login', '/']

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Skip APIs do Next, assets estáticos e rotas públicas
  if (
    pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    PUBLIC.includes(pathname)
  ) {
    return NextResponse.next()
  }

  const adminCookie = req.cookies.get('sm_admin_access')?.value
  const tenantCookie = req.cookies.get('sm_tenant_access')?.value

  // Modo estrito: bloqueia rotas privadas se cookie httpOnly ausente.
  if (ADMIN_PROTECTED.some((p) => pathname.startsWith(p)) && !adminCookie) {
    const url = req.nextUrl.clone()
    url.pathname = '/admin/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  if (TENANT_PROTECTED.some((p) => pathname.startsWith(p)) && !tenantCookie) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
