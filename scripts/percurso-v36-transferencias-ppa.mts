import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DAS TRANSFERÊNCIAS FINANCEIRAS PREVISTAS NO PPA (TR 5.9.1.17):
 *   o administrador prevê pela tela a transferência à Câmara no último ano do quadriênio e à previdência no penúltimo;
 *   corrige a da Câmara com motivo (versão 2); a correção sem motivo é recusada com o motivo; o quadro mostra os valores
 *   vigentes por entidade e ano e o total; o contador, que só consulta, lê o quadro sem o formulário.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-transferencias-ppa.mts
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

  const plano = await prisma.planoPlurianual.findFirst({ orderBy: { anoInicio: "desc" }, select: { id: true, anoFim: true } });
  const cm = await prisma.entidadeContabil.findFirst({ where: { codigo: "CM" }, select: { id: true } });
  const fps = await prisma.entidadeContabil.findFirst({ where: { codigo: "FPS" }, select: { id: true } });
  if (plano === null || cm === null || fps === null) throw new Error("a base não tem PPA ou as entidades CM e FPS");
  const ultimo = plano.anoFim;
  const penultimo = plano.anoFim - 1;
  const versoesAntes = await prisma.previsaoDeTransferenciaPpa.count({ where: { planoId: plano.id, entidadeId: cm.id, ano: ultimo } });
  const tela = `/planejamento/ppa/transferencias?plano=${plano.id}`;

  const prever = async (entidadeId: string, ano: number, valor: string, finalidade: string, motivo: string) => {
    await irPara(n, page, tela);
    return preencherEEnviar(page, "prever-transferencia", [
      { sel: 'select[name="entidadeId"]', valor: entidadeId, tipo: "select" },
      { sel: 'select[name="ano"]', valor: String(ano), tipo: "select" },
      { sel: '[data-mascara="valor"]', valor },
      { sel: 'input[name="finalidade"]', valor: finalidade },
      ...(motivo !== "" ? [{ sel: 'input[name="motivo"]', valor: motivo }] : []),
    ]);
  };

  // ── 1. a previsão da Câmara (ou a correção, se o percurso já rodou) e a da previdência ──
  const r1 = await prever(cm.id, ultimo, "1.200.000,00", "Duodécimo do Poder Legislativo", versoesAntes > 0 ? "Nova rodada do percurso" : "");
  const r2 = await prever(fps.id, penultimo, "500.000,00", "Repasse ao fundo de previdência", (await prisma.previsaoDeTransferenciaPpa.count({ where: { planoId: plano.id, entidadeId: fps.id, ano: penultimo } })) > 0 ? "Nova rodada do percurso" : "");
  conferir(r1.tipo === "ok" && r2.tipo === "ok", `previsões gravadas pela tela (${r1.texto.slice(0, 60)} | ${r2.texto.slice(0, 60)})`);

  // ── 2. a correção sem motivo é recusada ──
  const r3 = await prever(cm.id, ultimo, "1.250.000,00", "Duodécimo do Poder Legislativo", "");
  const depoisDaRecusa = await prisma.previsaoDeTransferenciaPpa.count({ where: { planoId: plano.id, entidadeId: cm.id, ano: ultimo } });
  conferir(r3.tipo === "erro" && /a correção precisa do motivo/.test(r3.texto) && depoisDaRecusa === versoesAntes + 1, `correção sem motivo recusada com o motivo, nada gravado (${r3.texto.slice(0, 90)})`);

  // ── 3. a correção com motivo ──
  const r4 = await prever(cm.id, ultimo, "1.250.000,00", "Duodécimo do Poder Legislativo", "Receita base do duodécimo recalculada");
  const vigente = await prisma.previsaoDeTransferenciaPpa.findFirst({ where: { planoId: plano.id, entidadeId: cm.id, ano: ultimo }, orderBy: { versao: "desc" }, select: { versao: true, valor: true } });
  conferir(r4.tipo === "ok" && vigente?.valor.toFixed(2) === "1250000.00" && vigente.versao === versoesAntes + 2, `corrigida com motivo: versão ${String(vigente?.versao ?? 0)}, ${vigente?.valor.toFixed(2) ?? "?"} (${r4.texto.slice(0, 80)})`);

  // ── 4. o quadro ──
  await irPara(n, page, tela);
  const celula = await page.$eval(`tr[data-transferencia-entidade^="CM"] td[data-ano="${String(ultimo)}"]`, (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "");
  const fpsCelula = await page.$eval(`tr[data-transferencia-entidade^="FPS"] td[data-ano="${String(penultimo)}"]`, (e) => (e as HTMLElement).innerText.replace(/\s+/g, " ")).catch(() => "");
  conferir(/1\.250\.000,00/.test(celula) && /versões/.test(celula) && /500\.000,00/.test(fpsCelula), `o quadro mostra a Câmara em ${String(ultimo)} ("${celula}") e a previdência em ${String(penultimo)} ("${fpsCelula}")`);

  // ── 5. quem só consulta ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "contador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}${tela}`, { waitUntil: "domcontentloaded" });
  await outra.waitForSelector("[data-tabela-transferencias]");
  conferir((await outra.$('form[data-acao="prever-transferencia"]')) === null, "o contador lê o quadro, sem o formulário (a recusa no servidor está no teste do domínio)");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das transferências previstas no PPA completo.");
