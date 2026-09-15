import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import { diaCivil } from "../packages/datas/index.js";
import { xlsxDeTeste, type CelulaDeTeste } from "../test/fixtures/planilhas.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — A MEDIÇÃO DA ORDEM DE SERVIÇO PELA PLANILHA DA OBRA (V7 M2 U7), POR PAPÉIS.
 *
 * Preparação declarada: `scripts/preparar-ponte-contratual.ts` (contrato de dois itens — visita 10 × R$ 100,00 e hora
 * 20 × R$ 50,00 —, gestora, fiscal e recebedor designados, empenho de R$ 1.100,00) e a OBRA sintética criada no banco
 * descartável (`OBRA_ID`); nada da planilha, da ordem ou da medição é preparado escondido.
 *
 * Pela tela, cada um com a SUA conta:
 *   1. a engenharia importa a planilha (1.1 visita 8 × 95,00; 1.2 hora 20 × 48,00; 1.3 relatório 2 × 150,00), confirma a
 *      versão 1 declarando o contrato e vincula 1.1 e 1.2 aos itens do contrato (1.3 fica sem vínculo);
 *   2. a gestora cria e emite a ordem (6 visitas + 10 horas = R$ 1.100,00);
 *   3. o fiscal mede PELA PLANILHA 6 visitas e 8 horas com uma evidência: R$ 1.000,00 no contrato (R$ 954,00 a preços
 *      da planilha); a mesma parcela de novo é recusada mantendo o digitado; baixa a memória em PDF; mede 2 horas e
 *      estorna essa medição (sem recebimento), que fica no histórico;
 *   4–7. recebimento provisório (R$ 900,00 conforme e R$ 100,00 em controvérsia), definitivo de R$ 900,00, nota
 *      conferida e liquidação de R$ 900,00 pelo M05; a contabilidade baixa a memória, sem ver as evidências;
 *   8. outro setor não baixa a evidência pela URL; o visitante não baixa a memória;
 *   9. controvérsia aceita, complemento de R$ 100,00 e a sua liquidação: R$ 1.000,00 recebidos e liquidados;
 *  10. a engenharia vê o andamento da obra por serviço e as duas medições (uma estornada).
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ENGENHARIA = "engenharia-obras@percursos.local";
const GESTORA = "gestora-contrato@percursos.local";
const FISCAL = "fiscal-contrato@percursos.local";
const RECEBEDOR = "recebedor-contrato@percursos.local";
const OUTRO = "outro-setor-contrato@percursos.local";
const ALMOX = "almoxarifado@percursos.local";
const CONTAB = "contabilidade@percursos.local";
const R = registroDePassos();
const CAPTURAS = process.env["PERCURSO_CAPTURAS"] ?? join(process.cwd(), ".registro-de-execucao", "pacote-v7-m2", "capturas");
const dia = (d: number): string => diaCivil(new Date(Date.now() + d * 86_400_000));
const HOJE = dia(0);

interface Ponte { readonly sufixo: string; readonly contratoId: string; readonly contrato: string; readonly cnpj: string; readonly empenho: string }
const PONTE: Ponte = JSON.parse(process.env["PONTE_JSON"] ?? "null") as Ponte;
let OBRA_ID = process.env["OBRA_ID"] ?? "";
const DESCARTAVEL = /^gestao_publica_(percursos|capturas|instalacao)_v7m[12]_[a-z0-9_]{1,40}$/;
const MOTIVO_VINCULO = "Correspondência conferida pela engenharia com o termo de referência do contrato";

const ORCAMENTO: CelulaDeTeste[][] = [
  ["Item", "Descrição", "Unidade", "Quantidade", "Preço unitário", "Total"],
  ["1", "SERVIÇOS TÉCNICOS", null, null, null, 2020],
  ["1.1", "Visita técnica às unidades", "visita", 8, 95, 760],
  ["1.2", "Hora técnica de engenharia", "hora", 20, 48, 960],
  ["1.3", "Relatório fotográfico", "un", 2, 150, 300],
];

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `medicao-planilha-${nome}.png`), fullPage: true });
}

