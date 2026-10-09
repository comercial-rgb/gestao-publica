import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — O CASCO NÃO VAZA: a janela não rola; quem rola é o conteúdo. Um elemento `absolute` sem ancestral posicionado
 * (o texto `sr-only` das caixas de seleção da tabela de fichas) se posicionava pelo documento, escapava da rolagem do
 * `main` e esticava a página: o casco subia e sobrava uma faixa branca abaixo do rodapé. Mede a altura rolável do
 * documento contra a da janela em telas com tabelas longas, em duas larguras. Só leitura.
 *
 * Uso: BASE=http://localhost:3011 SEED_ADMIN_SENHA=... npx tsx scripts/percurso-v37-casco-sem-vazamento.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const ROTAS = [
  "/planejamento/fichas?exercicio=2026",
  "/planejamento/qdd?exercicio=2026",
  "/planejamento/loa/vinculo-ppa?exercicio=2026",
  "/despesa/empenhos?exercicio=2026",
  "/protocolo/setores",
  "/patrimonio/almoxarifado/roteiros",
];
const falhas: string[] = [];
const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await page.setViewport({ width: 1900, height: 900 });
  await entrar(n, page, "admin@cg.pb.gov.br", senha);
  for (const largura of [1900, 1280]) {
    await page.setViewport({ width: largura, height: 900 });
    for (const rota of ROTAS) {
      await irPara(n, page, rota);
      const r = await page.evaluate(() => ({ janela: window.innerHeight, documento: document.documentElement.scrollHeight }));
      const ok = r.documento <= r.janela;
      console.log(`${ok ? "ok " : "FALHA"} ${String(largura)} px ${rota}: documento ${String(r.documento)} / janela ${String(r.janela)}`);
      if (!ok) falhas.push(`${String(largura)} ${rota}`);
    }
  }
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nO casco não vaza em nenhuma das telas medidas.");
