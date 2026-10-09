import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DA LOTAÇÃO NO SETOR: no detalhe do setor, "Lotar usuário no setor" escolhe o usuário pela busca (só
 * usuários ativos), grava a lotação e o detalhe passa a listar o lotado. Lotar de novo o mesmo usuário não duplica.
 * Pré-requisito: o setor SEC-ADM (percurso do almoxarifado pela busca). Escreve na base fictícia.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-lotar-no-setor.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  const setor = await prisma.setor.findUnique({ where: { codigo: "SEC-ADM" }, select: { id: true } });
  if (setor === null) throw new Error("Rode antes o percurso do almoxarifado pela busca (setor SEC-ADM).");
  // Um usuário ativo que ainda não está lotado no setor.
  const lotados = new Set((await prisma.usuarioDoSetor.findMany({ where: { setorId: setor.id }, select: { usuarioIdent: true } })).map((l) => l.usuarioIdent));
  const alvo = (await prisma.usuario.findMany({ where: { ativo: true }, orderBy: { identificador: "asc" }, select: { identificador: true } })).find((u) => !lotados.has(u.identificador));
  if (alvo === undefined) throw new Error("Todos os usuários ativos já estão lotados no SEC-ADM.");

  for (const vez of [1, 2]) {
    await irPara(n, page, `/protocolo/setores/${setor.id}`);
    const r = await preencherEEnviar(page, "lotar", [{ sel: "usuarioIdent", valor: alvo.identificador, busca: alvo.identificador, tipo: "referencia" }]);
    const gravadas = await prisma.usuarioDoSetor.count({ where: { setorId: setor.id, usuarioIdent: alvo.identificador } });
    conferir(r.tipo === "ok" && gravadas === 1, `${vez === 1 ? "lotação" : "nova lotação do mesmo usuário"} pela busca: ${gravadas} linha (${r.texto.slice(0, 50)})`);
  }
  await irPara(n, page, `/protocolo/setores/${setor.id}`);
  const tela = await page.$eval("main", (m) => m.textContent ?? "");
  conferir(tela.includes(alvo.identificador), "o detalhe do setor lista o usuário lotado");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da lotação no setor completo.");