async function opcao(page: Page, select: string, trecho: string): Promise<string> {
  return page.$$eval(`${select} option`, (os, t) => (os.find((o) => (o.textContent ?? "").includes(t as string)) as HTMLOptionElement | undefined)?.value ?? "", trecho);
}

async function baixar(page: Page, url: string): Promise<{ readonly status: number; readonly tipo: string; readonly texto: string }> {
  const r = await page.evaluate(async (u) => {
    const resp = await fetch(u, { cache: "no-store", redirect: "manual" });
    const buf = new Uint8Array(await resp.arrayBuffer());
    let bin = "";
    for (const b of buf) bin += String.fromCharCode(b);
    return { status: resp.status, tipo: resp.headers.get("content-type") ?? "", b64: btoa(bin) };
  }, url);
  if (!r.tipo.includes("pdf")) return { status: r.status, tipo: r.tipo, texto: "" };
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(Buffer.from(r.b64, "base64")), useSystemFonts: true }).promise;
  let t = "";
  for (let i = 1; i <= pdf.numPages; i += 1) t += ` ${(await (await pdf.getPage(i)).getTextContent()).items.map((it) => ("str" in it ? it.str : "")).join(" ")}`;
  return { status: r.status, tipo: r.tipo, texto: t.replace(/\s+/g, " ") };
}

/** O `name` do campo de quantidade do serviço no formulário de medição pela planilha. */
async function campoDoServico(page: Page, codigo: string): Promise<string> {
  return page.$eval(`form[data-acao="medir-pela-planilha"] tr[data-servico="${codigo}"] input`, (i) => (i as HTMLInputElement).name).catch(() => "");
}

