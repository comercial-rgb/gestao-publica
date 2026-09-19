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
 *
 * ═══ A GLOSA E OS DOIS ESTORNOS (V9 N4 — fecha `GLOSA-SEM-PERCURSO` e `ESTORNO-DE-RECEBIMENTO-SEM-PERCURSO`) ═══
 *
 *  12. A GLOSA. O fiscal mede as 2 horas que faltavam (medição nº 2, R$ 100,00) e recebe provisoriamente com 1 hora
 *      em controvérsia; o recebedor decide REJEITADA. Pela TELA e depois de RECARREGAR: a coluna "Glosado" do item 2
 *      deixa de ser zero, o saldo de EXECUÇÃO volta (o item volta a "a executar" na MESMA ordem) e o saldo de
 *      PAGAMENTO não volta (o elegível continua sem a hora glosada). Receber a medição inteira RECUSA nomeando
 *      `GLOSA-CONFIRMADA`; a parte regular (R$ 50,00) segue.
 *  13. O ESTORNO DA MEDIÇÃO. Medição nº 3 sem dependente: estorna, e as quantidades voltam a executar. Duas negativas
 *      pelo servidor: estornar de novo (`MEDICAO-JA-ESTORNADA`) e estornar a medição nº 4, que ganhou recebimento
 *      provisório (`MEDICAO-COM-RECEBIMENTO`, com o dependente nomeado).
 *  14. O ESTORNO DO RECEBIMENTO DEFINITIVO. O termo nº 1 da medição nº 1 lastreia R$ 900,00 liquidados: a tela avisa
 *      ANTES do clique e o servidor RECUSA com `RECEBIMENTO-LIQUIDADO` — primeiro o dinheiro volta, depois o
 *      recebimento se desfaz. O termo nº 1 da medição nº 2 (R$ 50,00, sem liquidação) estorna: o termo continua no
 *      histórico, marcado, e o elegível volta. Estornar de novo RECUSA (`RECEBIMENTO-JA-ESTORNADO`).
 *
 * ⚠️ POR QUE DUAS ABAS NAS NEGATIVAS DE 13 E 14. A página ESCONDE o formulário assim que a pré-condição cai (medição
 * já estornada, medição com recebimento, recebimento já estornado). Pela interface, o único caminho até a guarda do
 * SERVIDOR é a tela VELHA — duas abas, ou duas pessoas na mesma ordem —, que é exatamente o caso para o qual a guarda
 * existe ("botão oculto não é proteção"). A aba B é carregada ANTES do ato que muda o estado e enviada DEPOIS dele.
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
const MOTIVO_GLOSA = `Hora técnica sem registro de entrada e saída na unidade (percurso ${PONTE?.sufixo ?? ""})`;
const VERIFICACOES = `Relatórios de visita e planilha de horas conferidos (percurso ${PONTE?.sufixo ?? ""})`;

/**
 * O FORMULÁRIO DO ESTORNO DE UM RECEBIMENTO, RECORTADO PELA MEDIÇÃO.
 *
 * ⚠️ `data-acao="estornar-recebimento-N"` NÃO É ÚNICO NA PÁGINA: `N` é o número do recebimento DENTRO da medição, e
 * uma ordem com duas medições tem dois "nº 1". Sem o recorte, o percurso enviaria o formulário de outra medição.
 */
