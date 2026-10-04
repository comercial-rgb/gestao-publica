import type { MetadataRoute } from "next";
import { PRODUTO } from "../lib/identidade/produto";

/**
 * O MANIFESTO DO APLICATIVO — o nome é o do PRODUTO (nunca o de um ente, que vem do cadastro e não
 * cabe num arquivo estático) e os ícones são os oficiais da Engine, copiados sem alteração do kit
 * de marca (ver `public/marca/ORIGEM.md`). A cor de tema é o laranja oficial da marca.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PRODUTO.nome,
    short_name: PRODUTO.nome,
    description: PRODUTO.descricao,
    start_url: "/",
    display: "standalone",
    theme_color: "#FE6902",
    background_color: "#FEFEFE",
    lang: "pt-BR",
    icons: [
      { src: "/marca/engine-pwa-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/marca/engine-pwa-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/marca/engine-pwa-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/marca/engine-pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
