import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "SIAFIC — Campina Grande",
  description:
    "Sistema de Informações de Administração Financeira, Orçamentária e Contábil — Prefeitura de Campina Grande/PB.",
};

/**
 * LAYOUT RAIZ — só `html/body` e os estilos. O SHELL (sidebar/header) vive no layout do grupo
 * `(areas)`, que EXIGE sessão — assim o `/login` (fora do grupo) não herda o shell nem o loop de
 * redirect.
 *
 * ═══ ⚠️ O `UiContextProvider` SAIU DAQUI, E O MOTIVO É UM LOOP ═══
 * Enquanto as opções eram MOCK, montar o provider na raiz era inofensivo: constantes locais não
 * precisam de sessão. Agora elas vêm de `carregarContextoDoUsuario()`, que chama `exigirSessao()`
 * — e `exigirSessao` REDIRECIONA para `/login` quando não há sessão.
 *
 * Na raiz, isso poria o `/login` a redirecionar para `/login`, indefinidamente: a página de entrada
 * do sistema ficaria inacessível para exatamente quem precisa dela. O provider passou para o layout
 * de `(areas)`, que já é a fronteira de sessão e onde a pergunta "quais UGs este usuário pode ver?"
 * tem resposta.
 */
export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
