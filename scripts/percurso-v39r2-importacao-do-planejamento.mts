import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-021, R2-022) — PELA TELA: A LDO IMPORTADA PARA UM RASCUNHO E O PPA SEGUINTE PREPARADO A PARTIR DO ANTERIOR.
 *   1. cadastra a LDO de PERCURSO_LDO (padrão 2027) em rascunho, se faltar; no detalhe dela, escolhe a LDO de origem,
 *      o bloco das metas e o mapa dos anos, vê a prévia (o que vai, o que fica de fora e por quê) e confirma;
 *      no banco: o registro da importação, as metas no ano mapeado e a LDO nova sem trâmite;
 *   2. a mesma prévia de novo é recusada (o bloco já tem linhas);
 *   3. cadastra o PPA de PERCURSO_PPA (padrão 2030) e prepara a partir do plano anterior (programas e previsões);
 *      no banco: o registro com a versão da origem e as linhas copiadas;
 *   4. no plano anterior, escolher o plano novo como origem é recusado: o plano em vigor se revisa por ato de alteração.
 * GRAVA (base de demonstração ou ensaio, conferida pelo `entrar`).
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const anoLdo = Number(process.env["PERCURSO_LDO"] ?? "2027");
const anoPpa = Number(process.env["PERCURSO_PPA"] ?? "2030");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

