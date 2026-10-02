import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type Page } from "puppeteer";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { gerarTransfConcedida } from "../../adapters/tribunais/tce-pb/sagres/gerador-v26.js";

/**
 * PERCURSO DE NAVEGADOR — V26, as telas do SAGRES que dependiam de decisão: entidade e titular da conta, unidades
 * gestoras, transferência entre unidades (duodécimo, com estorno), a remessa com a unidade cadastrada, o protocolo da lei
 * no Tribunal, o PDF do decreto, o agrupamento da folha e o ordenador.
 *
 * Uso: `DATABASE_URL=<clone gestao_publica_ensaio> npx tsx scripts/demonstracao/percurso-v26-cadastros.ts [base] [pasta]`
 * (padrão http://localhost:3011). GRAVA pela tela; o banco é LIDO direto só para conferir o efeito. Nunca na 3010.
 * Pré-condição: o clone da cópia-modelo da apresentação, migrado.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "capturas-v26";
if (/:3010\b/.test(BASE)) throw new Error("Recusado: a 3010 serve o banco da apresentação, e este percurso grava.");
const URL_BANCO = process.env["DATABASE_URL"] ?? "";
if (!/\/gestao_publica_ensaio(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: o banco lido para conferir tem de ser o clone gestao_publica_ensaio.");
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

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

    console.log("2. a entidade contábil e o titular da conta");
    await ir(p, "/contabilidade/entidades");
    const FE = 'form[data-papel="form-cadastrar-entidade"]';
    await digitar(p, `${FE} input[name="codigo"]`, "0001");
    await digitar(p, `${FE} input[name="nome"]`, "Prefeitura Municipal (demonstração)");
    await p.select(`${FE} select[name="tipoManad"]`, "01");
    await p.select(`${FE} select[name="atoTipo"]`, "LEI");
    await digitar(p, `${FE} input[name="atoNumero"]`, "1");
    await digitar(p, `${FE} input[name="atoAno"]`, "1990");
    await digitar(p, `${FE} input[name="atoDispositivo"]`, "art. 1º");
    await digitar(p, `${FE} textarea[name="atoCitacao"]`, "Art. 1º Fica organizada a Prefeitura Municipal (demonstração), órgão do Poder Executivo do Município.");
    const re = await enviar(p, FE);
    if (re.tipo !== "ok") console.log(`  resposta da tela: ${re.tipo} ${re.texto}`);
    const ent = await prisma.entidadeContabil.findUnique({ where: { codigo: "0001" }, select: { id: true } });
    afirmar(ent !== null, "a entidade 0001 foi gravada pela tela");
    const conta = await prisma.contaBancaria.findFirstOrThrow({ where: { codigo: "CC-500-01" }, select: { id: true } });
    await ir(p, "/financeiro/contas-bancarias");
    await p.$eval('button[data-papel="declarar-titular-CC-500-01"]', (b) => (b as HTMLButtonElement).click());
    await esperar(800);
    const FT = `form:has(input[name="contaBancariaId"][value="${conta.id}"])`;
    await escolherPorTexto(p, `${FT} select[name="entidadeId"]`, "0001");
    await p.select(`${FT} select[name="atoTipo"]`, "LEI");
    await digitar(p, `${FT} input[name="atoNumero"]`, "1");
    await digitar(p, `${FT} input[name="atoAno"]`, "1990");
    await digitar(p, `${FT} input[name="atoDispositivo"]`, "art. 1º");
    await digitar(p, `${FT} textarea[name="atoCitacao"]`, "Art. 1º Fica organizada a Prefeitura Municipal (demonstração), titular da conta movimento CC-500-01, agência 4321, conta 33333.");
    const rt = await enviar(p, FT);
    if (rt.tipo !== "ok") console.log(`  resposta da tela: ${rt.tipo} ${rt.texto}`);
    afirmar((await prisma.declaracaoDeTitularDaConta.count({ where: { contaBancariaId: conta.id } })) === 1, "o titular da conta CC-500-01 foi declarado pela tela");

    console.log("3. as unidades gestoras: a Prefeitura escriturada aqui, a Câmara de fora");
    await ir(p, "/contabilidade/unidades-gestoras");
    const FU = 'form[data-acao="cadastrar-unidade-gestora"]';
    const ug = async (codigo: string, nome: string, natureza: string, entidade: string | null): Promise<{ tipo: string; texto: string }> => {
      await ir(p, "/contabilidade/unidades-gestoras");
      await digitar(p, `${FU} input[name="codigoTce"]`, codigo);
      await digitar(p, `${FU} input[name="nome"]`, nome);
      await p.select(`${FU} select[name="naturezaJuridica"]`, natureza);
      if (entidade !== null) await escolherPorTexto(p, `${FU} select[name="entidadeContabilId"]`, entidade);
      await valor(p, `${FU} input[name="vigenteDesde"]`, "2026-01-01");
      await digitar(p, `${FU} input[name="fundamento"]`, "Código de demonstração: o código real vem do cadastro do Tribunal");
      return enviar(p, FU);
    };
    afirmar((await ug("999101", "Prefeitura Municipal (demonstração)", "PREFEITURA_OU_SECRETARIA", "0001")).tipo === "ok", "a unidade 999101 foi cadastrada, escriturada aqui");
    afirmar((await ug("999102", "Câmara Municipal (demonstração)", "CAMARA_MUNICIPAL", null)).tipo === "ok", "a unidade 999102 foi cadastrada, de fora");
    const dup = await ug("999101", "Outra", "FUNDO", null);
    afirmar(dup.tipo === "erro" && /já é da unidade gestora Prefeitura/.test(dup.texto), `o código repetido é recusado com o motivo ("${dup.texto.slice(0, 80)}")`);
    await p.screenshot({ path: join(PASTA, "v26-unidades-gestoras.png"), fullPage: true });

    console.log("4. o duodécimo à Câmara: as contas, o registro, o estorno e a conciliação");
    await ir(p, "/financeiro/transferencias-entre-ugs");
    afirmar(/Nenhum tipo tem as contas decididas/.test(await texto(p)), "sem a decisão, a tela diz que a transferência é recusada");
    const FC = 'form[data-acao="decidir-contas-da-transferencia"]';
    await p.select(`${FC} select[name="tipo"]`, "DUODECIMO");
    await valor(p, `${FC} input[name="vigenteDesde"]`, "2026-01-01");
    await p.select(`${FC} select[name="contaConcedida"]`, "3.5.1.1.2.02.00");
    await p.select(`${FC} select[name="contaRecebida"]`, "4.5.1.1.2.02.00");
    await digitar(p, `${FC} input[name="fundamento"]`, "PCASP do TCE-PB 2025: repasse concedido e repasse recebido, intra OFSS");
    afirmar((await enviar(p, FC)).tipo === "ok", "as contas do duodécimo foram decididas");
    const FX = 'form[data-acao="registrar-transferencia-entre-ugs"]';
    const transferir = async (v: string, dia: string, comContaDaCamara: boolean): Promise<{ tipo: string; texto: string }> => {
      await ir(p, "/financeiro/transferencias-entre-ugs");
      await p.select(`${FX} select[name="tipo"]`, "DUODECIMO");
      await valor(p, `${FX} input[name="data"]`, dia);
      await digitar(p, `${FX} input[inputmode="decimal"]`, v);
      await escolherPorTexto(p, `${FX} select[name="ugOrigemId"]`, "999101");
      await escolherPorTexto(p, `${FX} select[name="contaOrigemId"]`, "CC-500-01");
      await escolherPorTexto(p, `${FX} select[name="ugDestinoId"]`, "999102");
      if (comContaDaCamara) await escolherPorTexto(p, `${FX} select[name="contaDestinoId"]`, "CC-POC-A");
      await digitar(p, `${FX} input[name="vinculo"]`, "Duodécimo de setembro, CF art. 29-A (demonstração)");
      return enviar(p, FX);
    };
    const fora = await transferir("1000,00", "2026-09-10", true);
    afirmar(fora.tipo === "erro" && /é de fora: a conta dela não é escriturada aqui/.test(fora.texto), `a conta para a unidade de fora é recusada com o motivo ("${fora.texto.slice(0, 80)}")`);
    afirmar((await transferir("85000,00", "2026-09-10", false)).tipo === "ok", "o duodécimo de 85.000,00 foi registrado");
    afirmar((await transferir("1000,00", "2026-09-10", false)).tipo === "ok", "um segundo duodécimo de 1.000,00 foi registrado");
    const ts = await prisma.transferenciaEntreUgs.findMany({ orderBy: { criadoEm: "asc" }, select: { id: true, valor: true, lancamentoConcedidaId: true, lancamentoRecebidaId: true } });
    afirmar(ts.length === 2 && ts.every((t) => t.lancamentoConcedidaId !== null && t.lancamentoRecebidaId === null), "só o lado da Prefeitura foi lançado nas duas (a Câmara é de fora)");
    const segunda = ts[1];
    if (segunda !== undefined) {
      await ir(p, "/financeiro/transferencias-entre-ugs");
      await p.$eval(`tr[data-transferencia="${segunda.id}"] summary`, (s) => (s as HTMLElement).click());
      const FE2 = `tr[data-transferencia="${segunda.id}"] form[data-acao="estornar-transferencia-entre-ugs"]`;
      await valor(p, `${FE2} input[name="data"]`, "2026-09-11");
      await digitar(p, `${FE2} input[name="motivo"]`, "Valor lançado em duplicidade");
      // O formulário some com o sucesso (a linha passa a "estornada"): confere-se a linha e o fato, não a mensagem.
      await enviar(p, FE2);
      await ir(p, "/financeiro/transferencias-entre-ugs?ano=2026");
      const linha = await p.$eval(`tr[data-transferencia="${segunda.id}"]`, (tr) => (tr as HTMLElement).innerText).catch(() => "");
      const estorno = await prisma.transferenciaEntreUgs.findFirst({ where: { estornoDeId: segunda.id }, select: { motivo: true } });
      afirmar(/estornada/.test(linha) && estorno?.motivo === "Valor lançado em duplicidade", "o segundo duodécimo foi estornado pela tela: a linha diz estornada e o estorno tem o motivo");
    }
    await ir(p, "/financeiro/transferencias-entre-ugs?ano=2026");
    const tc = await texto(p);
    afirmar(/Recebimento na outra unidade sem confirmação/.test(tc), "a conciliação diz que falta a confirmação da Câmara");
    afirmar(/85\.000,00/.test(tc) && /Líquido de 999101/.test(tc), "o líquido do par desconta o estorno");
    await p.screenshot({ path: join(PASTA, "v26-transferencias-entre-ugs.png"), fullPage: true });

    console.log("5. a remessa ao Tribunal com a unidade cadastrada");
    await ir(p, "/integracoes/sagres?dia=2026-09-10&mes=2026-09");
    afirmar(/A unidade gestora 999101 não tem CNPJ, nem a entidade que a escritura/.test(await texto(p)), "sem CNPJ, a prévia é recusada nomeando a unidade (nenhum CNPJ é emprestado)");
    // O CNPJ entra por uma nova versão da entidade, pela tela (CNPJ de demonstração, com dígito válido).
    const entidadeId = ent?.id ?? "";
    await ir(p, "/contabilidade/entidades");
    await p.$eval(`button[data-papel="corrigir-${entidadeId}"]`, (b) => (b as HTMLButtonElement).click());
    await esperar(800);
    const FV = `form:has(input[name="entidadeId"][value="${entidadeId}"])`;
    await digitar(p, `${FV} input[name="cnpj"]`, "11222333000181");
    await p.select(`${FV} select[name="atoTipo"]`, "LEI");
    await digitar(p, `${FV} input[name="atoNumero"]`, "2");
    await digitar(p, `${FV} input[name="atoAno"]`, "1991");
    await digitar(p, `${FV} input[name="atoDispositivo"]`, "art. 1º");
    await digitar(p, `${FV} textarea[name="atoCitacao"]`, "Art. 1º A Prefeitura Municipal (demonstração) é inscrita no CNPJ 11.222.333/0001-81.");
    const rv = await enviar(p, FV);
    afirmar(rv.tipo === "ok", `a versão da entidade com o CNPJ foi publicada pela tela (${rv.texto.slice(0, 60)})`);
    await ir(p, "/integracoes/sagres?dia=2026-09-10&mes=2026-09");
    const ts5 = await texto(p);
    afirmar(/Unidade gestora da remessa: 999101/.test(ts5), "a remessa usa a unidade 999101 cadastrada, não a de demonstração");
    afirmar(/50 de 58/.test(ts5), "a tabela do leiaute mostra 50 de 58 tabelas geradas");
    const cnpjEnte = (await prisma.enteConfig.findFirst({ select: { cnpj: true } }))?.cnpj ?? "";
    const conc = (await gerarTransfConcedida(prisma, { codUnidadeGestora: "999101", cnpjGerenciadora: cnpjEnte, dia: new Date(Date.UTC(2026, 8, 10)) })).conteudo.toString("utf8").split("\r\n").filter((l) => l !== "");
    afirmar(conc.length === 2 && conc.every((l) => l.slice(6, 12) === "999102" && l.slice(12, 14) === "11"), "o arquivo das transferências concedidas de 10/09 tem as duas, para a 999102, duodécimo ordinário");
    await p.screenshot({ path: join(PASTA, "v26-sagres-ug.png"), fullPage: true });

    console.log("6. a lei de crédito com o protocolo do Tribunal, e o PDF do decreto");
    const lei = await prisma.leiCredito.findFirstOrThrow({ where: { tipoCredito: { in: ["SUPLEMENTAR", "ESPECIAL"] } }, orderBy: { numero: "asc" }, select: { id: true, numero: true, ano: true, tipoCredito: true, dataPublicacao: true, valorAutorizado: true } });
    await ir(p, "/planejamento/creditos-adicionais/normas-no-tribunal");
    afirmar(new RegExp(`Lei ${lei.numero.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}/${lei.ano}`).test(await texto(p)), `a lei ${lei.numero}/${lei.ano} aparece sem protocolo`);
    const FN = 'form[data-acao="registrar-norma-no-tribunal"]';
    await p.select(`${FN} select[name="tipo"]`, lei.tipoCredito === "ESPECIAL" ? "CREDITO_ESPECIAL" : "CREDITO_SUPLEMENTAR");
    await digitar(p, `${FN} input[name="numero"]`, lei.numero.replace(/\D/g, ""));
    await digitar(p, `${FN} input[name="ano"]`, String(lei.ano));
    await valor(p, `${FN} input[name="dataPublicacao"]`, lei.dataPublicacao.toISOString().slice(0, 10));
    await digitar(p, `${FN} input[name="protocoloTce"]`, "000123/26");
    await p.select(`${FN} select[name="leiCreditoId"]`, lei.id);
    await digitar(p, `${FN} input[inputmode="decimal"]`, lei.valorAutorizado.toFixed(2).replace(".", ","));
    await digitar(p, `${FN} input[name="fundamento"]`, "Protocolo de demonstração; o real vem do comprovante do Tribunal");
    const rn = await enviar(p, FN);
    afirmar(rn.tipo === "ok" && (await prisma.normaOrcamentariaNoTce.count()) === 1, `a lei foi registrada com o protocolo 000123/26 (${rn.texto.slice(0, 60)})`);
    await p.screenshot({ path: join(PASTA, "v26-normas-no-tribunal.png"), fullPage: true });
    const dec = await prisma.decretoCredito.findFirstOrThrow({ orderBy: { numero: "asc" }, select: { id: true, numero: true, ano: true } });
    await ir(p, `/planejamento/creditos-adicionais?exercicio=${dec.ano}`);
    const pdf = join(PASTA, "decreto-demonstracao.pdf");
    writeFileSync(pdf, "%PDF-1.4\n% decreto de demonstracao\n");
    const FA = `[data-pdf-do-decreto="${dec.numero}/${dec.ano}"] form[data-acao="anexar"]`;
    const entrada = await p.$(`${FA} input[type="file"]`);
    if (entrada !== null) {
      await (entrada as unknown as { uploadFile: (c: string) => Promise<void> }).uploadFile(pdf);
      await p.waitForSelector(`${FA} input[name="__chave"][data-chave-de-comando="pronta"]`, { timeout: 30000 });
      await p.$eval(`${FA} button[type="submit"]`, (b) => (b as HTMLButtonElement).click());
      await esperar(7000);
    }
    afirmar((await prisma.anexo.count({ where: { decretoCreditoId: dec.id, mimeType: "application/pdf" } })) === 1, `o PDF do decreto ${dec.numero}/${dec.ano} foi anexado pela tela`);

    console.log("7. o código de agrupamento da folha");
    const lf = await prisma.liquidacaoDaFolha.findFirstOrThrow({ select: { liquidacao: { select: { numero: true, data: true } }, empenhoDaFolha: { select: { apropriacao: { select: { folha: { select: { competencia: true } } } } } } } });
    const comp = lf.empenhoDaFolha.apropriacao.folha.competencia;
    const mesDaLiquidacao = lf.liquidacao.data.toISOString().slice(0, 7);
    await ir(p, `/folha/agrupamento-no-tribunal?mes=${mesDaLiquidacao}`);
    afirmar(new RegExp(`Liquidação ${lf.liquidacao.numero}`).test(await texto(p)), `a liquidação ${lf.liquidacao.numero} da folha aparece sem o código`);
    const FG = 'form[data-acao="registrar-agrupamento-da-folha"]';
    await escolherPorTexto(p, `${FG} select[name="liquidacaoId"]`, `Liquidação ${lf.liquidacao.numero} `);
    await digitar(p, `${FG} input[name="codigo"]`, `${comp.slice(5, 7)}DEMO0001`);
    await valor(p, `${FG} input[name="competencia"]`, comp);
    await escolherPorTexto(p, `${FG} select[name="ugId"]`, "999101");
    await digitar(p, `${FG} input[name="sistemaDeOrigem"]`, "Folha deste sistema");
    await digitar(p, `${FG} input[name="fundamento"]`, "Código de demonstração da remessa de pessoal");
    const rg = await enviar(p, FG);
    afirmar(rg.tipo === "ok" && (await prisma.agrupamentoDaFolhaNaLiquidacao.count()) === 1, `o código ${comp.slice(5, 7)}DEMO0001 foi registrado na liquidação (${rg.texto.slice(0, 60)})`);
    await p.screenshot({ path: join(PASTA, "v26-agrupamento-da-folha.png"), fullPage: true });

    console.log("8. o ordenador de despesa");
    await ir(p, "/contabilidade/ordenadores");
    const FO = 'form[data-acao="designar-ordenador"]';
    await digitar(p, `${FO} input[name="cpf"]`, "11144477735");
    await digitar(p, `${FO} input[name="nome"]`, "Ordenador de demonstração");
    await p.select(`${FO} select[name="tipoDoAto"]`, "NOMEACAO");
    await digitar(p, `${FO} input[name="ato"]`, "Portaria 1/2026 (demonstração)");
    await valor(p, `${FO} input[name="vigenteDesde"]`, "2026-01-01");
    const ro = await enviar(p, FO);
    afirmar(ro.tipo === "ok" && (await prisma.designacaoDeOrdenador.count()) === 1, `o ordenador foi designado (${ro.texto.slice(0, 60)})`);
    await p.screenshot({ path: join(PASTA, "v26-ordenadores.png"), fullPage: true });
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
