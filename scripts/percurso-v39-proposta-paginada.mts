import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-014/015 — A PROPOSTA GRANDE PELA TELA: páginas de 100, busca no servidor, o editor de UMA linha sob demanda.
 * Usa a proposta pendente com mais fichas (PERCURSO_BANCO). GRAVA um ajuste numa linha (base de demonstração/ensaio,
 * conferida pelo `entrar`).
 *   1. "Mostrando 1 a 100 de N" e a página seguinte "101 a 200";
 *   2. a busca pelo número de uma ficha reduz o conjunto e mostra a soma do filtro;
 *   3. "Alterar" abre o editor só daquela linha, com a busca preservada no endereço; um único formulário de ajuste;
 *   4. o ajuste grava (lido no banco) e a página volta com a linha e a busca.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const candidatas = await prisma.propostaOrcamentaria.findMany({ where: { efetivacao: null }, select: { id: true, _count: { select: { linhasDeDespesa: true } } } });
const alvo = candidatas.sort((a, b) => b._count.linhasDeDespesa - a._count.linhasDeDespesa)[0];
if (alvo === undefined || alvo._count.linhasDeDespesa <= 100) throw new Error("Nenhuma proposta pendente com mais de 100 fichas nesta base.");
const ficha = await prisma.linhaDeDespesaDaProposta.findFirstOrThrow({ where: { propostaOrcamentariaId: alvo.id, fichaDeOrigemId: { not: null } }, orderBy: { fichaDeOrigem: { numero: "desc" } }, select: { id: true, fichaDeOrigem: { select: { numero: true } } } });
const numero = ficha.fichaDeOrigem?.numero ?? 0;
const rota = `/planejamento/proposta-orcamentaria/${alvo.id}`;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(600000);
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");
  const t1 = await irPara(n, page, rota);
  conferir(new RegExp(`mostrando 1 a 100 de ${String(alvo._count.linhasDeDespesa)}`, "i").test(t1), `primeira página das fichas: 1 a 100 de ${String(alvo._count.linhasDeDespesa)}`);
  const forms = await page.evaluate(() => document.querySelectorAll('form[data-acao="ajustar-linha"]').length);
  conferir(forms === 0, `nenhum formulário de ajuste montado de saída (${String(forms)})`);
  const seguinte = await page.$eval('[data-recorte="fichas"] a[data-pagina-seguinte]', (a) => a.getAttribute("href") ?? "").catch(() => "");
  const t2 = await irPara(n, page, seguinte.replace(/#.*$/, ""));
  conferir(/mostrando 101 a 200/i.test(t2), "a página seguinte mostra 101 a 200");

  const t3 = await irPara(n, page, `${rota}?busca=${String(numero)}`);
  conferir(/com a busca/i.test(t3) && (await page.$(`#ficha-${String(numero)}`)) !== null, `a busca pela ficha ${String(numero)} reduz o conjunto e mostra a ficha`);
  const alterar = await page.$eval(`a[data-editar-linha="${ficha.id}"]`, (a) => a.getAttribute("href") ?? "").catch(() => "");
  conferir(alterar.includes(`editar=${ficha.id}`) && alterar.includes(`busca=${String(numero)}`), "o \"Alterar\" leva ao editor da linha, com a busca preservada");
  await irPara(n, page, alterar.replace(/#.*$/, ""));
  const editores = await page.evaluate(() => Array.from(document.querySelectorAll('form[data-acao="ajustar-linha"]')).map((f) => f.getAttribute("aria-label") ?? ""));
  conferir(editores.length === 1 && editores[0] === `Alterar o valor de a ficha ${String(numero)}`, `um único editor, o da ficha ${String(numero)} (${editores.join(" | ")})`);
  const r = await preencherEEnviar(page, `form[data-acao="ajustar-linha"]`, [
    { sel: 'input[name="valor"]', valor: "12.345,67" },
    { sel: 'input[name="motivo"]', valor: "Ajuste do percurso da proposta paginada (V39)" },
  ]);
  const gravado = await prisma.ajusteDeDespesaDaProposta.findFirst({ where: { linhaId: ficha.id }, orderBy: { criadoEm: "desc" }, select: { valor: true, motivo: true } });
  conferir(r.tipo === "ok" && gravado?.valor.toFixed(2) === "12345.67", `o ajuste gravou ${gravado?.valor.toFixed(2) ?? "nada"} (${r.texto.slice(0, 80)})`);
  conferir(page.url().includes(`busca=${String(numero)}`), "depois de gravar, a página continua na busca");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da proposta paginada completo.");
