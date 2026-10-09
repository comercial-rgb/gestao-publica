import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { vinculoPpaLoa } from "../modules/m02b-plurianual/vinculo-ppa-loa.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V37 — PERCURSO DAS PENDÊNCIAS FINAIS, na base fictícia:
 *   1. desfazer a lotação no detalhe do setor (e lotar de novo, para deixar a base como estava);
 *   2. o roteiro do almoxarifado: sem a marcação, a troca é recusada; com ela, vira versão nova e a lista mostra as
 *      contas novas (se o ajuste por sobra não tiver roteiro, ele é cadastrado antes, com contas escolhidas pela busca);
 *   3. o Anexo 1 do RREO: "empenhadas até" e "liquidadas até" abrem os documentos, e o total da lista é o valor clicado;
 *   4. as ações do PPA na LOA: as duas tabelas têm as linhas que o leitor do vínculo devolve.
 * Pré-requisito: o setor SEC-ADM com alguém lotado (percurso da lotação no setor).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v37-pendencias-finais.mts
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
const texto = (page: import("puppeteer").Page): Promise<string> => page.$eval("main", (m) => (m.textContent ?? "").replace(/ /g, " "));

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  // ── 1. desfazer a lotação ──
  const setor = await prisma.setor.findUnique({ where: { codigo: "SEC-ADM" }, select: { id: true } });
  let lotado = setor === null ? null : await prisma.usuarioDoSetor.findFirst({ where: { setorId: setor.id }, orderBy: { usuarioIdent: "asc" }, select: { usuarioIdent: true } });
  if (setor !== null && lotado === null) {
    // Ninguém lotado: lota um usuário ativo pela tela, para ter o que desfazer.
    const u = await prisma.usuario.findFirst({ where: { ativo: true }, orderBy: { identificador: "asc" }, select: { identificador: true } });
    if (u !== null) {
      await irPara(n, page, `/protocolo/setores/${setor.id}`);
      await preencherEEnviar(page, "lotar", [{ sel: "usuarioIdent", valor: u.identificador, busca: u.identificador, tipo: "referencia" }]);
      lotado = await prisma.usuarioDoSetor.findFirst({ where: { setorId: setor.id }, select: { usuarioIdent: true } });
    }
  }
  if (setor === null || lotado === null) {
    console.log("NAO EXECUTADO 1: sem o setor SEC-ADM (rode o percurso do almoxarifado pela busca)");
  } else {
    const ident = lotado.usuarioIdent;
    await irPara(n, page, `/protocolo/setores/${setor.id}`);
    const r = await preencherEEnviar(page, "desfazer-lotacao", [{ sel: "usuarioIdent", valor: ident, busca: ident, tipo: "referencia" }]);
    const resta = await prisma.usuarioDoSetor.count({ where: { setorId: setor.id, usuarioIdent: ident } });
    await irPara(n, page, `/protocolo/setores/${setor.id}`);
    // Só o dado "Usuários lotados": o cabeçalho da página mostra quem está logado, que pode ser o próprio lotado.
    await page.waitForSelector("dl dt", { timeout: 60000 });
    const lotadosNaTela = await page.$$eval("dt", (dts) => dts.find((d) => (d.textContent ?? "").trim() === "Usuários lotados")?.nextElementSibling?.textContent ?? "(sem o dado)");
    conferir(r.tipo === "ok" && resta === 0 && !lotadosNaTela.includes(ident) && lotadosNaTela !== "(sem o dado)", `lotação de ${ident} desfeita pela busca dos lotados, e o detalhe não o lista mais (${r.texto.slice(0, 40)}; lotados na tela: "${lotadosNaTela.slice(0, 60)}")`);
    const rl = await preencherEEnviar(page, "lotar", [{ sel: "usuarioIdent", valor: ident, busca: ident, tipo: "referencia" }]);
    conferir(rl.tipo === "ok" && (await prisma.usuarioDoSetor.count({ where: { setorId: setor.id, usuarioIdent: ident } })) === 1, `lotado de novo (${rl.texto.slice(0, 40)})`);
  }

  // ── 2. o roteiro do almoxarifado: troca só com a marcação ──
  const ROT = "/patrimonio/almoxarifado/roteiros";
  const FORM = "criar-roteiros-do-almoxarifado";
  const contas = async (prefixo: string) => prisma.contaPcasp.findMany({ where: { analitica: true, codigo: { startsWith: prefixo } }, orderBy: { codigo: "asc" }, take: 2, select: { id: true, codigo: true } });
  const [estoques, vpas] = [await contas("1.1.5"), await contas("4.")];
  const vigente = async () =>
    (await prisma.versaoDeRoteiro.findFirst({ where: { familia: "ALMOXARIFADO", chave: "AJUSTE_ENTRADA", situacao: "PUBLICADA" }, orderBy: [{ publicadaEm: "desc" }, { numero: "desc" }], select: { contaDebitoId: true, contaCreditoId: true } }))
    ?? (await prisma.roteiroAlmoxarifado.findUnique({ where: { tipo: "AJUSTE_ENTRADA" }, select: { contaDebitoId: true, contaCreditoId: true } }));
  if (estoques.length < 2 || vpas.length < 1) {
    console.log("NAO EXECUTADO 2: a base não tem duas contas analíticas 1.1.5 e uma 4. para o roteiro");
  } else {
    const enviar = (debito: string, credito: string, buscaD: string, buscaC: string, trocar: boolean) =>
      (async () => {
        await irPara(n, page, ROT);
        return preencherEEnviar(page, FORM, [
          { sel: 'select[name="tipo"]', valor: "AJUSTE_ENTRADA", tipo: "select" },
          { sel: "contaDebitoId", valor: debito, busca: buscaD, tipo: "referencia" },
          { sel: "contaCreditoId", valor: credito, busca: buscaC, tipo: "referencia" },
          ...(trocar ? [{ sel: '[name="substituir"]', valor: "sim", tipo: "marcar" as const }] : []),
        ]);
      })();
    let atual = await vigente();
    if (atual === null) {
      const rc = await enviar(estoques[0]!.id, vpas[0]!.id, estoques[0]!.codigo, vpas[0]!.codigo, false);
      atual = await vigente();
      conferir(rc.tipo === "ok" && atual?.contaDebitoId === estoques[0]!.id, `roteiro do ajuste por sobra cadastrado pela tela (${rc.texto.slice(0, 50)})`);
    }
    if (atual !== null) {
      const outra = estoques.find((c) => c.id !== atual!.contaDebitoId) ?? estoques[0]!;
      const versoesAntes = await prisma.versaoDeRoteiro.count({ where: { familia: "ALMOXARIFADO", chave: "AJUSTE_ENTRADA" } });
      const credito = await prisma.contaPcasp.findUniqueOrThrow({ where: { id: atual.contaCreditoId }, select: { codigo: true } });
      const sem = await enviar(outra.id, atual.contaCreditoId, outra.codigo, credito.codigo, false);
      conferir(sem.tipo === "erro" && /Trocar as contas de um roteiro já cadastrado/.test(sem.texto) && (await prisma.versaoDeRoteiro.count({ where: { familia: "ALMOXARIFADO", chave: "AJUSTE_ENTRADA" } })) === versoesAntes, `sem a marcação, a troca é recusada dizendo como trocar, e nada se grava (${sem.texto.slice(0, 70)})`);
      const com = await enviar(outra.id, atual.contaCreditoId, outra.codigo, credito.codigo, true);
      const depois = await vigente();
      await irPara(n, page, ROT);
      const tela = await texto(page);
      conferir(com.tipo === "ok" && depois?.contaDebitoId === outra.id && tela.includes(outra.codigo), `com a marcação, as contas trocam por versão nova e a lista mostra ${outra.codigo} (${com.texto.slice(0, 60)})`);
    }
  }

  // ── 3. o Anexo 1 até os documentos da despesa ──
  for (const estagio of ["empenhada", "liquidada"]) {
    await irPara(n, page, "/relatorios/rreo/anexo1?exercicio=2026&bimestre=5");
    const alvo = await page.$$eval(`a[data-elo="documentos-${estagio}"]`, (as) => {
      const comValor = as.map((a) => ({ href: a.getAttribute("href") ?? "", valor: (a.textContent ?? "").trim() })).filter((x) => /[1-9]/.test(x.valor));
      return comValor.length === 0 ? null : comValor[comValor.length - 1];
    });
    if (alvo === null) {
      console.log(`NAO EXECUTADO 3 (${estagio}): nenhuma linha com valor no 5º bimestre de 2026`);
      continue;
    }
    await irPara(n, page, alvo.href);
    const corpo = await texto(page);
    const aviso = await page.$eval("[data-recorte-da-lista]", (p) => (p.textContent ?? "").trim()).catch(() => "");
    const valor = alvo.valor.replace(/ /g, " ").replace(/^R\$\s*/, "");
    conferir(new RegExp(`Despesa ${estagio}`).test(aviso) && corpo.includes(valor), `${estagio}: a lista abre com o recorte dito ("${aviso.slice(0, 70)}") e o total ${valor}`);
  }

  // ── 4. as ações do PPA na LOA ──
  const v = await vinculoPpaLoa(prisma, { exercicio: 2026 });
  await irPara(n, page, "/planejamento/loa/vinculo-ppa?exercicio=2026");
  const linhas = await page.$$eval("section", (ss) => ss.map((s) => s.querySelectorAll("tbody tr").length));
  const resumo = await page.$eval("[data-resumo-do-vinculo]", (p) => p.textContent ?? "").catch(() => "");
  // O TabelaDeDados não acrescenta linha de total aqui (sem ehTotal): as linhas são as do leitor.
  conferir(resumo !== "" && linhas[0] === (v.acoes.length === 0 ? 0 : v.acoes.length) && linhas[1] === (v.fichasSemAcao.length === 0 ? 0 : v.fichasSemAcao.length),
    `ações do PPA na LOA: ${String(v.acoes.length)} ação(ões) e ${String(v.fichasSemAcao.length)} ficha(s) sem ação, como o leitor (tela: ${JSON.stringify(linhas)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das pendências finais completo.");
