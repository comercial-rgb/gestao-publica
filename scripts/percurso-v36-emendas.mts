import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { detalharPropostaOrcamentaria, elaborarPropostaOrcamentaria } from "../modules/m02-planejamento/proposta-orcamentaria.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO: EMENDAS AO PROJETO DA LOA (/planejamento/emendas).
 *   1. uma proposta 2027 de demonstração, criada pelo serviço a cada corrida (a base fictícia não tinha nenhuma);
 *   2. a ficha bloqueada pela tela não aceita emenda — recusa nomeando a ficha, nada gravado;
 *   3. a emenda com acréscimo numa ficha e redução em outra é registrada e NÃO muda a proposta;
 *   4. a sanção parcial leva só o item escolhido à proposta (conferido pelo leitor da proposta) e a emenda fica
 *      "sancionada em parte";
 *   5. o contador, que só consulta o planejamento, vê a tela sem os atos; o atestador vai para /sem-acesso.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-emendas.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const ADMIN = "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const senhaFicticia = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const marca = new Date().toISOString().slice(0, 16);
const proposta = await elaborarPropostaOrcamentaria(prisma, {
  exercicio: 2027, exercicioDeOrigem: 2026, descricao: `Projeto 2027 de demonstração (${marca})`, baseDaReceita: "SEM_VALOR", percentualDaReceita: "0",
  baseDaDespesa: "DOTACAO_INICIAL", percentualDaDespesa: "0", aproveitaReceitas: false, aproveitaFichas: true, reajustaProjetos: false,
  incluiFichasAbertasPorCredito: false, criadoPor: ADMIN,
});
const vigentes = async (): Promise<Map<number, string>> => new Map((await detalharPropostaOrcamentaria(prisma, proposta.id))!.despesas.map((l) => [l.numero, l.valorVigente]));
const antes = await vigentes();
// Três fichas com valor para a redução: A recebe, C perde, B é bloqueada.
const [A, B, C] = [...antes.entries()].filter(([, v]) => Number(v) >= 2000).map(([k]) => k).sort((x, y) => x - y).slice(0, 3) as [number, number, number];
const url = `/planejamento/emendas?proposta=${proposta.id}`;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, ADMIN, senha);
  await irPara(n, page, url);

  const bl = await preencherEEnviar(page, "bloquear-dotacao", [
    { sel: 'input[name="ficha"]', valor: String(B) },
    { sel: 'input[name="motivo"]', valor: "Dotação de pessoal: fora das emendas" },
  ]);
  const recusada = await preencherEEnviar(page, "cadastrar-emenda", [
    { sel: 'input[name="data"]', valor: "20/11/2026" },
    { sel: 'input[name="vereador"]', valor: "Vereadora fictícia" },
    { sel: 'input[name="objetivo"]', valor: "Reforço da atenção básica" },
    { sel: 'textarea[name="justificativa"]', valor: "Demanda das audiências públicas" },
    { sel: 'textarea[name="textoJuridico"]', valor: "Acrescenta e reduz dotações do projeto" },
    { sel: 'textarea[name="itens"]', valor: `${String(A)}; 1.000,00\n${String(B)}; -1.000,00` },
  ]);
  conferir(
    /bloqueada para emendas/.test(bl.texto) && new RegExp(`ficha ${String(B)} está bloqueada para emendas[\\s\\S]*Nada foi gravado`).test(recusada.texto) &&
      (await prisma.emendaAoOrcamento.count({ where: { propostaOrcamentariaId: proposta.id } })) === 0,
    `ficha ${String(B)} bloqueada; emenda nela recusada com o motivo: "${recusada.texto.slice(0, 110)}"`
  );

  await irPara(n, page, url);
  const reg = await preencherEEnviar(page, "cadastrar-emenda", [
    { sel: 'input[name="data"]', valor: "20/11/2026" },
    { sel: 'input[name="vereador"]', valor: "Vereadora fictícia" },
    { sel: 'input[name="objetivo"]', valor: "Reforço da atenção básica" },
    { sel: 'textarea[name="justificativa"]', valor: "Demanda das audiências públicas" },
    { sel: 'textarea[name="textoJuridico"]', valor: "Acrescenta e reduz dotações do projeto" },
    { sel: 'textarea[name="itens"]', valor: `${String(A)}; 1.000,00\n${String(C)}; -1.000,00` },
  ]);
  const depoisDoRegistro = await vigentes();
  conferir(
    /Emenda nº 1 registrada, aguardando sanção/.test(reg.texto) && depoisDoRegistro.get(A) === antes.get(A) && depoisDoRegistro.get(C) === antes.get(C),
    `emenda registrada e a proposta não mudou (ficha ${String(A)} ${String(depoisDoRegistro.get(A))}, ficha ${String(C)} ${String(depoisDoRegistro.get(C))})`
  );

  await irPara(n, page, url);
  const emenda = await prisma.emendaAoOrcamento.findFirstOrThrow({ where: { propostaOrcamentariaId: proposta.id }, select: { id: true, itens: { select: { id: true, linhaDeDespesa: { select: { fichaDeOrigem: { select: { numero: true } } } } } } } });
  const itemA = emenda.itens.find((i) => i.linhaDeDespesa.fichaDeOrigem.numero === A)!.id;
  const form = `form[data-acao="sancionar-emenda"][data-emenda="${emenda.id}"]`;
  await page.click(`${form} input[name="resultado"][value="PARCIAL"]`);
  await page.waitForSelector(`${form} input[name="itemAprovado"][value="${itemA}"]`);
  await page.click(`${form} input[name="itemAprovado"][value="${itemA}"]`);
  const san = await preencherEEnviar(
    page,
    form,
    [
      { sel: 'input[name="data"]', valor: "15/12/2026" },
      { sel: 'input[name="ato"]', valor: "Lei fictícia nº 999/2026, veto ao item de redução" },
    ],
    "sancionar-emenda-1"
  );
  const depoisDaSancao = await vigentes();
  await irPara(n, page, url);
  const selo = await page.$eval("[data-emenda='1']", (a) => a.textContent ?? "");
  conferir(
    /1 dotação\(ões\) levada\(s\) à proposta/.test(san.texto) &&
      Number(depoisDaSancao.get(A)) === Number(antes.get(A)) + 1000 && depoisDaSancao.get(C) === antes.get(C) && /sancionada em parte/.test(selo),
    `sanção parcial: ficha ${String(A)} ${String(antes.get(A))} → ${String(depoisDaSancao.get(A))}, ficha ${String(C)} inalterada; "${san.texto.slice(0, 80)}"`
  );

  const contador = await (await nav.createBrowserContext()).newPage();
  contador.setDefaultTimeout(120000);
  await entrar(n, contador, "contador@ficticio.local", senhaFicticia);
  await contador.goto(`${n.base}${url}`, { waitUntil: "domcontentloaded" });
  await contador.waitForSelector("[data-proposta-escolhida]");
  const atos = await contador.$$eval("form[data-acao]", (fs) => fs.map((f) => f.getAttribute("data-acao")));
  const atestador = await (await nav.createBrowserContext()).newPage();
  atestador.setDefaultTimeout(120000);
  await entrar(n, atestador, "atestador@ficticio.local", senhaFicticia);
  await atestador.goto(`${n.base}${url}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(atestador.url());
  conferir(
    !atos.some((a) => a === "cadastrar-emenda" || a === "sancionar-emenda" || a === "bloquear-dotacao") && destino.pathname === "/sem-acesso" && destino.searchParams.get("acao") === "CONSULTAR_PLANEJAMENTO",
    `contador vê sem os atos (formulários: ${atos.join(",") || "nenhum"}); atestador em ${destino.pathname}?acao=${destino.searchParams.get("acao") ?? ""}`
  );
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das emendas completo.");
