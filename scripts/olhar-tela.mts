import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * SONDA DESCARTÁVEL — abre as rotas passadas por argumento, logado, e imprime o texto delas.
 *
 * ⚠️ EXISTE PARA NÃO ADIVINHAR. Uma rota que responde 200 e não mostra o conteúdo esperado tem três
 * causas possíveis (recorte, dado ausente, tela errada) e nenhuma delas se distingue pelo status.
 * `curl` não serve: a sessão é cookie, e sem ela tudo redireciona para o login.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3010" };
const rotas = process.argv.slice(2);
const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(60000);
  await entrar(n, page, "admin@cg.pb.gov.br", process.env["SEED_ADMIN_SENHA"] ?? "");
  for (const rota of rotas) {
    const t = await irPara(n, page, rota);
    console.log(`\n===== ${rota} =====\n${t.slice(0, Number(process.env["CORTE"] ?? 900))}`);
  }
} finally {
  await nav.close();
}
