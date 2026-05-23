import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'SaaS Municipal — Gestão Pública',
  description: 'Sistema integrado para gestão municipal (Lei 14.133/2021)',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