/** A OBRA da preparação, num banco exclusivamente descartável — a planilha, a ordem e a medição são todas pela tela. */
async function prepararObra(): Promise<string> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    const [{ banco }] = (await prisma.$queryRawUnsafe(`SELECT current_database() AS banco`)) as [{ banco: string }];
    if (!DESCARTAVEL.test(banco)) throw new Error(`"${banco}" não é banco descartável do percurso. Nada foi feito.`);
    const o = await prisma.obra.create({ data: { identificador: `OBRA-MEDICAO-${PONTE.sufixo}`, descricao: `Obra sintética do percurso ${PONTE.sufixo}`, tipoObraServico: "EDIFICACOES_EM_GERAL", criadoPor: "preparacao-do-percurso" }, select: { id: true } });
    return o.id;
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  if (PONTE === null) {
    R.falhou("preparação", "PONTE_JSON ausente: rode scripts/preparar-ponte-contratual.ts no banco descartável antes");
    R.encerrar();
    return;
  }
  if (OBRA_ID === "") OBRA_ID = await prepararObra();
  let navegador: Browser | undefined;
  const SUF = PONTE.sufixo;
  const hrefContrato = `/licitacoes/contratos/${PONTE.contratoId}`;
  const hrefPlanilha = `/licitacoes/obras/${OBRA_ID}/planilha`;
  const dir = join(CAPTURAS, "..", "arquivos-do-percurso");
  mkdirSync(dir, { recursive: true });
  const arqPlanilha = join(dir, `orcamento-medicao-${SUF}.xlsx`);
  const arqEvidencia = join(dir, `relatorio-de-campo-${SUF}.pdf`);
  writeFileSync(arqPlanilha, xlsxDeTeste("Orçamento", ORCAMENTO));
  writeFileSync(arqEvidencia, Buffer.from(`%PDF-1.4\n% relatório de campo sintético do percurso ${SUF}\n%%EOF\n`));
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [contrato ${PONTE.contrato} · obra ${OBRA_ID} · banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"}]`);

    // ══ 1. a engenharia: planilha, versão com o contrato e os vínculos ══
    await entrar(N, page, ENGENHARIA, SENHA);
    await irPara(N, page, hrefPlanilha);
    const p1 = await preencherEEnviar(page, "previa-da-planilha", [{ sel: 'input[name="arquivo"]', valor: arqPlanilha, tipo: "arquivo" }]);
    R.conferir("1.1 a engenharia importa a planilha: 3 serviços, R$ 2.020,00, sem erro", p1.tipo === "ok" && /3 serviço\(s\), total calculado R\$ 2\.020,00, 0 linha\(s\) com erro/.test(p1.texto), `${p1.tipo}: ${p1.texto.slice(0, 220)}`);
    const hrefPrevia = await page.$eval("[data-link-da-previa]", (a) => a.getAttribute("href") ?? "").catch(() => "");
    await irPara(N, page, hrefPrevia);
    const conf = await preencherEEnviar(page, "confirmar-planilha", [
      { sel: 'input[name="descricao"]', valor: `Orçamento da obra do percurso ${SUF}` },
      { sel: 'input[name="numeroDoContrato"]', valor: PONTE.contrato },
      { sel: 'input[name="dataBaseDosPrecos"]', valor: dia(-60), tipo: "data" },
      { sel: 'input[name="referenciaDePrecos"]', valor: "Tabela sintética do percurso" },
      { sel: 'input[name="vigenciaInicio"]', valor: dia(-20), tipo: "data" },
      { sel: 'textarea[name="motivo"]', valor: "Planilha do projeto aprovado (percurso)" },
    ]);
    R.conferir("1.2 a versão 1 é confirmada declarando o contrato", conf.tipo === "ok" && /Versão 1 da planilha confirmada/.test(conf.texto), `${conf.tipo}: ${conf.texto.slice(0, 200)}`);
    await irPara(N, page, hrefPlanilha);
    const hrefVersao = await page.$eval("[data-versoes-da-planilha] a", (a) => a.getAttribute("href") ?? "").catch(() => "");
    await irPara(N, page, hrefVersao);
    for (const [codigo, trecho] of [["1.1", `Visita técnica ${SUF}`], ["1.2", `Hora técnica ${SUF}`]] as const) {
      const form = `form[data-acao="vincular-item-da-planilha"][data-servico="${codigo}"]`;
      const item = await opcao(page, `${form} select[name="itemDoContratoId"]`, trecho);
      const v = await preencherEEnviar(page, form, [{ sel: 'select[name="itemDoContratoId"]', valor: item, tipo: "select" }, { sel: 'input[name="motivo"]', valor: MOTIVO_VINCULO }]);
      R.conferir(`1.3 a engenharia vincula o serviço ${codigo} ao item do contrato (${trecho})`, v.tipo === "ok" && item !== "" && /Vínculo registrado/.test(v.texto), `${v.tipo}: ${v.texto.slice(0, 160)} item=${item !== ""}`);
      await irPara(N, page, hrefVersao);
    }
    await sair(N, page);

    // ══ 2. a gestora: rascunho e emissão ══
    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, hrefContrato);
    const formNova = 'form[data-acao="criar-ordem-de-servico"]';
    const campoPeloRotulo = (trecho: string) => page.$$eval(`${formNova} label`, (ls, t) => ((ls.find((x) => (x.textContent ?? "").includes(t as string))?.querySelector("input, select, textarea") as HTMLInputElement | null)?.name ?? ""), trecho);
    const [cV, cH, fiscal, empenho] = [await campoPeloRotulo(`Visita técnica ${SUF}`), await campoPeloRotulo(`Hora técnica ${SUF}`), await opcao(page, `${formNova} select[name="fiscalDesignacaoId"]`, `Fábio Fiscal Ponte ${SUF}`), await opcao(page, `${formNova} select[name="empenhoId"]`, PONTE.empenho)];
    const rasc = await preencherEEnviar(page, "criar-ordem-de-servico", [
      { sel: 'textarea[name="finalidade"]', valor: `Acompanhamento técnico da obra — percurso ${SUF}` },
      { sel: 'input[name="inicioPrevisto"]', valor: dia(-10), tipo: "data" }, { sel: 'input[name="fimPrevisto"]', valor: dia(30), tipo: "data" },
      { sel: 'select[name="fiscalDesignacaoId"]', valor: fiscal, tipo: "select" }, { sel: 'select[name="empenhoId"]', valor: empenho, tipo: "select" },
      { sel: 'textarea[name="condicoes"]', valor: "Relatório de visitas assinado e planilha de horas" },
      { sel: `input[name="${cV}"]`, valor: "6" }, { sel: `input[name="${cH}"]`, valor: "10" },
    ]);
    await irPara(N, page, hrefContrato);
    const hrefOrdem = await page.$$eval("[data-ordens-de-servico] a[href*='/ordens/']", (as) => (as[0] as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    await irPara(N, page, hrefOrdem);
    const emit = await preencherEEnviar(page, "emitir-ordem-de-servico", [{ sel: 'input[name="inicioAutorizado"]', valor: dia(-10), tipo: "data" }]);
    R.conferir("2.1 a gestora cria e emite a ordem: R$ 1.100,00 autorizados", rasc.tipo === "ok" && emit.tipo === "ok" && /R\$ 1\.100,00 autorizados/.test(emit.texto), `${rasc.tipo}/${emit.tipo}: ${emit.texto.slice(0, 200)}`);
    await sair(N, page);

    // ══ 3. o fiscal mede pela planilha ══
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefOrdem);
    const semVinculo = await page.$eval('form[data-acao="medir-pela-planilha"] tr[data-servico="1.3"] [data-motivo-do-servico]', (e) => e.getAttribute("data-motivo-do-servico") ?? "").catch(() => "");
    R.conferir("3.1 o fiscal recebe o formulário pela planilha; a medição avulsa não oferece os itens vinculados; o 1.3 mostra por que não se mede", (await page.$('form[data-acao="medir-pela-planilha"]')) !== null && (await page.$('form[data-acao="medir-ordem-de-servico"]')) === null && (await page.$("[data-itens-pela-planilha]")) !== null && semVinculo === "SERVICO-SEM-VINCULO", `semVinculo=${semVinculo}`);
    const [q11, q12] = [await campoDoServico(page, "1.1"), await campoDoServico(page, "1.2")];
    const med = await preencherEEnviar(page, "medir-pela-planilha", [
      { sel: 'input[name="diaInicio"]', valor: dia(-5), tipo: "data" }, { sel: 'input[name="diaFim"]', valor: dia(-2), tipo: "data" },
      { sel: `input[name="${q11}"]`, valor: "6" }, { sel: `input[name="${q12}"]`, valor: "8" },
      { sel: 'input[name="evidencias"]', valor: arqEvidencia, tipo: "arquivo" },
    ]);
    R.conferir("3.2 o fiscal mede 6 visitas e 8 horas pela versão 1: R$ 1.000,00 no contrato e R$ 954,00 a preços da planilha, com 1 evidência", med.tipo === "ok" && /Medição nº 1 registrada pela versão 1 da planilha: R\$ 1\.000,00 no contrato \(R\$ 954,00 a preços da planilha\), 1 evidência/.test(med.texto) && /serviço 1\.1: acumulado 6, saldo na planilha 2/.test(med.texto), `${med.tipo}: ${med.texto.slice(0, 300)}`);
    await irPara(N, page, hrefOrdem);
    const q12b = await campoDoServico(page, "1.2");
    const repete = await preencherEEnviar(page, "medir-pela-planilha", [
      { sel: 'input[name="diaInicio"]', valor: dia(-5), tipo: "data" }, { sel: 'input[name="diaFim"]', valor: dia(-2), tipo: "data" }, { sel: `input[name="${q12b}"]`, valor: "10" },
    ]);
    const mantido = await page.$eval(`form[data-acao="medir-pela-planilha"] input[name="${q12b}"]`, (i) => (i as HTMLInputElement).value).catch(() => "");
    R.conferir("3.3 NEGATIVA: a mesma parcela de horas de novo é recusada pelo autorizado da ordem, e o formulário mantém o digitado", repete.tipo === "erro" && /ITEM-ACIMA-DO-AUTORIZADO-NA-ORDEM: o item 2/.test(repete.texto) && mantido === "10", `${repete.tipo}: ${repete.texto.slice(0, 220)} mantido=${mantido}`);
    await irPara(N, page, hrefOrdem);
    const hrefMemoria = await page.$eval('[data-medicao-da-ordem="1"] [data-documento="memoria"]', (a) => a.getAttribute("href") ?? "").catch(() => "");
    const hrefEvidencia = await page.$eval('[data-medicao-da-ordem="1"] [data-evidencias-da-medicao] a', (a) => a.getAttribute("href") ?? "").catch(() => "");
    const memoria = await baixar(page, hrefMemoria);
    R.conferir("3.4 a memória da medição sai em PDF com a versão, os dois totais e a evidência", memoria.status === 200 && memoria.texto.includes("MEMÓRIA DA MEDIÇÃO Nº 1") && memoria.texto.includes("R$ 1.000,00") && memoria.texto.includes("R$ 954,00") && memoria.texto.includes("versão 1") && memoria.texto.includes(`relatorio-de-campo-${SUF}.pdf`), `${memoria.status} ${memoria.tipo} ${memoria.texto.slice(0, 200)}`);
    const q12c = await campoDoServico(page, "1.2");
    const med2 = await preencherEEnviar(page, "medir-pela-planilha", [
      { sel: 'input[name="diaInicio"]', valor: dia(-1), tipo: "data" }, { sel: 'input[name="diaFim"]', valor: dia(-1), tipo: "data" }, { sel: `input[name="${q12c}"]`, valor: "2" },
    ]);
    await irPara(N, page, hrefOrdem);
    const est = await preencherEEnviar(page, "estornar-medicao-2", [{ sel: 'textarea[name="motivo"]', valor: `Horas lançadas em duplicidade com o relatório (percurso ${SUF})` }]);
    await irPara(N, page, hrefOrdem);
    const aExecutarHoras = await page.$eval('[data-item-da-ordem="2"] [data-a-executar]', (e) => (e.textContent ?? "").trim()).catch(() => "");
    R.conferir("3.5 o fiscal mede 2 horas e estorna essa medição sem recebimento: fica no histórico, estornada, e as 2 horas voltam a executar", med2.tipo === "ok" && est.tipo === "ok" && /Medição nº 2 estornada \(R\$ 100,00\)/.test(est.texto) && (await page.$('[data-estorno-da-medicao="2"]')) !== null && aExecutarHoras === "2", `${med2.tipo}/${est.tipo}: ${est.texto.slice(0, 160)} aExecutar=${aExecutarHoras}`);
    const formProv = 'form[data-acao="receber-provisoriamente"]';
    const visitaId = await page.$$eval(`${formProv} fieldset`, (fs, t) => (fs.find((f) => (f.textContent ?? "").includes(t as string))?.querySelector('input[name^="conforme."]') as HTMLInputElement | null)?.name.slice("conforme.".length) ?? "", `Visita técnica ${SUF}`);
    const prov = await preencherEEnviar(page, "receber-provisoriamente", [
      { sel: `input[name="conforme.${visitaId}"]`, valor: "5" }, { sel: `input[name="controversia.${visitaId}"]`, valor: "1" }, { sel: `input[name="motivo.${visitaId}"]`, valor: `Visita sem assinatura do responsável (percurso ${SUF})` },
      { sel: 'textarea[name="verificacoes"]', valor: `Relatórios de visita e planilha de horas conferidos (percurso ${SUF})` },
    ]);
    R.conferir("4.1 o fiscal recebe provisoriamente a medição pela planilha: R$ 900,00 conforme e R$ 100,00 em controvérsia", prov.tipo === "ok" && /R\$ 900,00 conforme; R\$ 100,00 em controvérsia/.test(prov.texto), `${prov.tipo}: ${prov.texto.slice(0, 200)}`);
    await capturar(page, "ordem-fiscal");
    await sair(N, page);

    // ══ 5. o recebedor: definitivo da parte regular ══
    await entrar(N, page, RECEBEDOR, SENHA);
    await irPara(N, page, hrefOrdem);
    const def = await preencherEEnviar(page, "receber-definitivamente", [{ sel: 'textarea[name="conclusao"]', valor: `Visitas e horas conferidas (percurso ${SUF})` }]);
    R.conferir("5.1 o recebedor recebe em definitivo R$ 900,00", def.tipo === "ok" && /R\$ 900,00/.test(def.texto), `${def.tipo}: ${def.texto.slice(0, 200)}`);
    await sair(N, page);

    // ══ 6. o almoxarifado registra e confere a nota ══
    await entrar(N, page, ALMOX, SENHA);
    await irPara(N, page, "/licitacoes/documentos-fiscais");
    const formDoc = 'form[data-acao="registrar-documento-fiscal"]';
    const [emitente, contrato] = [await opcao(page, `${formDoc} select[name="emitenteId"]`, `Serviços Técnicos Ponte ${SUF}`), await opcao(page, `${formDoc} select[name="contratoId"]`, PONTE.contrato)];
    const rDoc = await preencherEEnviar(page, "registrar-documento-fiscal", [
      { sel: 'select[name="emitenteId"]', valor: emitente, tipo: "select" }, { sel: 'select[name="modelo"]', valor: "NF_AVULSA", tipo: "select" },
      { sel: 'input[name="serie"]', valor: "1" }, { sel: 'input[name="numero"]', valor: `NFS-P-${SUF}` },
      { sel: 'input[name="dataEmissao"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="dataRecebimento"]', valor: HOJE, tipo: "data" },
      { sel: 'select[name="contratoId"]', valor: contrato, tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 0 }, { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 3 },
      { sel: 'input[name="itens.0.descricao"]', valor: "Serviços técnicos medidos pela planilha" }, { sel: 'input[name="itens.0.unidade"]', valor: "SV" }, { sel: 'input[name="itens.0.quantidade"]', valor: "1" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 4 }, { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 5 },
    ]);
    await irPara(N, page, `/licitacoes/documentos-fiscais?q=NFS-P-${SUF}`);
    const hrefDoc = await page.$$eval("tbody a[href^='/licitacoes/documentos-fiscais/']", (as) => (as[0] as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    await irPara(N, page, hrefDoc);
    const confNota = await preencherEEnviar(page, "conferir", [{ sel: 'input[name="data"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="motivo"]', valor: `Conferida com o termo de recebimento (percurso ${SUF})` }]);
    R.conferir("6.1 o almoxarifado registra e confere a nota do contratado (R$ 1.000,00)", rDoc.tipo === "ok" && confNota.tipo === "ok", `${rDoc.tipo}/${confNota.tipo}: ${rDoc.texto.slice(0, 120)}`);
    await sair(N, page);

    // ══ 7. a contabilidade liquida e baixa a memória, sem as evidências ══
    await entrar(N, page, CONTAB, SENHA);
    await irPara(N, page, hrefOrdem);
    const formLiq = 'form[data-acao="liquidar-parcelas-do-contrato"]';
    const liquidar = async (valor: string) => {
      const parcela = await page.$$eval(`${formLiq} input[name^="parcela."]`, (is) => (is[0] as HTMLInputElement | undefined)?.name ?? "");
      const [doc, emp] = [await opcao(page, `${formLiq} select[name="documentoFiscalId"]`, `NFS-P-${SUF}`), await opcao(page, `${formLiq} select[name="empenhoId"]`, PONTE.empenho)];
      return preencherEEnviar(page, "liquidar-parcelas-do-contrato", [{ sel: `input[name="${parcela}"]`, valor }, { sel: 'select[name="documentoFiscalId"]', valor: doc, tipo: "select" }, { sel: 'select[name="empenhoId"]', valor: emp, tipo: "select" }]);
    };
    const liq = await liquidar("900,00");
    R.conferir("7.1 a contabilidade liquida a parcela medida pela planilha: R$ 900,00 no M05", liq.tipo === "ok" && /registrada no M05: R\$ 900,00/.test(liq.texto), `${liq.tipo}: ${liq.texto.slice(0, 200)}`);
    await irPara(N, page, hrefOrdem);
    const memoriaFin = await baixar(page, hrefMemoria);
    R.conferir("7.2 a projeção financeira baixa a memória (lastro do valor) e não recebe o link das evidências", memoriaFin.status === 200 && memoriaFin.texto.includes("MEMÓRIA DA MEDIÇÃO Nº 1") && (await page.$("[data-evidencias-da-medicao]")) === null, `${memoriaFin.status} evidencias=${(await page.$("[data-evidencias-da-medicao]")) !== null}`);
    await sair(N, page);

    // ══ 8. negativas de alcance ══
    await entrar(N, page, OUTRO, SENHA);
    const evidOutro = await page.evaluate(async (u) => (await fetch(u, { cache: "no-store", redirect: "manual" })).status, hrefEvidencia);
    R.conferir("8.1 NEGATIVA: outro setor (projeção financeira), pela URL direta, não baixa a evidência da medição (404)", hrefEvidencia !== "" && evidOutro === 404, `href=${hrefEvidencia !== ""} status=${evidOutro}`);
    await sair(N, page);
    const memVisitante = await page.goto(`${N.base}${hrefMemoria}`, { waitUntil: "domcontentloaded" });
    R.conferir("8.2 NEGATIVA: o visitante não baixa a memória da medição (nunca o PDF)", !(memVisitante?.headers()["content-type"] ?? "").includes("pdf"), `${memVisitante?.status()} ${memVisitante?.headers()["content-type"]}`);

    // ══ 9. controvérsia aceita, complemento e liquidação ══
    await entrar(N, page, RECEBEDOR, SENHA);
    await irPara(N, page, hrefOrdem);
    const dec = await preencherEEnviar(page, "decidir-controversia", [{ sel: 'select[name="resultado"]', valor: "ACEITA", tipo: "select" }, { sel: 'textarea[name="fundamento"]', valor: `Assinatura apresentada depois (percurso ${SUF})` }]);
    await irPara(N, page, hrefOrdem);
    const comp = await preencherEEnviar(page, "receber-definitivamente", [{ sel: 'textarea[name="conclusao"]', valor: `Complemento da visita aceita (percurso ${SUF})` }]);
    R.conferir("9.1 aceita a controvérsia, o complemento recebido é R$ 100,00", dec.tipo === "ok" && comp.tipo === "ok" && /nº 2 registrado: R\$ 100,00/.test(comp.texto), `${dec.tipo}/${comp.tipo}: ${comp.texto.slice(0, 200)}`);
    await sair(N, page);
    await entrar(N, page, CONTAB, SENHA);
    await irPara(N, page, hrefOrdem);
    const liq2 = await liquidar("100,00");
    await irPara(N, page, hrefOrdem);
    const valores = await page.$eval("[data-valores-da-ordem]", (e) => e.textContent ?? "");
    R.conferir("9.2 liquidado o complemento: a ordem mostra medido R$ 1.000,00 (a estornada fora), recebido R$ 1.000,00 e liquidado R$ 1.000,00", liq2.tipo === "ok" && /Medido\s*R\$\s*1\.000,00/.test(valores) && /Recebido\s*R\$\s*1\.000,00/.test(valores) && /Liquidado\s*R\$\s*1\.000,00/.test(valores), `${liq2.tipo}: ${valores}`);
    await sair(N, page);

    // ══ 10. o andamento da obra por serviço ══
    await entrar(N, page, ENGENHARIA, SENHA);
    await irPara(N, page, hrefVersao);
    const linha = async (codigo: string) => page.$eval(`[data-andamento-do-servico="${codigo}"]`, (tr) => Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim())).catch(() => [] as string[]);
    const [a11, a12] = [await linha("1.1"), await linha("1.2")];
    const medicoes = await page.$$eval("[data-medicoes-pela-planilha] li", (ls) => ls.map((l) => l.textContent ?? ""));
    R.conferir("10.1 a versão mostra o andamento: 1.1 previsto 8, medido 6, saldo 2; 1.2 medido 8 (a estornada fora); as duas medições listadas, uma estornada", a11[2] === "8" && a11[3] === "6" && a11[4] === "2" && a12[3] === "8" && medicoes.length === 2 && medicoes.some((m) => m.includes("estornada")) && medicoes.some((m) => m.includes("com recebimento definitivo")), `1.1=${a11.join("|")} 1.2=${a12.join("|")} medicoes=${medicoes.join(" / ").slice(0, 300)}`);
    await capturar(page, "versao-andamento");
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
