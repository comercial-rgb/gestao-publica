import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer, { type Page } from "puppeteer";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * PERCURSO DE NAVEGADOR — V27: a frota e a farmácia pública (SAGRES §4.50 a §4.57), a lei registrada com o PDF antes
 * do protocolo do Tribunal, a licitação escolhida na lista do Tribunal (Tramita) e a remessa com as 58 tabelas, que sai
 * como conferência quando há pendência.
 *
 * Uso: `DATABASE_URL=<clone gestao_publica_ensaio> npx tsx scripts/demonstracao/percurso-v27.ts [base] [pasta]`
 * (padrão http://localhost:3011). Roda DEPOIS do `percurso-v26-cadastros.ts` no mesmo clone (ele cria a entidade e a
 * unidade gestora 999101 escriturada aqui). GRAVA pela tela; o banco é LIDO só para conferir o efeito. Nunca na 3010.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v27";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const URL_BANCO = process.env["DATABASE_URL"] ?? "";
if (!/\/gestao_publica_ensaio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: o banco lido para conferir tem de ser o clone gestao_publica_ensaio.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");
const DIA = "2026-10-01";

mkdirSync(PASTA, { recursive: true });
let passos = 0;
const falhas: string[] = [];
function afirmar(cond: boolean, oque: string): void {
  passos++;
  console.log(`  ${cond ? "ok  " : "FALHA"} ${oque}`);
  if (!cond) falhas.push(oque);
}
const ir = (p: Page, rota: string): Promise<unknown> => p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 });
const texto = (p: Page): Promise<string> => p.evaluate(() => document.body.innerText);
const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function digitar(p: Page, alvo: string, valor: string): Promise<void> {
  await p.waitForSelector(alvo, { timeout: 20000 });
  await p.$eval(alvo, (e) => {
    (e as HTMLInputElement).value = "";
    (e as HTMLElement).scrollIntoView({ block: "center" });
  });
  await p.focus(alvo);
  await p.keyboard.type(valor, { delay: 5 });
}
async function valor(p: Page, alvo: string, v: string): Promise<void> {
  await p.$eval(alvo, (e, x) => {
    const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(e, x);
    e.dispatchEvent(new Event("input", { bubbles: true }));
    e.dispatchEvent(new Event("change", { bubbles: true }));
  }, v);
}
async function escolherPorTexto(p: Page, alvo: string, contem: string): Promise<boolean> {
  const v = await p.$eval(alvo, (s, c) => Array.from((s as HTMLSelectElement).options).find((o) => (o.textContent ?? "").includes(c))?.value ?? "", contem);
  if (v === "") return false;
  await p.select(alvo, v);
  return true;
}
async function abrir(p: Page, alvo: string): Promise<void> {
  await p.$eval(alvo, (d) => {
    (d as HTMLDetailsElement).open = true;
  });
  await esperar(300);
}
async function enviar(p: Page, form: string): Promise<{ tipo: "ok" | "erro" | "silencio"; texto: string }> {
  await p.waitForSelector(`${form} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
  await p.$eval(`${form} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
  await esperar(6000);
  return p.evaluate((sel) => {
    const f = document.querySelector(sel);
    const raiz = f?.parentElement ?? document.body;
    const alerta = f?.querySelector('[role="alert"]') ?? raiz.querySelector('[role="alert"]');
    if (alerta !== null && alerta !== undefined && (alerta.textContent ?? "").trim() !== "") return { tipo: "erro" as const, texto: (alerta.textContent ?? "").trim() };
    const ok = f?.querySelector('[role="status"]') ?? raiz.querySelector('[role="status"]') ?? null;
    return ok !== null ? { tipo: "ok" as const, texto: (ok.textContent ?? "").trim() } : { tipo: "silencio" as const, texto: "" };
  }, form);
}
async function subir(p: Page, form: string, arquivo: string): Promise<void> {
  const entrada = await p.$(`${form} input[type="file"]`);
  if (entrada === null) throw new Error(`sem campo de arquivo em ${form}`);
  await (entrada as unknown as { uploadFile: (c: string) => Promise<void> }).uploadFile(arquivo);
}

async function main(): Promise<void> {
  const prisma = criarPrismaClient(URL_BANCO);
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  try {
    const p = await navegador.newPage();
    await p.evaluateOnNewDocument("globalThis.__name = (f) => f;");
    await p.setViewport({ width: 1440, height: 900 });

    console.log("1. entrada");
    await ir(p, "/login");
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 }).catch(() => undefined);
    afirmar(!p.url().includes("/login"), "a sessão abriu");

    console.log("2. a frota: veículo locado sem o modelo, a versão com o modelo, a máquina própria");
    await ir(p, "/patrimonio/frota");
    afirmar(/Veículos e máquinas, situação e abastecimento/.test(await texto(p)), "a tela da frota abriu (menu do patrimônio)");
    const FV = 'form[data-acao="cadastrar-veiculo"]';
    afirmar(await escolherPorTexto(p, `${FV} select[name="ugId"]`, "999101"), "a unidade gestora 999101 escriturada aqui está na escolha");
    await digitar(p, `${FV} input[name="placa"]`, "QWE1A23");
    await digitar(p, `${FV} input[name="anoModelo"]`, "2023");
    await digitar(p, `${FV} input[name="renavam"]`, "123456789");
    await p.select(`${FV} select[name="tipoFrota"]`, "LOCADO");
    await digitar(p, `${FV} label:has(input[name="proprietarioDocumento"]) input[data-mascara="cpf-cnpj"]`, "26471983000138");
    await digitar(p, `${FV} label:has(input[name="locadorDocumento"]) input[data-mascara="cpf-cnpj"]`, "28461739582");
    await p.select(`${FV} select[name="combustivelPrincipal"]`, "DIESEL");
    await valor(p, `${FV} input[name="vigenteDesde"]`, DIA);
    await digitar(p, `${FV} input[name="fundamento"]`, "Contrato de locação 12/2026 (demonstração)");
    const rv = await enviar(p, FV);
    const veiculo = await prisma.veiculoDaFrota.findUnique({ where: { placa: "QWE1A23" }, select: { id: true } });
    afirmar(rv.tipo === "ok" && veiculo !== null, `o veículo QWE1A23 foi cadastrado pela tela (${rv.texto.slice(0, 50)})`);
    await ir(p, "/patrimonio/frota");
    afirmar((await p.$('[data-pendencia-da-frota="QWE1A23"]')) !== null, "sem o número do modelo, a tela aponta a pendência do veículo");
    const VB = '[data-bem-da-frota="QWE1A23"]';
    await abrir(p, `${VB} details:has(form[data-acao="publicar-versao-da-frota"])`);
    const FVV = `${VB} form[data-acao="publicar-versao-da-frota"]`;
    await digitar(p, `${FVV} input[name="numeroModelo"]`, "4321");
    await valor(p, `${FVV} input[name="vigenteDesde"]`, DIA);
    await digitar(p, `${FVV} input[name="fundamento"]`, "Número do modelo conferido na tabela do Tribunal (demonstração)");
    const rvv = await enviar(p, FVV);
    afirmar(rvv.tipo === "ok" && (await prisma.versaoDoVeiculo.count({ where: { veiculoId: veiculo?.id ?? "", numeroModelo: "4321" } })) === 1, `a versão 2 com o modelo foi publicada (${rvv.texto.slice(0, 50)})`);
    await ir(p, "/patrimonio/frota");
    const FM = 'form[data-acao="cadastrar-maquina"]';
    await escolherPorTexto(p, `${FM} select[name="ugId"]`, "999101");
    await digitar(p, `${FM} input[name="codigo"]`, "RET01");
    await digitar(p, `${FM} input[name="anoFabricacao"]`, "2018");
    await digitar(p, `${FM} input[name="descricao"]`, "Retroescavadeira (demonstração)");
    await p.select(`${FM} select[name="tipoFrota"]`, "PROPRIO");
    await p.select(`${FM} select[name="combustivelPrincipal"]`, "DIESEL");
    await valor(p, `${FM} input[name="vigenteDesde"]`, DIA);
    await digitar(p, `${FM} input[name="fundamento"]`, "Termo de incorporação do bem (demonstração)");
    const rm = await enviar(p, FM);
    afirmar(rm.tipo === "ok" && (await prisma.maquinaDaFrota.count({ where: { codigo: "RET01" } })) === 1, `a máquina RET01 foi cadastrada (${rm.texto.slice(0, 50)})`);

    console.log("3. abastecimento e situação, com as recusas");
    await ir(p, "/patrimonio/frota");
    await abrir(p, `${VB} details:has(form[data-acao="registrar-abastecimento"])`);
    const FA = `${VB} form[data-acao="registrar-abastecimento"]`;
    await valor(p, `${FA} input[name="data"]`, DIA);
    await p.select(`${FA} select[name="combustivel"]`, "DIESEL");
    await digitar(p, `${FA} input[name="quantidade"]`, "10,123");
    await digitar(p, `${FA} input[name="documento"]`, "Cupom 777");
    const ra0 = await enviar(p, FA);
    afirmar(ra0.tipo === "erro" && /no máximo 2 casas decimais/.test(ra0.texto), `quantidade com 3 casas é recusada com o motivo (${ra0.texto.slice(0, 60)})`);
    await ir(p, "/patrimonio/frota");
    await abrir(p, `${VB} details:has(form[data-acao="registrar-abastecimento"])`);
    await valor(p, `${FA} input[name="data"]`, DIA);
    await p.select(`${FA} select[name="combustivel"]`, "DIESEL");
    await digitar(p, `${FA} input[name="quantidade"]`, "45,50");
    await digitar(p, `${FA} input[name="documento"]`, "Cupom 778");
    const ra = await enviar(p, FA);
    const ab = await prisma.abastecimentoDaFrota.findFirst({ where: { documento: "Cupom 778" }, select: { quantidade: true } });
    afirmar(ra.tipo === "ok" && ab?.quantidade.toFixed(2) === "45.50", `o abastecimento de 45,50 L foi registrado (${ra.texto.slice(0, 40)})`);
    const MB = '[data-bem-da-frota="RET01"]';
    await abrir(p, `${MB} details:has(form[data-acao="registrar-situacao-da-frota"])`);
    const FS = `${MB} form[data-acao="registrar-situacao-da-frota"]`;
    await p.select(`${FS} select[name="situacao"]`, "EM_MANUTENCAO");
    await valor(p, `${FS} input[name="desde"]`, DIA);
    await digitar(p, `${FS} input[name="motivo"]`, "Ordem de serviço 9 (demonstração)");
    const rs = await enviar(p, FS);
    afirmar(rs.tipo === "erro" && /já tem situação começando em 01\/10\/2026/.test(rs.texto), `duas situações no mesmo dia são recusadas com o motivo (${rs.texto.slice(0, 60)})`);
    await p.screenshot({ path: join(PASTA, "v27-frota.png"), fullPage: true });

    console.log("4. a farmácia pública e o estoque do mês (digitado e por arquivo)");
    await ir(p, "/patrimonio/farmacias");
    const FF = 'form[data-acao="cadastrar-farmacia"]';
    await escolherPorTexto(p, `${FF} select[name="ugId"]`, "999101");
    await digitar(p, `${FF} input[name="codigo"]`, "1234");
    await digitar(p, `${FF} input[name="descricao"]`, "Farmácia Básica (demonstração)");
    await digitar(p, `${FF} input[name="endereco"]`, "Rua da Demonstração, 100, Centro");
    await digitar(p, `${FF} input[name="nomeResponsavel"]`, "Maria Farmacêutica");
    await digitar(p, `${FF} input[name="cpfResponsavel"]`, "11144477735");
    await digitar(p, `${FF} input[name="crfResponsavel"]`, "PB-1234");
    await valor(p, `${FF} input[name="vigenteDesde"]`, DIA);
    await digitar(p, `${FF} input[name="fundamento"]`, "Portaria de designação 5/2026 (demonstração)");
    const rf = await enviar(p, FF);
    const farm = await prisma.farmaciaPublica.findFirst({ where: { codigo: "1234" }, select: { id: true } });
    afirmar(rf.tipo === "ok" && farm !== null, `a farmácia 1234 foi cadastrada (${rf.texto.slice(0, 40)})`);
    await ir(p, "/patrimonio/farmacias");
    const FB = '[data-farmacia="1234"]';
    await abrir(p, `${FB} details:has(form[data-acao="informar-estoque-da-farmacia"])`);
    const FE = `${FB} form[data-acao="informar-estoque-da-farmacia"]`;
    await valor(p, `${FE} input[name="mes"]`, "2026-10");
    await digitar(p, `${FE} input[name="fundamento"]`, "Inventário de 01/10/2026 (demonstração)");
    await valor(p, `${FE} textarea[name="produtos"]`, "7891234567895;Dipirona 500 mg;COMPRIMIDO;1200\n7896004700011;Amoxicilina 500 mg;CAPSULA;300,5");
    const re = await enviar(p, FE);
    afirmar(re.tipo === "ok" && /2 produto\(s\)/.test(re.texto), `o estoque digitado com 2 produtos foi informado (${re.texto.slice(0, 50)})`);
    const csv = resolve(PASTA, "estoque-demonstracao.csv");
    writeFileSync(csv, "codigoProduto;descricao;unidade;quantidade\n7891234567895;Dipirona 500 mg;COMPRIMIDO;1.150,00\n7896004700011;Amoxicilina 500 mg;CAPSULA;280\n7891058001155;Soro fisiológico 0,9%;FRASCO;40\n");
    await ir(p, "/patrimonio/farmacias");
    await abrir(p, `${FB} details:has(form[data-acao="informar-estoque-da-farmacia"])`);
    await valor(p, `${FE} input[name="mes"]`, "2026-10");
    await digitar(p, `${FE} input[name="fundamento"]`, "Relatório do sistema da farmácia (demonstração)");
    await subir(p, FE, csv);
    const re2 = await enviar(p, FE);
    const ultimo = await prisma.informeDeEstoqueDaFarmacia.findFirst({ where: { farmaciaId: farm?.id ?? "" }, orderBy: { criadoEm: "desc" }, select: { origem: true, _count: { select: { itens: true } } } });
    afirmar(re2.tipo === "ok" && ultimo?.origem === "ARQUIVO" && ultimo._count.itens === 3, `o estoque por arquivo (3 produtos) substitui o digitado (${re2.texto.slice(0, 50)})`);
    await ir(p, "/patrimonio/farmacias");
    afirmar(/substituído/.test(await texto(p)), "a tela mostra o informe anterior do mês como substituído");
    await p.screenshot({ path: join(PASTA, "v27-farmacias.png"), fullPage: true });

    console.log("5. a lei registrada com o PDF antes do protocolo, e o protocolo depois");
    await ir(p, "/planejamento/creditos-adicionais/normas-no-tribunal");
    const FN = 'form[data-acao="registrar-norma-no-tribunal"]';
    await p.select(`${FN} select[name="tipo"]`, "LOA");
    await digitar(p, `${FN} input[name="numero"]`, "999");
    await digitar(p, `${FN} input[name="ano"]`, "2025");
    await valor(p, `${FN} input[name="dataPublicacao"]`, "2025-12-19");
    await p.select(`${FN} select[name="autorizacao"]`, "PERCENTUAL");
    await digitar(p, `${FN} input[inputmode="decimal"]`, "50,00");
    await digitar(p, `${FN} input[name="fundamento"]`, "Lei 999/2025 de demonstração, art. 5º (suplementação até 50%)");
    const rn = await enviar(p, FN);
    const norma = await prisma.normaOrcamentariaNoTce.findFirst({ where: { tipo: "LOA", numero: "999", ano: 2025 }, select: { id: true, protocoloTce: true } });
    afirmar(rn.tipo === "ok" && norma !== null && norma.protocoloTce === null, `a lei foi registrada sem o protocolo (${rn.texto.slice(0, 60)})`);
    await ir(p, "/planejamento/creditos-adicionais/normas-no-tribunal");
    afirmar((await p.$('[data-norma-sem-protocolo="999/2025"]')) !== null, "a lista mostra o protocolo pendente");
    const pdf = resolve(PASTA, "lei-demonstracao.pdf");
    writeFileSync(pdf, "%PDF-1.4\n% lei de demonstracao\n");
    const FAN = '[data-pdf-da-norma="999/2025"] form[data-acao="anexar"]';
    await subir(p, FAN, pdf);
    await p.waitForSelector(`${FAN} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
    await p.$eval(`${FAN} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
    await esperar(7000);
    afirmar((await prisma.anexo.count({ where: { normaOrcamentariaId: norma?.id ?? "", mimeType: "application/pdf" } })) === 1, "o PDF da lei foi anexado à norma pela tela");
    await ir(p, "/planejamento/creditos-adicionais/normas-no-tribunal");
    await abrir(p, `tr[data-norma="999/2025"] details:has(form[data-acao="informar-protocolo-da-norma"])`);
    const FP = 'tr[data-norma="999/2025"] form[data-acao="informar-protocolo-da-norma"]';
    await digitar(p, `${FP} input[name="protocoloTce"]`, "000999/25");
    await digitar(p, `${FP} input[name="fundamento"]`, "Comprovante de envio de demonstração");
    const rp = await enviar(p, FP);
    afirmar(rp.tipo === "ok" && (await prisma.protocoloDaNormaNoTce.count({ where: { normaId: norma?.id ?? "" } })) === 1, `o protocolo chegou depois, como fato próprio (${rp.texto.slice(0, 40)})`);
    await p.screenshot({ path: join(PASTA, "v27-normas.png"), fullPage: true });

    console.log("6. a licitação escolhida na lista do Tribunal (Tramita)");
    const processo = await prisma.processoLicitatorio.findFirstOrThrow({ where: { modalidade: "PREGAO_ELETRONICO" }, orderBy: { criadoEm: "asc" }, select: { id: true, numeroProcesso: true } });
    const lista = resolve(PASTA, "licitacoes-demonstracao.csv");
    writeFileSync(lista, "nome_municipio;codigo_unidade_gestora;descricao_unidade_gestora;numero_licitacao;numero_protocolo_tce;ano_licitacao;modalidade;objeto_licitacao\nDemonstração;999101;Unidade de demonstração;00004/2026;Doc. 01234/26;2026;Pregão (Lei Nº 14.133/2021);MATERIAL\nDemonstração;999101;Unidade de demonstração;00009/2026;Doc. 01299/26;2026;Dispensa (Lei Nº 14.133/2021);SERVIÇO\n");
    await ir(p, `/licitacoes/processos/${processo.id}`);
    await abrir(p, 'details:has(form[data-acao="importar-licitacoes-do-tribunal"])');
    const FI = 'form[data-acao="importar-licitacoes-do-tribunal"]';
    await subir(p, FI, lista);
    const ri = await enviar(p, FI);
    afirmar(ri.tipo === "ok" && (await prisma.licitacaoNoTribunal.count()) >= 2, `a lista do Tribunal foi importada (${ri.texto.slice(0, 50)})`);
    await ir(p, `/licitacoes/processos/${processo.id}`);
    const FL = 'form[data-acao="informar-tramita-pela-lista"]';
    const opcoes = await p.$$eval(`${FL} select[name="licitacaoNoTribunalId"] option`, (os) => os.map((o) => o.textContent ?? ""));
    afirmar(opcoes.some((o) => o.includes("00004/2026")) && !opcoes.some((o) => o.includes("00009/2026")), "a lista do pregão traz só a licitação de modalidade compatível");
    await escolherPorTexto(p, `${FL} select[name="licitacaoNoTribunalId"]`, "00004/2026");
    const rl = await enviar(p, FL);
    const id = await prisma.identificacaoNoTramita.findFirst({ where: { processoId: processo.id }, orderBy: { criadoEm: "desc" }, select: { numeroNoTramita: true, protocoloNoTribunal: true } });
    afirmar(rl.tipo === "ok" && id?.numeroNoTramita === "000042026" && id.protocoloNoTribunal === "Doc. 01234/26", `o processo ${processo.numeroProcesso} ficou com a licitação 000042026 e o protocolo do Tramita (${rl.texto.slice(0, 40)})`);
    await p.screenshot({ path: join(PASTA, "v27-tramita.png"), fullPage: true });

    console.log("7. a remessa: 58 tabelas, a frota e a farmácia no pacote, conferência quando há pendência");
    await ir(p, `/integracoes/sagres?dia=${DIA}&mes=2026-10&ug=999101`);
    const t = await texto(p);
    afirmar(/58 de 58/.test(t), "a tabela do leiaute mostra 58 de 58 tabelas com gerador");
    afirmar(/Veiculos/.test(t) && /SituacaoFrota/.test(t) && /Abastecimento/.test(t) && /EstoqueFarmacia/.test(t), "a prévia traz os arquivos da frota e da farmácia");
    const conferencia = (await p.$('[data-teste="pacote-de-conferencia"]')) !== null;
    const nome = await p.evaluate(async (u) => {
      const r = await fetch(u);
      return r.headers.get("content-disposition") ?? "";
    }, `/integracoes/sagres/download?dia=${DIA}&mes=2026-10&ug=999101`);
    afirmar(conferencia === /conferencia-incompleto_/.test(nome), `o pacote baixado é ${conferencia ? "de conferência" : "o pronto"}, como a tela diz (${nome.slice(0, 70)})`);
    await p.screenshot({ path: join(PASTA, "v27-sagres.png"), fullPage: true });
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  console.log(`\n${passos - falhas.length}/${passos} passos`);
  if (falhas.length > 0) {
    console.log(`FALHAS:\n- ${falhas.join("\n- ")}`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
