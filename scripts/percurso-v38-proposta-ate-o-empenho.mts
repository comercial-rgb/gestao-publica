import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { projetar } from "../modules/m02-planejamento/proposta-orcamentaria.js";
import { toMoney, toPercentual } from "../packages/contracts/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V38 — A JORNADA QUE A CONTADORA PEDIU, DE PONTA A PONTA, na base fictícia:
 *   1. elaborar a proposta de 2027 a partir de 2026 (importa receitas e fichas);
 *   2. incluir uma RECEITA nova e uma FICHA nova pelos formulários (o que a lei de 2026 não tinha);
 *   3. reajustar em lote as fichas de uma fonte: calcular a prévia e aplicar;
 *   4. abrir 2027 e gerar o orçamento; conferir as fichas de 2027 (a nova com o número seguinte) e que 2026 NÃO mudou;
 *   5. emitir um empenho de 2027 na ficha nova.
 * Escreve na base fictícia (o orçamento de 2027 fica lá). Se 2027 já tiver orçamento gerado, não executa.
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v38-proposta-ate-o-empenho.mts
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
const MARCA = String(Date.now()).slice(-6);
// O par de exercícios vem do ambiente; sem ele, a origem é o último exercício com fichas e o destino é o seguinte.
const ORIGEM_PEDIDA = Number(process.env["PERCURSO_ORIGEM"] ?? "");
const ORIGEM = Number.isInteger(ORIGEM_PEDIDA) && ORIGEM_PEDIDA > 2000 ? ORIGEM_PEDIDA : (await prisma.fichaOrcamentaria.aggregate({ _max: { exercicio: true } }))._max.exercicio ?? 2026;
const DESTINO = ORIGEM + 1;