const formEstornoDoRecebimento = async (page: Page, medicao: number, recibo: number): Promise<string> => {
  // ⚠️ A CHAVE DO ATO É O ID DO RECEBIMENTO, NÃO O NÚMERO — E ESTE ROTEIRO NASCEU DESATUALIZADO.
  // A V5.2 trocou `data-acao="estornar-recebimento-<numero>"` por `<id>` exatamente porque o
  // número se repete entre medições; este roteiro foi escrito DEPOIS, contra o nome antigo, e
  // foi tipado sem nunca ser executado. Na primeira execução real, o passo 14.1 não achou
  // formulário nenhum. Agora o recorte (medição, recebimento) é lido da TELA e o `data-acao`
  // exato vem de lá — o percurso deixa de depender de como a chave é formada.
  const acao = await page.evaluate(
    (m, r) =>
      document
        .querySelector(`li[data-medicao-da-ordem="${m}"] li[data-recebimento-definitivo="${r}"] form[data-acao^="estornar-recebimento-"]`)
        ?.getAttribute("data-acao") ?? "",
    medicao,
    recibo
  );
  if (acao === "") throw new Error(`não achei o formulário de estorno do recebimento nº ${recibo} da medição nº ${medicao} nesta tela.`);
  return `form[data-acao="${acao}"]`;
};

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

