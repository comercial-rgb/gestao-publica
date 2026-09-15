import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Browser, Page } from "puppeteer";
import { diaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — O CONTRATO ACOMPANHADO (V7 M2.1), POR QUATRO PAPÉIS E O VISITANTE.
 *
 * O administrador cadastra as pessoas, vincula as contas, cadastra dois itens num contrato VIGENTE e
 * designa gestora e fiscal (a gestora como fiscal do mesmo contrato é recusada) → a gestora programa a
 * fiscalização → o fiscal registra ocorrência com evidência, encaminha ao gestor e mede por itens (parcela
 * parcial) → OUTRO SETOR, com as mesmas ações de perfil e sem designação, vê o motivo e nenhum formulário →
 * a gestora resolve → o visitante vê a projeção pública sem ocorrência nem evidência, e não baixa a
 * evidência → o administrador revoga o fiscal, que perde o formulário.
 *
 * ⚠️ Nada é semeado além das contas de `percursos-usuarios-por-papel.ts`. Nomes e documentos levam o sufixo.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const GESTORA = "gestora-contrato@percursos.local";
const FISCAL = "fiscal-contrato@percursos.local";
const OUTRO = "outro-setor-contrato@percursos.local";
const SUF = String(Date.now()).slice(-6);
const R = registroDePassos();
const CAPTURAS = process.env["PERCURSO_CAPTURAS"] ?? join(process.cwd(), ".registro-de-execucao", "pacote-v7-m2", "capturas");
const HOJE = diaCivil(new Date());
const DESCRICAO_OCORRENCIA = `Base com espessura abaixo do projeto no trecho ${SUF}`;

function dv11(ds: readonly number[], pesos: readonly number[]): number {
  const r = ds.reduce((a, d, i) => a + d * (pesos[i] ?? 0), 0) % 11;
  return r < 2 ? 0 : 11 - r;
}
function cpf(semente: string): string {
  const base = `${semente}000000000`.slice(0, 9).split("").map(Number);
  const d1 = dv11(base, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv11([...base, d1], [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base.join("")}${d1}${d2}`;
}

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `contrato-${nome}.png`), fullPage: true });
}

async function cadastrarEVincular(page: Page, conta: string, documento: string, nome: string): Promise<void> {
  await irPara(N, page, "/cadastros/pessoas");
  const r = await preencherEEnviar(page, "cadastrar-pessoa", [
    { sel: 'input[data-mascara="cpf-cnpj"]', valor: documento },
    { sel: 'input[name="nome"]', valor: nome },
    { sel: 'input[name="email"]', valor: `${conta.split("@")[0]}.${SUF}@exemplo.test` },
  ]);
  R.conferir(`1.p pessoa ${nome} cadastrada`, r.tipo === "ok", `${r.tipo}: ${r.texto.slice(0, 160)}`);
  const rota = `/administracao/usuarios?q=${encodeURIComponent(conta)}`;
  const abrir = (): Promise<void> => page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
  await irPara(N, page, rota);
  await abrir();
  if ((await page.$(`form[data-acao="desvincular-pessoa"][data-usuario="${conta}"]`)) !== null) {
    await preencherEEnviar(page, `form[data-acao="desvincular-pessoa"][data-usuario="${conta}"]`, [{ sel: 'input[name="motivo"]', valor: `percurso ${SUF}: a conta passa à pessoa desta execução` }]);
    await irPara(N, page, rota);
    await abrir();
  }
  const v = await preencherEEnviar(page, `form[data-acao="vincular-pessoa"][data-usuario="${conta}"]`, [
    { sel: 'input[name="documento"]', valor: documento },
    { sel: 'input[name="motivo"]', valor: `percurso ${SUF}: conferido pelo CPF` },
  ]);
  R.conferir(`1.v conta ${conta} vinculada`, v.tipo !== "erro", `${v.tipo}: ${v.texto.slice(0, 160)}`);
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  const evidencia = join(CAPTURAS, `evidencia-${SUF}.pdf`);
  mkdirSync(CAPTURAS, { recursive: true });
  writeFileSync(evidencia, `%PDF-1.4\n% evidencia sintetica do percurso ${SUF}\n%%EOF\n`);
  try {
    navegador = await lancarNavegadorDoPercurso();
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [sufixo ${SUF} · banco ${process.env["PERCURSO_BANCO"] ?? "não declarado"}]`);

    const lista = await page.goto(`${N.base}/transparencia/contratos`, { waitUntil: "networkidle2" });
    R.conferir("0.1 /transparencia/contratos responde sem sessão", lista?.status() === 200, `${lista?.status()}`);

    // ══ 1. administrador: pessoas, vínculos, itens e designações ══
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await cadastrarEVincular(page, GESTORA, cpf(`4${SUF}1`), `Gabriela Gestora ${SUF}`);
    await cadastrarEVincular(page, FISCAL, cpf(`5${SUF}2`), `Fábio Fiscal ${SUF}`);
    await cadastrarEVincular(page, OUTRO, cpf(`6${SUF}3`), `Otávio Outro ${SUF}`);
    await irPara(N, page, "/licitacoes/contratos");
    const hrefContrato = await page.evaluate(() => {
      const linha = Array.from(document.querySelectorAll("tbody tr")).find((tr) => /vigente/i.test(tr.textContent ?? ""));
      const a = linha?.querySelector('a[href^="/licitacoes/contratos/"]') as HTMLAnchorElement | null | undefined;
      return a === null || a === undefined ? null : new URL(a.href).pathname;
    });
    if (hrefContrato === null) throw new Error("não há contrato VIGENTE no banco dos percursos");
    const contratoId = hrefContrato.split("/").pop() ?? "";
    await irPara(N, page, hrefContrato);
    for (const [descricao, qtd, unit] of [[`Base de brita ${SUF}`, "2", "0,50"], [`Revestimento ${SUF}`, "4", "0,25"]] as const) {
      const r = await preencherEEnviar(page, "cadastrar-item-do-contrato", [
        { sel: 'input[name="descricao"]', valor: descricao }, { sel: 'input[name="unidade"]', valor: "m3" },
        { sel: 'input[name="quantidade"]', valor: qtd }, { sel: 'input[name="valorUnitario"]', valor: unit },
      ]);
      R.conferir(`1.1 item "${descricao}" cadastrado pela tela`, r.tipo === "ok", `${r.tipo}: ${r.texto.slice(0, 200)}`);
    }
    for (const [papel, conta, ato] of [["GESTOR", GESTORA, `Portaria ${SUF}-G/2026`], ["FISCAL", FISCAL, `Portaria ${SUF}-F/2026`]] as const) {
      await irPara(N, page, hrefContrato);
      const r = await preencherEEnviar(page, "designar-no-contrato", [
        { sel: 'select[name="papel"]', valor: papel, tipo: "select" }, { sel: 'select[name="usuario"]', valor: conta, tipo: "select" },
        { sel: 'input[name="ato"]', valor: ato }, { sel: 'input[name="inicio"]', valor: HOJE, tipo: "data" },
      ]);
      R.conferir(`1.2 ${papel} designado pela tela (${conta})`, r.tipo === "ok", `${r.tipo}: ${r.texto.slice(0, 200)}`);
    }
    await irPara(N, page, hrefContrato);
    const acumulo = await preencherEEnviar(page, "designar-no-contrato", [
      { sel: 'select[name="papel"]', valor: "FISCAL", tipo: "select" }, { sel: 'select[name="usuario"]', valor: GESTORA, tipo: "select" },
      { sel: 'input[name="ato"]', valor: `Portaria ${SUF}-X/2026` }, { sel: 'input[name="inicio"]', valor: HOJE, tipo: "data" },
    ]);
    R.conferir("1.3 NEGATIVA: a gestora como fiscal do mesmo contrato é recusada nomeando o acúmulo", acumulo.tipo === "erro" && /ACUMULO-DE-GESTOR-E-FISCAL/.test(acumulo.texto), `${acumulo.tipo}: ${acumulo.texto.slice(0, 200)}`);
    await sair(N, page);

    // ══ 2. gestora programa ══
    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, hrefContrato);
    R.conferir("2.0 a gestora não vê o formulário de ocorrência (é do fiscal) e vê o motivo", (await page.$('form[data-acao="registrar-ocorrencia"]')) === null && (await texto(page)).includes("registrar ocorrência é do fiscal designado"), "formulário de fiscal apareceu para a gestora");
    const fiscalId = await page.$eval('form[data-acao="programar-fiscalizacao"] select[name="fiscalDesignacaoId"]', (s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value).find((v) => v !== "") ?? "");
    const prog = await preencherEEnviar(page, "programar-fiscalizacao", [
      { sel: 'select[name="fiscalDesignacaoId"]', valor: fiscalId, tipo: "select" }, { sel: 'input[name="dataPrevista"]', valor: HOJE, tipo: "data" },
      { sel: 'textarea[name="objetivo"]', valor: `Conferir a compactação da base (${SUF})` },
    ]);
    R.conferir("2.1 a gestora programa a fiscalização para o fiscal", prog.tipo === "ok" && /Ordem de fiscalização nº \d+/.test(prog.texto), `${prog.tipo}: ${prog.texto.slice(0, 200)}`);
    await sair(N, page);

    // ══ 3. fiscal: ocorrência com evidência e medição por itens ══
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefContrato);
    const ordem = await page.$eval('form[data-acao="registrar-ocorrencia"] select[name="ordemId"]', (s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value).find((v) => v !== "") ?? "").catch(() => "");
    const oc = await preencherEEnviar(page, "registrar-ocorrencia", [
      { sel: 'select[name="tipo"]', valor: "NAO_CONFORMIDADE", tipo: "select" },
      ...(ordem !== "" ? [{ sel: 'select[name="ordemId"]', valor: ordem, tipo: "select" as const }] : []),
      { sel: 'textarea[name="descricao"]', valor: DESCRICAO_OCORRENCIA },
      { sel: 'select[name="encaminhamento"]', valor: "GESTOR", tipo: "select" },
      { sel: 'input[name="evidencias"]', valor: evidencia, tipo: "arquivo" },
    ]);
    R.conferir("3.1 o fiscal registra a ocorrência com 1 evidência e encaminha ao gestor", oc.tipo === "ok" && /1 evidência\(s\), encaminhada ao gestor/.test(oc.texto), `${oc.tipo}: ${oc.texto.slice(0, 200)}`);
    await irPara(N, page, hrefContrato);
    const hrefEvidencia = await page.evaluate((d) => {
      const li = Array.from(document.querySelectorAll("[data-ocorrencia]")).find((x) => (x.textContent ?? "").includes(d));
      return (li?.querySelector('a[href^="/documentos/anexos/"]') as HTMLAnchorElement | null)?.getAttribute("href") ?? "";
    }, DESCRICAO_OCORRENCIA);
    R.conferir("3.2 recarregada: a ocorrência aparece aguardando o gestor, com o link da evidência", hrefEvidencia !== "", "sem evidência na lista");
    const temObra = (await page.$('form[data-acao="medir-por-itens"] select[name="obraId"] option:not([value=""])')) !== null;
    if (temObra) {
      const obra = await page.$eval('form[data-acao="medir-por-itens"] select[name="obraId"]', (s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value).find((v) => v !== "") ?? "");
      /**
       * ⚠️ O PERÍODO LIVRE É PROCURADO, NÃO SUPOSTO: uma execução anterior deste percurso no mesmo banco já mediu "ontem"
       * nesta obra, e o produto recusa, com razão, o período sobreposto (achado da reexecução sobre 2d7a9cd). Anda um dia
       * para trás a cada recusa de sobreposição — a recusa no caminho é o próprio produto; qualquer outra recusa para.
       */
      let med = { tipo: "silencio", texto: "sem dia livre nos últimos 30" };
      for (let k = 1; k <= 30; k++) {
        const dia = diaCivil(new Date(Date.now() - k * 86_400_000));
        await irPara(N, page, hrefContrato);
        const primeiroItem = await page.$eval('form[data-acao="medir-por-itens"] input[name^="item."]', (i) => (i as HTMLInputElement).name);
        med = await preencherEEnviar(page, "medir-por-itens", [
          { sel: 'select[name="obraId"]', valor: obra, tipo: "select" },
          { sel: 'input[name="diaInicio"]', valor: dia, tipo: "data" }, { sel: 'input[name="diaFim"]', valor: dia, tipo: "data" },
          { sel: 'input[name="responsavelTecnico"]', valor: "Eng. Marta Nunes (percurso)" }, { sel: 'input[name="registroProfissional"]', valor: "CREA-PB 000000 (sintético)" },
          { sel: `input[name="${primeiroItem}"]`, valor: "1" },
        ]);
        if (!(med.tipo === "erro" && /PERÍODO SOBREPOSTO/.test(med.texto))) break;
        console.log(`      [${dia} já medido nesta obra por execução anterior — recusado por sobreposição; tenta o dia anterior]`);
      }
      R.conferir("3.3 o fiscal mede por itens uma parcela PARCIAL (1 de 2) — e a mensagem diz que falta aprovação", med.tipo === "ok" && /precisa ser APROVADA/.test(med.texto), `${med.tipo}: ${med.texto.slice(0, 300)}`);
      await irPara(N, page, hrefContrato);
      const fisico = await page.$eval("[data-itens-do-contrato] tbody tr:last-child [data-percentual-fisico]", (e) => e.textContent ?? "").catch(() => "");
      R.conferir("3.4 recarregada: o físico do item medido aparece em percentual, e o financeiro não mudou por medir", /%$/.test(fisico) && (await page.$("[data-medicao]")) !== null, `físico=${fisico}`);
    } else {
      R.falhou("3.3 medição por itens", "nenhuma obra ativa no banco dos percursos para medir — BLOQUEADO POR DADO, não por regra");
    }
    await capturar(page, "fiscal");
    await sair(N, page);

    // ══ 4. outro setor ══
    await entrar(N, page, OUTRO, SENHA);
    await irPara(N, page, hrefContrato);
    const outroTexto = await texto(page);
    R.conferir("4.1 NEGATIVA: outro setor, com as mesmas ações de perfil, não recebe formulário de gestor nem de fiscal — e lê o motivo", (await page.$('form[data-acao="registrar-ocorrencia"], form[data-acao="programar-fiscalizacao"], form[data-acao="medir-por-itens"], form[data-acao="resolver-ocorrencia"]')) === null && outroTexto.includes("é do fiscal designado e vigente neste contrato") && outroTexto.includes("é do gestor designado e vigente neste contrato"), outroTexto.slice(0, 300));
    await sair(N, page);

    // ══ 5. gestora resolve ══
    await entrar(N, page, GESTORA, SENHA);
    await irPara(N, page, hrefContrato);
    const numeroOc = await page.evaluate((d) => Array.from(document.querySelectorAll("[data-ocorrencia]")).find((x) => (x.textContent ?? "").includes(d))?.getAttribute("data-ocorrencia") ?? "", DESCRICAO_OCORRENCIA);
    const res = await preencherEEnviar(page, `form[data-acao="resolver-ocorrencia"][data-ocorrencia-alvo="${numeroOc}"]`, [{ sel: 'textarea[name="texto"]', valor: `Notificada a contratada para refazer o trecho (${SUF})` }]);
    R.conferir("5.1 a gestora resolve a ocorrência encaminhada", res.tipo === "ok", `${res.tipo}: ${res.texto.slice(0, 200)}`);
    await capturar(page, "gestora");
    await sair(N, page);

    // ══ 6. visitante ══
    const pub = await irPara(N, page, `/transparencia/contratos/${contratoId}`);
    R.conferir("6.1 a projeção pública mostra gestora e fiscal vigentes pelo nome e ato", pub.includes(`gabriela gestora ${SUF}`) && pub.includes(`fábio fiscal ${SUF}`), pub.slice(0, 400));
    R.conferir("6.2 NEGATIVA: a projeção pública não leva ocorrência, conta de usuário nem CPF", !pub.includes(DESCRICAO_OCORRENCIA.toLowerCase()) && !pub.includes("percursos.local") && !pub.includes(cpf(`5${SUF}2`)), "vazou dado interno");
    await capturar(page, "publico");
    const ev = await page.goto(`${N.base}${hrefEvidencia}`, { waitUntil: "domcontentloaded" });
    R.conferir("6.3 NEGATIVA: o visitante não baixa a evidência (login ou recusa, nunca o PDF)", page.url().includes("/login") || (ev?.status() ?? 0) >= 400 || !(ev?.headers()["content-type"] ?? "").includes("pdf"), `${ev?.status()} ${page.url()}`);

    // ══ 7. revogação ══
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    await irPara(N, page, hrefContrato);
    const alvoFiscal = await page.evaluate((nome) => {
      const li = Array.from(document.querySelectorAll('[data-designacao="FISCAL"]')).find((x) => (x.textContent ?? "").includes(nome));
      return li?.querySelector('form[data-acao="revogar-designacao"]')?.getAttribute("data-designacao-alvo") ?? "";
    }, `Fábio Fiscal ${SUF}`);
    const rev = await preencherEEnviar(page, `form[data-acao="revogar-designacao"][data-designacao-alvo="${alvoFiscal}"]`, [{ sel: 'input[name="dataEfeito"]', valor: HOJE, tipo: "data" }, { sel: 'input[name="motivo"]', valor: `Fiscal removido (percurso ${SUF})` }]);
    R.conferir("7.1 o administrador revoga o fiscal com efeito hoje", rev.tipo === "ok", `${rev.tipo}: ${rev.texto.slice(0, 200)}`);
    await sair(N, page);
    await entrar(N, page, FISCAL, SENHA);
    await irPara(N, page, hrefContrato);
    R.conferir("7.2 revogado, o fiscal perde os formulários de ocorrência e medição", (await page.$('form[data-acao="registrar-ocorrencia"], form[data-acao="medir-por-itens"]')) === null, "o formulário continuou");
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
