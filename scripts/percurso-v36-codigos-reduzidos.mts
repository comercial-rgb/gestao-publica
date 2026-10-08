import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { anoCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DOS CÓDIGOS REDUZIDOS DA DESPESA DO PPA (TR 5.9.1.8):
 *   parte de uma ficha do exercício (a dotação que a execução usa); sem o programa dela no plano, o percurso o inclui pelas
 *   telas do PPA (eixo e área temática, se faltarem); o administrador roda o gerador pela tela; inclui DUAS ações no
 *   programa pela tela do programa (N=2) — a segunda com a classificação da ficha — e cada uma nasce com o próximo
 *   código; a busca pelo número traz só aquela; no empenho, a busca da dotação por "reduzido N" acha a ficha; quem só
 *   consulta o planejamento lê os códigos sem o gerador.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-codigos-reduzidos.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const marca = String(Date.now()).slice(-5);

const plano = await prisma.planoPlurianual.findFirst({ orderBy: { anoInicio: "desc" }, select: { id: true, anoInicio: true, anoFim: true } });
if (plano === null) throw new Error("a base não tem PPA");
const exercicio = Math.min(Math.max(anoCivil(new Date()), plano.anoInicio), plano.anoFim);
const TELA = `/planejamento/ppa/codigos-reduzidos?plano=${plano.id}`;

// A ficha: do exercício, cuja ação ainda não está no programa dela neste plano, e com outra ação do cadastro livre
// no mesmo programa (as duas ações novas do N=2).
const fichas = await prisma.fichaOrcamentaria.findMany({ where: { exercicio }, orderBy: { numero: "asc" }, select: { id: true, numero: true, unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true } });
const acoesDoCadastro = await prisma.acao.findMany({ orderBy: { codigo: "asc" }, select: { id: true } });
let ficha: (typeof fichas)[number] | undefined;
let outraAcao = "";
for (const f of fichas) {
  const noPlano = await prisma.acaoPpa.findMany({ where: { programaPpa: { planoId: plano.id, programaId: f.programaId } }, select: { acaoId: true } });
  if (noPlano.some((a) => a.acaoId === f.acaoId)) continue;
  const livre = acoesDoCadastro.find((a) => a.id !== f.acaoId && !noPlano.some((x) => x.acaoId === a.id));
  if (livre === undefined) continue;
  ficha = f;
  outraAcao = livre.id;
  break;
}
if (ficha === undefined) throw new Error(`a base não tem ficha de ${String(exercicio)} cuja ação ainda esteja fora do programa no PPA`);
const F = ficha;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 0. o programa da ficha no plano, pelas telas do PPA ──
  let programaPpa = await prisma.programaPpa.findFirst({ where: { planoId: plano.id, programaId: F.programaId }, select: { id: true } });
  if (programaPpa === null) {
    let area = await prisma.areaTematica.findFirst({ orderBy: { codigo: "asc" }, select: { id: true } });
    if (area === null) {
      await irPara(n, page, "/planejamento/ppa/estrutura");
      await preencherEEnviar(page, "criar-estrutura-do-ppa", [
        { sel: 'select[name="tipo"]', valor: "EIXO", tipo: "select" },
        { sel: 'input[name="codigo"]', valor: `E${marca}` },
        { sel: 'input[name="descricao"]', valor: `Eixo do percurso ${marca}` },
      ]);
      const eixo = await prisma.eixoEstruturante.findUnique({ where: { codigo: `E${marca}` }, select: { id: true } });
      await irPara(n, page, "/planejamento/ppa/estrutura");
      await preencherEEnviar(page, "criar-estrutura-do-ppa", [
        { sel: 'select[name="tipo"]', valor: "AREA", tipo: "select" },
        { sel: 'input[name="codigo"]', valor: `A${marca}` },
        { sel: 'input[name="descricao"]', valor: `Área temática do percurso ${marca}` },
        { sel: 'select[name="eixoId"]', valor: eixo?.id ?? "", tipo: "select" },
      ]);
      area = await prisma.areaTematica.findUnique({ where: { codigo: `A${marca}` }, select: { id: true } });
    }
    await irPara(n, page, `/planejamento/ppa/${plano.id}`);
    const rProg = await preencherEEnviar(page, "programa-no-plano", [
      { sel: 'select[name="programaId"]', valor: F.programaId, tipo: "select" },
      { sel: 'select[name="areaTematicaId"]', valor: area?.id ?? "", tipo: "select" },
      { sel: 'textarea[name="estrategia"]', valor: "Programa do percurso dos códigos reduzidos." },
      { sel: 'input[data-mascara="valor"]', valor: "100000,00" },
    ]);
    programaPpa = await prisma.programaPpa.findFirst({ where: { planoId: plano.id, programaId: F.programaId }, select: { id: true } });
    conferir(rProg.tipo === "ok" && programaPpa !== null, `o programa da ficha ${String(F.numero)} foi incluído no plano pelas telas do PPA (${rProg.texto.slice(0, 60)})`);
  }
  if (programaPpa === null) throw new Error("sem o programa da ficha no plano, o percurso não segue");

  // ── 1. o gerador, para as ações que já existiam ──
  const antes = await prisma.codigoReduzidoDaDespesaPpa.count({ where: { planoId: plano.id } });
  await irPara(n, page, TELA);
  const r1 = await preencherEEnviar(page, "gerar-codigos-reduzidos", []);
  const depois = await prisma.codigoReduzidoDaDespesaPpa.count({ where: { planoId: plano.id } });
  const classificadas = await prisma.acaoPpa.count({ where: { programaPpa: { planoId: plano.id }, unidadeExecutoraId: { not: null }, funcaoId: { not: null }, subfuncaoId: { not: null } } });
  conferir(r1.tipo === "ok" && depois === classificadas, `gerador pela tela: ${String(antes)} → ${String(depois)} código(s) para ${String(classificadas)} ação(ões) classificada(s) (${r1.texto.replace(/\s+/g, " ").slice(0, 90)})`);

  // ── 2. duas ações novas, cada uma com o próximo código; a segunda com a classificação da ficha ──
  const maior = (await prisma.codigoReduzidoDaDespesaPpa.aggregate({ where: { planoId: plano.id }, _max: { numero: true } }))._max.numero ?? 0;
  const numeros: (number | null)[] = [];
  const respostas: string[] = [];
  for (const acaoId of [outraAcao, F.acaoId]) {
    await irPara(n, page, `/planejamento/ppa/programas/${programaPpa.id}`);
    const r = await preencherEEnviar(page, "acao-do-plano", [
      { sel: 'select[name="acaoId"]', valor: acaoId, tipo: "select" },
      { sel: 'select[name="unidadeExecutoraId"]', valor: F.unidadeOrcId, tipo: "select" },
      { sel: 'select[name="funcaoId"]', valor: F.funcaoId, tipo: "select" },
      { sel: 'select[name="subfuncaoId"]', valor: F.subfuncaoId, tipo: "select" },
      { sel: 'input[name="produto"]', valor: `Ação do percurso dos códigos reduzidos ${marca}` },
      { sel: 'input[name="unidadeMedida"]', valor: "un" },
      { sel: 'input[name="metaFisica"]', valor: "1" },
      { sel: 'input[data-mascara="valor"]', valor: "1000,00" },
    ]);
    respostas.push(`${r.tipo}: ${r.texto.slice(0, 40)}`);
    const c = await prisma.codigoReduzidoDaDespesaPpa.findFirst({ where: { planoId: plano.id, unidadeExecutoraId: F.unidadeOrcId, funcaoId: F.funcaoId, subfuncaoId: F.subfuncaoId, programaId: F.programaId, acaoId }, select: { numero: true } });
    numeros.push(c?.numero ?? null);
  }
  conferir(numeros[0] === maior + 1 && numeros[1] === maior + 2, `as duas ações incluídas pela tela nascem com os códigos ${numeros.join(" e ")} (o maior era ${String(maior)}) (${respostas.join(" | ")})`);
  const daFicha = numeros[1] ?? 0;

  // ── 3. a busca pelo número ──
  await irPara(n, page, `${TELA}&busca=${String(daFicha)}`);
  const linhas = await page.$$eval("tr[data-codigo-reduzido]", (ls) => ls.map((l) => (l as HTMLElement).getAttribute("data-codigo-reduzido")));
  conferir(linhas.length === 1 && linhas[0] === String(daFicha), `a busca pelo número traz só o código ${String(daFicha)} (linhas: ${linhas.slice(0, 5).join(", ")})`);

  // ── 4. na execução: a busca da dotação do empenho pelo código reduzido acha a ficha ──
  await irPara(n, page, `/despesa/empenhos?exercicio=${String(exercicio)}`);
  await page.waitForSelector("[data-busca-da-ficha]");
  await page.type("[data-busca-da-ficha]", `reduzido ${String(daFicha)}`);
  await new Promise((r) => setTimeout(r, 400));
  const opcoes = await page.$$eval('form[data-acao="empenhar"] select[name="fichaId"] option', (os) => os.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== ""));
  conferir(opcoes.includes(F.id), `no empenho, "reduzido ${String(daFicha)}" acha a ficha ${String(F.numero)} (${String(opcoes.length)} ficha(s) na lista)`);

  // ── 5. quem só consulta o planejamento ──
  const leitor = await prisma.usuario.findFirst({
    where: {
      identificador: { endsWith: "@ficticio.local" },
      vinculos: { some: { perfil: { permissoes: { some: { acao: "CONSULTAR_PLANEJAMENTO" as never } } } } },
      NOT: { vinculos: { some: { perfil: { permissoes: { some: { acao: "CADASTRAR_PROGRAMA_PPA" as never } } } } } },
    },
    select: { identificador: true },
  });
  if (leitor === null) {
    console.log("NAO EXECUTADO quem só consulta: a base fictícia não tem usuário com consulta do planejamento sem o cadastro do PPA");
  } else {
    const outra = await (await nav.createBrowserContext()).newPage();
    outra.setDefaultTimeout(120000);
    await entrar(n, outra, leitor.identificador, "Ficticio#2026");
    await outra.goto(`${n.base}${TELA}`, { waitUntil: "domcontentloaded" });
    await outra.waitForSelector("[data-tabela-codigos-reduzidos]");
    conferir((await outra.$('form[data-acao="gerar-codigos-reduzidos"]')) === null, `${leitor.identificador} lê os códigos sem o gerador (a recusa no servidor está no teste do domínio)`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso dos códigos reduzidos completo.");
