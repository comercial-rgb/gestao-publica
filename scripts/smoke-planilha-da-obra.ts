import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { xlsDeTeste, xlsxDeTeste, type CelulaDeTeste } from "../test/fixtures/planilhas.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — A PLANILHA ORÇAMENTÁRIA DA OBRA (V7 M2 U6), POR PAPÉIS.
 *
 * Preparação declarada (neste script, antes do navegador, só em banco descartável): uma OBRA sintética com sufixo próprio
 * e os arquivos .xlsx e .xls do mesmo orçamento sintético (as contas estão em `test/planilha-orcamentaria.test.ts`:
 * total calculado R$ 5.102,89, duas divergências de conciliação). Pela tela:
 *   1. a engenharia de obras importa o .xlsx e abre a prévia: 4 serviços, 0 erro, 2 divergências, total R$ 5.102,89;
 *   2. confirma sem ciência: recusado com o motivo; com ciência: versão 1;
 *   3. a versão mostra o total e a origem; importa o .xls do mesmo orçamento: a prévia dá o mesmo total;
 *   4. um arquivo que não é planilha é recusado nomeando o motivo;
 *   5. a gestora (lê licitações, sem a ação) vê as versões e não recebe o formulário de importar.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ENGENHARIA = "engenharia-obras@percursos.local";
const GESTORA = "gestora-contrato@percursos.local";
const R = registroDePassos();
const CAPTURAS = process.env["PERCURSO_CAPTURAS"] ?? join(process.cwd(), ".registro-de-execucao", "pacote-v7-m2", "capturas");
const DESCARTAVEL = /^gestao_publica_(percursos|capturas|instalacao)_v7m[12]_[a-z0-9_]{1,40}$/;
const SUF = String(Date.now()).slice(-6);

const ORCAMENTO: CelulaDeTeste[][] = [
  ["PLANILHA ORÇAMENTÁRIA — OBRA SINTÉTICA DE PERCURSO"], [],
  ["Item", "Código", "Descrição", "Unid.", "Quant.", "Custo unitário sem BDI", "Preço unitário com BDI", "Preço total"],
  ["1", null, "SERVIÇOS PRELIMINARES", null, null, null, null, 1305],
  ["1.1", "COMP-PLACA", "Placa de obra em chapa galvanizada", "m²", 6, 150, 180.5, { f: "E5*G5", v: 1083 }],
  ["1.2", "COMP-LOCACAO", "Locação da obra", "m", 100, 1.8, "2,22", 222],
  ["2", null, "ALVENARIA", null, null, null, null, null],
  ["2.1", null, "Alvenaria de vedação em bloco cerâmico", "m²", "45,5", 60, 71.33, 3245.52],
  ["2.2", null, "Chapisco em parede", "m²", 91, 5, 6.07, 552.36],
  [null, null, "TOTAL GERAL", null, null, null, null, 5102.88],
];

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `planilha-${nome}.png`), fullPage: true });
}

