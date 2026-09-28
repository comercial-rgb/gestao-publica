import "dotenv/config";
import type { Page } from "puppeteer";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import {
  CONTA_REALOCACAO_ACRESCIMO,
  CONTA_REALOCACAO_REDUCAO,
} from "../modules/m01-core-contabil/roteiros.js";
import { diaCivil } from "../packages/datas/index.js";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  type CampoDoPercurso,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * V21 — REMANEJAMENTO, TRANSPOSIÇÃO E TRANSFERÊNCIA DE DOTAÇÃO, PELA TELA.
 *
 * ═══ O QUE SÓ A TELA RESPONDE ═══
 *   1. a tela abre, e a ação nova chega ao administrador pela fila de atualizações (v37);
 *   2. um ato que NÃO FECHA é recusado com o motivo na tela, e nada é gravado;
 *   3. o ato que fecha grava, CONFIRMA, aparece na lista como vigente, e a dotação das fichas muda
 *      — persistência conferida no banco, não na mensagem;
 *   4. o razão recebe as contas de ALTERAÇÃO DA LEI ORÇAMENTÁRIA (a tela não mostra conta; é o
 *      balancete que lê — por isso esta conferência é no banco);
 *   5. o QDD mostra a coluna das realocações;
 *   6. o mesmo número repetido é recusado nomeando o ato;
 *   7. desfazer devolve a dotação, a lista mostra "Desfeito", e o formulário de desfazer CONTINUA na
 *      tela dizendo que não há mais ato vigente — a confirmação não some com ele.
 *
 * ⚠️ BANCO DESCARTÁVEL. O percurso grava atos e lançamentos. A porta 3010 é recusada.
 *
 * Uso:  DATABASE_URL=<o clone> npx tsx scripts/smoke-realocacao-de-dotacao.ts http://localhost:3011
 */
const BASE = process.argv[2] ?? "http://localhost:3011";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const N: Navegador = { base: BASE };

if (BASE.includes(":3010")) {
  throw new Error(
    "Este percurso grava atos e lançamentos. A porta 3010 é a do ambiente de apresentação — rode " +
      "contra um clone descartável (3011). Nada foi feito."
  );
}

const FORM = "registrar-realocacao";
const FORM_ANULAR = "anular-realocacao";
const VALOR = "1000.00";
const NUMERO = `DEC-REAL-${String(Date.now()).slice(-6)}`;

function hojeCivil(): string {
  return diaCivil(new Date());
}

async function abrirPainel(page: Page, rotulo: string): Promise<boolean> {
  await page.bringToFront();
  const clicou = await page.evaluate((t) => {
    const alvo = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === t);
    if (!(alvo instanceof HTMLButtonElement)) return false;
    alvo.click();
    return true;
  }, rotulo);
  if (clicou) await new Promise((r) => setTimeout(r, 400));
  return clicou;
}

async function porQueNaoEnviou(page: Page): Promise<string> {
  return page.evaluate((a) => {
    const f = document.querySelector(`form[data-acao="${a}"]`);
    if (f === null) return "o formulário não está mais na tela";
    const erros = f.querySelector('[data-teste="erros-forma"]')?.textContent?.trim() ?? "";
    const b = f.querySelector('button[type="submit"]');
    const estado = b instanceof HTMLButtonElement ? (b.disabled ? "DESABILITADO" : "habilitado") : "ausente";
    return `botão ${estado} | erros de forma: ${erros === "" ? "(nenhum)" : erros}`;
  }, FORM);
}

interface Par {
  readonly cede: { readonly id: string; readonly numero: number };
  readonly recebe: { readonly id: string; readonly numero: number };
  readonly fonteId: string;
}

/** Duas fichas da MESMA fonte no exercício corrente, a que cede com disponível para o valor. */
async function escolherPar(prisma: PrismaClient, ano: number): Promise<Par | null> {
  const fichas = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: ano },
    orderBy: [{ saldoDisponivel: "desc" }, { numero: "asc" }],
    select: { id: true, numero: true, fonteId: true, saldoDisponivel: true },
  });
  for (const cede of fichas) {
    if (cede.saldoDisponivel.lessThan(VALOR)) continue;
    const recebe = fichas.find((f) => f.fonteId === cede.fonteId && f.id !== cede.id);
    if (recebe !== undefined) {
      return { cede: { id: cede.id, numero: cede.numero }, recebe: { id: recebe.id, numero: recebe.numero }, fonteId: cede.fonteId };
    }
  }
  return null;
}

