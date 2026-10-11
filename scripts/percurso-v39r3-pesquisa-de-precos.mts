import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type CampoDoPercurso, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-020, V39-040) — PELA TELA: A PESQUISA DE PREÇOS COM ORIGEM VERIFICÁVEL E O PREÇO ESTIMADO FIXADO.
 *
 * Pré-requisito: a massa da R3 (a pesquisadora de preços; a solicitante de compras só consulta licitações) e a regra do
 * número mínimo de preços carregada do texto oficial (scripts/carregar-regra-da-pesquisa-de-precos.ts).
 *   1. a pesquisadora registra a pesquisa com um item e TRÊS preços, cada um com de onde veio, o dia e o documento;
 *   2. tenta fixar pela mediana descartando o preço de 40 com o motivo: sobram dois, abaixo do mínimo da regra —
 *      recusado com o motivo, nada gravado;
 *   3. fixa de novo com a justificativa do gestor: mediana de 10 e 12 = 11; a tela mostra o método, os preços usados, o
 *      descarte e a justificativa;
 *   4. quem só consulta licitações vê os preços e o preço fixado e não recebe o formulário.
 * GRAVA (base de ensaio). Cada corrida usa um número novo.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3012" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const senha = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
if ((await prisma.regraDaPesquisaDePrecos.count()) === 0) throw new Error("A regra do número mínimo de preços não está carregada nesta base.");
const material = await prisma.material.findFirst({ where: { codigo: "R3EXP001" }, select: { id: true, descricaoSucinta: true } });
if (material === null) throw new Error("A massa da R3 não tem o material R3EXP001.");
const pessoas = await prisma.pessoa.findMany({ where: { tipo: "JURIDICA" }, orderBy: { criadoEm: "asc" }, take: 3, select: { id: true, documento: true } });
if (pessoas.length !== 3) throw new Error("São precisas três pessoas jurídicas no cadastro.");
const marca = String(Date.now()).slice(-5);
const numero = `PP-R3-${marca}`;

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. a pesquisadora registra ──
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "pesquisa.precos@ficticio.local", senha);
  await irPara(n, pa, "/licitacoes/pesquisas-de-precos");
  const precos = [["10,00", "FORNECEDORES", "Ofício de cotação 1"], ["12,00", "CONTRATACOES_SIMILARES", "Contrato 22/2026 do município vizinho"], ["40,00", "FORNECEDORES", "Ofício de cotação 3"]] as const;
  const campos: CampoDoPercurso[] = [
    { sel: 'input[name="numero"]', valor: numero },
    { sel: 'input[name="objeto"]', valor: "Papel A4 para o semestre (ensaio)" },
    { sel: 'input[name="data"]', valor: "2026-09-10", tipo: "data" },
    { sel: "itens.0.materialId", valor: material.id, busca: material.descricaoSucinta.slice(0, 10), tipo: "referencia" },
    { sel: 'input[name="itens.0.quantidade"]', valor: "500" },
  ];
  precos.forEach(([valor, parametro, documento], j) => {
    campos.push(
      { sel: `itens.0.cotacoes.${String(j)}.fornecedorId`, valor: pessoas[j]!.id, busca: pessoas[j]!.documento, tipo: "referencia" },
      { sel: `input[name="itens.0.cotacoes.${String(j)}.valorUnitario"]`, valor },
      { sel: `input[name="itens.0.cotacoes.${String(j)}.origem"]`, valor: "proposta formal" },
      { sel: `select[name="itens.0.cotacoes.${String(j)}.parametro"]`, valor: parametro, tipo: "select" },
      { sel: `input[name="itens.0.cotacoes.${String(j)}.dataDoPreco"]`, valor: "2026-09-05", tipo: "data" },
      { sel: `input[name="itens.0.cotacoes.${String(j)}.documento"]`, valor: documento },
    );
  });
  const r = await preencherEEnviar(pa, "criar-pesquisa", campos);
  const p = await prisma.pesquisaDePrecos.findUnique({ where: { numero }, select: { id: true, itens: { select: { id: true, cotacoes: { select: { id: true, valorUnitario: true, parametro: true, documento: true } } } } } });
  const cot = p?.itens[0]?.cotacoes ?? [];
  conferir(r.tipo === "ok" && cot.length === 3 && cot.every((c) => c.parametro !== null && (c.documento ?? "") !== ""), `pesquisa ${numero} registrada pela tela com três preços de origem informada (${r.texto.slice(0, 60)})`);
  if (p === null || p.itens[0] === undefined) throw new Error("sem pesquisa");
  const itemId = p.itens[0].id;
  const c40 = cot.find((c) => c.valorUnitario.toString() === "40")?.id ?? "";
  const U = `/licitacoes/pesquisas-de-precos/${p.id}`;
  const fixar = async (justificativa: string) => {
    await irPara(n, pa, U);
    return preencherEEnviar(pa, `form[data-acao="fixar-preco-estimado"][data-item="${itemId}"]`, [
      { sel: 'select[name="metodo"]', valor: "MEDIANA", tipo: "select" },
      { sel: `input[name="descartar"][value="${c40}"]`, valor: "sim", tipo: "marcar" },
      { sel: `input[name="motivo.${c40}"]`, valor: "Excessivamente elevado: mais que o triplo dos demais" },
      ...(justificativa === "" ? [] : [{ sel: 'input[name="justificativaMenosPrecos"]', valor: justificativa }]),
    ], `fixar-preco-${itemId}`);
  };
  // ── 2. abaixo do mínimo, sem justificativa ──
  const recusa = await fixar("");
  conferir(recusa.tipo === "erro" && /usaria 2 preço\(s\), e a regra pede 3 ou mais/.test(recusa.texto) && (await prisma.precoEstimadoDoItem.count({ where: { itemId } })) === 0, `descartado o 40, dois preços sem justificativa: recusado com o motivo (${recusa.texto.slice(0, 90)})`);
  // ── 3. com a justificativa ──
  const ok = await fixar("Só dois fornecedores no mercado local, conforme consulta registrada no processo");
  const fixado = await prisma.precoEstimadoDoItem.findFirst({ where: { itemId }, select: { valorEstimado: true, precosUsados: true, metodo: true, criadoPor: true } });
  conferir(ok.tipo === "ok" && fixado?.valorEstimado.toString() === "11" && fixado.precosUsados === 2 && fixado.metodo === "MEDIANA" && fixado.criadoPor === "pesquisa.precos@ficticio.local", `fixado pela tela: mediana de 10 e 12 = 11 (${ok.texto.slice(0, 80)})`);
  await irPara(n, pa, U);
  const textoFixado = await pa.$eval(`[data-item-da-pesquisa="${itemId}"] [data-preco-fixado]`, (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(/R\$ 11,00, pela mediana de 2 preço\(s\), 1 descartado\(s\).*Justificativa: Só dois fornecedores/.test(textoFixado), `a tela mostra o método, os preços, o descarte e a justificativa (${textoFixado.slice(0, 120)})`);
  await ctxA.close();

  // ── 4. quem só consulta ──
  const ctxB = await nav.createBrowserContext();
  const pb = await ctxB.newPage();
  pb.setDefaultTimeout(300000);
  await entrar(n, pb, "solicitante.compras@ficticio.local", senha);
  await irPara(n, pb, U);
  const vePrecos = (await pb.$$(`[data-item-da-pesquisa="${itemId}"] [data-preco]`)).length === 3;
  const temForm = (await pb.$('form[data-acao="fixar-preco-estimado"]')) !== null;
  conferir(vePrecos && !temForm, "quem só consulta vê os três preços com a origem e o preço fixado, sem o formulário");
  // à mão: 500 × 11,00 = 5.500,00 — a estimativa é a do preço fixado, não a média das três cotações (500 × 20,67)
  const estimativa = await pb.$eval("body", (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(/Estimativa pelo preço fixado.{0,40}5\.500,00/.test(estimativa) && !/10\.333,33/.test(estimativa), `a estimativa da pesquisa é a do preço fixado (${/Estimativa pelo preço fixado.{0,40}/.exec(estimativa)?.[0] ?? "ausente"})`);
  await ctxB.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da pesquisa de preços completo.");
