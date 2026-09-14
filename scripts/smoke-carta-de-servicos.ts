import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { diaCivil } from "../packages/datas/index.js";
import { barrado, buscarJson, entrar, irPara, preencherEEnviar, registroDePassos, sair, texto, type Navegador } from "./percursos-navegador.js";

/**
 * PERCURSO — A CARTA DE SERVIÇOS DE PONTA A PONTA (M21/M19, V6.2 P3), POR SEIS PAPÉIS.
 *
 * O administrador cadastra as pessoas e VINCULA as contas pelo CPF → o gestor da carta cadastra três
 * serviços (requerimento, atualização cadastral, complemento de fornecedor) e um rascunho, com versão
 * pela ilha e publicação pela barra, e registra a representação da empresa → o visitante SEM CONTA lê a
 * carta → a cidadã A pede pela tela → a cidadã B não alcança o pedido de A → a mesa emite exigência (e
 * a barra trava a decisão) → A envia documento e responde → a mesa libera resposta e decide, com
 * fundamento interno → A lê a decisão sem o fundamento e baixa a resposta → a atualização cadastral
 * deferida vira versão do cadastro → o representante pede em nome da empresa, a representação é
 * revogada e ele perde o acesso.
 *
 * ⚠️ NADA É SEMEADO NESTE PERCURSO ALÉM DAS CONTAS DE `percursos-usuarios-por-papel.ts`: pessoas,
 * vínculos, serviços, versões, publicação, representação e solicitações nascem pela tela. Os nomes e
 * documentos levam o sufixo do instante.
 */
