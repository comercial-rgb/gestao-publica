import "dotenv/config";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { buscarJson, entrar, hrefDoRegistro, irPara, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — A FICHA ORÇAMENTÁRIA PELA TELA (M02, V6.2 U0; resolve `CRIAR-FICHA-SEM-TELA`).
 *
 * O planejamento cria DUAS fichas pela tela — a de vencimentos (319011) e a de obrigações patronais
 * (319013) — numa fonte e unidade que o banco não tinha para essas naturezas, com os seletores
 * referenciados. Cada ficha nasce SEM crédito, recarrega, aparece na lista e mostra a dotação
 * inicial zero no histórico. Depois: duplicidade, exercício que a tela não oferece, o recorte da UO
 * para quem só cria numa unidade, a falta da permissão para quem só lê, a leitura negada da lista
 * para quem não lê o planejamento e a sessão ausente.
 *
 * ⚠️ AS FICHAS NÃO SÃO SEMEADAS: o percurso prova que a TELA as cria. Os números vêm do instante.
 * ⚠️ O QUE ELE NÃO PROVA: a ficha usada numa apropriação — isso é do percurso dos encargos (U1), que
 * parte das fichas criadas aqui.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const PLANEJAMENTO = "planejamento@percursos.local";
const PLANEJAMENTO_UG = "planejamento-ug@percursos.local";
const CONTABILIDADE = "contabilidade@percursos.local";
const SERVIDOR = "servidor@percursos.local";
const SUF = Number(String(Date.now()).slice(-4));
const R = registroDePassos();

interface Opcao {
  readonly valor: string;
  readonly rotulo: string;
}

async function opcoes(page: Page, catalogo: string, q = ""): Promise<{ readonly status: number; readonly opcoes: readonly Opcao[]; readonly erro: string }> {
  const r = await buscarJson(page, `${N.base}/opcoes/${catalogo}?q=${encodeURIComponent(q)}`);
  const corpo = (r.corpo ?? {}) as { opcoes?: Opcao[]; erro?: string };
  return { status: r.status, opcoes: corpo.opcoes ?? [], erro: corpo.erro ?? "" };
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  try {
    navegador = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await navegador.newPage();
    await page.setViewport({ width: 1366, height: 900 });

    // ══ 1. o planejamento cria a ficha de VENCIMENTOS pela tela ══
    await entrar(N, page, PLANEJAMENTO, SENHA);
    R.ok("1.0 o planejamento entra");
    const lista = await irPara(N, page, "/planejamento/fichas");
    R.conferir("1.1 a tela das fichas existe, com o formulário de criar e o aviso de que a ficha nasce SEM crédito", (await page.$('form[data-acao="criar-fichas"]')) !== null && lista.includes("nasce sem crédito"), lista.slice(0, 400));
    R.conferir("1.1b nenhum identificador de cláusula na tela", !/\btr\s*\d+\.\d+/.test(lista), "apareceu rótulo de catálogo");
    R.conferir("1.2 o formulário NÃO tem campo de valor — criar ficha não é abrir crédito", (await page.$('form[data-acao="criar-fichas"] [name="valorDotado"]')) === null && (await page.$('form[data-acao="criar-fichas"] [data-mascara="valor"]')) === null, "apareceu campo de valor");

    const uos = await opcoes(page, "unidades-para-ficha");
    const naturezas = await opcoes(page, "naturezas-de-despesa", "3190");
    R.conferir("1.3 o seletor da UO pesquisa no servidor e devolve as unidades do ente (global)", uos.status === 200 && uos.opcoes.length >= 1, JSON.stringify(uos).slice(0, 300));
    R.conferir("1.4 a busca de natureza por PREFIXO '3190' traz 319011 e 319013", naturezas.opcoes.some((o) => o.valor === "319011") && naturezas.opcoes.some((o) => o.valor === "319013"), JSON.stringify(naturezas.opcoes.map((o) => o.valor)));
    const fontes = await opcoes(page, "fontes");
    // A fonte: a última da lista, para não repetir a chave das fichas já existentes (que usam a primeira).
    const fonte = fontes.opcoes[fontes.opcoes.length - 1];
    const uo = uos.opcoes[0];
    if (fonte === undefined || uo === undefined) throw new Error("sem fonte ou unidade no banco dos percursos");

    const exercicio = await page.$eval('form[data-acao="criar-fichas"] select[name="exercicio"]', (s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value).filter((v) => v !== ""));
    R.conferir("1.5 o exercício só oferece os ABERTOS", exercicio.length >= 1 && exercicio.every((a) => /^\d{4}$/.test(a)), JSON.stringify(exercicio));
    const ano = exercicio[0] ?? "2026";

    // O banco dos percursos tem um programa, uma ação e uma fonte — mas 111 subfunções. A chave livre
    // varia a SUBFUNÇÃO (e a ação, quando houver mais de uma).
    const acoesDoPlano = (await opcoes(page, "acoes")).opcoes;
    const subfuncoes = (await opcoes(page, "subfuncoes", "1")).opcoes;
    const criar = async (numero: number, natureza: string, acao: string, subfuncao = "") =>
      preencherEEnviar(page, "criar-fichas", [
        { sel: 'select[name="exercicio"]', valor: ano, tipo: "select" },
        { sel: 'input[name="numero"]', valor: String(numero) },
        { sel: "unidadeOrc", valor: uo.valor, tipo: "referencia" },
        { sel: "funcao", valor: "", tipo: "referencia" },
        { sel: "subfuncao", valor: subfuncao, tipo: "referencia", busca: subfuncao },
        { sel: "programa", valor: "", tipo: "referencia" },
        { sel: "acao", valor: acao, tipo: "referencia", busca: acao },
        { sel: "naturezaDespesa", valor: natureza, tipo: "referencia", busca: natureza },
        { sel: "fonte", valor: fonte.valor, tipo: "referencia" },
        { sel: 'select[name="exercicioFonte"]', valor: "1", tipo: "select" },
      ]);
    /**
     * ⚠️ A CHAVE LIVRE É PROCURADA, NÃO SUPOSTA: uma execução anterior deste percurso já criou a ficha
     * na primeira combinação, e a unicidade `uq_ficha_sagres` recusaria de novo. Anda pelas combinações
     * até a primeira que o banco aceita — e a recusa de duplicidade no caminho é o próprio produto.
     */
    const criarLivre = async (numero: number, natureza: string): Promise<{ readonly r: { tipo: string; texto: string }; readonly acao: string; readonly subfuncao: string }> => {
      let ultima = { r: { tipo: "silencio", texto: "sem combinação livre" }, acao: "", subfuncao: "" };
      for (const a of acoesDoPlano) {
        for (const sf of subfuncoes.slice(0, 20)) {
          await irPara(N, page, "/planejamento/fichas");
          const r = await criar(numero, natureza, a.valor, sf.valor);
          ultima = { r, acao: a.valor, subfuncao: sf.valor };
          if (!(r.tipo === "erro" && /Ficha duplicada/.test(r.texto))) return ultima;
        }
      }
      return ultima;
    };

    const NUM_VENC = 20000 + SUF;
    const venc = await criarLivre(NUM_VENC, "319011");
    const rVenc = venc.r;
    R.conferir("1.6 ficha de VENCIMENTOS criada pela tela — e a mensagem diz SEM crédito e de onde vem a dotação", rVenc.tipo === "ok" && /sem dotação/.test(rVenc.texto) && /crédito adicional/.test(rVenc.texto), `${rVenc.tipo}: ${rVenc.texto.slice(0, 300)}`);

    await irPara(N, page, `/planejamento/fichas?q=${NUM_VENC}`);
    const hrefVenc = await hrefDoRegistro(page, String(NUM_VENC));
    R.conferir("1.7 RECARREGADA, a ficha aparece na lista com a natureza e a fonte escolhidas", hrefVenc !== null && (await texto(page)).includes("319011"), hrefVenc ?? "sem link");
    if (hrefVenc !== null) {
      const det = await irPara(N, page, hrefVenc);
      R.conferir("1.8 o detalhe mostra dotação inicial 0,00, autorizado 0,00 e o selo SEM CRÉDITO", det.includes("sem crédito") && det.includes("dotação inicial (loa)") && /autorizado\s*r\$\s*0,00/.test(det), det.slice(0, 700));
      const hist = await irPara(N, page, `${hrefVenc}?aba=historico`);
      R.conferir("1.9 o histórico traz a dotação inicial ZERO, com competência e registro", hist.includes("dotação inicial (loa)") && hist.includes("r$ 0,00"), hist.slice(0, 500));
    }

    // ══ 2. a ficha de OBRIGAÇÕES PATRONAIS — a que o percurso dos encargos vai usar ══
    const NUM_PATR = 30000 + SUF;
    const patr = await criarLivre(NUM_PATR, "319013");
    R.conferir("2.1 ficha de OBRIGAÇÕES PATRONAIS (319013) criada pela tela, também sem crédito", patr.r.tipo === "ok" && /sem dotação/.test(patr.r.texto), `${patr.r.tipo}: ${patr.r.texto.slice(0, 300)}`);
    console.log(`      [fichas do percurso: ${NUM_VENC} (319011, ação ${venc.acao}, subfunção ${venc.subfuncao}) e ${NUM_PATR} (319013, ação ${patr.acao}), fonte ${fonte.valor}, UO ${uo.valor}, exercício ${ano}]`);

    // ══ 3. as recusas, cada uma com o motivo ══
    await irPara(N, page, "/planejamento/fichas");
    const rDup = await criar(40000 + SUF, "319011", venc.acao, venc.subfuncao);
    R.conferir("3.1 NEGATIVA: a MESMA classificação com outro número é recusada como duplicada, nomeando a chave", rDup.tipo === "erro" && /Ficha duplicada/.test(rDup.texto), `${rDup.tipo}: ${rDup.texto.slice(0, 250)}`);
    await irPara(N, page, "/planejamento/fichas");
    const rNum = await criar(NUM_VENC, "339039", venc.acao, venc.subfuncao);
    R.conferir("3.2 NEGATIVA: o MESMO número no exercício é recusado", rNum.tipo === "erro" && /duplicada/i.test(rNum.texto), `${rNum.tipo}: ${rNum.texto.slice(0, 250)}`);
    // O exercício que a tela NÃO oferece, forçado no DOM — a forma de uma chamada que não veio da tela.
    await irPara(N, page, "/planejamento/fichas");
    await page.evaluate(() => {
      const s = document.querySelector('form[data-acao="criar-fichas"] select[name="exercicio"]') as HTMLSelectElement | null;
      if (s === null) return;
      const o = document.createElement("option");
      o.value = "2031";
      o.textContent = "2031";
      s.appendChild(o);
    });
    const rEx = await preencherEEnviar(page, "criar-fichas", [
      { sel: 'select[name="exercicio"]', valor: "2031", tipo: "select" },
      { sel: 'input[name="numero"]', valor: String(50000 + SUF) },
      { sel: "unidadeOrc", valor: uo.valor, tipo: "referencia" },
      { sel: "funcao", valor: "", tipo: "referencia" },
      { sel: "subfuncao", valor: "", tipo: "referencia" },
      { sel: "programa", valor: "", tipo: "referencia" },
      { sel: "acao", valor: "", tipo: "referencia" },
      { sel: "naturezaDespesa", valor: "319011", tipo: "referencia", busca: "319011" },
      { sel: "fonte", valor: fonte.valor, tipo: "referencia" },
      { sel: 'select[name="exercicioFonte"]', valor: "1", tipo: "select" },
    ]);
    R.conferir("3.3 NEGATIVA: exercício que a tela não oferece (2031), forçado, é recusado pelo caso de uso nomeando o ano", rEx.tipo === "erro" && /2031/.test(rEx.texto), `${rEx.tipo}: ${rEx.texto.slice(0, 250)}`);
    await irPara(N, page, "/planejamento/fichas");
    const rVazio = await preencherEEnviar(page, "criar-fichas", [
      { sel: 'select[name="exercicio"]', valor: ano, tipo: "select" },
      { sel: 'input[name="numero"]', valor: String(60000 + SUF) },
      { sel: 'select[name="exercicioFonte"]', valor: "1", tipo: "select" },
    ]);
    R.conferir("3.4 NEGATIVA: sem escolher na lista, o texto não vale — a recusa nomeia o que falta escolher", rVazio.tipo === "erro" && /Escolha na lista/.test(rVazio.texto) && /unidade orçamentária/.test(rVazio.texto), `${rVazio.tipo}: ${rVazio.texto.slice(0, 250)}`);
    await irPara(N, page, `/planejamento/fichas?q=${40000 + SUF}`);
    R.conferir("3.5 e nenhuma das recusas gravou ficha", (await hrefDoRegistro(page, String(40000 + SUF))) === null, "a ficha duplicada apareceu na lista");

    // ══ 4. o recorte da UO e a falta de direito ══
    await sair(N, page);
    await entrar(N, page, PLANEJAMENTO_UG, SENHA);
    const uosUg = await opcoes(page, "unidades-para-ficha");
    R.conferir("4.1 quem cria ficha SÓ na 99001 vê SÓ a 99001 no seletor da unidade", uosUg.status === 200 && uosUg.opcoes.map((o) => o.valor).join(",") === "99001", JSON.stringify(uosUg.opcoes.map((o) => o.valor)));
    const direto = await buscarJson(page, `${N.base}/opcoes/unidades-para-ficha?valor=01001`);
    R.conferir("4.2 NEGATIVA: pedir a 01001 pelo parâmetro direto não a entrega", direto.status === 200 && ((direto.corpo as { opcoes?: unknown[] }).opcoes ?? []).length === 0, JSON.stringify(direto));

    await sair(N, page);
    await entrar(N, page, CONTABILIDADE, SENHA);
    const contab = await irPara(N, page, "/planejamento/fichas");
    R.conferir("4.3 NEGATIVA: a contabilidade LÊ as fichas, mas sem CRIAR_FICHA vê o motivo no lugar do formulário", (await page.$('form[data-acao="criar-fichas"]')) === null && contab.includes("não tem a permissão necessária para cadastrar ficha orçamentária"), contab.slice(0, 400));
    const uosContab = await opcoes(page, "unidades-para-ficha");
    R.conferir("4.4 e o seletor de unidade devolve VAZIO para ela — não se oferece o que cairia", uosContab.status === 200 && uosContab.opcoes.length === 0, JSON.stringify(uosContab));

    await sair(N, page);
    await entrar(N, page, SERVIDOR, SENHA);
    const semLeitura = await opcoes(page, "naturezas-de-despesa", "3190");
    R.conferir("4.5 NEGATIVA: a servidora do quadro (sem leitura do planejamento) recebe 403 COM o motivo — não lista vazia", semLeitura.status === 403 && /ACESSO NEGADO/.test(semLeitura.erro) && /CONSULTAR_PLANEJAMENTO/.test(semLeitura.erro), JSON.stringify(semLeitura));
    await sair(N, page);
    const anonimo = await buscarJson(page, `${N.base}/opcoes/naturezas-de-despesa?q=3190`);
    R.conferir("4.6 NEGATIVA: sem sessão, 401 — e nenhum dado", anonimo.status === 401 && JSON.stringify(anonimo.corpo).includes("Sessão encerrada") && !JSON.stringify(anonimo.corpo).includes("319011"), JSON.stringify(anonimo));
  } catch (e) {
    R.falhou("execução", e instanceof Error ? e.message : String(e));
  } finally {
    await navegador?.close();
  }
  R.encerrar();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