async function prepararObra(): Promise<string> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    const [{ banco }] = (await prisma.$queryRawUnsafe(`SELECT current_database() AS banco`)) as [{ banco: string }];
    if (!DESCARTAVEL.test(banco)) throw new Error(`"${banco}" não é banco descartável do percurso. Nada foi feito.`);
    const o = await prisma.obra.create({ data: { identificador: `OBRA-PERCURSO-${SUF}`, descricao: `Unidade de saúde sintética do percurso ${SUF}`, tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "preparacao-do-percurso" }, select: { id: true } });
    return o.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    const obraId = await prepararObra();
    const dir = join(CAPTURAS, "..", "arquivos-do-percurso");
    mkdirSync(dir, { recursive: true });
    const xlsx = join(dir, `orcamento-${SUF}.xlsx`);
    const xls = join(dir, `orcamento-${SUF}.xls`);
    const pdf = join(dir, `nao-e-planilha-${SUF}.xlsx`);
    writeFileSync(xlsx, xlsxDeTeste("Orçamento", ORCAMENTO));
    writeFileSync(xls, xlsDeTeste("Orçamento", ORCAMENTO));
    writeFileSync(pdf, Buffer.from("%PDF-1.7 este arquivo não é planilha"));
    console.log(`      [obra OBRA-PERCURSO-${SUF} · banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"}]`);

    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    const href = `/licitacoes/obras/${obraId}/planilha`;

    await entrar(N, page, ENGENHARIA, SENHA);
    await irPara(N, page, href);
    R.conferir("1.1 a engenharia abre a planilha da obra sem versões e com o formulário de importação", (await page.$("[data-sem-versoes]")) !== null && (await page.$('form[data-acao="previa-da-planilha"]')) !== null, (await texto(page)).slice(0, 200));
    const p1 = await preencherEEnviar(page, "previa-da-planilha", [{ sel: 'input[name="arquivo"]', valor: xlsx, tipo: "arquivo" }]);
    R.conferir("1.2 a prévia do .xlsx: 4 serviços, R$ 5.102,89, 0 erro e 2 divergências — nada importado ainda", p1.tipo === "ok" && /nada foi importado ainda: 4 serviço\(s\), total calculado R\$ 5\.102,89, 0 linha\(s\) com erro e 2 divergência/.test(p1.texto), `${p1.tipo}: ${p1.texto.slice(0, 240)}`);
    const hrefPrevia = await page.$eval("[data-link-da-previa]", (a) => a.getAttribute("href") ?? "").catch(() => "");
    await irPara(N, page, hrefPrevia);
    const divergencias = await page.$$eval("[data-divergencias-da-previa] li", (ls) => ls.map((l) => l.textContent ?? ""));
    R.conferir("1.3 a prévia lista as divergências (linha 9 e total geral) e as linhas a importar", divergencias.length === 2 && /Linha 9.*552,36|552\.36/.test(divergencias[0] ?? "") && (await page.$$("[data-itens-da-previa] tbody tr")).length === 6, divergencias.join(" | ").slice(0, 240));
    await capturar(page, "previa");

    const campos = [
      { sel: 'input[name="descricao"]', valor: `Orçamento do projeto básico ${SUF}` },
      { sel: 'input[name="dataBaseDosPrecos"]', valor: "2026-07-01", tipo: "data" as const },
      { sel: 'input[name="referenciaDePrecos"]', valor: "Tabela sintética do percurso, 07/2026" },
      { sel: 'textarea[name="motivo"]', valor: "Planilha do projeto básico aprovado (percurso)" },
    ];
    const semCiencia = await preencherEEnviar(page, "confirmar-planilha", campos);
    R.conferir("2.1 confirmar sem ciência das divergências é recusado com o motivo, e o formulário mantém o que foi digitado", semCiencia.tipo === "erro" && /DIVERGENCIAS-SEM-CIENCIA: a prévia tem 2 divergência/.test(semCiencia.texto) && (await page.$eval('form[data-acao="confirmar-planilha"] input[name="descricao"]', (i) => (i as HTMLInputElement).value)) === `Orçamento do projeto básico ${SUF}`, `${semCiencia.tipo}: ${semCiencia.texto.slice(0, 200)}`);
    const comCiencia = await preencherEEnviar(page, "confirmar-planilha", [{ sel: 'input[name="ciente"]', valor: "sim", tipo: "marcar" }]);
    R.conferir("2.2 com ciência: versão 1 confirmada, 6 linhas, R$ 5.102,89", comCiencia.tipo === "ok" && /Versão 1 da planilha confirmada: 6 linha\(s\), total R\$ 5\.102,89/.test(comCiencia.texto), `${comCiencia.tipo}: ${comCiencia.texto.slice(0, 200)}`);

    await irPara(N, page, href);
    const hrefVersao = await page.$eval("[data-versoes-da-planilha] a", (a) => a.getAttribute("href") ?? "").catch(() => "");
    await irPara(N, page, hrefVersao);
    const total = await page.$eval("[data-total-da-versao]", (e) => e.textContent ?? "").catch(() => "");
    R.conferir("3.1 a versão 1 mostra o total, os grupos e a ciência das divergências", /5\.102,89/.test(total) && (await page.$("[data-item-da-planilha='2.2']")) !== null && (await page.$("[data-divergencias-cientes]")) !== null, total);
    await capturar(page, "versao");
    await irPara(N, page, href);
    const p2 = await preencherEEnviar(page, "previa-da-planilha", [{ sel: 'input[name="arquivo"]', valor: xls, tipo: "arquivo" }]);
    R.conferir("3.2 o .xls do mesmo orçamento dá a mesma prévia: R$ 5.102,89 e 2 divergências", p2.tipo === "ok" && /4 serviço\(s\), total calculado R\$ 5\.102,89, 0 linha\(s\) com erro e 2 divergência/.test(p2.texto), `${p2.tipo}: ${p2.texto.slice(0, 200)}`);
    await irPara(N, page, href);
    const p3 = await preencherEEnviar(page, "previa-da-planilha", [{ sel: 'input[name="arquivo"]', valor: pdf, tipo: "arquivo" }]);
    R.conferir("4.1 um arquivo que não é planilha é recusado nomeando o motivo", p3.tipo === "erro" && /ARQUIVO-NAO-E-PLANILHA/.test(p3.texto), `${p3.tipo}: ${p3.texto.slice(0, 200)}`);
    await capturar(page, "lista");
    await sair(N, page);

    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, href);
    R.conferir("5.1 a gestora vê as versões e não recebe o formulário de importar (com o motivo)", (await page.$("[data-versoes-da-planilha]")) !== null && (await page.$('form[data-acao="previa-da-planilha"]')) === null && (await page.$("[data-motivo-da-planilha]")) !== null, (await texto(page)).slice(0, 160));
    await sair(N, page);
  } catch (e) {
    R.falhou("execução", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e));
    if (navegador !== undefined) {
      const p = (await navegador.pages()).at(-1);
      if (p !== undefined) await capturar(p, "falha").catch(() => undefined);
    }
  } finally {
    await navegador?.close();
  }
  R.encerrar();
}

void main();
