import "dotenv/config";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — A PONTE CONTRATUAL-FINANCEIRA (V7 M2 U4), POR PAPÉIS.
 *
 * Preparação (`scripts/preparar-ponte-contratual.ts`, declarada): contrato de serviços com dois itens (visita 10 ×
 * R$ 100,00; hora 20 × R$ 50,00), gestora, fiscal e recebedor designados, empenho de R$ 1.100,00 do contrato. A
 * preparação entrega a linha `PONTE {json}` em `PONTE_JSON`.
 *
 * Pela tela, cada um com a SUA conta (nenhum passo com administrador universal):
 *   1. a gestora abre o contrato com as duas linhas; 2. cria e emite a ordem (6 visitas + 10 horas = R$ 1.100,00);
 *   3. o fiscal acha a ordem pela lista da fiscalização e mede 6 visitas + 8 horas (R$ 1.000,00);
 *   4. recebe provisoriamente com 1 visita em controvérsia (R$ 900,00 conforme);
 *   5. o recebedor designado recebe em definitivo só a parte regular (R$ 900,00); outro setor não recebe;
 *   6. o almoxarifado registra e confere a nota do fornecedor (R$ 1.000,00);
 *   7. a contabilidade liquida a parcela (R$ 900,00) pelo M05 e consulta o efeito;
 *   8. a parcela liquidada não se oferece de novo (sem duplicidade);
 *   9. o visitante vê a projeção pública sem motivo nem termo; outro setor vê a financeira e não baixa o termo provisório;
 *  10. o fiscal reimprime o termo definitivo (PDF lido: título, valor e sha256) e o visitante não o baixa;
 *  11. o recebedor aceita a controvérsia e recebe o complemento (R$ 100,00, não a medição inteira); a contabilidade
 *      liquida os R$ 100,00 com a mesma nota — liquidado R$ 1.000,00.
 * O passo 12 dos critérios (apropriação da folha) é o percurso próprio, `smoke-apropriacao-da-folha.ts`, na mesma
 * cadeia do candidato.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
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
const MOTIVO = `Visita à unidade sem assinatura do responsável (percurso ${PONTE?.sufixo ?? ""})`;
const VERIFICACOES = `Relatórios de visita e planilha de horas conferidos (percurso ${PONTE?.sufixo ?? ""})`;

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `ponte-${nome}.png`), fullPage: true });
}

/** O `name` do campo cujo rótulo contém o trecho (dentro do formulário). */
async function campoPeloRotulo(page: Page, form: string, trecho: string): Promise<string> {
  return page.$$eval(`${form} label`, (ls, t) => {
    const l = ls.find((x) => (x.textContent ?? "").includes(t as string));
    return (l?.querySelector("input, select, textarea") as HTMLInputElement | null)?.name ?? "";
  }, trecho);
}

/** O valor da opção cujo texto contém o trecho. */
async function opcao(page: Page, select: string, trecho: string): Promise<string> {
  return page.$$eval(`${select} option`, (os, t) => (os.find((o) => (o.textContent ?? "").includes(t as string)) as HTMLOptionElement | undefined)?.value ?? "", trecho);
}

