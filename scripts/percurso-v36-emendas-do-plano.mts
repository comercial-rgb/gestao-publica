import "dotenv/config";
import type { Page } from "puppeteer";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarMetaAnualLdo, criarPrevisaoReceitaPpa } from "../modules/m02b-plurianual/servico.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DAS EMENDAS AO PPA E À LDO (TR 5.9.1.21-23 e 5.9.2.11-13):
 *   LDO: emenda que sobe só a receita primária e outra que sobe primária e total, pela tela; a sanção da primeira é
 *   recusada nomeando a regra (primária acima da total) e nada é gravado; a da segunda grava o ato da lei com os dois
 *   itens e a emenda aparece aprovada; uma linha bloqueada recusa emenda nova com o motivo, e liberada volta a aceitar.
 *   PPA: emenda com duas previsões, sanção PARCIAL de uma — o ato leva só a sancionada, a outra aparece vetada.
 *   Quem não consulta o planejamento não abre a tela.
 *
 * As linhas da peça (metas fiscais de 2026 e duas previsões de receita do PPA) são criadas pelo domínio, como o
 * administrador, quando a base fictícia não as tem — o cadastro do PPA e da LDO tem percurso próprio.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 npx tsx scripts/percurso-v36-emendas-do-plano.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(_[a-z]+)?(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: PERCURSO_BANCO tem de ser a base fictícia que a BASE serve.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const ADMIN = "admin@cg.pb.gov.br";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const marca = String(Date.now()).slice(-6);
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Fortaleza" }).format(new Date());

async function texto(page: Page, form: string, nome: string, valor: string): Promise<void> {
  await page.$eval(`${form} [name='${nome}']`, (el, v) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, valor);
}

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 0. as linhas das peças (domínio, só se faltarem) ──
  const plano = await prisma.planoPlurianual.findFirstOrThrow({ orderBy: { anoInicio: "desc" }, select: { id: true } });
  const ldo = await prisma.leiDiretrizesOrcamentarias.findFirstOrThrow({ where: { exercicio: 2026 }, select: { id: true } });
  let meta = await prisma.metaAnualLdo.findFirst({ where: { ldoId: ldo.id, ano: 2026 }, select: { id: true } });
  if (meta === null) {
    meta = { id: (await criarMetaAnualLdo(prisma, {
      ldoId: ldo.id, ano: 2026, receitaTotal: "100000000.00", receitaPrimaria: "90000000.00", despesaTotal: "98000000.00", despesaPrimaria: "95000000.00", resultadoNominal: "-2000000.00",
      dividaPublicaConsolidada: "30000000.00", dividaConsolidadaLiquida: "25000000.00", receitaPrimariaPpp: "0.00", despesaPrimariaPpp: "0.00", impactoSaldoPpp: "0.00", criadoPor: ADMIN,
    })).metaAnualId };
  }
  const vigente = async (g: "receitaTotal" | "receitaPrimaria"): Promise<number> => {
    const m = await prisma.metaAnualLdo.findUniqueOrThrow({ where: { id: meta!.id }, select: { [g]: true } as never });
    const ajustes = await prisma.alteracaoDeValorPlanejado.findMany({ where: { metaAnualLdoId: meta!.id, grandeza: g }, select: { valorAjuste: true } });
    return Number((m as Record<string, { toString(): string }>)[g]!.toString()) + ajustes.reduce((s, a) => s + Number(a.valorAjuste), 0);
  };
  const fonte = await prisma.fonteRecurso.findFirstOrThrow({ where: { codigo: "500" }, select: { id: true } });
  const naturezas = await prisma.naturezaReceita.findMany({ where: { codigo: { startsWith: "1" } }, orderBy: { codigo: "asc" }, take: 2, select: { id: true } });
  const previsoes: string[] = [];
  for (const nat of naturezas) {
    const ja = await prisma.previsaoReceitaPpa.findFirst({ where: { planoId: plano.id, naturezaReceitaId: nat.id, fonteId: fonte.id, ano: 2027 }, select: { id: true } });
    previsoes.push(ja?.id ?? (await criarPrevisaoReceitaPpa(prisma, { planoId: plano.id, naturezaReceitaId: nat.id, fonteId: fonte.id, ano: 2027, valor: "1000000.00", criadoPor: ADMIN })).previsaoId);
  }
  if (previsoes.length < 2) throw new Error("a base não tem duas naturezas de receita para as previsões do PPA");

  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, ADMIN, senha);
  const telaLdo = `/planejamento/emendas-do-plano?peca=${encodeURIComponent(`LDO::${ldo.id}`)}`;
  const telaPpa = `/planejamento/emendas-do-plano?peca=${encodeURIComponent(`PPA::${plano.id}`)}`;

  const cadastrar = async (tela: string, objetivo: string, itens: readonly { linha: string; valor: string }[]): Promise<string> => {
    await irPara(n, page, tela);
    const f = 'form[data-acao="cadastrar-emenda-do-plano"]';
    await texto(page, f, "justificativa", `Justificativa da emenda ${marca}`);
    await texto(page, f, "textoJuridico", "Art. 1º Fica alterado o anexo correspondente.");
    return (await preencherEEnviar(page, "cadastrar-emenda-do-plano", [
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="vereador"]', valor: "Vereador Fictício" },
      { sel: 'input[name="objetivo"]', valor: objetivo },
      ...itens.flatMap((i, k) => [
        { sel: 'select[name="linha"]', valor: i.linha, tipo: "select" as const, indice: k },
        { sel: '[data-mascara="valor"]', valor: i.valor, indice: k },
      ]),
    ])).texto;
  };
  const sancionar = async (tela: string, emendaId: string, numero: number, lei: string, parcialItem?: string): Promise<string> => {
    await irPara(n, page, tela);
    const f = `form[data-acao="sancionar-emenda-do-plano"][data-emenda="${emendaId}"]`;
    if (parcialItem !== undefined) {
      // O rádio é estado do React: antes da hidratação o clique não abre a escolha das linhas. Repete até ela aparecer.
      const caixa = `${f} input[name="itemAprovado"][value="${parcialItem}"]`;
      for (let i = 0; i < 20 && (await page.$(caixa)) === null; i += 1) {
        await page.click(`${f} input[name="resultado"][value="PARCIAL"]`);
        await new Promise((r) => setTimeout(r, 500));
      }
      await page.click(caixa);
    }
    // A resposta mora fora do formulário, com o número da emenda no nome do marcador.
    return (await preencherEEnviar(page, f, [
      { sel: 'input[name="leiNumero"]', valor: lei },
      { sel: 'input[name="leiAno"]', valor: "2026" },
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="dataPublicacao"]', valor: hoje, tipo: "data" },
    ], `sancionar-emenda-do-plano-${String(numero)}`)).texto;
  };
  const ultimaEmenda = async (onde: { ldoId: string } | { planoId: string }, objetivo: string) =>
    prisma.emendaAoPlanejamento.findFirst({ where: { ...onde, objetivo }, orderBy: { numero: "desc" }, select: { id: true, numero: true, itens: { select: { id: true, grandeza: true, previsaoReceitaPpaId: true } } } });

  // ── 1. LDO: duas emendas pela tela ──
  const primaria = `META_ANUAL_LDO::${meta.id}::receitaPrimaria`;
  const total = `META_ANUAL_LDO::${meta.id}::receitaTotal`;
  const folga = (await vigente("receitaTotal")) - (await vigente("receitaPrimaria"));
  const aMais = `${(Math.floor(folga) + 1_000_000).toLocaleString("pt-BR")},00`;
  const r1 = await cadastrar(telaLdo, `Só a primária ${marca}`, [{ linha: primaria, valor: aMais }]);
  const r2 = await cadastrar(telaLdo, `Primária e total ${marca}`, [{ linha: primaria, valor: "5.000.000,00" }, { linha: total, valor: "5.000.000,00" }]);
  const e1 = await ultimaEmenda({ ldoId: ldo.id }, `Só a primária ${marca}`);
  const e2 = await ultimaEmenda({ ldoId: ldo.id }, `Primária e total ${marca}`);
  conferir(e1 !== null && e2 !== null && e2.itens.length === 2 && /registrada/i.test(r1) && /registrada/i.test(r2), `duas emendas à LDO pela tela (nº ${String(e1?.numero)} e ${String(e2?.numero)}): "${r2.trim().slice(0, 60)}"`);
  if (e1 === null || e2 === null) throw new Error("sem as emendas, o percurso não segue");

  // ── 2. a sanção da que passaria a total é recusada, e nada é gravado ──
  const atosAntes = await prisma.atoDeAlteracaoDoPlanejamento.count({ where: { ldoId: ldo.id } });
  const s1 = await sancionar(telaLdo, e1.id, e1.numero, `E${marca}`);
  const atosDepois = await prisma.atoDeAlteracaoDoPlanejamento.count({ where: { ldoId: ldo.id } });
  const semSancao = (await prisma.sancaoDaEmendaAoPlanejamento.count({ where: { emendaId: e1.id } })) === 0;
  conferir(/primária não pode exceder a total/i.test(s1) && atosDepois === atosAntes && semSancao, `sanção recusada pela regra das metas ("${s1.trim().slice(0, 90)}"), nada gravado`);

  // ── 3. a outra é aprovada: o ato da lei nasce com os dois itens ──
  const s2 = await sancionar(telaLdo, e2.id, e2.numero, `F${marca}`);
  const ato = await prisma.atoDeAlteracaoDoPlanejamento.findFirst({ where: { ldoId: ldo.id, numero: `F${marca}`, ano: 2026 }, select: { _count: { select: { itens: true } } } });
  await irPara(n, page, telaLdo);
  const situacao = await page.$eval(`[data-emenda-do-plano="${e2.numero}"]`, (el) => el.getAttribute("data-situacao")).catch(() => "");
  conferir(/Sanção registrada/i.test(s2) && ato?._count.itens === 2 && situacao === "APROVADA", `aprovada pela lei F${marca}/2026: ato com ${String(ato?._count.itens)} itens, emenda ${situacao ?? ""}`);

  // ── 4. bloqueio e liberação ──
  const despesa = `META_ANUAL_LDO::${meta.id}::despesaTotal`;
  await irPara(n, page, telaLdo);
  await preencherEEnviar(page, "bloquear-linha", [{ sel: 'select[name="linha"]', valor: despesa, tipo: "select" }, { sel: 'input[name="motivo"]', valor: `Meta pactuada com o Tribunal ${marca}` }]);
  const bloqueada = await cadastrar(telaLdo, `Na linha bloqueada ${marca}`, [{ linha: despesa, valor: "1.000,00" }]);
  const bl = await prisma.bloqueioDeEmendaAoPlanejamento.findFirst({ where: { metaAnualLdoId: meta.id, grandeza: "despesaTotal", revogaDeId: null, revogadoPor: null }, select: { id: true } });
  await irPara(n, page, telaLdo);
  await preencherEEnviar(page, "liberar-linha", [{ sel: 'select[name="bloqueioId"]', valor: bl?.id ?? "", tipo: "select" }, { sel: 'input[name="motivo"]', valor: "Meta revista" }]);
  const liberada = await cadastrar(telaLdo, `Depois de liberada ${marca}`, [{ linha: despesa, valor: "1.000,00" }]);
  conferir(/está bloqueada para emendas/i.test(bloqueada) && /registrada/i.test(liberada), `bloqueada recusa ("${bloqueada.trim().slice(0, 70)}"); liberada aceita`);

  // ── 5. PPA: sanção parcial ──
  const [pA, pB] = previsoes as [string, string];
  await cadastrar(telaPpa, `Duas receitas ${marca}`, [{ linha: `PREVISAO_RECEITA_PPA::${pA}::valor`, valor: "10.000,00" }, { linha: `PREVISAO_RECEITA_PPA::${pB}::valor`, valor: "20.000,00" }]);
  const ep = await ultimaEmenda({ planoId: plano.id }, `Duas receitas ${marca}`);
  const itemA = ep?.itens.find((i) => i.previsaoReceitaPpaId === pA)?.id ?? "";
  const sp = await sancionar(telaPpa, ep?.id ?? "", ep?.numero ?? 0, `G${marca}`, itemA);
  const atoP = await prisma.atoDeAlteracaoDoPlanejamento.findFirst({ where: { planoId: plano.id, numero: `G${marca}` }, select: { itens: { select: { previsaoReceitaPpaId: true } } } });
  await irPara(n, page, telaPpa);
  const cartao = await page.$eval(`[data-emenda-do-plano="${String(ep?.numero)}"]`, (el) => (el as HTMLElement).innerText).catch(() => "");
  conferir(/1 linha/.test(sp) && atoP?.itens.length === 1 && atoP.itens[0]?.previsaoReceitaPpaId === pA && /sancionada/i.test(cartao) && /vetada/i.test(cartao), `PPA: sanção parcial leva só a linha escolhida ao ato G${marca}; a outra aparece vetada`);

  // ── 6. negação ──
  const outra = await (await nav.createBrowserContext()).newPage();
  outra.setDefaultTimeout(120000);
  await entrar(n, outra, "atestador@ficticio.local", "Ficticio#2026");
  await outra.goto(`${n.base}${telaLdo}`, { waitUntil: "domcontentloaded" });
  const destino = new URL(outra.url());
  const t = await outra.evaluate(() => document.body.innerText);
  const recusa = destino.pathname === "/sem-acesso" ? (destino.searchParams.get("acao") ?? "") : (/ação de leitura cobrada é (\w+)/.exec(t)?.[1] ?? "");
  conferir(recusa === "CONSULTAR_PLANEJAMENTO" && !t.includes(`Primária e total ${marca}`), `sem consulta do planejamento: a tela não abre (${destino.pathname}, ${recusa})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso das emendas ao PPA e à LDO completo.");
