import "dotenv/config";
import Decimal from "decimal.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-003, R3-004) — PELA TELA, COM VALORES: A VERSÃO DO PROJETO DA LOA CAPTURADA DA PROPOSTA, E O EFEITO DAS
 * EMENDAS APROVADA, REJEITADA E PENDENTE SOBRE ELA.
 *
 * Pré-requisito: a massa `semear-massa-r3.mts` (declarações de programa, ação e unidade de 2026; a proposta de 2027 com
 * valores). Quem opera é a planejadora (perfil de planejamento), não o administrador.
 *   1. cadastra o projeto da LOA de 2027 pela tela, se faltar, e captura a versão encaminhada escolhendo a proposta;
 *      no banco: a versão aponta a proposta, TODAS as dotações apontam uma linha, e o valor de cada dotação é o da linha;
 *   2. altera pela tela o valor de uma linha DEPOIS da captura: a dotação da versão não muda;
 *   3. registra três emendas pela tela: E1 (+1.000 em A, −1.000 em D) aprovada; E2 (+500 em B) rejeitada; E3 (+300 em
 *      C) sem sanção;
 *   4. no comparativo da tela, por dotação: no projeto, aprovadas, rejeitadas, aguardando, esperado, hoje e outros
 *      ajustes — cada célula conferida contra o valor calculado aqui a partir do banco.
 * GRAVA (base de ensaio ou demonstração). Roda uma vez por base: a segunda corrida acha a versão e as emendas e só confere.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const exercicio = 2027;
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
/** O número como a tela mostra (pt-BR, duas casas), para procurar na célula. */
const br = (v: Decimal.Value): string => new Decimal(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "#").replace(".", ",").replace(/#/g, ".");
/** A célula da tela: o negativo vem entre parênteses (convenção contábil do componente de valor). */
const somenteNumero = (s: string): string => {
  const t = s.trim();
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const corpo = t.replace(/[^\d,.]/g, "");
  return neg && corpo !== "0,00" ? `-${corpo}` : corpo;
};

const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { exercicio, descricao: { contains: "(ensaio)" }, efetivacao: { is: null } }, select: { id: true, descricao: true } });
if (proposta === null) throw new Error("A proposta de 2027 da massa R3 não está nesta base. Rode scripts/demonstracao/semear-massa-r3.mts.");

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, "planejador@ficticio.local", senha);

  // ── 1. o projeto da LOA e a versão encaminhada ──
  let lei = await prisma.leiOrcamentariaAnual.findUnique({ where: { exercicio }, select: { id: true } });
  if (lei === null) {
    await irPara(n, page, "/planejamento/leis-orcamentarias");
    const r = await preencherEEnviar(page, "criar-leis-orcamentarias", [
      { sel: 'input[name="exercicio"]', valor: String(exercicio) },
      { sel: 'input[name="numeroDoProjeto"]', valor: "PL 27/2026 (fictício)" },
      { sel: 'input[name="dataDoEnvio"]', valor: "2026-09-30", tipo: "data" },
      { sel: 'textarea[name="ementa"]', valor: "Estima a receita e fixa a despesa do Município para o exercício de 2027 (fictício)." },
    ]);
    lei = await prisma.leiOrcamentariaAnual.findUnique({ where: { exercicio }, select: { id: true } });
    conferir(r.tipo === "ok" && lei !== null, `projeto da LOA de 2027 cadastrado pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, "projeto da LOA de 2027 já cadastrado (corrida anterior)");
  if (lei === null) throw new Error("sem projeto da LOA");

  let versao = await prisma.versaoDoProjetoDaLoa.findFirst({ where: { leiId: lei.id, propostaOrcamentariaId: proposta.id }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
  if (versao === null) {
    await irPara(n, page, `/planejamento/leis-orcamentarias/${lei.id}`);
    const rv = await preencherEEnviar(page, "guardar-versao-do-projeto", [
      { sel: 'select[name="propostaId"]', valor: proposta.id, tipo: "select" },
      { sel: 'select[name="tipo"]', valor: "ENCAMINHADO", tipo: "select" },
      { sel: 'input[name="dataDoEncaminhamento"]', valor: "2026-09-30", tipo: "data" },
      { sel: 'input[name="competenciaDaRemessa"]', valor: "2026-09", tipo: "data" },
      { sel: 'input[name="documento"]', valor: "Mensagem 31/2026 do Executivo à Câmara (fictícia)" },
      { sel: 'input[name="fundamento"]', valor: "Encaminhamento do projeto da lei orçamentária de 2027 (fictício)" },
    ]);
    versao = await prisma.versaoDoProjetoDaLoa.findFirst({ where: { leiId: lei.id, propostaOrcamentariaId: proposta.id }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
    conferir(rv.tipo === "ok" && versao !== null, `versão do projeto capturada pela tela com a proposta "${proposta.descricao}" (${rv.texto.slice(0, 120)})`);
  } else conferir(true, `versão ${String(versao.numero)} já capturada (corrida anterior)`);
  if (versao === null) throw new Error("a versão não foi capturada");

  const dotacoes = await prisma.dotacaoDoProjetoDaLoa.findMany({ where: { versaoId: versao.id }, select: { id: true, valor: true, linhaDaPropostaId: true } });
  const linhasDaProposta = await prisma.linhaDeDespesaDaProposta.findMany({ where: { propostaOrcamentariaId: proposta.id }, select: { id: true, valorProjetado: true, fichaDeOrigem: { select: { numero: true } }, ajustes: { select: { id: true, valor: true, criadoEm: true } } } });
  const porId = new Map(linhasDaProposta.map((l) => [l.id, l]));
  const versaoCriada = await prisma.versaoDoProjetoDaLoa.findUniqueOrThrow({ where: { id: versao.id }, select: { criadoEm: true } });
  /** O ajuste guarda o VALOR NOVO da linha: vale o último (por data, depois id). Recalculado aqui, não pelo serviço. */
  const ultimo = (projetado: Decimal.Value, ajustes: readonly { id: string; valor: Decimal.Value; criadoEm: Date }[]): Decimal => {
    const u = [...ajustes].sort((x, y) => x.criadoEm.getTime() - y.criadoEm.getTime() || (x.id < y.id ? -1 : 1)).pop();
    return new Decimal((u?.valor ?? projetado).toString());
  };
  /** Valor da linha na hora da captura: o último ajuste gravado até a captura, ou o projetado. */
  const naCaptura = (id: string): Decimal => {
    const l = porId.get(id);
    if (l === undefined) return new Decimal(Number.NaN);
    return ultimo(l.valorProjetado.toString(), l.ajustes.filter((a) => a.criadoEm <= versaoCriada.criadoEm).map((a) => ({ id: a.id, valor: a.valor.toString(), criadoEm: a.criadoEm })));
  };
  const ligadas = dotacoes.filter((d) => d.linhaDaPropostaId !== null);
  const valoresBatem = ligadas.every((d) => naCaptura(d.linhaDaPropostaId!).equals(d.valor.toString()));
  const somaDotacoes = dotacoes.reduce((t, d) => t.plus(d.valor.toString()), new Decimal(0));
  conferir(dotacoes.length > 0 && ligadas.length === dotacoes.length && valoresBatem,
    `as ${String(dotacoes.length)} dotações da versão apontam uma linha da proposta, e o valor de cada uma é o da linha na captura (soma ${br(somaDotacoes)})`);
  const t0 = await irPara(n, page, `/planejamento/leis-orcamentarias/${lei.id}`);
  conferir(/da proposta/i.test(t0) && (await page.$("[data-proposta-da-versao]")) !== null, "a tela da LOA mostra a versão com a proposta de origem");

  // Quatro linhas de ficha no projeto, das maiores (a redução de 1.000 não deixa nenhuma negativa).
  const candidatas = ligadas
    .map((d) => ({ id: d.linhaDaPropostaId!, valor: new Decimal(d.valor.toString()), ficha: porId.get(d.linhaDaPropostaId!)?.fichaDeOrigem?.numero ?? null }))
    .filter((c) => c.ficha !== null && c.valor.greaterThan(20000))
    .sort((a, b) => (a.ficha ?? 0) - (b.ficha ?? 0));
  if (candidatas.length < 4) throw new Error("a proposta não tem quatro linhas de ficha acima de 20.000 no projeto");
  const [A, B, C, Dd] = candidatas.slice(0, 4) as [typeof candidatas[number], typeof candidatas[number], typeof candidatas[number], typeof candidatas[number]];

  // ── 2. um ajuste DEPOIS da captura não muda a versão ──
  const dotC = ligadas.find((d) => d.linhaDaPropostaId === C.id)!;
  const ajustesDeC = await prisma.ajusteDeDespesaDaProposta.count({ where: { linhaId: C.id } });
  const valorDeHojeC = (): Promise<Decimal> => prisma.linhaDeDespesaDaProposta.findUniqueOrThrow({ where: { id: C.id }, select: { valorProjetado: true, ajustes: { select: { id: true, valor: true, criadoEm: true } } } })
    .then((l) => ultimo(l.valorProjetado.toString(), l.ajustes.map((a) => ({ id: a.id, valor: a.valor.toString(), criadoEm: a.criadoEm }))));
  const jaAjustada = (await valorDeHojeC()).minus(C.valor).equals(777);
  if (!jaAjustada) {
    await irPara(n, page, `/planejamento/proposta-orcamentaria/${proposta.id}?editar=${C.id}`);
    const ra = await preencherEEnviar(page, 'form[data-acao="ajustar-linha"]', [
      { sel: 'input[name="valor"]', valor: br(C.valor.plus(777)) },
      { sel: 'input[name="motivo"]', valor: "Reestimativa depois do envio do projeto (fictícia)" },
    ]);
    conferir(ra.tipo === "ok" && (await valorDeHojeC()).minus(C.valor).equals(777), `linha da ficha ${String(C.ficha)} alterada pela tela depois da captura: ${br(C.valor)} → ${br(C.valor.plus(777))} (${ra.texto.slice(0, 60)}; ajustes antes ${String(ajustesDeC)})`);
  } else conferir(true, `linha da ficha ${String(C.ficha)} já alterada depois da captura (corrida anterior)`);
  const dotCDepois = await prisma.dotacaoDoProjetoDaLoa.findUniqueOrThrow({ where: { id: dotC.id }, select: { valor: true } });
  conferir(new Decimal(dotCDepois.valor.toString()).equals(dotC.valor.toString()) && (await prisma.dotacaoDoProjetoDaLoa.count({ where: { versaoId: versao.id } })) === dotacoes.length,
    `a versão capturada não muda com o ajuste posterior: a dotação da ficha ${String(C.ficha)} segue ${br(dotC.valor.toString())}, e a versão segue com ${String(dotacoes.length)} dotações`);

  // ── 3. as três emendas ──
  const emendas = await prisma.emendaAoOrcamento.findMany({ where: { propostaOrcamentariaId: proposta.id }, select: { id: true, numero: true, objetivo: true, sancao: { select: { id: true } } } });
  const registrar = async (objetivo: string, itens: string): Promise<string> => {
    const ja = emendas.find((e) => e.objetivo === objetivo);
    if (ja !== undefined) return ja.id;
    await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
    const r = await preencherEEnviar(page, "cadastrar-emenda", [
      { sel: 'input[name="data"]', valor: "05/10/2026" },
      { sel: 'input[name="vereador"]', valor: "Vereadora da Comissão de Finanças (fictícia)" },
      { sel: 'input[name="objetivo"]', valor: objetivo },
      { sel: 'textarea[name="justificativa"]', valor: "Prioridade definida na comissão (fictício)" },
      { sel: 'textarea[name="textoJuridico"]', valor: "Altera as dotações indicadas (fictício)" },
      { sel: 'textarea[name="itens"]', valor: itens },
    ]);
    const e = await prisma.emendaAoOrcamento.findFirst({ where: { propostaOrcamentariaId: proposta.id, objetivo }, select: { id: true, numero: true } });
    conferir(r.tipo === "ok" && e !== null, `emenda "${objetivo}" registrada pela tela (${r.texto.slice(0, 60)})`);
    if (e === null) throw new Error(`emenda "${objetivo}" não gravada: ${r.texto}`);
    return e.id;
  };
  const sancionar = async (id: string, resultado: "APROVADA" | "REJEITADA"): Promise<void> => {
    const feita = await prisma.sancaoDaEmenda.findFirst({ where: { emendaId: id }, select: { resultado: true } });
    if (feita !== null) {
      conferir(feita.resultado === resultado, `emenda já sancionada (corrida anterior) com o resultado ${feita.resultado}`);
      return;
    }
    const numero = (await prisma.emendaAoOrcamento.findUniqueOrThrow({ where: { id }, select: { numero: true } })).numero;
    await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
    const r = await preencherEEnviar(page, `form[data-acao="sancionar-emenda"][data-emenda="${id}"]`, [
      { sel: `input[name="resultado"][value="${resultado}"]`, valor: "sim", tipo: "marcar" },
      { sel: 'input[name="data"]', valor: "08/10/2026" },
      { sel: 'input[name="ato"]', valor: "Votação em plenário de 08/10/2026 (fictícia)" },
    ], `sancionar-emenda-${String(numero)}`);
    conferir(r.tipo === "ok" && (await prisma.sancaoDaEmenda.count({ where: { emendaId: id } })) === 1, `emenda ${resultado === "APROVADA" ? "aprovada" : "rejeitada"} pela tela (${r.texto.slice(0, 60)})`);
  };
  const e1 = await registrar("Remanejar para a ficha A (fictício)", `${String(A.ficha)}; 1.000,00\n${String(Dd.ficha)}; -1.000,00`);
  const e2 = await registrar("Reforçar a ficha B (fictício)", `${String(B.ficha)}; 500,00`);
  const e3 = await registrar("Reforçar a ficha C (fictício)", `${String(C.ficha)}; 300,00`);
  await sancionar(e1, "APROVADA");
  await sancionar(e2, "REJEITADA");
  conferir((await prisma.sancaoDaEmenda.count({ where: { emendaId: e3 } })) === 0, "a terceira emenda fica sem sanção (aguardando)");

  // ── 4. o comparativo, célula a célula ──
  await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
  const base = await page.$eval("[data-comparativo-das-emendas]", (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(new RegExp(`versão ${String(versao.numero)} do projeto`).test(base), `o comparativo diz que a base é a versão ${String(versao.numero)} guardada (não o caminho "sem versão")`);
  const celulas = async (ficha: number | null): Promise<string[]> => page.$$eval(`[data-linha-do-comparativo="ficha ${String(ficha)}"] td`, (tds) => tds.map((t) => (t.textContent ?? "").trim())).catch(() => []);
  // colunas: dotação | no projeto | já no projeto | aprovadas | rejeitadas | aguardando | esperado | hoje | outros ajustes
  const casos = [
    { nome: "A (emenda aprovada)", l: A, aprov: 1000, rej: 0, pend: 0, hoje: A.valor.plus(1000) },
    { nome: "D (aprovada, redução)", l: Dd, aprov: -1000, rej: 0, pend: 0, hoje: Dd.valor.minus(1000) },
    { nome: "B (emenda rejeitada)", l: B, aprov: 0, rej: 500, pend: 0, hoje: B.valor },
    { nome: "C (emenda pendente e ajuste fora das emendas)", l: C, aprov: 0, rej: 0, pend: 300, hoje: C.valor.plus(777) },
  ];
  for (const c of casos) {
    const cs = await celulas(c.l.ficha);
    const esperado = c.l.valor.plus(c.aprov);
    const outros = c.hoje.minus(esperado);
    const quer = [br(c.l.valor), br(0), br(c.aprov), br(c.rej), br(c.pend), br(esperado), br(c.hoje), br(outros)];
    const tem = cs.slice(1).map(somenteNumero);
    const ok = cs.length === 9 && quer.every((q, i) => tem[i] === q);
    conferir(ok, `ficha ${String(c.l.ficha)} ${c.nome}: projeto ${quer[0]}, aprovadas ${quer[2]}, rejeitadas ${quer[3]}, aguardando ${quer[4]}, esperado ${quer[5]}, hoje ${quer[6]}, outros ajustes ${quer[7]}${ok ? "" : ` — na tela: ${tem.join(" | ")}`}`);
  }
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do projeto da LOA e das emendas, com valores, completo.");