function camposDoAto(par: Par, numero: string, valorQueRecebe: string): readonly CampoDoPercurso[] {
  return [
    { sel: 'select[name="especie"]', valor: "TRANSPOSICAO", tipo: "select" },
    { sel: 'input[name="numero"]', valor: numero },
    { sel: 'input[name="data"]', valor: hojeCivil(), tipo: "data" },
    { sel: 'input[name="leiNumero"]', valor: "Lei 77/2026" },
    { sel: 'input[name="leiData"]', valor: hojeCivil(), tipo: "data" },
    { sel: 'textarea[name="justificativa"]', valor: "Transposicao aprovada pela Camara para reforcar o programa." },
    { sel: '[aria-label="Ficha da linha 1"]', valor: par.cede.id, tipo: "select" },
    { sel: '[aria-label="Papel da linha 1"]', valor: "REDUCAO", tipo: "select" },
    { sel: '[aria-label="Valor da linha 1"]', valor: VALOR.replace(".", ",") },
    { sel: '[aria-label="Ficha da linha 2"]', valor: par.recebe.id, tipo: "select" },
    { sel: '[aria-label="Papel da linha 2"]', valor: "ACRESCIMO", tipo: "select" },
    { sel: '[aria-label="Valor da linha 2"]', valor: valorQueRecebe.replace(".", ",") },
  ];
}

