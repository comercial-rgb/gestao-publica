import "dotenv/config";
import { mkdirSync } from "node:fs";
import { lancarNavegadorDoPercurso } from "./percursos-navegador.js";

/**
 * CAPTURAS DAS TELAS PÚBLICAS NOVAS (V9 N1/N2) — celular e desktop, sem credencial e sem sessão.
 *
 * ⚠️ AS DUAS LARGURAS, E NÃO POR CAPRICHO. A consulta de bens tem uma tabela de seis colunas; a
 * 390 px ela precisa rolar dentro do próprio contêiner, e é isso que se confere olhando. Um
 * `overflow-x` esquecido faz a PÁGINA inteira rolar de lado — e num celular isso é a diferença
 * entre consultar e desistir.
 *
 * ⚠️ E ELAS SÃO ANÔNIMAS. Nenhum login acontece aqui: o que a imagem mostra é o que qualquer
 * pessoa vê, que é justamente o ponto de uma tela de transparência.
 */

const BASE = process.argv[2] ?? "http://localhost:3010";
const PASTA = ".registro-de-execucao/capturas-v9";

const TELAS = [
  { nome: "portal-transparencia", rota: "/transparencia" },
  { nome: "bens-lista", rota: "/transparencia/bens" },
  { nome: "bens-lista-filtrada", rota: "/transparencia/bens?especie=MOVEL&ordem=aquisicao&direcao=desc" },
  { nome: "servicos", rota: "/servicos" },
] as const;

const LARGURAS = [
  { nome: "celular", width: 390, height: 844 },
  { nome: "desktop", width: 1280, height: 900 },
] as const;

mkdirSync(PASTA, { recursive: true });
/**
 * ⚠️ `domcontentloaded`, E NUNCA `networkidle0`. Medido em 16/09/2026: a captura de
 * `/transparencia/bens` estourou 60 s esperando a rede silenciar. Não era a página lenta — a
 * página responde em milissegundos; é que "rede ociosa" não chega nunca quando o servidor
 * mantém conexão aberta. Aumentar o tempo limite teria escondido isso e deixado a captura
 * levando minutos por tela. O que se espera é o DOM, e depois uma pausa curta e declarada para
 * a fonte e o SVG do rodapé assentarem.
 */
const assentar = (): Promise<void> => new Promise((r) => setTimeout(r, 400));

const navegador = await lancarNavegadorDoPercurso();
try {
  const page = await navegador.newPage();
  for (const largura of LARGURAS) {
    await page.setViewport({ width: largura.width, height: largura.height });
    for (const tela of TELAS) {
      await page.goto(`${BASE}${tela.rota}`, { waitUntil: "domcontentloaded", timeout: 60000 });
      await assentar();
      const arquivo = `${PASTA}/${tela.nome}-${largura.nome}.png`;
      await page.screenshot({ path: arquivo as `${string}.png`, fullPage: true });

      // ⚠️ A CONFERÊNCIA QUE A IMAGEM SOZINHA NÃO FAZ: a página rola de lado? Uma captura de
      // página inteira ESCONDE isso — ela alarga o viewport para caber tudo.
      const rolaDeLado = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      console.log(`[captura] ${arquivo}${rolaDeLado ? "  ⚠️ A PÁGINA ROLA DE LADO NESTA LARGURA" : ""}`);
      if (rolaDeLado) process.exitCode = 1;
    }
  }
  // O detalhe precisa de um id de verdade — vem da própria lista.
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(`${BASE}/transparencia/bens`, { waitUntil: "domcontentloaded" });
  const href = await page.evaluate(() => (document.querySelector("[data-bem] a") as HTMLAnchorElement | null)?.getAttribute("href") ?? "");
  if (href !== "") {
    for (const largura of LARGURAS) {
      await page.setViewport({ width: largura.width, height: largura.height });
      for (const aba of ["geral", "localizacao", "movimentacoes"]) {
        await page.goto(`${BASE}${href.split("?")[0]}?aba=${aba}`, { waitUntil: "domcontentloaded", timeout: 60000 });
        await assentar();
        const arquivo = `${PASTA}/bem-detalhe-${aba}-${largura.nome}.png`;
        await page.screenshot({ path: arquivo as `${string}.png`, fullPage: true });
        const rolaDeLado = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        console.log(`[captura] ${arquivo}${rolaDeLado ? "  ⚠️ A PÁGINA ROLA DE LADO NESTA LARGURA" : ""}`);
        if (rolaDeLado) process.exitCode = 1;
      }
    }
  }
} finally {
  await navegador.close();
}
