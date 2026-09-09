/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // O commit curto do build vai para o rodapé (via env — o build o injeta).
  env: {
    NEXT_PUBLIC_BUILD_COMMIT: process.env.NEXT_PUBLIC_BUILD_COMMIT ?? "dev",
  },

  // ⚠️ O puppeteer roda no servidor (a impressão de PDF dos demonstrativos, TR 7.5/5.120) e NUNCA
  // no bundle: ele carrega o Chromium por caminho de arquivo, e empacotá-lo quebraria o build. Marca
  // como externo — o Node o resolve de `node_modules` em runtime, do lado do servidor.
  serverExternalPackages: ["puppeteer"],

  // ⚠️ O DOMÍNIO É NodeNext — imports com `.js` que resolvem `.ts`. O webpack do Next NÃO faz esse
  // mapeamento sozinho (o tsc faz, o webpack não), então uma porta que importa `modules/**` quebra
  // o build com "Can't resolve './razao.js'". `extensionAlias` ensina o webpack a resolver `.js`
  // para os fontes `.ts`/`.tsx` — o mesmo mapeamento do NodeNext, do lado do bundler. Sem isto, a
  // borda `lib/portas/**` (a única que importa o domínio) não compila.
  webpack(config) {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};
export default nextConfig;
