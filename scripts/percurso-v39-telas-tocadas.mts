import "dotenv/config";
import { entrar, irPara, lancarNavegadorDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-096 — AS TELAS TOCADAS PELA V39, ABERTAS ANTES DE PUBLICAR. Só leitura: nada é enviado. Na V38 o painel da
 * conciliação foi publicado sem ser aberto e caiu em produção por 15 minutos; este percurso existe para isso não se
 * repetir. Confere, em cada tela, que ela abre sem erro e que o elemento novo está lá:
 *   · o painel da conciliação com o seletor de conta (quando há mais de uma com extrato) ou o painel da conta única;
 *   · a lista de ordens de serviço com o filtro, e o filtro por situação devolvendo a página;
 *   · a proposta orçamentária com a escolha do fundamento (quando ainda não efetivada) ou o fundamento gravado;
 *   · a rota da natureza da base.
 * Uso: BASE=... npx tsx scripts/percurso-v39-telas-tocadas.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const ano = process.env["PERCURSO_ANO"] ?? new Date().getFullYear().toString();
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const semErro = (t: string): boolean => !/Não foi possível carregar|Application error|Erro inesperado|Internal Server Error/i.test(t);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  await entrar(n, page, usuario, senha);

  const painel = await irPara(n, page, `/financeiro/conciliacao?exercicio=${ano}`);
  const seletor = await page.$("form[data-seletor-de-conta]");
  conferir(semErro(painel) && (seletor !== null || /nenhum extrato bancário importado/i.test(painel) || /conta contábil correspondente/i.test(painel)), `painel da conciliação abre ${seletor === null ? "(conta única ou sem extrato)" : "com o seletor de conta"}`);
  if (seletor !== null) {
    const contas = await page.$$eval("form[data-seletor-de-conta] select[name=conta] option", (os) => os.map((o) => o.getAttribute("value") ?? "").filter((v) => v !== ""));
    for (const c of contas) {
      const t = await irPara(n, page, `/financeiro/conciliacao?exercicio=${ano}&conta=${c}`);
      conferir(semErro(t) && /conta contábil correspondente/i.test(t), `painel na conta ${c}`);
    }
    const fora = await irPara(n, page, `/financeiro/conciliacao?exercicio=${ano}&conta=conta-que-nao-existe`);
    conferir(/a conta pedida não tem extrato importado/i.test(fora), "conta fora da lista é recusada com a frase");
  }

  const ordens = await irPara(n, page, "/licitacoes/ordens-de-servico");
  conferir(semErro(ordens) && (await page.$("form[data-filtro-das-ordens]")) !== null, "lista de ordens abre com o filtro");
  const filtradas = await irPara(n, page, "/licitacoes/ordens-de-servico?situacao=EMITIDA&busca=1");
  conferir(semErro(filtradas) && (/ordens \d+ a \d+ de \d+ com o filtro/i.test(filtradas) || /nenhuma ordem de serviço com esse filtro/i.test(filtradas)), "o filtro devolve a página com o total ou a frase do vazio");

  await irPara(n, page, "/planejamento/proposta-orcamentaria");
  const proposta = await page.$$eval("a[href^='/planejamento/proposta-orcamentaria/']", (as) => as.map((a) => a.getAttribute("href") ?? "").find((h) => /\/proposta-orcamentaria\/[^/?]+$/.test(h)) ?? "");
  if (proposta === "") console.log("   nenhuma proposta nesta base: a tela da proposta não foi aberta");
  else {
    const t = await irPara(n, page, proposta);
    const escolha = (await page.$("[data-fundamento-da-efetivacao]")) !== null;
    const efetivada = (await page.$("[data-proposta-efetivada]")) !== null;
    conferir(semErro(t) && (escolha || efetivada), `proposta ${proposta} abre ${escolha ? "com a escolha do fundamento" : "efetivada"}`);
  }

  // V39-010/011 — o dossiê do empenho (a saída de caixa passou a descontar a retenção própria).
  await irPara(n, page, "/despesa/empenhos");
  const empenho = await page.$$eval("a[href^='/despesa/empenhos/']", (as) => as.map((a) => a.getAttribute("href") ?? "").find((h) => /\/despesa\/empenhos\/[^/?]+$/.test(h)) ?? "");
  if (empenho === "") console.log("   nenhum empenho nesta base: o dossiê não foi aberto");
  else {
    const t = await irPara(n, page, empenho);
    conferir(semErro(t) && /saída de caixa/i.test(t), `dossiê do empenho ${empenho} abre com a saída de caixa`);
  }

  // V39-R2 — as telas tocadas pela continuidade.
  // R2-001: o período encerrado da conciliação diz que a conferência é a do encerramento (ou a de antes da foto).
  await irPara(n, page, "/financeiro/conciliacao/periodo");
  const contasDoPeriodo = await page.$$eval('form[data-acao="abrir-conciliacao"] select[name="conta"] option', (os) => os.map((o) => o.getAttribute("value") ?? "").filter((v) => v !== "")).catch(() => [] as string[]);
  let viuEncerrado = false;
  for (const c of contasDoPeriodo) {
    await irPara(n, page, `/financeiro/conciliacao/periodo?conta=${c}`);
    const enc = await page.$$eval("li[data-periodo]", (ls) => ls.filter((l) => (l.textContent ?? "").includes("encerrada")).map((l) => l.querySelector("a")?.getAttribute("href") ?? "")).catch(() => [] as string[]);
    if (enc[0] === undefined || enc[0] === "") continue;
    const t = await irPara(n, page, enc[0]);
    const fonte = await page.$eval("[data-fonte-do-relatorio]", (e) => e.getAttribute("data-fonte-do-relatorio") ?? "").catch(() => "");
    conferir(semErro(t) && fonte !== "", `período encerrado da conta ${c} abre e diz a fonte da conferência (${fonte})`);
    viuEncerrado = true;
    break;
  }
  if (!viuEncerrado) console.log("   nenhum período encerrado nesta base: a foto do encerramento não foi aberta");
  // R2-005/006: a tela das retenções do próprio município, com o legado.
  const ret = await irPara(n, page, "/financeiro/retencoes-proprias");
  conferir(semErro(ret) && /Retenções do próprio município/i.test(ret), "retenções do próprio município abrem");
  // R2-008 a 013: o controle contábil na página do contrato.
  await irPara(n, page, "/licitacoes/contratos");
  const contrato = await page.$$eval("a[href^='/licitacoes/contratos/']", (as) => as.map((a) => a.getAttribute("href") ?? "").find((h) => /\/licitacoes\/contratos\/[^/?]+$/.test(h)) ?? "");
  if (contrato === "") console.log("   nenhum contrato nesta base: o controle contábil não foi aberto");
  else {
    const t = await irPara(n, page, contrato);
    conferir(semErro(t) && (await page.$("[data-controle-contabil-do-contrato]")) !== null, `contrato ${contrato} abre com o controle contábil`);
  }
  const rot = await irPara(n, page, "/contabilidade/roteiros-patrimoniais");
  const temContrato = await page.$$eval('select[name="movimento"] option', (os) => os.some((o) => (o.getAttribute("value") ?? "").startsWith("CONTRATO|"))).catch(() => false);
  conferir(semErro(rot) && temContrato, "roteiros patrimoniais oferecem os movimentos do controle de contratos");

  const r = await page.goto(`${n.base}/natureza-da-base`);
  conferir(r?.status() === 200, `natureza da base: ${(await r?.text())?.slice(0, 60) ?? ""}`);
} finally {
  await nav.close();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nTelas tocadas pela V39 abertas sem erro.");
