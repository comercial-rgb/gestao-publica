import type { Metadata, Viewport } from "next";
import { Exo_2, Inter } from "next/font/google";
import { identidadePublica } from "../lib/portas/identidade";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

/** A fonte de títulos da marca Engine (V22). O texto corrido continua em Inter. */
const exo = Exo_2({
  subsets: ["latin"],
  display: "swap",
  // 900 é o peso dos títulos de destaque e dos números de painel no manual da marca.
  weight: ["600", "700", "800", "900"],
  variable: "--font-exo",
});

/** A cor da barra do navegador no celular: o laranja oficial da marca (manual Engine). */
export const viewport: Viewport = { themeColor: "#FE6902" };

/**
 * O TÍTULO DA ABA vem da identidade (V6 P0.1): "Gestão Pública · <ente>" — ou o ambiente,
 * quando não há ente configurado. Nunca um nome de prefeitura escrito no código.
 */
export async function generateMetadata(): Promise<Metadata> {
  const id = await identidadePublica();
  const complemento = id.ente?.nomeDeExibicao ?? id.rotuloDoAmbiente ?? id.produto.descricao;
  return {
    title: `${id.produto.nome} · ${complemento}`,
    description: id.ente !== null ? `${id.produto.descricao} — ${id.ente.nomeDeExibicao}.` : id.produto.descricao,
  };
}

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
    <html lang="pt-BR" className={`${inter.variable} ${exo.variable}`}>
      <body>{children}</body>
    </html>
  );
}