async function pedirPrevia(page: Page, origemId: string, blocos: readonly string[], anos: string): Promise<string> {
  await page.waitForSelector('form[data-acao="previa-da-importacao"]');
  await page.select("#imp-origem", origemId);
  for (const b of blocos) {
    const marcado = await page.$eval(`input[name="imp_bloco"][value="${b}"]`, (e) => (e as HTMLInputElement).checked);
    if (!marcado) await page.click(`input[name="imp_bloco"][value="${b}"]`);
  }
  await page.$eval("#imp-anos", (e) => { (e as HTMLTextAreaElement).value = ""; });
  if (anos !== "") await page.type("#imp-anos", anos);
  await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2" }), page.click('form[data-acao="previa-da-importacao"] button[type="submit"]')]);
  return page.$eval("[data-importacao-do-planejamento]", (e) => (e.textContent ?? "").replace(/\s+/g, " "));
}

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // ── 1. LDO ──
  const origemLdo = await prisma.leiDiretrizesOrcamentarias.findFirst({ where: { exercicio: { lt: anoLdo }, metasAnuais: { some: {} } }, orderBy: { exercicio: "desc" }, select: { id: true, exercicio: true, metasAnuais: { select: { ano: true } } } });
  if (origemLdo === null) throw new Error(`Não há LDO anterior a ${String(anoLdo)} com metas nesta base.`);
  let destinoLdo = await prisma.leiDiretrizesOrcamentarias.findUnique({ where: { exercicio: anoLdo }, select: { id: true } });
  if (destinoLdo === null) {
    await irPara(n, page, "/planejamento/ldo");
    const r = await preencherEEnviar(page, "criar-leis-de-diretrizes", [
      { sel: 'input[name="exercicio"]', valor: String(anoLdo) },
      { sel: 'input[name="inicioVigencia"]', valor: `${String(anoLdo)}-01-01`, tipo: "data" },
      { sel: 'input[name="fimVigencia"]', valor: `${String(anoLdo)}-12-31`, tipo: "data" },
    ]);
    destinoLdo = await prisma.leiDiretrizesOrcamentarias.findUnique({ where: { exercicio: anoLdo }, select: { id: true } });
    conferir(r.tipo === "ok" && destinoLdo !== null, `LDO de ${String(anoLdo)} cadastrada em rascunho pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, `LDO de ${String(anoLdo)} já cadastrada`);
  if (destinoLdo === null) throw new Error("sem LDO de destino");
  const jaTemMetas = (await prisma.metaAnualLdo.count({ where: { ldoId: destinoLdo.id } })) > 0;
  const anosOrigem = [...new Set(origemLdo.metasAnuais.map((m) => m.ano))].sort();
  // mapa: o primeiro ano da origem fica de fora; os demais vão para o mesmo ano (ou para o exercício da nova LDO, se só houver um)
  const mapa = anosOrigem.length === 1 ? `${String(anosOrigem[0])}=${String(anoLdo)}` : anosOrigem.slice(1).map((a) => `${String(a)}=${String(a)}`).join("\n");
  await irPara(n, page, `/planejamento/ldo/${destinoLdo.id}`);
  const t1 = await pedirPrevia(page, origemLdo.id, ["METAS_ANUAIS"], mapa);
  const linhasDaPrevia = await page.$$eval("[data-linha-da-previa]", (ls) => ls.length);
  if (!jaTemMetas) {
    conferir(/Prévia: de LDO \d{4} para LDO \d{4}/.test(t1) && linhasDaPrevia > 0 && (await page.$('form[data-acao="confirmar-importacao"] button[type="submit"]')) !== null,
      `a prévia mostra ${String(linhasDaPrevia)} meta(s) a copiar e oferece a confirmação (mapa ${mapa.replace(/\n/g, ", ")})`);
    if (anosOrigem.length > 1) conferir(/Fica de fora/.test(t1) && /não tem correspondência no mapa dos anos/.test(t1), "o ano sem correspondência aparece em \"fica de fora\", com o motivo");
    const antes = await prisma.importacaoDaLdo.count({ where: { destinoId: destinoLdo.id } });
    const rc = await preencherEEnviar(page, "confirmar-importacao", [], "confirmar-importacao");
    const depois = await prisma.leiDiretrizesOrcamentarias.findUniqueOrThrow({ where: { id: destinoLdo.id }, select: { numeroProtocolo: true, dataEnvioLegislativo: true, dataSancao: true, metasAnuais: { select: { ano: true } }, importacoesDoDestino: { select: { origemId: true, itens: { select: { bloco: true } } } } } });
    conferir(rc.tipo === "ok" && depois.importacoesDoDestino.length === antes + 1 && depois.importacoesDoDestino.some((i) => i.origemId === origemLdo.id && i.itens.length === linhasDaPrevia),
      `importação confirmada pela tela e registrada com a origem e ${String(linhasDaPrevia)} linha(s) (${rc.texto.slice(0, 70)})`);
    conferir([depois.numeroProtocolo, depois.dataEnvioLegislativo, depois.dataSancao].every((x) => x === null) && depois.metasAnuais.length === linhasDaPrevia,
      `a LDO de ${String(anoLdo)} segue rascunho (sem protocolo, envio ou sanção) com as metas nos anos ${depois.metasAnuais.map((m) => m.ano).sort().join(", ")}`);
  } else conferir(true, `a LDO de ${String(anoLdo)} já tem metas (corrida anterior): segue para a recusa`);
  // 2. de novo: o bloco já tem linhas
  await irPara(n, page, `/planejamento/ldo/${destinoLdo.id}`);
  const t2 = await pedirPrevia(page, origemLdo.id, ["METAS_ANUAIS"], mapa);
  conferir(/já tem metas anuais \(\d+\): a importação não mistura nem substitui/.test(t2) && (await page.$('form[data-acao="confirmar-importacao"] button[type="submit"]')) === null,
    "a segunda importação das metas é recusada na prévia (o bloco já tem linhas) e não oferece confirmação");

  // ── 3. PPA ──
  const origemPpa = await prisma.planoPlurianual.findFirst({ where: { anoFim: { lt: anoPpa } }, orderBy: { anoInicio: "desc" }, select: { id: true, anoInicio: true, anoFim: true, previsoes: { select: { ano: true } } } });
  if (origemPpa === null) throw new Error(`Não há PPA que termine antes de ${String(anoPpa)} nesta base.`);
  let destinoPpa = await prisma.planoPlurianual.findUnique({ where: { anoInicio: anoPpa }, select: { id: true } });
  if (destinoPpa === null) {
    await irPara(n, page, "/planejamento/ppa");
    const r = await preencherEEnviar(page, "criar-planos-plurianuais", [
      { sel: 'input[name="anoInicio"]', valor: String(anoPpa) },
      { sel: 'input[name="anoFim"]', valor: String(anoPpa + 3) },
      { sel: 'input[name="leiRef"]', valor: `Projeto de lei do PPA ${String(anoPpa)}–${String(anoPpa + 3)} (ensaio)` },
      { sel: 'input[name="dataPublicacao"]', valor: `${String(anoPpa - 1)}-08-31`, tipo: "data" },
    ]);
    destinoPpa = await prisma.planoPlurianual.findUnique({ where: { anoInicio: anoPpa }, select: { id: true } });
    conferir(r.tipo === "ok" && destinoPpa !== null, `PPA ${String(anoPpa)}–${String(anoPpa + 3)} cadastrado pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, `PPA ${String(anoPpa)} já cadastrado`);
  if (destinoPpa === null) throw new Error("sem PPA de destino");
  const anoPrev = [...new Set(origemPpa.previsoes.map((p) => p.ano))].sort().at(-1);
  const mapaPpa = anoPrev === undefined ? "" : `${String(anoPrev)}=${String(anoPpa)}`;
  const vazio = (await prisma.programaPpa.count({ where: { planoId: destinoPpa.id } })) === 0;
  await irPara(n, page, `/planejamento/ppa/${destinoPpa.id}`);
  const t3 = await pedirPrevia(page, origemPpa.id, ["PROGRAMAS", "PREVISOES_RECEITA"], mapaPpa);
  conferir(/Versão da origem copiada:/.test(t3) && /ato de alteração/.test(t3), "a prévia do PPA diz a versão da origem e lembra que revisar o plano em vigor é por ato de alteração");
  if (vazio) {
    const nPrevia = await page.$$eval("[data-linha-da-previa]", (ls) => ls.length);
    const rc = await preencherEEnviar(page, "confirmar-importacao", [], "confirmar-importacao");
    const imp = await prisma.importacaoDoPpa.findFirst({ where: { destinoId: destinoPpa.id }, orderBy: { criadoEm: "desc" }, select: { origemId: true, versaoDaOrigemAtoId: true, itens: { select: { bloco: true } } } });
    const programas = await prisma.programaPpa.count({ where: { planoId: destinoPpa.id } });
    conferir(rc.tipo === "ok" && imp !== null && imp.origemId === origemPpa.id && imp.itens.length === nPrevia && programas > 0,
      `plano preparado pela tela: ${String(programas)} programa(s), ${String(imp?.itens.length ?? 0)} linha(s) com origem registrada (${rc.texto.slice(0, 80)})`);
  } else conferir(true, `o PPA ${String(anoPpa)} já tem programas (corrida anterior)`);
  // 4. no plano anterior, o novo como origem: é revisão, não importação
  await irPara(n, page, `/planejamento/ppa/${origemPpa.id}`);
  const t4 = await pedirPrevia(page, destinoPpa.id, ["PROGRAMAS"], "");
  conferir(/isto seria revisar o ciclo em vigor, e a revisão se faz por ato de alteração no próprio plano/.test(t4) && (await page.$('form[data-acao="confirmar-importacao"] button[type="submit"]')) === null,
    "no plano anterior, importar do plano seguinte é recusado: o plano em vigor se revisa por ato de alteração");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da importação do planejamento completo.");