/** Baixa pelo navegador (com a sessão) e devolve status, tipo e o texto do PDF (lido pelo pdfjs no Node). */
async function baixarPdf(page: Page, url: string): Promise<{ readonly status: number; readonly tipo: string; readonly texto: string }> {
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

async function main(): Promise<void> {
  if (PONTE === null) {
    R.falhou("preparação", "PONTE_JSON ausente: rode scripts/preparar-ponte-contratual.ts no banco descartável antes");
    R.encerrar();
    return;
  }
  let navegador: Browser | undefined;
  const SUF = PONTE.sufixo;
  const hrefContrato = `/licitacoes/contratos/${PONTE.contratoId}`;
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [contrato ${PONTE.contrato} · empenho ${PONTE.empenho} · banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"}]`);

    // ══ 1–2. a gestora: contrato, rascunho, prévia e emissão ══
    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, hrefContrato);
    const saldo = await page.$$eval("[data-saldo-dos-itens] [data-a-autorizar]", (tds) => tds.map((t) => (t.textContent ?? "").trim()));
    R.conferir("1.1 a gestora abre o contrato com as duas linhas e o saldo a autorizar (10 visitas, 20 horas)", (await page.$('[data-execucao-do-contrato="FISCALIZACAO"]')) !== null && saldo.join("|") === "10|20", `saldo=${saldo.join("|")}`);
    const formNova = 'form[data-acao="criar-ordem-de-servico"]';
    const [campoVisita, campoHora, fiscal, empenho] = [
      await campoPeloRotulo(page, formNova, `Visita técnica ${SUF}`), await campoPeloRotulo(page, formNova, `Hora técnica ${SUF}`),
      await opcao(page, `${formNova} select[name="fiscalDesignacaoId"]`, `Fábio Fiscal Ponte ${SUF}`), await opcao(page, `${formNova} select[name="empenhoId"]`, PONTE.empenho),
    ];
    const rasc = await preencherEEnviar(page, "criar-ordem-de-servico", [
      { sel: 'textarea[name="finalidade"]', valor: `Manutenção preventiva das unidades de saúde — percurso ${SUF}` },
      { sel: 'input[name="inicioPrevisto"]', valor: dia(-10), tipo: "data" }, { sel: 'input[name="fimPrevisto"]', valor: dia(30), tipo: "data" },
      { sel: 'select[name="fiscalDesignacaoId"]', valor: fiscal, tipo: "select" }, { sel: 'select[name="empenhoId"]', valor: empenho, tipo: "select" },
      { sel: 'textarea[name="condicoes"]', valor: "Relatório de visitas assinado e planilha de horas" },
      { sel: `input[name="${campoVisita}"]`, valor: "6" }, { sel: `input[name="${campoHora}"]`, valor: "10" },
    ]);
    R.conferir("2.1 a gestora cria o rascunho: R$ 1.100,00 previstos, sem comprometer saldo", rasc.tipo === "ok" && /R\$ 1\.100,00 previstos em 2 item/.test(rasc.texto), `${rasc.tipo}: ${rasc.texto.slice(0, 240)}`);
    await irPara(N, page, hrefContrato);
    const hrefOrdem = await page.$$eval("[data-ordens-de-servico] a[href*='/ordens/']", (as) => (as[0] as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    await irPara(N, page, hrefOrdem);
    const previa = await texto(page);
    R.conferir("2.2 a prévia da emissão mostra o efeito por item (6 de 10 visitas, 10 de 20 horas) antes de gravar", (await page.$("[data-previa-da-emissao]")) !== null && previa.includes("disponível hoje") && (await page.$("[data-previa-sem-saldo]")) === null, previa.slice(0, 300));
    const emit = await preencherEEnviar(page, "emitir-ordem-de-servico", [{ sel: 'input[name="inicioAutorizado"]', valor: dia(-10), tipo: "data" }]);
    R.conferir("2.3 a gestora emite: R$ 1.100,00 autorizados; a mensagem diz que emitir não empenha nem paga", emit.tipo === "ok" && /R\$ 1\.100,00 autorizados/.test(emit.texto) && /não empenha nem paga/.test(emit.texto), `${emit.tipo}: ${emit.texto.slice(0, 240)}`);
    const numeroOrdem = await page.$eval("[data-ordem-de-servico-pagina]", (e) => e.getAttribute("data-ordem-de-servico-pagina") ?? "").catch(() => "");
    console.log(`      [ordem de serviço nº ${numeroOrdem}]`);
    await irPara(N, page, hrefContrato);
    const saldoDepois = await page.$$eval("[data-saldo-dos-itens] [data-a-autorizar]", (tds) => tds.map((t) => (t.textContent ?? "").trim()));
    R.conferir("2.4 recarregado, o contrato tem 4 visitas e 10 horas a autorizar", saldoDepois.join("|") === "4|10", saldoDepois.join("|"));
    await irPara(N, page, hrefOrdem);
    const espelho = await baixarPdf(page, `${hrefOrdem.replace(/\/ordens\/.*/, "")}/documentos/ordem/${hrefOrdem.split("/").pop()}`);
    R.conferir("2.5 o espelho da ordem sai em PDF com o total e o nome da ordem", espelho.status === 200 && espelho.texto.includes(`ORDEM DE SERVIÇO Nº ${numeroOrdem}`) && espelho.texto.includes("R$ 1.100,00"), `${espelho.status} ${espelho.tipo} ${espelho.texto.slice(0, 160)}`);
    R.conferir("2.6 NEGATIVA: a gestora não recebe o formulário de medição (é do fiscal) e lê o motivo", (await page.$('form[data-acao="medir-ordem-de-servico"]')) === null && (await texto(page)).includes("é do fiscal designado"), "formulário de medição apareceu para a gestora");
    await capturar(page, "ordem-gestora");
    await sair(N, page);

    // ══ 3–4. o fiscal: acha a ordem, mede, confere e recebe provisoriamente ══
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, "/licitacoes/fiscalizacao");
    R.conferir("3.1 o fiscal acha o contrato na lista da fiscalização, com o papel", (await page.$(`[data-contrato-fiscalizado="${PONTE.contrato}"]`)) !== null, (await texto(page)).slice(0, 300));
    await irPara(N, page, hrefOrdem);
    const formMedir = 'form[data-acao="medir-ordem-de-servico"]';
    const [mV, mH] = [await campoPeloRotulo(page, formMedir, `Visita técnica ${SUF}`), await campoPeloRotulo(page, formMedir, `Hora técnica ${SUF}`)];
    const med = await preencherEEnviar(page, "medir-ordem-de-servico", [
      { sel: 'input[name="diaInicio"]', valor: dia(-5), tipo: "data" }, { sel: 'input[name="diaFim"]', valor: dia(-1), tipo: "data" },
      { sel: `input[name="${mV}"]`, valor: "6" }, { sel: `input[name="${mH}"]`, valor: "8" },
    ]);
    R.conferir("3.2 o fiscal mede 6 visitas e 8 horas: R$ 1.000,00, e a mensagem diz o que ainda falta executar", med.tipo === "ok" && /R\$ 1\.000,00/.test(med.texto) && /Ainda a executar: item 2, 2/.test(med.texto), `${med.tipo}: ${med.texto.slice(0, 260)}`);
    await irPara(N, page, hrefOrdem);
    const formProv = 'form[data-acao="receber-provisoriamente"]';
    const nomes = await page.$$eval(`${formProv} input[name^="conforme."]`, (is) => is.map((i) => (i as HTMLInputElement).name.slice("conforme.".length)));
    const visitaId = await page.$$eval(`${formProv} fieldset`, (fs, t) => (fs.find((f) => (f.textContent ?? "").includes(t as string))?.querySelector('input[name^="conforme."]') as HTMLInputElement | null)?.name.slice("conforme.".length) ?? "", `Visita técnica ${SUF}`);
    const prov = await preencherEEnviar(page, "receber-provisoriamente", [
      { sel: `input[name="conforme.${visitaId}"]`, valor: "5" }, { sel: `input[name="controversia.${visitaId}"]`, valor: "1" }, { sel: `input[name="motivo.${visitaId}"]`, valor: MOTIVO },
      { sel: 'textarea[name="verificacoes"]', valor: VERIFICACOES },
    ]);
    R.conferir("4.1 o fiscal recebe provisoriamente: R$ 900,00 conforme e R$ 100,00 em controvérsia", prov.tipo === "ok" && /R\$ 900,00 conforme; R\$ 100,00 em controvérsia/.test(prov.texto), `${prov.tipo}: ${prov.texto.slice(0, 240)} (itens ${nomes.length})`);
    await irPara(N, page, hrefOrdem);
    R.conferir("4.2 NEGATIVA: o fiscal não recebe em definitivo (não é o recebedor designado) e lê o motivo", (await page.$('form[data-acao="receber-definitivamente"]')) === null && (await texto(page)).includes("é do recebedor designado"), "o fiscal viu o formulário do definitivo");
    await capturar(page, "ordem-fiscal-conferencia");
    await sair(N, page);

    // ══ 5. o recebedor: definitivo só da parte regular; outro setor não recebe ══
    await entrar(N, page, OUTRO, SENHA);
    await irPara(N, page, hrefOrdem);
    R.conferir("5.0 NEGATIVA: outro setor, com a ação de receber em definitivo e sem designação, não recebe o formulário", (await page.$('form[data-acao="receber-definitivamente"], form[data-acao="decidir-controversia"]')) === null && (await texto(page)).includes("é do recebedor designado"), "outro setor viu o formulário");
    await sair(N, page);
    await entrar(N, page, RECEBEDOR, SENHA);
    await irPara(N, page, hrefOrdem);
    const def = await preencherEEnviar(page, "receber-definitivamente", [{ sel: 'textarea[name="conclusao"]', valor: `Visitas e horas conferidas com os relatórios assinados (percurso ${SUF})` }]);
    R.conferir("5.1 o recebedor recebe em definitivo R$ 900,00 (o elegível), e a pendência da visita sai nomeada", def.tipo === "ok" && /R\$ 900,00/.test(def.texto) && /1\.0000 visita em controvérsia aguardando decisão/.test(def.texto), `${def.tipo}: ${def.texto.slice(0, 260)}`);
    await capturar(page, "ordem-recebedor");
    await sair(N, page);

    // ══ 6. o almoxarifado registra e confere a nota do fornecedor ══
    await entrar(N, page, ALMOX, SENHA);
    await irPara(N, page, "/licitacoes/documentos-fiscais");
    const formDoc = 'form[data-acao="registrar-documento-fiscal"]';
    const [emitente, contrato] = [await opcao(page, `${formDoc} select[name="emitenteId"]`, `Serviços Técnicos Ponte ${SUF}`), await opcao(page, `${formDoc} select[name="contratoId"]`, PONTE.contrato)];
    const rDoc = await preencherEEnviar(page, "registrar-documento-fiscal", [
      { sel: 'select[name="emitenteId"]', valor: emitente, tipo: "select" }, { sel: 'select[name="modelo"]', valor: "NF_AVULSA", tipo: "select" },
      { sel: 'input[name="serie"]', valor: "1" }, { sel: 'input[name="numero"]', valor: `NFS-${SUF}` },
      { sel: 'input[name="dataEmissao"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="dataRecebimento"]', valor: HOJE, tipo: "data" },
      { sel: 'select[name="contratoId"]', valor: contrato, tipo: "select" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 0 }, { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 3 },
      { sel: 'input[name="itens.0.descricao"]', valor: `Serviços técnicos da ordem ${numeroOrdem}` }, { sel: 'input[name="itens.0.unidade"]', valor: "SV" }, { sel: 'input[name="itens.0.quantidade"]', valor: "1" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 4 }, { sel: 'input[data-mascara="valor"]', valor: "1000,00", indice: 5 },
    ]);
    R.conferir("6.1 o almoxarifado registra a nota do fornecedor do contrato (R$ 1.000,00)", rDoc.tipo === "ok" && emitente !== "" && contrato !== "", `${rDoc.tipo}: ${rDoc.texto.slice(0, 220)} emitente=${emitente !== ""} contrato=${contrato !== ""}`);
    await irPara(N, page, `/licitacoes/documentos-fiscais?q=NFS-${SUF}`);
    const hrefDoc = await page.$$eval("tbody a[href^='/licitacoes/documentos-fiscais/']", (as) => (as[0] as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    await irPara(N, page, hrefDoc);
    const conf = await preencherEEnviar(page, "conferir", [{ sel: 'input[name="data"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="motivo"]', valor: `Conferida com o termo de recebimento (percurso ${SUF})` }]);
    R.conferir("6.2 o almoxarifado confere a nota", conf.tipo === "ok", `${conf.tipo}: ${conf.texto.slice(0, 200)}`);
    await sair(N, page);

    // ══ 7–8. a contabilidade liquida a parcela e não a vê de novo ══
    await entrar(N, page, CONTAB, SENHA);
    await irPara(N, page, hrefOrdem);
    const formLiq = 'form[data-acao="liquidar-parcelas-do-contrato"]';
    const parcela1 = await page.$$eval(`${formLiq} input[name^="parcela."]`, (is) => (is[0] as HTMLInputElement | undefined)?.name ?? "");
    const [docLiq, empLiq] = [await opcao(page, `${formLiq} select[name="documentoFiscalId"]`, `NFS-${SUF}`), await opcao(page, `${formLiq} select[name="empenhoId"]`, PONTE.empenho)];
    const liq = await preencherEEnviar(page, "liquidar-parcelas-do-contrato", [
      { sel: `input[name="${parcela1}"]`, valor: "900,00" }, { sel: 'select[name="documentoFiscalId"]', valor: docLiq, tipo: "select" }, { sel: 'select[name="empenhoId"]', valor: empLiq, tipo: "select" },
    ]);
    R.conferir("7.1 a contabilidade liquida a parcela pelo M05: R$ 900,00, com a nota conferida e o empenho do contrato", liq.tipo === "ok" && /registrada no M05: R\$ 900,00/.test(liq.texto), `${liq.tipo}: ${liq.texto.slice(0, 240)}`);
    await irPara(N, page, hrefOrdem);
    const valores = await page.$eval("[data-valores-da-ordem]", (e) => e.textContent ?? "");
    R.conferir("7.2 recarregada, a ordem mostra autorizado R$ 1.100,00, medido R$ 1.000,00, recebido R$ 900,00 e liquidado R$ 900,00 — separados", /Autorizado\s*R\$\s*1\.100,00/.test(valores) && /Medido\s*R\$\s*1\.000,00/.test(valores) && /Recebido\s*R\$\s*900,00/.test(valores) && /Liquidado\s*R\$\s*900,00/.test(valores), valores);
    R.conferir("8.1 a parcela liquidada não se oferece de novo: sem parcela a liquidar e sem formulário", (await page.$("[data-sem-parcela-a-liquidar]")) !== null && (await page.$(formLiq)) === null, "a parcela continuou oferecida");
    await capturar(page, "ordem-financeiro");
    await sair(N, page);

    // ══ 9–10. projeções e documentos ══
    await entrar(N, page, OUTRO, SENHA);
    await irPara(N, page, hrefContrato);
    R.conferir("9.1 outro setor (lê licitações, sem designação) recebe a projeção financeira — sem agenda, ocorrência nem motivo", (await page.$('[data-execucao-do-contrato="FINANCEIRA"]')) !== null && (await page.$("[data-fiscalizacao-restrita]")) !== null, "a projeção não foi a financeira");
    await irPara(N, page, hrefOrdem);
    const textoFin = await texto(page);
    R.conferir("9.2 NEGATIVA: na projeção financeira da ordem não aparecem o motivo da controvérsia nem o link do termo provisório", !textoFin.includes(MOTIVO.toLowerCase()) && (await page.$('[data-documento="provisorio"]')) === null, "motivo ou termo provisório à vista");
    await sair(N, page);
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefOrdem);
    const hrefProv = await page.$eval('[data-documento="provisorio"]', (a) => a.getAttribute("href") ?? "").catch(() => "");
    const hrefDef = await page.$eval('[data-documento="definitivo"]', (a) => a.getAttribute("href") ?? "").catch(() => "");
    const pdf1 = await baixarPdf(page, hrefDef);
    const pdf2 = await baixarPdf(page, hrefDef);
    R.conferir("10.1 o fiscal reimprime o termo definitivo: PDF com título, R$ 900,00 e o sha256 — e a segunda via tem o mesmo conteúdo", pdf1.status === 200 && pdf1.texto.includes("TERMO DE RECEBIMENTO DEFINITIVO") && pdf1.texto.includes("R$ 900,00") && /sha256 [0-9a-f]{64}/.test(pdf1.texto) && pdf1.texto.replace(/Gerado em .*? UTC/g, "") === pdf2.texto.replace(/Gerado em .*? UTC/g, ""), `${pdf1.status} ${pdf1.texto.slice(0, 200)}`);
    await sair(N, page);
    await entrar(N, page, OUTRO, SENHA);
    const provOutro = await baixarPdf(page, hrefProv);
    R.conferir("9.3 NEGATIVA: outro setor, pela URL direta, não baixa o termo provisório (404)", provOutro.status === 404 && provOutro.texto === "", `${provOutro.status} ${provOutro.tipo}`);
    await sair(N, page);
    const pub = await page.goto(`${N.base}/transparencia/contratos/${PONTE.contratoId}`, { waitUntil: "networkidle2" });
    const textoPub = await texto(page);
    R.conferir("9.4 o visitante vê a ordem pública com período, autorizado e recebido — sem motivo, verificações nem termo", pub?.status() === 200 && (await page.$("[data-publico-ordens]")) !== null && textoPub.includes("r$ 900,00") && !textoPub.includes(MOTIVO.toLowerCase()) && !textoPub.includes(VERIFICACOES.toLowerCase()) && (await page.$('a[href*="/documentos/"]')) === null, textoPub.slice(0, 400));
    await capturar(page, "publico");
    const defVisitante = await page.goto(`${N.base}${hrefDef}`, { waitUntil: "domcontentloaded" });
    R.conferir("10.2 NEGATIVA: o visitante não baixa o termo definitivo (nunca o PDF)", !(defVisitante?.headers()["content-type"] ?? "").includes("pdf"), `${defVisitante?.status()} ${defVisitante?.headers()["content-type"]}`);

    // ══ 11. a controvérsia aceita e o complemento ══
    await entrar(N, page, RECEBEDOR, SENHA);
    await irPara(N, page, hrefOrdem);
    const dec = await preencherEEnviar(page, "decidir-controversia", [{ sel: 'select[name="resultado"]', valor: "ACEITA", tipo: "select" }, { sel: 'textarea[name="fundamento"]', valor: `Responsável da unidade apresentou a assinatura (percurso ${SUF})` }]);
    R.conferir("11.1 o recebedor aceita a controvérsia: 1 unidade, R$ 100,00, fica elegível ao complemento", dec.tipo === "ok" && /1 unidade\(s\), R\$ 100,00/.test(dec.texto), `${dec.tipo}: ${dec.texto.slice(0, 220)}`);
    await irPara(N, page, hrefOrdem);
    const comp = await preencherEEnviar(page, "receber-definitivamente", [{ sel: 'textarea[name="conclusao"]', valor: `Complemento da visita aceita (percurso ${SUF})` }]);
    R.conferir("11.2 o complemento recebido é R$ 100,00 — não a medição inteira", comp.tipo === "ok" && /nº 2 registrado: R\$ 100,00/.test(comp.texto), `${comp.tipo}: ${comp.texto.slice(0, 220)}`);
    await sair(N, page);
    await entrar(N, page, CONTAB, SENHA);
    await irPara(N, page, hrefOrdem);
    const parcela2 = await page.$$eval(`${formLiq} input[name^="parcela."]`, (is) => (is[0] as HTMLInputElement | undefined)?.name ?? "");
    const [docLiq2, empLiq2] = [await opcao(page, `${formLiq} select[name="documentoFiscalId"]`, `NFS-${SUF}`), await opcao(page, `${formLiq} select[name="empenhoId"]`, PONTE.empenho)];
    const liq2 = await preencherEEnviar(page, "liquidar-parcelas-do-contrato", [
      { sel: `input[name="${parcela2}"]`, valor: "100,00" }, { sel: 'select[name="documentoFiscalId"]', valor: docLiq2, tipo: "select" }, { sel: 'select[name="empenhoId"]', valor: empLiq2, tipo: "select" },
    ]);
    R.conferir("11.3 a contabilidade liquida o complemento com a mesma nota: R$ 100,00", liq2.tipo === "ok" && /registrada no M05: R\$ 100,00/.test(liq2.texto) && docLiq2 !== "", `${liq2.tipo}: ${liq2.texto.slice(0, 220)}`);
    await irPara(N, page, hrefContrato);
    const cards = await page.$eval("[data-execucao-do-contrato]", (e) => e.textContent ?? "");
    R.conferir("11.4 no contrato: recebido R$ 1.000,00 e liquidado R$ 1.000,00, e os R$ 900,00 da primeira liquidação continuam lá", /Recebido em definitivo\s*R\$\s*1\.000,00/.test(cards) && /Liquidado pelas parcelas\s*R\$\s*1\.000,00/.test(cards), cards.slice(0, 400));
    await capturar(page, "contrato-execucao");
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
