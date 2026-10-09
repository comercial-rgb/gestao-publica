import "dotenv/config";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, registroDePassos, type Navegador } from "./percursos-navegador.js";

/**
 * V29 — A PROPOSTA ORÇAMENTÁRIA DO EXERCÍCIO SEGUINTE, PELA TELA.
 *
 *   1. a tela abre pelo menu do Planejamento;
 *   2. importar o exercício de origem cria a proposta com as receitas e as fichas — conferido no banco, e sem
 *      nenhuma ficha nem lançamento no exercício de destino;
 *   3. a página da proposta mostra a lei de origem, a receita líquida e o que falta para gerar o orçamento;
 *   4. alterar uma ficha grava o ajuste com motivo, e o valor da proposta muda;
 *   5. sem o exercício de destino aberto, o botão de gerar fica desabilitado; abrir o exercício pela tela;
 *   6. gerar o orçamento cria as fichas e a receita prevista do destino, com a dotação inicial em 1º de janeiro e
 *      o valor alterado na ficha alterada;
 *   7. a proposta passa a mostrar "Orçamento gerado", sem formulário de alteração, e as fichas aparecem na tela
 *      das fichas do exercício novo.
 *
 * ⚠️ GRAVA NO BANCO. A porta 3010 é recusada.
 *
 * Uso:  DATABASE_URL=<banco do ensaio> npx tsx scripts/smoke-proposta-orcamentaria.ts http://localhost:3011 [admin] [senha] [origem] [destino]
 */
const BASE = process.argv[2] ?? "http://localhost:3011";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const ORIGEM = Number(process.argv[5] ?? "2026");
const DESTINO = Number(process.argv[6] ?? String(ORIGEM + 1));
const N: Navegador = { base: BASE };

if (BASE.includes(":3010")) {
  throw new Error("Este percurso grava proposta, exercício e fichas. A 3010 é a apresentação — use o ensaio (3011). Nada foi feito.");
}