/** O texto de um elemento — por `textContent`, que enxerga dentro de `<details>` fechado (o `innerText` seria vazio). */
async function conteudo(page: Page, sel: string): Promise<string> {
  return page.$eval(sel, (e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).catch(() => "");
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

    // ══ 12. A GLOSA: a controvérsia REJEITADA devolve o saldo de EXECUÇÃO e não devolve o de PAGAMENTO ══
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefOrdem);
    const mH2 = await campoPeloRotulo(page, formMedir, `Hora técnica ${SUF}`);
    const med2 = await preencherEEnviar(page, "medir-ordem-de-servico", [
      { sel: 'input[name="diaInicio"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="diaFim"]', valor: HOJE, tipo: "data" },
      { sel: `input[name="${mH2}"]`, valor: "2" },
    ]);
    R.conferir("12.1 o fiscal mede as 2 horas que faltavam: medição nº 2 de R$ 100,00", med2.tipo === "ok" && /Medição nº 2 registrada: R\$ 100,00/.test(med2.texto), `${med2.tipo}: ${med2.texto.slice(0, 240)}`);
    await irPara(N, page, hrefOrdem);
    const horaId2 = await page.$$eval(`${formProv} fieldset`, (fs, t) => (fs.find((f) => (f.textContent ?? "").includes(t as string))?.querySelector('input[name^="conforme."]') as HTMLInputElement | null)?.name.slice("conforme.".length) ?? "", `Hora técnica ${SUF}`);
    const prov2 = await preencherEEnviar(page, "receber-provisoriamente", [
      { sel: `input[name="conforme.${horaId2}"]`, valor: "1" }, { sel: `input[name="controversia.${horaId2}"]`, valor: "1" }, { sel: `input[name="motivo.${horaId2}"]`, valor: MOTIVO_GLOSA },
      { sel: 'textarea[name="verificacoes"]', valor: VERIFICACOES },
    ]);
    R.conferir("12.2 o fiscal recebe provisoriamente a medição nº 2: R$ 50,00 conforme e R$ 50,00 em controvérsia", prov2.tipo === "ok" && /R\$ 50,00 conforme; R\$ 50,00 em controvérsia/.test(prov2.texto), `${prov2.tipo}: ${prov2.texto.slice(0, 240)} (campo ${horaId2 === "" ? "não achado" : "achado"})`);
    await sair(N, page);

    await entrar(N, page, RECEBEDOR, SENHA);
    await irPara(N, page, hrefOrdem);
    const dec2 = await preencherEEnviar(page, "decidir-controversia", [
      { sel: 'select[name="resultado"]', valor: "REJEITADA", tipo: "select" },
      { sel: 'textarea[name="fundamento"]', valor: `A hora apontada não tem registro de entrada e saída na unidade (percurso ${SUF})` },
    ]);
    R.conferir("12.3 o recebedor REJEITA a controvérsia: glosa confirmada de R$ 50,00", dec2.tipo === "ok" && /Controvérsia rejeitada: glosa confirmada de R\$ 50,00/.test(dec2.texto), `${dec2.tipo}: ${dec2.texto.slice(0, 240)}`);
    await irPara(N, page, hrefOrdem);
    const item2 = await page.$eval('tr[data-item-da-ordem="2"]', (tr) => {
      const g = tr.querySelector("td[data-glosado]");
      return {
        medido: (g?.previousElementSibling?.textContent ?? "").trim(),
        glosado: (g?.textContent ?? "").trim(),
        aExecutar: (tr.querySelector("td[data-a-executar]")?.textContent ?? "").trim(),
      };
    });
    R.conferir(
      "12.4 recarregada, a ordem mostra o GLOSADO do item 2 (1) e o saldo de EXECUÇÃO de volta na MESMA ordem: medido 9, a executar 1",
      item2.glosado === "1" && item2.aExecutar === "1" && item2.medido === "9",
      `medido=${item2.medido} glosado=${item2.glosado} aExecutar=${item2.aExecutar}`
    );
    const eleg2 = await conteudo(page, 'li[data-medicao-da-ordem="2"] tr[data-item-medido="2"] td[data-elegivel]');
    const valoresMed2 = await conteudo(page, 'li[data-medicao-da-ordem="2"] [data-valores-da-medicao]');
    R.conferir(
      "12.4b o saldo de PAGAMENTO não voltou: o elegível da medição nº 2 continua 1 (só o conforme) e a tela separa glosado R$ 50,00 de conforme R$ 50,00",
      eleg2 === "1" && /glosado\s*R\$\s*50,00/.test(valoresMed2) && /conforme\s*R\$\s*50,00/.test(valoresMed2),
      `elegivel=${eleg2} · ${valoresMed2}`
    );
    const formDef = 'form[data-acao="receber-definitivamente"]';
    const campoReceber = await page.$$eval(`${formDef} input[name^="receber."]`, (is) => (is[0] as HTMLInputElement | undefined)?.name ?? "");
    const negGlosa = await preencherEEnviar(page, "receber-definitivamente", [
      { sel: `input[name="${campoReceber}"]`, valor: "2" },
      { sel: 'textarea[name="conclusao"]', valor: `Tentativa de receber a medição inteira, com a hora glosada (percurso ${SUF})` },
    ]);
    R.conferir(
      "12.5 NEGATIVA: receber em definitivo a hora REJEITADA recusa, e a recusa diz GLOSA-CONFIRMADA com o glosado e o elegível",
      negGlosa.tipo === "erro" && /GLOSA-CONFIRMADA/.test(negGlosa.texto) && /1\.0000 hora foram rejeitados/.test(negGlosa.texto) && /elegível 1\.0000/.test(negGlosa.texto),
      `${negGlosa.tipo}: ${negGlosa.texto.slice(0, 300)}`
    );
    const def2 = await preencherEEnviar(page, "receber-definitivamente", [
      { sel: `input[name="${campoReceber}"]`, valor: "1" },
      { sel: 'textarea[name="conclusao"]', valor: `Parte regular da medição nº 2, sem a hora glosada (percurso ${SUF})` },
    ]);
    R.conferir("12.6 a parte regular segue: recebimento definitivo de R$ 50,00 na medição nº 2 — não os R$ 100,00 medidos", def2.tipo === "ok" && /nº 1 registrado: R\$ 50,00/.test(def2.texto), `${def2.tipo}: ${def2.texto.slice(0, 260)}`);
    await irPara(N, page, hrefOrdem);
    const linhaDec2 = await conteudo(page, 'li[data-medicao-da-ordem="2"] tr[data-item-medido="2"]');
    const valoresMed2b = await conteudo(page, 'li[data-medicao-da-ordem="2"] [data-valores-da-medicao]');
    R.conferir(
      "12.7 recarregada, a decisão persiste como 'rejeitada (glosa)' e a medição nº 2 fica com glosado R$ 50,00 e recebido R$ 50,00",
      /rejeitada \(glosa\)/.test(linhaDec2) && /glosado\s*R\$\s*50,00/.test(valoresMed2b) && /recebido\s*R\$\s*50,00/.test(valoresMed2b),
      `${linhaDec2.slice(0, 200)} || ${valoresMed2b}`
    );
    await capturar(page, "ordem-glosa");
    await sair(N, page);

    // ══ 13. O ESTORNO DA MEDIÇÃO — o que funciona, e as duas recusas com o motivo nomeado ══
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefOrdem);
    const mH3 = await campoPeloRotulo(page, formMedir, `Hora técnica ${SUF}`);
    const med3 = await preencherEEnviar(page, "medir-ordem-de-servico", [
      { sel: 'input[name="diaInicio"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="diaFim"]', valor: HOJE, tipo: "data" },
      { sel: `input[name="${mH3}"]`, valor: "1" },
    ]);
    R.conferir("13.1 o fiscal remede a hora glosada dentro da MESMA ordem: medição nº 3 de R$ 50,00", med3.tipo === "ok" && /Medição nº 3 registrada: R\$ 50,00/.test(med3.texto), `${med3.tipo}: ${med3.texto.slice(0, 240)}`);
    await irPara(N, page, hrefOrdem);
    // A aba B abre com a tela de AGORA e só envia depois do ato da aba A — é a tela velha de quem ficou com a página aberta.
    const abaB = await navegador.newPage();
    abaB.setDefaultTimeout(120000);
    await abaB.setViewport({ width: 1366, height: 900 });
    await irPara(N, abaB, hrefOrdem);
    R.conferir("13.2 as duas abas do fiscal oferecem o estorno da medição nº 3 (ainda sem recebimento)", (await page.$('form[data-acao="estornar-medicao-3"]')) !== null && (await abaB.$('form[data-acao="estornar-medicao-3"]')) !== null, "o formulário do estorno não apareceu nas duas abas");
    const est3 = await preencherEEnviar(page, "estornar-medicao-3", [{ sel: 'textarea[name="motivo"]', valor: `Período lançado em duplicidade pelo fiscal (percurso ${SUF})` }]);
    R.conferir("13.3 a medição sem dependente estorna: R$ 50,00, com o histórico preservado", est3.tipo === "ok" && /Medição nº 3 estornada \(R\$ 50,00\)/.test(est3.texto), `${est3.tipo}: ${est3.texto.slice(0, 240)}`);
    await irPara(N, page, hrefOrdem);
    const estorno3 = await conteudo(page, '[data-estorno-da-medicao="3"]');
    const item2Dep = await page.$eval('tr[data-item-da-ordem="2"]', (tr) => ({ medido: (tr.querySelector("td[data-glosado]")?.previousElementSibling?.textContent ?? "").trim(), aExecutar: (tr.querySelector("td[data-a-executar]")?.textContent ?? "").trim() }));
    R.conferir(
      "13.4 recarregada, a medição nº 3 está no histórico marcada como estornada e a quantidade voltou a executar (medido 9, a executar 1)",
      estorno3.includes("Fica no histórico e fora das somas") && item2Dep.medido === "9" && item2Dep.aExecutar === "1",
      `${estorno3.slice(0, 160)} || medido=${item2Dep.medido} aExecutar=${item2Dep.aExecutar}`
    );
    const neg3 = await preencherEEnviar(abaB, "estornar-medicao-3", [{ sel: 'textarea[name="motivo"]', valor: `Segundo estorno da mesma medição, pela tela velha (percurso ${SUF})` }]);
    R.conferir(
      "13.5 NEGATIVA: estornar a mesma medição duas vezes (aba com a tela velha) recusa dizendo MEDICAO-JA-ESTORNADA",
      neg3.tipo === "erro" && /MEDICAO-JA-ESTORNADA/.test(neg3.texto) && /medição nº 3/.test(neg3.texto),
      `${neg3.tipo}: ${neg3.texto.slice(0, 300)}`
    );
    const mH4 = await campoPeloRotulo(page, formMedir, `Hora técnica ${SUF}`);
    const med4 = await preencherEEnviar(page, "medir-ordem-de-servico", [
      { sel: 'input[name="diaInicio"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="diaFim"]', valor: HOJE, tipo: "data" },
      { sel: `input[name="${mH4}"]`, valor: "1" },
    ]);
    R.conferir("13.6 o fiscal remede a hora: medição nº 4 de R$ 50,00", med4.tipo === "ok" && /Medição nº 4 registrada: R\$ 50,00/.test(med4.texto), `${med4.tipo}: ${med4.texto.slice(0, 240)}`);
    await irPara(N, page, hrefOrdem);
    await irPara(N, abaB, hrefOrdem);
    R.conferir("13.7 a aba B carrega a ordem com o estorno da medição nº 4 ainda oferecido", (await abaB.$('form[data-acao="estornar-medicao-4"]')) !== null, "o formulário do estorno da medição nº 4 não apareceu na aba B");
    const horaId4 = await page.$$eval(`${formProv} fieldset`, (fs, t) => (fs.find((f) => (f.textContent ?? "").includes(t as string))?.querySelector('input[name^="conforme."]') as HTMLInputElement | null)?.name.slice("conforme.".length) ?? "", `Hora técnica ${SUF}`);
    const prov4 = await preencherEEnviar(page, "receber-provisoriamente", [
      { sel: `input[name="conforme.${horaId4}"]`, valor: "1" }, { sel: `input[name="controversia.${horaId4}"]`, valor: "0" },
      { sel: 'textarea[name="verificacoes"]', valor: VERIFICACOES },
    ]);
    R.conferir("13.8 o fiscal recebe provisoriamente a medição nº 4: R$ 50,00 conforme, sem controvérsia", prov4.tipo === "ok" && /R\$ 50,00 conforme, sem controvérsia/.test(prov4.texto), `${prov4.tipo}: ${prov4.texto.slice(0, 240)}`);
    const neg4 = await preencherEEnviar(abaB, "estornar-medicao-4", [{ sel: 'textarea[name="motivo"]', valor: `Estorno pedido depois do recebimento, pela tela velha (percurso ${SUF})` }]);
    R.conferir(
      "13.9 NEGATIVA: a medição com recebimento pendurado recusa dizendo MEDICAO-COM-RECEBIMENTO e nomeando o dependente",
      neg4.tipo === "erro" && /MEDICAO-COM-RECEBIMENTO/.test(neg4.texto) && /medição nº 4/.test(neg4.texto) && /já tem recebimento provisório de \d{2}\/\d{2}\/\d{4}/.test(neg4.texto) && /Nada foi gravado/.test(neg4.texto),
      `${neg4.tipo}: ${neg4.texto.slice(0, 340)}`
    );
    await capturar(page, "ordem-estorno-de-medicao");
    await abaB.close();
    await sair(N, page);

    // ══ 14. O ESTORNO DO RECEBIMENTO DEFINITIVO — a ordem da cadeia: o dinheiro volta primeiro ══
    await entrar(N, page, RECEBEDOR, SENHA);
    await irPara(N, page, hrefOrdem);
    const bloqueio = await conteudo(page, `${await formEstornoDoRecebimento(page, 1, 1)} [data-bloqueio-do-estorno]`);
    R.conferir(
      "14.1 a tela AVISA antes do clique: o termo nº 1 da medição nº 1 lastreia R$ 900,00 liquidados e o estorno será recusado até a liquidação ser estornada",
      /lastreia R\$\s*900[.,]00 já liquidados/.test(bloqueio) && /estorne-a primeiro/i.test(bloqueio),
      bloqueio === "" ? "o aviso do bloqueio não está na tela" : bloqueio.slice(0, 240)
    );
    const negLiq = await preencherEEnviar(page, await formEstornoDoRecebimento(page, 1, 1), [
      { sel: 'input[name="data"]', valor: HOJE, tipo: "data" },
      { sel: 'textarea[name="motivo"]', valor: `Tentativa de desfazer o termo que lastreia a liquidação (percurso ${SUF})` },
    ]);
    R.conferir(
      "14.2 NEGATIVA: o recebimento já liquidado não se estorna, e a recusa diz RECEBIMENTO-LIQUIDADO, o valor e onde se estorna a liquidação",
      negLiq.tipo === "erro" && /RECEBIMENTO-LIQUIDADO/.test(negLiq.texto) && /lastreia R\$ 900\.00 já liquidados/.test(negLiq.texto) && /Despesa › Liquidações/.test(negLiq.texto) && /Nada foi gravado/.test(negLiq.texto),
      `${negLiq.tipo}: ${negLiq.texto.slice(0, 340)}`
    );
    const abaC = await navegador.newPage();
    abaC.setDefaultTimeout(120000);
    await abaC.setViewport({ width: 1366, height: 900 });
    await irPara(N, abaC, hrefOrdem);
    const estRec = await preencherEEnviar(page, await formEstornoDoRecebimento(page, 2, 1), [
      { sel: 'input[name="data"]', valor: HOJE, tipo: "data" },
      { sel: 'textarea[name="motivo"]', valor: `Termo com quantidade conferida a maior; será refeito (percurso ${SUF})` },
    ]);
    R.conferir(
      "14.3 o recebimento SEM liquidação estorna: R$ 50,00, com termo próprio, e o original continua no histórico",
      estRec.tipo === "ok" && /Recebimento definitivo nº 1 \(R\$ 50,00\) estornado/.test(estRec.texto) && /continua no histórico/.test(estRec.texto),
      `${estRec.tipo}: ${estRec.texto.slice(0, 300)}`
    );
    await irPara(N, page, hrefOrdem);
    const selo = await conteudo(page, 'li[data-medicao-da-ordem="2"] [data-recebimento-estornado]');
    const linhaRec2 = await conteudo(page, 'li[data-medicao-da-ordem="2"] li[data-recebimento-definitivo="1"]');
    const elegDepois = await conteudo(page, 'li[data-medicao-da-ordem="2"] tr[data-item-medido="2"] td[data-elegivel]');
    R.conferir(
      "14.4 recarregada, o termo nº 1 da medição nº 2 aparece estornado (com autor e motivo), continua valendo R$ 50,00 no papel, e o ELEGÍVEL voltou a 1",
      selo.startsWith("estornado em") && /R\$\s*50,00/.test(linhaRec2) && elegDepois === "1",
      `selo=${selo.slice(0, 160)} · linha=${linhaRec2.slice(0, 160)} · elegivel=${elegDepois}`
    );
    const negRec = await preencherEEnviar(abaC, await formEstornoDoRecebimento(abaC, 2, 1), [
      { sel: 'input[name="data"]', valor: HOJE, tipo: "data" },
      { sel: 'textarea[name="motivo"]', valor: `Segundo estorno do mesmo termo, pela tela velha (percurso ${SUF})` },
    ]);
    R.conferir(
      "14.5 NEGATIVA: estornar o mesmo recebimento duas vezes (aba com a tela velha) recusa dizendo RECEBIMENTO-JA-ESTORNADO",
      negRec.tipo === "erro" && /RECEBIMENTO-JA-ESTORNADO/.test(negRec.texto) && /recebimento definitivo nº 1 da medição nº 2/.test(negRec.texto),
      `${negRec.tipo}: ${negRec.texto.slice(0, 340)}`
    );
    // Medições que o percurso deixa para a leitura da evidência bruta (não são afirmações de passo).
    console.log(`      [após o estorno do termo · valores da ordem: ${await conteudo(page, "[data-valores-da-ordem]")}]`);
    console.log(`      [após o estorno do termo · parcelas oferecidas à liquidação: ${(await page.$eval("[data-parcelas-a-liquidar]", (e) => e.getAttribute("data-parcelas-a-liquidar")).catch(() => "nenhuma"))}]`);
    await capturar(page, "ordem-estorno-de-recebimento");
    await abaC.close();
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