async function autorizado(prisma: PrismaClient, fichaId: string): Promise<string> {
  const f = await prisma.fichaOrcamentaria.findUniqueOrThrow({ where: { id: fichaId }, select: { saldoAutorizado: true } });
  return f.saldoAutorizado.toFixed(2);
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL ausente — o percurso confere a persistência no banco do clone.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const ano = Number(hojeCivil().slice(0, 4));
  const rota = `/planejamento/realocacoes?exercicio=${String(ano)}`;

  const par = await escolherPar(prisma, ano);
  if (par === null) {
    throw new Error(`Não há duas fichas da mesma fonte em ${String(ano)} com ${VALOR} disponível. Rode o preparador. Nada foi feito.`);
  }
  const antesCede = await autorizado(prisma, par.cede.id);
  const antesRecebe = await autorizado(prisma, par.recebe.id);

  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    R.ok("0.1 login do administrador");

    // A AÇÃO NOVA CHEGA PELA FILA DE ATUALIZAÇÕES (v37) num banco que já existia.
    await irPara(N, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(
        () => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null
      );
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(N, page, "/administracao/perfis");
    }
    R.ok("0.2 fila de atualizações de permissões esgotada");

    // ══ 1. A TELA ══
    const inicial = await irPara(N, page, rota);
    R.conferir("1.1 a tela de remanejamento, transposição e transferência abre", /remanejamento, transposi[çc][ãa]o e transfer[êe]ncia/i.test(inicial), inicial.slice(0, 200));
    R.conferir("1.2 a tela diz que não é crédito adicional", /n[ãa]o [ée] cr[ée]dito adicional/i.test(inicial), inicial.slice(0, 600));
    R.conferir("1.3 o menu leva à tela", await page.evaluate(() => document.querySelector('a[href="/planejamento/realocacoes"]') !== null), "sem link no menu");

    // ══ 2. O QUE NÃO FECHA É RECUSADO, COM O MOTIVO ══
    const atosAntes = await prisma.atoDeRealocacao.count();
    R.conferir("2.1 o painel do ato abre", await abrirPainel(page, "Registrar realocação"), "botão ausente");
    const recusa = await preencherEEnviar(page, FORM, camposDoAto(par, NUMERO, "900.00"));
    R.conferir(
      "2.2 ato que não fecha é recusado nomeando a diferença",
      recusa.tipo === "erro" && /n[ãa]o fecha/i.test(recusa.texto),
      recusa.tipo === "silencio" ? await porQueNaoEnviou(page) : `${recusa.tipo}: ${recusa.texto}`
    );
    R.conferir("2.3 e nada foi gravado", (await prisma.atoDeRealocacao.count()) === atosAntes, "um ato foi gravado");

    // ══ 3. O ATO QUE FECHA ══
    await irPara(N, page, rota);
    await abrirPainel(page, "Registrar realocação");
    const r = await preencherEEnviar(page, FORM, camposDoAto(par, NUMERO, VALOR));
    R.conferir(
      `3.1 o ato ${NUMERO} grava e confirma`,
      r.tipo === "ok" && r.texto.includes(NUMERO),
      r.tipo === "silencio" ? await porQueNaoEnviou(page) : `${r.tipo}: ${r.texto}`
    );
    const lista = await irPara(N, page, rota);
    R.conferir("3.2 o ato aparece na lista, vigente, recarregada", lista.includes(NUMERO.toLowerCase()) && /vigente/i.test(lista), lista.slice(0, 400));
    const depoisCede = await autorizado(prisma, par.cede.id);
    const depoisRecebe = await autorizado(prisma, par.recebe.id);
    R.conferir(
      `3.3 a ficha ${String(par.cede.numero)} perdeu ${VALOR} e a ficha ${String(par.recebe.numero)} ganhou ${VALOR}`,
      Number(antesCede) - Number(depoisCede) === Number(VALOR) && Number(depoisRecebe) - Number(antesRecebe) === Number(VALOR),
      `cede ${antesCede} -> ${depoisCede}; recebe ${antesRecebe} -> ${depoisRecebe}`
    );

    // ══ 4. O RAZÃO ══
    const ato = await prisma.atoDeRealocacao.findFirstOrThrow({ where: { numero: NUMERO }, select: { id: true } });
    const partidas = await prisma.partidaContabil.findMany({
      where: { lancamento: { origemTipo: "REALOCACAO_DE_DOTACAO", origemId: { not: null } }, conta: { codigo: { in: [CONTA_REALOCACAO_ACRESCIMO, CONTA_REALOCACAO_REDUCAO] } } },
      select: { tipo: true, valor: true, fichaId: true, conta: { select: { codigo: true } } },
    });
    const doAto = partidas.filter((p) => p.fichaId === par.cede.id || p.fichaId === par.recebe.id);
    R.conferir(
      "4.1 o razão debitou o ACRÉSCIMO na ficha que recebe e creditou a REDUÇÃO na que cede",
      doAto.some((p) => p.conta.codigo === CONTA_REALOCACAO_ACRESCIMO && p.tipo === "DEBITO" && p.fichaId === par.recebe.id) &&
        doAto.some((p) => p.conta.codigo === CONTA_REALOCACAO_REDUCAO && p.tipo === "CREDITO" && p.fichaId === par.cede.id),
      JSON.stringify(doAto.map((p) => [p.conta.codigo, p.tipo, p.fichaId]))
    );

    // ══ 5. O QDD ══
    const qdd = await irPara(N, page, `/planejamento/qdd?exercicio=${String(ano)}`);
    R.conferir("5.1 o QDD mostra a coluna das realocações", /realoca[çc][õo]es/i.test(qdd), qdd.slice(0, 300));

    // ══ 6. O MESMO NÚMERO ══
    await irPara(N, page, rota);
    await abrirPainel(page, "Registrar realocação");
    const repetido = await preencherEEnviar(page, FORM, camposDoAto(par, NUMERO, VALOR));
    R.conferir(
      "6.1 o mesmo número no mesmo ano é recusado nomeando o ato",
      repetido.tipo === "erro" && repetido.texto.includes(`${NUMERO}/${String(ano)}`),
      `${repetido.tipo}: ${repetido.texto}`
    );
    R.conferir("6.2 e só existe um ato com esse número", (await prisma.atoDeRealocacao.count({ where: { numero: NUMERO } })) === 1, "duplicou");

    // ══ 7. DESFAZER ══
    await irPara(N, page, rota);
    const anular = await preencherEEnviar(page, FORM_ANULAR, [
      { sel: 'select[name="atoId"]', valor: ato.id, tipo: "select" },
      { sel: 'input[name="data"]', valor: hojeCivil(), tipo: "data" },
      { sel: 'textarea[name="motivo"]', valor: "Lei revogada; a dotacao volta ao programa de origem." },
    ]);
    R.conferir("7.1 desfazer confirma", anular.tipo === "ok" && /anulado/i.test(anular.texto), `${anular.tipo}: ${anular.texto}`);
    R.conferir(
      "7.2 a dotação das duas fichas voltou",
      (await autorizado(prisma, par.cede.id)) === antesCede && (await autorizado(prisma, par.recebe.id)) === antesRecebe,
      "saldo não voltou"
    );
    const final = await irPara(N, page, rota);
    R.conferir("7.3 a lista mostra o ato como desfeito, com o motivo", /desfeito em/i.test(final) && final.includes("lei revogada"), final.slice(0, 400));
    const formContinua = await page.evaluate(() => document.querySelector('form[data-acao="anular-realocacao"]') !== null);
    R.conferir("7.4 o formulário de desfazer continua na tela", formContinua, "o formulário sumiu");
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