async function main(): Promise<void> {
  if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL ausente — o percurso confere a persistência no banco do ensaio.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const nome = `Proposta ${String(DESTINO)} pelo percurso ${String(Date.now()).slice(-5)}`;

  if ((await prisma.exercicio.count({ where: { ano: DESTINO } })) > 0) {
    throw new Error(`O exercício ${String(DESTINO)} já existe neste banco; o percurso precisa dele fechado. Use um ensaio limpo. Nada foi feito.`);
  }
  const receitasOrigem = await prisma.receitaPrevista.count({ where: { exercicio: ORIGEM } });
  // A MESMA regra do serviço, contada aqui por outro caminho: ficam de fora por padrão as fichas de recurso de
  // exercício anterior e as abertas no exercício por crédito especial ou extraordinário com dotação inicial zero.
  const todasOrigem = await prisma.fichaOrcamentaria.findMany({
    where: { exercicio: ORIGEM },
    select: {
      exercicioFonte: true,
      valorDotado: true,
      itensCredito: { where: { estornoDeId: null }, select: { decreto: { select: { lei: { select: { tipoCredito: true } } } } } },
    },
  });
  const exclusiva = (f: (typeof todasOrigem)[number]): boolean =>
    f.exercicioFonte !== 1 ||
    (f.valorDotado.isZero() && f.itensCredito.some((i) => i.decreto.lei.tipoCredito === "ESPECIAL" || i.decreto.lei.tipoCredito === "EXTRAORDINARIO"));
  const fichasOrigem = todasOrigem.filter((f) => !exclusiva(f)).length;
  const deixadas = todasOrigem.length - fichasOrigem;

  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    await entrar(N, page, ADMIN, SENHA);
    R.ok("0.1 login do administrador");

    // ══ 1. A TELA ══
    const hub = await irPara(N, page, "/planejamento");
    R.conferir("1.1 o Planejamento oferece a proposta orçamentária", /proposta or[çc]ament[áa]ria/i.test(hub), hub.slice(0, 300));
    const lista = await irPara(N, page, "/planejamento/proposta-orcamentaria");
    R.conferir("1.2 a tela da proposta abre com o formulário de importação", /importar e criar a proposta/i.test(lista), lista.slice(0, 300));

    // ══ 2. IMPORTAR ══
    const antes = await prisma.propostaOrcamentaria.count();
    const r = await preencherEEnviar(page, "elaborar-proposta", [
      { sel: 'input[name="exercicio"]', valor: String(DESTINO) },
      { sel: 'select[name="exercicioDeOrigem"]', valor: String(ORIGEM), tipo: "select" },
      { sel: 'input[name="descricao"]', valor: nome },
      { sel: 'select[name="baseDaReceita"]', valor: "PREVISAO_ATUALIZADA", tipo: "select" },
      { sel: 'input[name="percentualDaReceita"]', valor: "4,5" },
      { sel: 'select[name="baseDaDespesa"]', valor: "DOTACAO_INICIAL", tipo: "select" },
      { sel: 'input[name="percentualDaDespesa"]', valor: "4,5" },
    ]);
    R.conferir("2.1 importar confirma com a contagem", r.tipo === "ok" && /proposta criada/i.test(r.texto), `${r.tipo}: ${r.texto}`);
    R.conferir(
      `2.1b a confirmação diz que ${String(deixadas)} ficha(s) exclusiva(s) de ${String(ORIGEM)} ficaram de fora`,
      deixadas === 0 ? !/ficaram de fora/i.test(r.texto) : r.texto.includes(`${String(deixadas)} ficha(s)`) && /ficaram de fora/i.test(r.texto),
      r.texto
    );
    const proposta = await prisma.propostaOrcamentaria.findFirst({
      where: { descricao: nome },
      select: { id: true, _count: { select: { linhasDeReceita: true, linhasDeDespesa: true } } },
    });
    R.conferir("2.2 a proposta foi gravada", proposta !== null && (await prisma.propostaOrcamentaria.count()) === antes + 1, "não gravou");
    if (proposta === null) throw new Error("sem proposta, o percurso não continua");
    R.conferir(
      `2.3 vieram ${String(receitasOrigem)} receita(s) e ${String(fichasOrigem)} ficha(s) de ${String(ORIGEM)}`,
      proposta._count.linhasDeReceita === receitasOrigem && proposta._count.linhasDeDespesa === fichasOrigem,
      JSON.stringify(proposta._count)
    );
    R.conferir(
      `2.4 nenhuma ficha nem receita em ${String(DESTINO)} ainda`,
      (await prisma.fichaOrcamentaria.count({ where: { exercicio: DESTINO } })) === 0 &&
        (await prisma.receitaPrevista.count({ where: { exercicio: DESTINO } })) === 0,
      "o destino já tem orçamento"
    );

    // ══ 3. A PÁGINA DA PROPOSTA ══
    const rota = `/planejamento/proposta-orcamentaria/${proposta.id}`;
    const pag = await irPara(N, page, rota);
    R.conferir(`3.1 a página mostra a lei de ${String(ORIGEM)} para comparar`, pag.includes(`lei de ${String(ORIGEM)}`), pag.slice(0, 400));
    R.conferir("3.2 a receita aparece como líquida", /receita prevista \(l[íi]quida\)/i.test(pag), pag.slice(0, 400));
    R.conferir(`3.3 o exercício ${String(DESTINO)} aparece como pendente`, /falta/i.test(pag) && pag.includes(`exercício ${String(DESTINO)} aberto`), pag.slice(0, 800));
    const desabilitado = await page.evaluate(() => {
      const b = document.querySelector('form[data-acao="efetivar-proposta"] button[type="submit"]');
      return b instanceof HTMLButtonElement && b.disabled;
    });
    R.conferir("3.4 sem o exercício aberto, gerar o orçamento fica desabilitado", desabilitado, "o botão está habilitado");

    // ══ 4. ALTERAR UMA FICHA ══
    const linha = await prisma.linhaDeDespesaDaProposta.findFirst({
      where: { propostaOrcamentariaId: proposta.id },
      orderBy: { fichaDeOrigem: { numero: "asc" } },
      select: { id: true, fichaDeOrigem: { select: { numero: true } } },
    });
    if (linha === null) throw new Error("a proposta não tem fichas");
    // V38 — a linha pode ser nova (sem ficha de origem); este smoke altera uma importada.
    if (linha.fichaDeOrigem === null) throw new Error("a linha escolhida é nova, sem ficha de origem");
    const aj = await preencherEEnviar(page, `form[data-acao="ajustar-linha"][aria-label="Alterar o valor de a ficha ${String(linha.fichaDeOrigem.numero)}"]`, [
      { sel: 'input[name="valor"]', valor: "1.234.567,89" },
      { sel: 'input[name="motivo"]', valor: "Ampliação do atendimento aprovada" },
    ]);
    R.conferir("4.1 a alteração confirma com o valor em reais", aj.tipo === "ok" && aj.texto.includes("1.234.567,89"), `${aj.tipo}: ${aj.texto}`);
    const ajuste = await prisma.ajusteDeDespesaDaProposta.findFirst({ where: { linhaId: linha.id }, select: { valor: true, motivo: true } });
    R.conferir("4.2 o ajuste foi gravado com o motivo", ajuste?.valor.toFixed(2) === "1234567.89" && ajuste.motivo.includes("Ampliação"), JSON.stringify(ajuste));

    // ══ 5. ABRIR O EXERCÍCIO ══
    await irPara(N, page, rota);
    const ab = await preencherEEnviar(page, "abrir-exercicio", []);
    R.conferir(`5.1 abrir o exercício ${String(DESTINO)} pela tela confirma`, ab.tipo === "ok" && ab.texto.includes(String(DESTINO)), `${ab.tipo}: ${ab.texto}`);
    R.conferir(`5.2 o exercício ${String(DESTINO)} existe no banco`, (await prisma.exercicio.count({ where: { ano: DESTINO } })) === 1, "não abriu");

    // ══ 6. GERAR O ORÇAMENTO ══
    await irPara(N, page, rota);
    const ef = await preencherEEnviar(page, "efetivar-proposta", []);
    R.conferir(`6.1 gerar o orçamento de ${String(DESTINO)} confirma`, ef.tipo === "ok" && /or[çc]amento de \d{4} gerado/i.test(ef.texto), `${ef.tipo}: ${ef.texto}`);
    const efet = await prisma.efetivacaoDaProposta.findUnique({ where: { exercicio: DESTINO }, select: { fichasCriadas: true, receitasCriadas: true } });
    const fichasDestino = await prisma.fichaOrcamentaria.count({ where: { exercicio: DESTINO } });
    const receitasDestino = await prisma.receitaPrevista.count({ where: { exercicio: DESTINO } });
    R.conferir(
      "6.2 a efetivação foi registrada e bate com o que nasceu",
      efet !== null && efet.fichasCriadas === fichasDestino && efet.receitasCriadas === receitasDestino && fichasDestino > 0,
      `${JSON.stringify(efet)} fichas=${String(fichasDestino)} receitas=${String(receitasDestino)}`
    );
    const alterada = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: DESTINO, numero: linha.fichaDeOrigem.numero },
      select: { valorDotado: true, saldoAutorizado: true, movimentos: { select: { tipo: true, competencia: true } } },
    });
    R.conferir(
      `6.3 a ficha ${String(linha.fichaDeOrigem.numero)} de ${String(DESTINO)} nasceu com o valor alterado`,
      alterada?.valorDotado.toFixed(2) === "1234567.89" && alterada.saldoAutorizado.toFixed(2) === "1234567.89",
      JSON.stringify(alterada?.valorDotado)
    );
    R.conferir(
      "6.4 a dotação inicial foi lançada uma vez, em 1º de janeiro do exercício novo",
      alterada !== null &&
        alterada.movimentos.length === 1 &&
        alterada.movimentos[0]!.tipo === "DOTACAO_INICIAL" &&
        alterada.movimentos[0]!.competencia.toISOString().startsWith(`${String(DESTINO)}-01-01`),
      JSON.stringify(alterada?.movimentos)
    );

    // ══ 7. DEPOIS ══
    const fim = await irPara(N, page, rota);
    R.conferir("7.1 a proposta mostra o orçamento gerado", /or[çc]amento gerado/i.test(fim), fim.slice(0, 400));
    R.conferir(
      "7.2 e não oferece mais alteração nem nova geração",
      await page.evaluate(
        () =>
          document.querySelector('form[data-acao="ajustar-linha"]') === null &&
          document.querySelector('form[data-acao="efetivar-proposta"] button[type="submit"]') === null
      ),
      "ainda há formulário"
    );
    const fichas = await irPara(N, page, `/planejamento/fichas?exercicio=${String(DESTINO)}`);
    R.conferir(`7.3 as fichas de ${String(DESTINO)} aparecem na tela das fichas`, fichas.includes(String(DESTINO)) && /ficha/i.test(fichas), fichas.slice(0, 300));
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