const de2026 = async () => ({
  fichas: await prisma.fichaOrcamentaria.aggregate({ where: { exercicio: ORIGEM }, _count: { _all: true }, _sum: { valorDotado: true } }),
  receitas: await prisma.receitaPrevista.aggregate({ where: { exercicio: ORIGEM }, _count: { _all: true }, _sum: { valorPrevisto: true } }),
  movimentos: await prisma.movimentoDotacao.aggregate({ where: { ficha: { exercicio: ORIGEM } }, _count: { _all: true }, _sum: { valor: true } }),
});
const esperarNoBanco = async <T>(ler: () => Promise<T | null>, segundos: number): Promise<T | null> => {
  for (let i = 0; i < segundos * 2; i += 1) {
    const v = await ler();
    if (v !== null) return v;
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
};

const nav = await lancarNavegadorDoPercurso();
try {
  if ((await prisma.efetivacaoDaProposta.findUnique({ where: { exercicio: DESTINO } })) !== null) {
    console.log(`NAO EXECUTADO: ${String(DESTINO)} já tem orçamento gerado nesta base; restaure a cópia para repetir.`);
  } else {
    const page = await nav.newPage();
    page.setDefaultTimeout(300000);
    page.on("dialog", (d) => void d.accept());
    await entrar(n, page, "admin@cg.pb.gov.br", senha);

    // A classificação da ficha nova: a da ficha 1 de 2026, com uma natureza que 2026 não usa nessa combinação.
    const base = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: ORIGEM, valorDotado: { gt: 0 } },
      orderBy: { numero: "asc" },
      select: { unidadeOrcId: true, funcaoId: true, subfuncaoId: true, programaId: true, acaoId: true, fonteId: true, unidadeOrc: { select: { codigo: true } }, funcao: { select: { codigo: true } }, subfuncao: { select: { codigo: true } }, programa: { select: { codigo: true } }, acao: { select: { codigo: true } }, fonte: { select: { codigo: true } } },
    });
    if (base === null) throw new Error("A base não tem ficha de 2026 com dotação.");
    const usadas = new Set((await prisma.fichaOrcamentaria.findMany({ where: { exercicio: ORIGEM, unidadeOrcId: base.unidadeOrcId, funcaoId: base.funcaoId, subfuncaoId: base.subfuncaoId, programaId: base.programaId, acaoId: base.acaoId, fonteId: base.fonteId }, select: { naturezaDespesaId: true } })).map((f) => f.naturezaDespesaId));
    const natureza = await prisma.naturezaDespesa.findFirst({ where: { id: { notIn: [...usadas] }, codigoCompleto: { startsWith: "3390" } }, orderBy: { codigoCompleto: "asc" }, select: { id: true, codigoCompleto: true } });
    if (natureza === null) throw new Error("Nenhuma natureza 3390 livre para a ficha nova.");
    // A receita nova: um par natureza + fonte que 2026 não prevê (a base pode prever todas as naturezas em alguma fonte).
    const paresPrevistos = new Set((await prisma.receitaPrevista.findMany({ where: { exercicio: ORIGEM }, select: { naturezaReceitaId: true, fonteId: true } })).map((r) => `${r.naturezaReceitaId}|${r.fonteId}`));
    const fontes = await prisma.fonteRecurso.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true } });
    let escolha: { readonly naturezaR: { readonly id: string; readonly codigo: string }; readonly fonteR: { readonly id: string; readonly codigo: string } } | null = null;
    for (const nr of await prisma.naturezaReceita.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true } })) {
      const fonteLivre = fontes.find((fo) => !paresPrevistos.has(`${nr.id}|${fo.id}`));
      if (fonteLivre !== undefined) { escolha = { naturezaR: nr, fonteR: fonteLivre }; break; }
    }
    if (escolha === null) throw new Error("Nenhum par natureza + fonte de receita livre.");
    const { naturezaR, fonteR } = escolha;
    const antes = await de2026();
    const fichasComValor = await prisma.fichaOrcamentaria.count({ where: { exercicio: ORIGEM, valorDotado: { gt: 0 } } });
    const maiorNumero = (await prisma.fichaOrcamentaria.aggregate({ where: { exercicio: ORIGEM }, _max: { numero: true } }))._max.numero ?? 0;

    // ── 1. elaborar ──
    await irPara(n, page, "/planejamento/proposta-orcamentaria");
    const descricao = `Proposta ${String(DESTINO)} — percurso V38 ${MARCA}`;
    const r1 = await preencherEEnviar(page, "elaborar-proposta", [
      { sel: 'input[name="exercicio"]', valor: String(DESTINO) },
      { sel: 'select[name="exercicioDeOrigem"]', valor: String(ORIGEM), tipo: "select" },
      { sel: 'input[name="descricao"]', valor: descricao },
      { sel: 'select[name="baseDaReceita"]', valor: "PREVISAO_INICIAL", tipo: "select" },
      { sel: 'select[name="baseDaDespesa"]', valor: "DOTACAO_INICIAL", tipo: "select" },
    ]);
    const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { descricao }, select: { id: true, _count: { select: { linhasDeReceita: true, linhasDeDespesa: true } } } });
    conferir(r1.tipo === "ok" && proposta !== null && proposta._count.linhasDeDespesa > 0, `proposta de ${String(DESTINO)} elaborada de ${String(ORIGEM)}: ${String(proposta?._count.linhasDeReceita ?? 0)} receitas e ${String(proposta?._count.linhasDeDespesa ?? 0)} fichas importadas (${r1.texto.slice(0, 50)})`);
    if (proposta === null) throw new Error("sem proposta, o percurso não segue");
    const ROTA = `/planejamento/proposta-orcamentaria/${proposta.id}`;

    // ── 2. incluir receita e ficha novas ──
    await irPara(n, page, ROTA);
    const r2 = await preencherEEnviar(page, "incluir-receita", [
      { sel: "naturezaReceita", valor: naturezaR.codigo, busca: naturezaR.codigo, tipo: "referencia" },
      { sel: "fonte", valor: fonteR.codigo, busca: fonteR.codigo, tipo: "referencia" },
      { sel: 'select[name="tipoReceita"]', valor: "ORCAMENTARIA", tipo: "select" },
      { sel: 'input[name="valor"]', valor: "70.000,00" },
      { sel: 'input[name="motivo"]', valor: `Transferência nova (percurso ${MARCA})` },
    ]);
    const receitaNova = await prisma.linhaDeReceitaDaProposta.findFirst({ where: { propostaOrcamentariaId: proposta.id, naturezaReceitaId: naturezaR.id }, select: { valorProjetado: true } });
    conferir(r2.tipo === "ok" && receitaNova?.valorProjetado.toFixed(2) === "70000.00", `receita nova ${naturezaR.codigo} fonte ${fonteR.codigo} incluída pela tela com 70.000,00 (${r2.texto.slice(0, 50)})`);
    await irPara(n, page, ROTA);
    const r3 = await preencherEEnviar(page, "incluir-ficha", [
      { sel: "unidadeOrc", valor: base.unidadeOrc.codigo, busca: base.unidadeOrc.codigo, tipo: "referencia" },
      { sel: "funcao", valor: base.funcao.codigo, busca: base.funcao.codigo, tipo: "referencia" },
      { sel: "subfuncao", valor: base.subfuncao.codigo, busca: base.subfuncao.codigo, tipo: "referencia" },
      { sel: "programa", valor: base.programa.codigo, busca: base.programa.codigo, tipo: "referencia" },
      { sel: "acao", valor: base.acao.codigo, busca: base.acao.codigo, tipo: "referencia" },
      { sel: "naturezaDespesa", valor: natureza.codigoCompleto, busca: natureza.codigoCompleto, tipo: "referencia" },
      { sel: "fonte", valor: base.fonte.codigo, busca: base.fonte.codigo, tipo: "referencia" },
      { sel: 'input[name="valor"]', valor: "50.000,00" },
      { sel: 'input[name="motivo"]', valor: `Serviço novo (percurso ${MARCA})` },
    ]);
    const fichaNova = await prisma.linhaDeDespesaDaProposta.findFirst({ where: { propostaOrcamentariaId: proposta.id, naturezaDespesaId: natureza.id, fichaDeOrigemId: null }, select: { id: true, valorProjetado: true } });
    conferir(r3.tipo === "ok" && fichaNova?.valorProjetado.toFixed(2) === "50000.00", `ficha nova ${natureza.codigoCompleto} incluída pela tela com 50.000,00 (${r3.texto.slice(0, 50)})`);

    // ── 3. reajuste em lote da fonte: prévia e aplicação ──
    await irPara(n, page, ROTA);
    await preencherEEnviar(page, "reajuste-em-lote", [
      { sel: 'select[name="lado"]', valor: "DESPESA", tipo: "select" },
      { sel: 'input[name="percentual"]', valor: "2" },
      { sel: "fonte", valor: base.fonte.codigo, busca: base.fonte.codigo, tipo: "referencia" },
      { sel: 'input[name="motivo"]', valor: `Reajuste da fonte ${base.fonte.codigo} (percurso ${MARCA})` },
    ]);
    const linhasDaPrevia = Number(await page.$eval("[data-previa-do-reajuste]", (p) => p.getAttribute("data-previa-do-reajuste") ?? "0").catch(() => "0"));
    const ajustesAntes = await prisma.ajusteDeDespesaDaProposta.count({ where: { linha: { propostaOrcamentariaId: proposta.id } } });
    // A prévia não tem mensagem de resultado (só lê): a prova é a linha da prévia na tela e nenhum ajuste gravado.
    conferir(linhasDaPrevia > 0 && ajustesAntes === 0, `prévia do reajuste de 2% na fonte ${base.fonte.codigo}: ${String(linhasDaPrevia)} linha(s), nada gravado`);
    await page.click('form[data-acao="reajuste-em-lote"] button[data-botao="aplicar"]');
    const aplicado = await esperarNoBanco(async () => { const c = await prisma.ajusteDeDespesaDaProposta.count({ where: { linha: { propostaOrcamentariaId: proposta.id } } }); return c > 0 ? c : null; }, 60);
    conferir(aplicado === linhasDaPrevia, `reajuste aplicado: ${String(aplicado)} ajuste(s), o mesmo número da prévia`);

    // ── 4. abrir 2027 e gerar o orçamento ──
    await irPara(n, page, ROTA);
    if ((await prisma.exercicio.findUnique({ where: { ano: DESTINO } })) === null) {
      const ra = await preencherEEnviar(page, "abrir-exercicio", []);
      conferir(ra.tipo === "ok", `exercício ${String(DESTINO)} aberto pela tela (${ra.texto.slice(0, 40)})`);
      await irPara(n, page, ROTA);
    }
    await page.click('form[data-acao="efetivar-proposta"] button[type="submit"]');
    const efetivacao = await esperarNoBanco(() => prisma.efetivacaoDaProposta.findUnique({ where: { exercicio: DESTINO }, select: { fichasCriadas: true, receitasCriadas: true } }), 240);
    conferir(efetivacao !== null, `orçamento de ${String(DESTINO)} gerado: ${String(efetivacao?.fichasCriadas ?? 0)} fichas e ${String(efetivacao?.receitasCriadas ?? 0)} receitas`);
    if (efetivacao !== null) {
      const fichas2027 = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: DESTINO }, select: { numero: true, valorDotado: true, naturezaDespesaId: true, fonteId: true, unidadeOrcId: true } });
      const nova = fichas2027.find((f) => f.numero === maiorNumero + 1);
      conferir(fichas2027.length === fichasComValor + 1 && nova !== undefined && nova.naturezaDespesaId === natureza.id && nova.valorDotado.toFixed(2) === "51000.00", `fichas de ${String(DESTINO)}: ${String(fichas2027.length)} (as ${String(fichasComValor)} com valor em ${String(ORIGEM)} mais a nova), a nova com o número ${String(nova?.numero ?? "?")} (seguinte a ${String(maiorNumero)}) e 51.000,00 (os 50.000,00 incluídos, com o reajuste de 2% da fonte, que alcança a linha nova)`);
      // O reajuste de 2% chegou às fichas da fonte: cada uma vale a de 2026 projetada a 2%.
      const de2026DaFonte = await prisma.fichaOrcamentaria.findMany({ where: { exercicio: ORIGEM, fonteId: base.fonteId, valorDotado: { gt: 0 } }, select: { numero: true, valorDotado: true } });
      const esperado = de2026DaFonte.reduce((s, f) => toMoney(s.plus(projetar(toMoney(f.valorDotado.toFixed(2)), toPercentual("2")))), toMoney("0"));
      const obtido = fichas2027.filter((f) => f.fonteId === base.fonteId && f.numero <= maiorNumero).reduce((s, f) => toMoney(s.plus(toMoney(f.valorDotado.toFixed(2)))), toMoney("0"));
      conferir(esperado.toFixed(2) === obtido.toFixed(2), `as fichas de ${String(DESTINO)} da fonte ${base.fonte.codigo} somam o de ${String(ORIGEM)} com 2% (${obtido.toFixed(2)})`);
      const receita2027 = await prisma.receitaPrevista.findFirst({ where: { exercicio: DESTINO, naturezaReceitaId: naturezaR.id, fonteId: fonteR.id }, select: { valorPrevisto: true } });
      conferir(receita2027?.valorPrevisto.toFixed(2) === "70000.00", `a receita nova ${naturezaR.codigo} está prevista em ${String(DESTINO)} com 70.000,00`);
      const depois = await de2026();
      conferir(JSON.stringify(depois) === JSON.stringify(antes), `${String(ORIGEM)} não mudou: ${String(antes.fichas._count._all)} fichas, ${String(antes.receitas._count._all)} receitas e ${String(antes.movimentos._count._all)} movimentos, mesmas somas`);

      // ── 5. empenho de 2027 na ficha nova ──
      const fichaNovaId = (await prisma.fichaOrcamentaria.findFirst({ where: { exercicio: DESTINO, numero: maiorNumero + 1 }, select: { id: true } }))?.id ?? "";
      const pessoa = await prisma.pessoa.findFirst({ where: { tipo: "JURIDICA" }, select: { documento: true } });
      await irPara(n, page, `/despesa/empenhos?exercicio=${String(DESTINO)}`);
      await page.waitForSelector("[data-busca-da-ficha]", { timeout: 120000 });
      await page.type("[data-busca-da-ficha]", String(maiorNumero + 1), { delay: 10 });
      // O botão "Credor sem cadastro" só responde depois de a tela montar: clica até o campo aparecer.
      for (let i = 0; i < 20 && (await page.$('form[data-acao="empenhar"] [data-mascara="cpf-cnpj"]')) === null; i += 1) {
        for (const b of await page.$$('form[data-acao="empenhar"] button')) {
          if (/Credor sem cadastro/i.test(await b.evaluate((e) => e.textContent ?? ""))) { await b.click(); break; }
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
      const historico = `Empenho de ${String(DESTINO)} na ficha nova (percurso ${MARCA})`;
      const re = await preencherEEnviar(page, "empenhar", [
        { sel: 'select[name="fichaId"]', valor: fichaNovaId, tipo: "select" },
        { sel: '[data-mascara="cpf-cnpj"]', valor: pessoa?.documento ?? "" },
        { sel: '[data-mascara="valor"]', valor: "1.000,00" },
        { sel: 'input[name="data"]', valor: `${String(DESTINO)}-01-15`, tipo: "data" },
        { sel: 'select[name="categoria"]', valor: "FORNECIMENTO_BENS", tipo: "select" },
        { sel: '[name="historico"]', valor: historico },
      ]);
      const empenho = await prisma.empenho.findFirst({ where: { historico }, select: { numero: true, valor: true, ficha: { select: { exercicio: true, numero: true } } } });
      conferir(re.tipo === "ok" && empenho?.ficha.exercicio === DESTINO && empenho.ficha.numero === maiorNumero + 1, `empenho ${empenho?.numero ?? "?"} de 1.000,00 emitido em ${String(DESTINO)} na ficha nova ${String(maiorNumero + 1)} (${re.texto.slice(0, 50)})`);
    }
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da proposta até o empenho completo.");
