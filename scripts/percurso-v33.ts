import "dotenv/config";
import type { Page } from "puppeteer";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { posicaoAPagar } from "../modules/m05-despesa/a-pagar.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, type Navegador } from "./percursos-navegador.js";

/**
 * V33 — O PERCURSO DA VERSÃO INTEGRADA, COM PERFIS DE TRABALHO.
 *
 *   C. O CONTADOR (contabilidade@percursos.local): lê os livros pelo menu; do balanço ao razão pela composição da
 *      linha; fecha um mês e NÃO tem como reabrir; "A pagar" com as fases separadas, sem a ação de pagar; anula
 *      parte de um empenho pela central, conferindo antes e abrindo o lançamento depois.
 *   T. O TESOUREIRO: de "A pagar" à fila de pagamentos com a liquidação já escolhida.
 *   A. O ADMINISTRADOR: cadastra Prefeitura e Câmara como UGs, declara de qual UG é cada unidade orçamentária e
 *      confere a prévia e o download do SAGRES de cada uma; reabre o mês que o contador fechou.
 *
 * ⚠️ GRAVA (fechamento, anulação, UGs, vínculos). A 3010 é recusada. A fixture das DUAS ENTIDADES CONTÁBEIS é
 * gravada por este script (o cadastro de entidade não é o objeto do percurso) e está declarada aqui.
 * Uso: DATABASE_URL=<ensaio> npx tsx scripts/percurso-v33.ts http://localhost:3011 <senha-admin>
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const SENHA_ADMIN = process.argv[3] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const SENHA_PAPEIS = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const N: Navegador = { base: BASE };
if (BASE.includes(":3010")) throw new Error("Este percurso grava. A 3010 é a apresentação — use a 3011. Nada foi feito.");

const PREF = "201001";
const CAM = "201002";
const DIA = "2026-07-15";
const MES = "2026-07";

const reais = (t: string): string => {
  const m = /-?[\d.]+,\d{2}/.exec(t.replace(/\s/g, ""));
  return m === null ? "" : m[0].replace(/\./g, "").replace(",", ".");
};
const textoDe = (page: Page, sel: string): Promise<string> => page.evaluate((s) => document.querySelector(s)?.textContent ?? "", sel);

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "" || SENHA_ADMIN === "") throw new Error("DATABASE_URL e a senha do administrador são obrigatórias.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    page.on("dialog", (d) => void d.accept());

    // ══ C. O CONTADOR ══
    await entrar(N, page, "contabilidade@percursos.local", SENHA_PAPEIS);
    R.ok("C.0 login do contador");
    await irPara(N, page, "/?exercicio=2026");
    await page.click('li[data-aba="contabilidade"] button[aria-expanded]');
    const livros = await page.evaluate(() => document.querySelectorAll('li[data-aba="contabilidade"] a[href^="/relatorios/livros/"]').length);
    R.conferir("C.1 a aba Contabilidade oferece os livros ao contador", livros > 0, `${String(livros)} link(s)`);

    await irPara(N, page, "/relatorios/demonstracoes/balanco-patrimonial?exercicio=2026");
    const linkConta = await page.evaluate(() => (document.querySelector("[data-composicao-da-linha] a") as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    const semMapa = (await textoDe(page, "main")).includes("Mapeamento do balanço não configurado");
    R.conferir(
      "C.2 o balanço abre para o contador, e a conta da linha leva ao razão no período do balanço (ou o balanço diz que falta o mapeamento)",
      !page.url().includes("/sem-acesso") && (semMapa || (linkConta !== null && linkConta.includes("desde=2026-01-01&ate=2026-12-31"))),
      `${page.url()} · ${String(linkConta)} · sem mapeamento=${String(semMapa)}`
    );
    if (linkConta !== null) {
      await irPara(N, page, linkConta);
      R.conferir("C.3 a conta abre o razão", new URL(page.url()).pathname === "/relatorios/livros/razao", page.url());
    }

    // Fechar janeiro — e não ter como reabrir.
    await irPara(N, page, "/contabilidade/fechamento-mensal?exercicio=2026");
    const reabrirAntes = await page.$$eval('form[data-acao="reabrir-mes"]', (f) => f.length);
    R.conferir("C.4 sem a ação de reabrir, nenhum mês oferece reabertura ao contador", reabrirAntes === 0, `${String(reabrirAntes)} formulário(s) de reabrir`);
    // O primeiro mês ainda aberto (o percurso pode rodar de novo sobre o mesmo ensaio).
    const mes = await page.evaluate(() => document.querySelector('form[data-acao="fechar-mes"]')?.getAttribute("data-competencia") ?? "");
    if (mes === "") throw new Error("Nenhum mês aberto em 2026 no ensaio.");
    const travasAntes = await prisma.movimentoTravamento.count({ where: { tipo: "TRAVAR", criadoPor: "contabilidade@percursos.local" } });
    const fechar = await preencherEEnviar(page, `form[data-acao="fechar-mes"][data-competencia="${mes}"]`, [], "fechar-mes");
    const travou = await prisma.movimentoTravamento.count({ where: { tipo: "TRAVAR", criadoPor: "contabilidade@percursos.local" } });
    R.conferir(
      "C.5 fechar o mês confirma na tela e grava a trava — ou recusa dizendo a divergência",
      (fechar.tipo === "ok" && /fechado/i.test(fechar.texto) && travou === travasAntes + 1) || (fechar.tipo === "erro" && /diverg/i.test(fechar.texto) && travou === travasAntes),
      `${mes} · ${fechar.tipo}: ${fechar.texto} · travas do contador ${String(travasAntes)} -> ${String(travou)}`
    );
    if (fechar.tipo === "ok") {
      await irPara(N, page, "/contabilidade/fechamento-mensal?exercicio=2026");
      const linha = await textoDe(page, `tr[data-competencia="${mes}"]`);
      R.conferir("C.6 o mês fechado diz ao contador que reabrir não está no acesso dele", /Fechado/.test(linha) && /Reabrir o mês não está no seu acesso/.test(linha), linha.slice(0, 200));
    }

    // A pagar: fases separadas, subtotais que somam o total, nenhum "Pagar" para quem não paga.
    await irPara(N, page, "/despesa/a-pagar?exercicio=2026");
    const total = reais(await textoDe(page, '[data-total="liquidado-a-pagar"]'));
    const subtotais = await page.$$eval('[data-subtotal="liquidado-a-pagar"]', (els) => els.map((e) => e.textContent ?? ""));
    const somaSub = subtotais.map(reais).reduce((s, v) => s + Math.round(Number(v) * 100), 0);
    const posicao = await posicaoAPagar(prisma, { exercicio: 2026 });
    const doModulo = posicao.obrigacoes.filter((o) => o.fase === "LIQUIDADO_A_PAGAR").reduce((s, o) => s + Math.round(Number(o.saldo.toFixed(2)) * 100), 0);
    R.conferir("C.7 o total exigível da tela é a soma dos credores e é o da apuração", Math.round(Number(total) * 100) === somaSub && somaSub === doModulo, `tela=${total} · credores=${String(somaSub / 100)} · apuração=${String(doModulo / 100)}`);
    const linksPagar = await page.$$eval('a[href^="/despesa/pagamentos?"]', (a) => a.length);
    R.conferir("C.8 sem a ação de pagar, a consulta não oferece pagar ao contador", linksPagar === 0, `${String(linksPagar)} link(s) de pagar`);

    // Central de anulações: conferir antes, confirmar, abrir depois.
    await irPara(N, page, "/despesa/anulacoes?tipo=empenho&exercicio=2026");
    const alvo = await page.evaluate(() => document.querySelector("[data-anulavel]")?.getAttribute("data-anulavel") ?? null);
    if (alvo === null) throw new Error("O ensaio não tem empenho com saldo anulável em 2026.");
    const antes = await prisma.empenho.count({ where: { anulacaoParcialDeId: alvo } });
    const numeroAnulacao = `73${String(Date.now()).slice(-5)}`;
    const linha = `tr[data-anulavel="${alvo}"]`;
    await page.click(`${linha} details summary`);
    const valor = await page.$(`${linha} input[data-mascara="valor"]`);
    await valor?.click({ count: 3 });
    await page.keyboard.press("Backspace");
    await valor?.type("1,00");
    await page.type(`${linha} input[name="numero"]`, numeroAnulacao);
    await page.type(`${linha} input[name="motivo"]`, "redução do objeto no percurso V33");
    await page.$eval(`${linha} input[name="data"]`, (el) => {
      const i = el as HTMLInputElement;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(i, "2026-10-03");
      i.dispatchEvent(new Event("input", { bubbles: true }));
      i.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.click(`${linha} button[type="button"]`);
    await page.waitForSelector(`${linha} [data-conferencia-da-anulacao]`);
    const conferencia = await textoDe(page, `${linha} [data-conferencia-da-anulacao]`);
    R.conferir("C.9 antes de confirmar, a tela diz objeto, valor parcial, motivo e efeito", /Empenho/.test(conferencia) && /parcial/.test(conferencia) && /percurso V33/.test(conferencia) && /volta ao saldo disponível/.test(conferencia), conferencia);
    await page.waitForSelector(`${linha} input[name="__chave"][data-chave-de-comando="pronta"]`);
    await page.click(`${linha} button[type="submit"]`);
    await page.waitForSelector(`${linha} [data-resultado-da-acao="anular-empenho"]`, { timeout: 120000 });
    const resultado = await textoDe(page, `${linha} [data-resultado-da-acao="anular-empenho"]`);
    const depois = await prisma.empenho.findFirst({ where: { anulacaoParcialDeId: alvo, numero: numeroAnulacao }, select: { valor: true, criadoPor: true, lancamentoId: true } });
    R.conferir(
      "C.10 a anulação confirma, fica na tela com os links, e é um registro novo do contador",
      /registrada/.test(resultado) && /Abrir o lançamento da anulação/.test(resultado) && depois !== null && depois.valor.toFixed(2) === "1.00" && depois.criadoPor === "contabilidade@percursos.local" && (await prisma.empenho.count({ where: { anulacaoParcialDeId: alvo } })) === antes + 1,
      `${resultado} · ${JSON.stringify(depois)}`
    );
    await irPara(N, page, "/despesa/anulacoes?tipo=empenho&exercicio=2026");
    const registrada = await page.evaluate((lanc: string) => document.querySelector(`[data-lista="anulacoes-registradas"] a[href="/contabilidade/lancamentos/${lanc}"]`) !== null, depois?.lancamentoId ?? "-");
    R.conferir("C.11 a anulação aparece nas registradas, com o lançamento", registrada, String(depois?.lancamentoId));
    await sair(N, page).catch(() => undefined);

    // ══ T. O TESOUREIRO ══
    await entrar(N, page, "tesouraria@percursos.local", SENHA_PAPEIS);
    await irPara(N, page, "/despesa/a-pagar?exercicio=2026");
    const pagar = await page.evaluate(() => (document.querySelector('a[href^="/despesa/pagamentos?"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? null);
    if (pagar === null) {
      R.conferir("T.1 há liquidação a pagar no exercício para o tesoureiro abrir", false, "nenhum link de pagar na consulta");
    } else {
      const liq = new URL(pagar, BASE).searchParams.get("liquidacao") ?? "";
      await irPara(N, page, pagar);
      const escolhida = await page.$eval('form[data-acao="pagar"] select[name="liquidacaoId"]', (s) => (s as HTMLSelectElement).value).catch(() => "");
      R.conferir("T.1 de A pagar, a fila abre com a liquidação já escolhida", escolhida === liq && liq !== "", `escolhida=${escolhida} · pedida=${liq}`);
    }
    await sair(N, page).catch(() => undefined);

    // ══ A. O ADMINISTRADOR: duas UGs, o vínculo das unidades e o SAGRES de cada uma ══
    for (const [id, codigo, nome] of [["ent-v33-pref", "0001", "Prefeitura Municipal (percurso V33)"], ["ent-v33-cam", "0002", "Câmara Municipal (percurso V33)"]] as const) {
      if ((await prisma.entidadeContabil.findUnique({ where: { id }, select: { id: true } })) !== null) continue;
      await prisma.entidadeContabil.create({ data: { id, codigo, criadoPor: "admin@cg.pb.gov.br" } });
      await prisma.versaoDaEntidadeContabil.create({
        data: { entidadeId: id, versao: 1, nome, tipoManad: codigo === "0001" ? "01" : "02", atoTipo: "LEI", atoNumero: "1", atoAno: 2000, atoDispositivo: "art. 1", atoCitacao: "Lei orgânica (fixture do percurso V33)", criadoPor: "admin@cg.pb.gov.br" },
      });
    }
    await entrar(N, page, "admin@cg.pb.gov.br", SENHA_ADMIN);
    for (const [cod, nome, nat, ent, cnpj] of [[PREF, "Prefeitura Municipal", "PREFEITURA_OU_SECRETARIA", "ent-v33-pref", "12345678000195"], [CAM, "Câmara Municipal", "CAMARA_MUNICIPAL", "ent-v33-cam", "11222333000181"]] as const) {
      await irPara(N, page, "/contabilidade/unidades-gestoras");
      const r = await preencherEEnviar(page, "cadastrar-unidade-gestora", [
        { sel: 'input[name="codigoTce"]', valor: cod },
        { sel: 'input[name="nome"]', valor: nome },
        { sel: 'select[name="naturezaJuridica"]', valor: nat, tipo: "select" },
        { sel: 'input[data-mascara="cpf-cnpj"]', valor: cnpj },
        { sel: 'select[name="entidadeContabilId"]', valor: ent, tipo: "select" },
        { sel: 'input[name="vigenteDesde"]', valor: "2026-01-01", tipo: "data" },
        { sel: 'input[name="fundamento"]', valor: "Cadastro de UG do Tribunal (percurso V33)" },
      ]);
      R.conferir(`A.1 cadastrar a UG ${cod} confirma e grava`, r.tipo === "ok" && (await prisma.unidadeGestora.count({ where: { codigoTce: cod, entidadeContabilId: ent } })) === 1, `${r.tipo}: ${r.texto}`);
    }
    const ugs = new Map((await prisma.unidadeGestora.findMany({ select: { id: true, codigoTce: true } })).map((u) => [u.codigoTce, u.id]));
    const uos = new Map((await prisma.unidadeOrcamentaria.findMany({ select: { id: true, codigo: true } })).map((u) => [u.codigo, u.id]));
    const vincular = async (uo: string, ug: string): Promise<void> => {
      await irPara(N, page, "/contabilidade/unidades-gestoras");
      const r = await preencherEEnviar(page, "vincular-unidade-orcamentaria", [
        { sel: 'select[name="unidadeOrcId"]', valor: uos.get(uo) ?? "", tipo: "select" },
        { sel: 'select[name="ugId"]', valor: ugs.get(ug) ?? "", tipo: "select" },
        { sel: 'input[name="vigenteDesde"]', valor: "2026-01-01", tipo: "data" },
        { sel: 'input[name="fundamento"]', valor: "Quadro de unidades da LOA 2026 (percurso V33)" },
      ]);
      R.conferir(`A.2 declarar a unidade ${uo} da UG ${ug} confirma e grava`, r.tipo === "ok" && (await prisma.vinculoDaUnidadeOrcamentariaComUg.count({ where: { unidadeOrc: { codigo: uo }, ug: { codigoTce: ug } } })) === 1, `${r.tipo}: ${r.texto}`);
    };
    await vincular("01001", PREF);

    const previa = async (ug: string): Promise<string> => {
      await irPara(N, page, `/integracoes/sagres?dia=${DIA}&mes=${MES}&ug=${ug}`);
      return textoDe(page, "main");
    };
    let p = await previa(PREF);
    R.conferir(
      "A.3 com uma unidade sem UG, a prévia nomeia a unidade e tira a dotação; as contas saem por falta de vínculo",
      /Unidade orçamentária sem unidade gestora declarada/.test(p) && /99001/.test(p) && /Dados de mais de uma unidade gestora/.test(p),
      p.slice(0, 400)
    );
    await vincular("99001", CAM);
    p = await previa(PREF);
    // A prévia de cada arquivo é um cartão com o nome em <strong> e as linhas num <pre>: sobe do <pre> até o cartão.
    const dotacao = await page.evaluate(() => {
      for (const pre of [...document.querySelectorAll("pre")]) {
        let el: HTMLElement | null = pre;
        while (el !== null && el.querySelector("strong") === null) el = el.parentElement;
        // A prévia numera cada linha ("  1 | 201001..."): tira a numeração e fica com o registro.
        if (el?.querySelector("strong")?.textContent === "Dotacao") {
          return (pre.textContent ?? "").split("\n").map((l) => l.replace(/^\s*\d+ \| /, "")).filter((l) => /^\d{6}/.test(l));
        }
      }
      return [] as string[];
    });
    const porUo = new Map(dotacao.map((l) => [l.slice(10, 15), l.slice(0, 6)]));
    R.conferir(
      "A.4 pela Prefeitura, a dotação leva em cada linha a UG dona da unidade",
      dotacao.length > 0 && [...porUo.entries()].every(([uo, ug]) => (uo === "01001" ? ug === PREF : uo === "99001" ? ug === CAM : false)),
      JSON.stringify([...porUo.entries()])
    );
    p = await previa(CAM);
    R.conferir("A.5 a Câmara não remete a dotação (arquivo do ente)", /Arquivo do ente, remetido só pela Prefeitura/.test(p) && /Dotacao/.test(p), p.slice(0, 300));

    const baixar = (q: string): Promise<{ status: number; nome: string; corpo: string }> =>
      page.evaluate(async (u: string) => {
        const r = await fetch(u);
        const b = new Uint8Array(await r.arrayBuffer());
        let s = "";
        for (const x of b) s += String.fromCharCode(x);
        return { status: r.status, nome: r.headers.get("content-disposition") ?? "", corpo: s };
      }, `${BASE}/integracoes/sagres/download?${q}`);
    const semUg = await baixar(`dia=${DIA}&mes=${MES}`);
    R.conferir("A.6 sem escolher a UG, com duas escrituradas, o download recusa dizendo por quê", semUg.status >= 400 && /Escolha a unidade da remessa/.test(semUg.corpo), `${String(semUg.status)} ${semUg.corpo.slice(0, 200)}`);
    const daCamara = await baixar(`dia=${DIA}&mes=${MES}&ug=${CAM}`);
    R.conferir(
      "A.7 o pacote da Câmara sai como conferência, sem a dotação e sem as contas, com os arquivos dela",
      daCamara.status === 200 && /conferencia-incompleto_/.test(daCamara.nome) && !daCamara.corpo.includes("Dotacao.txt") && !daCamara.corpo.includes("CadastroContaBancaria.txt") && daCamara.corpo.includes("Empenhos.txt"),
      `${String(daCamara.status)} ${daCamara.nome}`
    );

    // O administrador reabre o mês que o contador fechou — com motivo.
    if (fechar.tipo === "ok") {
      await irPara(N, page, "/contabilidade/fechamento-mensal?exercicio=2026");
      const r = await preencherEEnviar(page, `form[data-acao="reabrir-mes"][data-competencia="${mes}"]`, [{ sel: 'input[name="motivo"]', valor: "reabertura do percurso V33 para conferência" }], "reabrir-mes");
      const destravou = await prisma.movimentoTravamento.count({ where: { tipo: "DESTRAVAR", criadoPor: "admin@cg.pb.gov.br" } });
      R.conferir("A.8 quem tem a ação reabre o mês, com o motivo registrado", r.tipo === "ok" && /reaberto/i.test(r.texto) && destravou >= 1, `${r.tipo}: ${r.texto}`);
    }
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? (e.stack ?? e.message) : e);
  process.exit(1);
});