const N: Navegador = { base: process.argv[2] ?? "http://localhost:3010" };
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";
const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.env["SEED_ADMIN_SENHA"] ?? "";
const CARTA = "carta@percursos.local";
const MESA = "mesa@percursos.local";
const A = "cidada-a@percursos.local";
const B = "cidada-b@percursos.local";
const REP = "representante@percursos.local";
const SUF = String(Date.now()).slice(-6);
const R = registroDePassos();
const CAPTURAS = join(process.cwd(), ".registro-de-execucao", "pacote-v6-2", "capturas");
const FUNDAMENTO_INTERNO = `Fundamento interno reservado ${SUF}`;
const MENSAGEM_DECISAO = `Seu pedido foi deferido: o lançamento será revisto (${SUF}).`;

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
function cnpj(semente: string): string {
  const base = `${semente}00000000`.slice(0, 8).concat("0001").split("").map(Number);
  const d1 = dv11(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = dv11([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return `${base.join("")}${d1}${d2}`;
}

const CPF_A = cpf(`7${SUF}1`);
const CPF_B = cpf(`8${SUF}2`);
const CPF_REP = cpf(`9${SUF}3`);
const CNPJ_EMPRESA = cnpj(`6${SUF}4`);

async function capturar(page: Page, nome: string): Promise<void> {
  mkdirSync(CAPTURAS, { recursive: true });
  await page.screenshot({ path: join(CAPTURAS, `p3-${nome}.png`), fullPage: true });
}

async function status(page: Page, rota: string): Promise<number> {
  const r = await page.goto(`${N.base}${rota}`, { waitUntil: "networkidle2" });
  return r?.status() ?? 0;
}

async function opcaoQueComeca(page: Page, select: string, inicio: string): Promise<string> {
  return page.$eval(select, (s, ini) => Array.from((s as HTMLSelectElement).options).find((o) => o.text.startsWith(ini))?.value ?? "", inicio);
}

async function idDoSucesso(texto: string, rota: string): Promise<string> {
  const m = new RegExp(`${rota.replace(/\//g, "\\/")}\\/([a-z0-9]+)`).exec(texto);
  if (m === null) throw new Error(`o sucesso não trouxe o endereço ${rota}/<id>: ${texto.slice(0, 200)}`);
  return m[1] ?? "";
}

async function cadastrarPessoa(page: Page, documento: string, nome: string, email: string): Promise<void> {
  await irPara(N, page, "/cadastros/pessoas");
  const r = await preencherEEnviar(page, "cadastrar-pessoa", [
    { sel: 'input[data-mascara="cpf-cnpj"]', valor: documento },
    { sel: 'input[name="nome"]', valor: nome },
    { sel: 'input[name="email"]', valor: email },
  ]);
  R.conferir(`1.p pessoa ${nome} cadastrada pela tela`, r.tipo === "ok", `${r.tipo}: ${r.texto.slice(0, 200)}`);
}

async function vincularConta(page: Page, conta: string, documento: string, nome: string): Promise<void> {
  const rota = `/administracao/usuarios?q=${encodeURIComponent(conta)}`;
  // As ações do usuário moram num <details> fechado: sem abrir, os campos não recebem digitação e o
  // navegador barra o envio pela validação — silêncio que não é do servidor.
  const abrirGerenciar = (): Promise<void> => page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
  await irPara(N, page, rota);
  await abrirGerenciar();
  if ((await page.$(`form[data-acao="desvincular-pessoa"][data-usuario="${conta}"]`)) !== null) {
    await preencherEEnviar(page, `form[data-acao="desvincular-pessoa"][data-usuario="${conta}"]`, [{ sel: 'input[name="motivo"]', valor: `percurso ${SUF}: a conta passa à pessoa desta execução` }]);
    await irPara(N, page, rota);
    await abrirGerenciar();
  }
  const r = await preencherEEnviar(page, `form[data-acao="vincular-pessoa"][data-usuario="${conta}"]`, [
    { sel: 'input[name="documento"]', valor: documento },
    { sel: 'input[name="motivo"]', valor: `percurso ${SUF}: conferido pelo CPF` },
  ]);
  const depois = await irPara(N, page, rota);
  R.conferir(`1.v conta ${conta} vinculada à pessoa pelo CPF`, r.tipo !== "erro" && depois.includes(nome.toLowerCase()), `${r.tipo}: ${r.texto.slice(0, 160)}`);
}

async function criarServico(page: Page, slug: string, titulo: string, tipo: string, publico: string): Promise<string> {
  await irPara(N, page, "/protocolo/servicos");
  const assunto = await opcaoQueComeca(page, 'form[data-acao="criar-servicos-da-carta"] select[name="assuntoId"]', "REQ");
  const r = await preencherEEnviar(page, "criar-servicos-da-carta", [
    { sel: 'input[name="titulo"]', valor: titulo },
    { sel: 'input[name="slug"]', valor: slug },
    { sel: 'input[name="categoria"]', valor: "Atendimento ao público" },
    { sel: 'select[name="publico"]', valor: publico, tipo: "select" },
    { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
    { sel: 'select[name="assuntoId"]', valor: assunto, tipo: "select" },
  ]);
  R.conferir(`2.s serviço ${slug} cadastrado pelo molde, fora da carta`, r.tipo === "ok" && r.texto.includes("FORA DA CARTA"), `${r.tipo}: ${r.texto.slice(0, 200)}`);
  return idDoSucesso(r.texto, "/protocolo/servicos");
}

async function cadastrarVersao(page: Page, servicoId: string, campos: readonly { nome: string; rotulo: string; tipo: string; obrigatorio: boolean }[]): Promise<{ tipo: string; texto: string }> {
  await irPara(N, page, `/protocolo/servicos/${servicoId}`);
  const setor = await opcaoQueComeca(page, 'form[data-acao="nova-versao-do-servico"] select[name="setorDeEntradaId"]', "PROT");
  for (let i = 3; i < campos.length; i += 1) await page.evaluate(() => (Array.from(document.querySelectorAll('form[data-acao="nova-versao-do-servico"] button[type="button"]')).at(-1) as HTMLButtonElement | undefined)?.click());
  return preencherEEnviar(page, "nova-versao-do-servico", [
    { sel: 'textarea[name="descricao"]', valor: `Serviço do percurso ${SUF}: descrição ao público.` },
    { sel: 'textarea[name="requisitos"]', valor: "Ter conta vinculada ao cadastro de pessoa." },
    { sel: 'textarea[name="documentos"]', valor: "Documento de identidade\nComprovante do pedido" },
    { sel: 'input[name="canais"]', valor: "Pela internet, com a sua conta." },
    { sel: 'select[name="setorDeEntradaId"]', valor: setor, tipo: "select" },
    { sel: 'input[name="prazoDias"]', valor: "15" },
    { sel: 'input[name="fundamentoDoPrazo"]', valor: "Lei municipal do processo administrativo, art. 49" },
    ...campos.flatMap((c, i) => [
      { sel: `input[name="campos.${i}.nome"]`, valor: c.nome },
      { sel: `input[name="campos.${i}.rotulo"]`, valor: c.rotulo },
      { sel: `select[name="campos.${i}.tipo"]`, valor: c.tipo, tipo: "select" as const },
      ...(c.obrigatorio ? [{ sel: `input[name="campos.${i}.obrigatorio"]`, valor: "sim", tipo: "marcar" as const }] : []),
    ]),
  ]);
}

async function publicar(page: Page, servicoId: string): Promise<void> {
  await irPara(N, page, `/protocolo/servicos/${servicoId}`);
  const versao = await page.$eval('form[data-acao="publicar-versao"] select[name="versaoId"]', (s) => Array.from((s as HTMLSelectElement).options).map((o) => o.value).find((v) => v !== "") ?? "");
  const r = await preencherEEnviar(page, "publicar-versao", [{ sel: 'select[name="versaoId"]', valor: versao, tipo: "select" }]);
  R.conferir(`2.p versão publicada pela barra (${servicoId})`, r.tipo === "ok" && r.texto.includes("etapa"), `${r.tipo}: ${r.texto.slice(0, 200)}`);
  await irPara(N, page, `/protocolo/servicos/${servicoId}`);
  R.conferir("2.q publicada, 'publicar' sai da barra como ato possível (não há rascunho)", (await page.$('[data-acao-estado="nao-aplicavel"][data-acao-nome="publicar-versao"]')) !== null, "a barra continuou oferecendo publicar");
}

async function main(): Promise<void> {
  let navegador: Browser | undefined;
  const pdf = join(tmpdir(), `p3-comprovante-${SUF}.pdf`);
  const resposta = join(tmpdir(), `p3-resposta-${SUF}.pdf`);
  writeFileSync(pdf, `%PDF-1.4\n% comprovante do percurso ${SUF}\n%%EOF\n`);
  writeFileSync(resposta, `%PDF-1.4\n% resposta do ente ${SUF}\n%%EOF\n`);
  try {
    navegador = await puppeteer.launch({ headless: true, protocolTimeout: 180000, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] });
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await page.setViewport({ width: 1366, height: 900 });
    console.log(`      [sufixo ${SUF} · CPF A ${CPF_A} · CPF B ${CPF_B} · CPF representante ${CPF_REP} · CNPJ ${CNPJ_EMPRESA}]`);

    // ══ 0. sem conta: a carta é pública; o acompanhamento não ══
    R.conferir("0.1 /servicos responde sem sessão", (await status(page, "/servicos")) === 200, "a carta exigiu sessão");
    await page.goto(`${N.base}/meus-servicos`, { waitUntil: "networkidle2" });
    R.conferir("0.2 /meus-servicos sem sessão manda ao login", page.url().includes("/login"), page.url());

    // ══ 1. o administrador cadastra as pessoas e vincula as contas ══
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    R.ok("1.0 administrador entra");
    await cadastrarPessoa(page, CPF_A, `Ana Requerente ${SUF}`, `ana.antiga.${SUF}@exemplo.test`);
    await cadastrarPessoa(page, CPF_B, `Bia Requerente ${SUF}`, `bia.${SUF}@exemplo.test`);
    await cadastrarPessoa(page, CPF_REP, `Caio Representante ${SUF}`, `caio.${SUF}@exemplo.test`);
    await cadastrarPessoa(page, CNPJ_EMPRESA, `Fornecedora ${SUF} Ltda`, `empresa.${SUF}@exemplo.test`);
    await vincularConta(page, A, CPF_A, `Ana Requerente ${SUF}`);
    await vincularConta(page, B, CPF_B, `Bia Requerente ${SUF}`);
    await vincularConta(page, REP, CPF_REP, `Caio Representante ${SUF}`);
    await sair(N, page);

    // ══ 2. o gestor da carta: serviços, versões, publicação e representação ══
    await entrar(N, page, CARTA, SENHA);
    R.ok("2.0 gestor da carta entra");
    const slugReq = `revisao-de-lancamento-${SUF}`;
    const slugCad = `atualizar-contato-${SUF}`;
    const slugComp = `complemento-fornecedor-${SUF}`;
    const slugRasc = `rascunho-${SUF}`;
    const req = await criarServico(page, slugReq, `Revisão de lançamento ${SUF}`, "REQUERIMENTO_ADMINISTRATIVO", "CIDADAO");
    const rv = await cadastrarVersao(page, req, [{ nome: "assunto", rotulo: "Assunto do pedido", tipo: "texto", obrigatorio: true }, { nome: "detalhes", rotulo: "Detalhes", tipo: "textoLongo", obrigatorio: true }]);
    R.conferir("2.1 versão do requerimento cadastrada em RASCUNHO pela ilha", rv.tipo === "ok" && rv.texto.includes("RASCUNHO"), `${rv.tipo}: ${rv.texto.slice(0, 200)}`);
    await publicar(page, req);

    const cad = await criarServico(page, slugCad, `Atualizar contato ${SUF}`, "ATUALIZACAO_CADASTRAL", "CIDADAO");
    const errado = await cadastrarVersao(page, cad, [{ nome: "renda", rotulo: "Renda", tipo: "texto", obrigatorio: true }]);
    R.conferir("2.2 NEGATIVA: atualização cadastral com campo fora do cadastro é recusada nomeando o campo", errado.tipo === "erro" && errado.texto.includes("não é campo do cadastro"), `${errado.tipo}: ${errado.texto.slice(0, 200)}`);
    const cv = await cadastrarVersao(page, cad, [{ nome: "email", rotulo: "Novo e-mail", tipo: "email", obrigatorio: true }]);
    R.conferir("2.3 versão da atualização cadastral só com campo do cadastro", cv.tipo === "ok", `${cv.tipo}: ${cv.texto.slice(0, 200)}`);
    await publicar(page, cad);

    const comp = await criarServico(page, slugComp, `Complemento documental ${SUF}`, "COMPLEMENTO_DE_FORNECEDOR", "FORNECEDOR");
    await cadastrarVersao(page, comp, [{ nome: "documento", rotulo: "Documento complementado", tipo: "texto", obrigatorio: true }]);
    await publicar(page, comp);

    const rasc = await criarServico(page, slugRasc, `Rascunho ${SUF}`, "REQUERIMENTO_ADMINISTRATIVO", "CIDADAO");
    await cadastrarVersao(page, rasc, [{ nome: "pedido", rotulo: "Pedido", tipo: "texto", obrigatorio: true }]);
    await capturar(page, "carta-configuracao");

    await irPara(N, page, "/cadastros/representacoes");
    const rRep = await preencherEEnviar(page, "criar-representacoes", [
      { sel: "representadaId", valor: "", tipo: "referencia", busca: CNPJ_EMPRESA.slice(0, 8) },
      { sel: "representanteUsuario", valor: REP, tipo: "referencia", busca: "representante@" },
      { sel: 'input[name="fundamento"]', valor: `Procuração pública ${SUF}, livro 3, folha 12` },
      { sel: 'input[name="vigenciaInicio"]', valor: "2026-01-01", tipo: "data" },
    ]);
    R.conferir("2.4 representação registrada com seletores referenciados de pessoa e conta", rRep.tipo === "ok", `${rRep.tipo}: ${rRep.texto.slice(0, 200)}`);
    const representacaoId = await idDoSucesso(rRep.texto, "/cadastros/representacoes");
    R.conferir("2.5 o gestor da carta NÃO decide solicitação", (await barrado(N, page, "/meus-servicos")).barrado, "abriu a área do requerente");
    await sair(N, page);

    // ══ 3. o visitante lê a carta ══
    const carta = await irPara(N, page, `/servicos`);
    R.conferir("3.1 a carta pública lista os serviços publicados e não o rascunho", carta.includes(`revisão de lançamento ${SUF}`) && !carta.includes(`rascunho ${SUF}`), carta.slice(0, 300));
    const detalhePublico = await irPara(N, page, `/servicos/${slugReq}`);
    R.conferir("3.2 o serviço público mostra prazo com fundamento e as etapas do roteiro real", detalhePublico.includes("15 dias corridos") && detalhePublico.includes("art. 49") && (await page.$('[data-bloco="etapas"] li')) !== null, detalhePublico.slice(0, 400));
    await capturar(page, "carta-publica-servico");
    R.conferir("3.3 NEGATIVA: serviço só em rascunho responde 404", (await status(page, `/servicos/${slugRasc}`)) === 404, "rascunho apareceu");

    // ══ 4. a cidadã A pede pela tela ══
    await entrar(N, page, A, SENHA);
    R.ok("4.0 cidadã A entra");
    await irPara(N, page, `/meus-servicos/solicitar/${slugReq}`);
    const pA = await preencherEEnviar(page, "protocolar-solicitacao", [
      { sel: 'input[name="resposta.assunto"]', valor: "Revisão do IPTU" },
      { sel: 'textarea[name="resposta.detalhes"]', valor: `Peço a revisão do lançamento (percurso ${SUF}).` },
    ]);
    R.conferir("4.1 solicitação protocolada pela tela, com número", pA.tipo === "ok" && pA.texto.includes("protocolada sob o número"), `${pA.tipo}: ${pA.texto.slice(0, 200)}`);
    const idA = (await page.$eval("[data-protocolada]", (el) => el.getAttribute("data-protocolada"))) ?? "";
    const lista = await irPara(N, page, "/meus-servicos");
    R.conferir("4.2 a lista do requerente mostra o pedido com a situação derivada", (await page.$(`[data-minhas-solicitacoes] a[href="/meus-servicos/${idA}"]`)) !== null && lista.includes("aguardando recebimento"), lista.slice(0, 300));
    await irPara(N, page, `/meus-servicos/solicitar/${slugCad}`);
    const pCad = await preencherEEnviar(page, "protocolar-solicitacao", [{ sel: 'input[name="resposta.email"]', valor: `ana.nova.${SUF}@exemplo.test` }]);
    const idCad = (await page.$eval("[data-protocolada]", (el) => el.getAttribute("data-protocolada")).catch(() => "")) ?? "";
    R.conferir("4.3 atualização cadastral protocolada (o cadastro não muda no envio)", pCad.tipo === "ok" && idCad !== "", `${pCad.tipo}: ${pCad.texto.slice(0, 200)}`);
    const semRep = await irPara(N, page, `/meus-servicos/solicitar/${slugComp}`);
    R.conferir("4.4 complemento de fornecedor sem representação: a tela diz por quê, sem formulário", semRep.includes("não tem representação vigente") && (await page.$('form[data-acao="protocolar-solicitacao"]')) === null, semRep.slice(0, 300));
    R.conferir("4.5 NEGATIVA: a requerente não abre a mesa", (await barrado(N, page, "/protocolo/solicitacoes")).barrado, "abriu a mesa");
    R.conferir("4.6 NEGATIVA: a requerente não abre a configuração da carta", (await barrado(N, page, "/protocolo/servicos")).barrado, "abriu a configuração");
    await sair(N, page);

    // ══ 5. a cidadã B não alcança o pedido de A ══
    await entrar(N, page, B, SENHA);
    R.conferir("5.1 NEGATIVA: B pedindo a URL do pedido de A recebe 404", (await status(page, `/meus-servicos/${idA}`)) === 404, "B abriu o pedido de A");
    const listaB = await irPara(N, page, "/meus-servicos");
    R.conferir("5.2 a lista de B não tem o pedido de A", !listaB.includes("revisão de lançamento"), listaB.slice(0, 300));
    await sair(N, page);

    // ══ 6. a mesa: exigência e a barra travada ══
    await entrar(N, page, MESA, SENHA);
    R.ok("6.0 mesa entra");
    await irPara(N, page, "/protocolo/solicitacoes");
    R.conferir("6.1 a mesa conta as solicitações por situação", (await page.$('[data-contagem="RECEBIDA"]')) !== null, "sem contagem");
    await irPara(N, page, `/protocolo/solicitacoes/${idA}`);
    R.conferir("6.2 decidir está disponível antes da exigência", (await page.$('form[data-acao="decidir"]')) !== null, "decidir não apareceu");
    const ex = await preencherEEnviar(page, "emitir-exigencia", [{ sel: 'textarea[name="mensagemAoRequerente"]', valor: `Envie o comprovante do lançamento (percurso ${SUF}).` }]);
    R.conferir("6.3 exigência emitida pela barra", ex.tipo === "ok", `${ex.tipo}: ${ex.texto.slice(0, 200)}`);
    await irPara(N, page, `/protocolo/solicitacoes/${idA}`);
    const travada = await page.$eval('[data-acao="decidir"][data-acao-estado="bloqueada"]', (el) => el.textContent ?? "").catch(() => "");
    R.conferir("6.4 com exigência pendente, DECIDIR aparece travado com o motivo", travada.includes("exigência sem resposta"), travada.slice(0, 200));
    await capturar(page, "mesa-exigencia-pendente");
    await sair(N, page);

    // ══ 7. A envia documento e responde ══
    await entrar(N, page, A, SENHA);
    const comExig = await irPara(N, page, `/meus-servicos/${idA}`);
    R.conferir("7.1 A vê a exigência e a situação 'aguardando você'", (await page.$('[data-exigencia="pendente"]')) !== null && comExig.includes("aguardando você"), comExig.slice(0, 300));
    const doc = await preencherEEnviar(page, "enviar-documento", [{ sel: 'input[name="arquivo"]', valor: pdf, tipo: "arquivo" }]);
    R.conferir("7.2 A envia o documento pela tela", doc.tipo === "ok", `${doc.tipo}: ${doc.texto.slice(0, 200)}`);
    const resp = await preencherEEnviar(page, "responder-exigencia", [{ sel: 'textarea[name="texto"]', valor: "Comprovante enviado." }]);
    R.conferir("7.3 A responde a exigência", resp.tipo === "ok", `${resp.tipo}: ${resp.texto.slice(0, 200)}`);
    await sair(N, page);

    // ══ 8. a mesa libera resposta e decide; defere a atualização cadastral ══
    await entrar(N, page, MESA, SENHA);
    await irPara(N, page, `/protocolo/solicitacoes/${idA}`);
    const lib = await preencherEEnviar(page, "liberar-resposta", [{ sel: 'input[name="arquivo"]', valor: resposta, tipo: "arquivo" }]);
    R.conferir("8.1 a mesa libera o documento de resposta", lib.tipo === "ok", `${lib.tipo}: ${lib.texto.slice(0, 200)}`);
    await irPara(N, page, `/protocolo/solicitacoes/${idA}`);
    const dec = await preencherEEnviar(page, "decidir", [
      { sel: 'select[name="resultado"]', valor: "DEFERIDA", tipo: "select" },
      { sel: 'textarea[name="mensagemAoRequerente"]', valor: MENSAGEM_DECISAO },
      { sel: 'textarea[name="fundamentoInterno"]', valor: FUNDAMENTO_INTERNO },
    ]);
    R.conferir("8.2 a mesa decide pela barra", dec.tipo === "ok" && dec.texto.includes("DEFERIDA"), `${dec.tipo}: ${dec.texto.slice(0, 200)}`);
    const decidida = await irPara(N, page, `/protocolo/solicitacoes/${idA}`);
    R.conferir("8.3 decidida, 'decidir' sai da barra e a mesa vê o fundamento interno", (await page.$('[data-acao-estado="nao-aplicavel"][data-acao-nome="decidir"]')) !== null && decidida.includes(FUNDAMENTO_INTERNO.toLowerCase()), decidida.slice(0, 300));
    await irPara(N, page, `/protocolo/solicitacoes/${idCad}`);
    const decCad = await preencherEEnviar(page, "decidir", [
      { sel: 'select[name="resultado"]', valor: "DEFERIDA", tipo: "select" },
      { sel: 'textarea[name="mensagemAoRequerente"]', valor: "Seu contato foi atualizado no cadastro." },
      { sel: 'textarea[name="fundamentoInterno"]', valor: "Titular autenticada pela conta vinculada." },
    ]);
    R.conferir("8.4 deferida a atualização cadastral, o cadastro ganha a versão proposta", decCad.tipo === "ok" && decCad.texto.includes("versão nova"), `${decCad.tipo}: ${decCad.texto.slice(0, 200)}`);
    await irPara(N, page, `/cadastros/pessoas?busca=${CPF_A}`);
    const hrefPessoa = await page.evaluate(() => (Array.from(document.querySelectorAll('a[href^="/cadastros/pessoas/"]')).at(0) as HTMLAnchorElement | undefined)?.getAttribute("href") ?? "");
    const pessoaA = hrefPessoa === "" ? "" : await irPara(N, page, hrefPessoa);
    R.conferir("8.5 o histórico da pessoa mostra a versão criada pela decisão, com o motivo", pessoaA.includes("atualização cadastral deferida na solicitação"), pessoaA.slice(0, 400));
    await sair(N, page);

    // ══ 9. A lê a decisão, sem o fundamento, e baixa a resposta ══
    await entrar(N, page, A, SENHA);
    const final = await irPara(N, page, `/meus-servicos/${idA}`);
    R.conferir("9.1 A vê DEFERIDA com a mensagem ao requerente", (await page.$('[data-decisao="DEFERIDA"]')) !== null && final.includes(MENSAGEM_DECISAO.toLowerCase()), final.slice(0, 400));
    R.conferir("9.2 NEGATIVA: o fundamento interno NÃO chega ao requerente", !final.includes(FUNDAMENTO_INTERNO.toLowerCase()), "o fundamento interno apareceu");
    await capturar(page, "requerente-decisao");
    const docs = await page.$$eval("[data-documentos] a", (as) => as.map((a) => ({ href: a.getAttribute("href") ?? "", nome: a.textContent ?? "" })));
    const hrefResposta = docs.find((d) => d.nome.includes("p3-resposta"))?.href ?? "";
    const baixa = await buscarJson(page, `${N.base}${hrefResposta}`);
    R.conferir("9.3 A baixa o documento de resposta liberado (e o que ela enviou está listado)", hrefResposta !== "" && baixa.status === 200 && docs.some((d) => d.nome.includes("p3-comprovante")), JSON.stringify(docs));
    const anexoId = hrefResposta.split("/").at(-1) ?? "";
    R.conferir("9.4 NEGATIVA: A não baixa pelo caminho interno de anexos do processo", (await buscarJson(page, `${N.base}/documentos/anexos/${anexoId}`)).status === 404, "a rota interna entregou ao requerente");
    await sair(N, page);
    await entrar(N, page, B, SENHA);
    R.conferir("9.5 NEGATIVA: B com a URL exata do documento de A recebe 404", (await buscarJson(page, `${N.base}${hrefResposta}`)).status === 404, "B baixou o documento de A");
    await sair(N, page);

    // ══ 10. o representante pede pela empresa; revogada a representação, perde o acesso ══
    await entrar(N, page, REP, SENHA);
    await irPara(N, page, `/meus-servicos/solicitar/${slugComp}`);
    const pRep = await preencherEEnviar(page, "protocolar-solicitacao", [{ sel: 'input[name="resposta.documento"]', valor: "Certidão negativa atualizada" }]);
    R.conferir("10.1 o representante protocola o complemento em nome da empresa", pRep.tipo === "ok" && pRep.texto.includes(`Fornecedora ${SUF} Ltda`) && pRep.texto.includes("por representação"), `${pRep.tipo}: ${pRep.texto.slice(0, 200)}`);
    const idRep = (await page.$eval("[data-protocolada]", (el) => el.getAttribute("data-protocolada")).catch(() => "")) ?? "";
    await sair(N, page);
    await entrar(N, page, CARTA, SENHA);
    await irPara(N, page, `/cadastros/representacoes/${representacaoId}`);
    const rev = await preencherEEnviar(page, "revogar", [
      { sel: 'input[name="dataEfeito"]', valor: diaCivil(new Date()), tipo: "data" },
      { sel: 'input[name="motivo"]', valor: `A empresa revogou a procuração (percurso ${SUF})` },
    ]);
    R.conferir("10.2 a representação é revogada com efeito hoje", rev.tipo === "ok", `${rev.tipo}: ${rev.texto.slice(0, 200)}`);
    await sair(N, page);
    await entrar(N, page, REP, SENHA);
    const listaRep = await irPara(N, page, "/meus-servicos");
    R.conferir("10.3 revogada, a solicitação da empresa sai da lista do ex-representante", !listaRep.includes(`complemento documental ${SUF}`), listaRep.slice(0, 300));
    R.conferir("10.4 NEGATIVA: o detalhe da solicitação da empresa responde 404", (await status(page, `/meus-servicos/${idRep}`)) === 404, "o ex-representante abriu o pedido");
    const semVigente = await irPara(N, page, `/meus-servicos/solicitar/${slugComp}`);
    R.conferir("10.5 e o formulário de complemento diz que não há representação vigente", semVigente.includes("não tem representação vigente"), semVigente.slice(0, 200));
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

void texto;
void main();
