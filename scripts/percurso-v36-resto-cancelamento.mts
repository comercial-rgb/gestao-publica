import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { formatarMoeda } from "../packages/contracts/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO: O RESTO A PAGAR INSCRITO E O CANCELAMENTO SEM CONTAS INFORMADAS, numa CÓPIA da base fictícia.
 *   1. o administrador encerra 2026 pela tela e as inscrições ficam gravadas;
 *   2. no detalhe de uma inscrição de um empenho que tem as DUAS (processado e não processado), a tela mostra o saldo
 *      do empenho nos dois tipos, iguais aos valores inscritos;
 *   3. o cancelamento é recusado nomeando a falta das contas da operação, e nada é gravado.
 *
 * ⚠️ O CANCELAMENTO EFETIVO NÃO É MEDIDO AQUI, e de propósito: as contas de débito e crédito do cancelamento são decisão
 * contábil do ente (Contabilidade › Roteiros de restos a pagar), e escolhê-las num percurso seria inventar o roteiro.
 * O mecanismo do cancelamento com contas informadas está medido em scripts/smoke-restos-a-pagar-operacoes.ts.
 *
 * ⚠️ SÓ NA CÓPIA: encerrar 2026 trava a competência do ano. Clonar `gestao_publica_esperanca_ficticio` por
 * pg_dump | pg_restore para `gestao_publica_esperanca_ficticio_restos`, provisionar o papel e servi-la na 3011.
 *
 * Uso: PERCURSO_BANCO=<url da cópia> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-resto-cancelamento.mts
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio_restos(\?|$)/.test(URL_BANCO)) throw new Error("Recusado: este percurso encerra o exercício; só roda na cópia gestao_publica_esperanca_ficticio_restos.");
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const prisma = criarPrismaClient(URL_BANCO);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const brl = (v: string): string => `R$ ${formatarMoeda(v).texto}`;

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(180000);
  await entrar(n, page, "admin@cg.pb.gov.br", senha);

  const jaEncerrado = (await prisma.encerramentoExercicio.count({ where: { exercicio: { ano: 2026 } } })) > 0;
  if (!jaEncerrado) {
    await irPara(n, page, "/despesa/restos-a-pagar?exercicio=2026");
    const r = await preencherEEnviar(page, "encerrar-exercicio", [{ sel: 'input[name="confirmacao"]', valor: "2026" }]);
    const qtd = await prisma.inscricaoRestosAPagar.count({ where: { exercicioOrigem: 2026 } });
    conferir(/encerrado/i.test(r.texto) && qtd > 0, `encerramento de 2026 pela tela: "${r.texto.slice(0, 160)}" · ${String(qtd)} inscrição(ões)`);
  } else console.log("(2026 já estava encerrado nesta cópia: o passo 1 foi medido numa corrida anterior)");

  // Um empenho com as DUAS inscrições: é onde a tela tem de mostrar dois saldos diferentes (N=2 nos tipos).
  const inscricoes = await prisma.inscricaoRestosAPagar.findMany({
    where: { exercicioOrigem: 2026 },
    select: { id: true, tipo: true, valorInscrito: true, empenhoId: true, empenho: { select: { numero: true } }, _count: { select: { movimentos: true } } },
  });
  const porEmpenho = new Map<string, typeof inscricoes>();
  for (const i of inscricoes) porEmpenho.set(i.empenhoId, [...(porEmpenho.get(i.empenhoId) ?? []), i]);
  const par = [...porEmpenho.values()].find((g) => g.length === 2 && g.every((i) => i._count.movimentos === 0));
  if (par === undefined) throw new Error("Nenhum empenho com as duas inscrições sem movimento nesta cópia.");
  const proc = par.find((i) => i.tipo === "PROCESSADO")!;
  const naoProc = par.find((i) => i.tipo === "NAO_PROCESSADO")!;

  await irPara(n, page, `/despesa/restos-a-pagar/${proc.id}`);
  const saldo = await page.$eval("[data-saldo-por-tipo]", (e) => (e.textContent ?? "").replace(/\s+/g, " "));
  conferir(
    saldo.includes(`processados ${brl(proc.valorInscrito.toFixed(2))}`) && saldo.includes(`não processados ${brl(naoProc.valorInscrito.toFixed(2))}`),
    `empenho ${proc.empenho.numero}: "${saldo.slice(0, 160)}"`
  );

  const movimentosAntes = await prisma.movimentoRestosAPagar.count();
  const aviso = await page.evaluate(() => document.body.innerText);
  const c = await preencherEEnviar(page, "cancelar-resto", [
    { sel: 'input[name="valor"]', valor: "100,00" },
    { sel: 'textarea[name="motivo"]', valor: "Percurso: cancelamento sem as contas da operação informadas" },
  ]);
  conferir(
    // O aviso antes de tentar: uma operação ("O cancelamento ainda não tem...") ou a lista ("Estas operações ...: pagamento, cancelamento").
    (/O cancelamento ainda não tem contas informadas/.test(aviso) || /Estas operações ainda não têm contas informadas[^.]*cancelamento/.test(aviso)) &&
      /^O cancelamento de restos a pagar processados ainda não tem contas informadas[\s\S]*Nada foi gravado/.test(c.texto.trim()) &&
      (await prisma.movimentoRestosAPagar.count()) === movimentosAntes,
    `cancelamento sem contas recusado com o motivo, nada gravado: "${c.texto.slice(0, 200)}"`
  );
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do resto a pagar e do cancelamento sem contas completo.");
