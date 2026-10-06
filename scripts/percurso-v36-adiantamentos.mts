import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarM05Deps } from "../modules/m05-despesa/adapter-prisma.js";
import { roteiroEmpenho } from "../modules/m01-core-contabil/roteiros.js";
import { empenhar } from "../modules/m05-despesa/servico.js";
import { meioDiaCivil } from "../packages/datas/index.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V36 — PERCURSO DE DIÁRIAS E SUPRIMENTO DE FUNDOS pela tela, depois da guarda da devolução (V35).
 *
 * O percurso da V32 (`demonstracao/percurso-v32-areas.ts`) aprovava uma prestação com 50,00 devolvidos sem
 * nenhuma anulação — exatamente o que a V35 passou a recusar —, e dependia de um clone de outra época. Este
 * refaz o caminho na base fictícia e afirma os DOIS lados da guarda:
 *   1. diária concedida pela tela (destino, quantidade, valor unitário), com o controle 7/8 lançado;
 *   2. a diária aparece no portal da transparência, com o CPF mascarado;
 *   3. suprimento concedido; prestação com devolução SEM anulação: a aprovação é RECUSADA com o motivo;
 *   4. a prestação é rejeitada com parecer, uma nova (sem devolução) é apresentada e aprovada, e o
 *      lançamento de baixa inverte o controle da concessão;
 *   5. a prestação da diária é aprovada e a tela mostra as duas como comprovadas.
 * PREPARAÇÃO por serviço, dita aqui: os dois empenhos em nome dos beneficiários (o empenho pela tela tem
 * percurso próprio).
 *
 * Uso: PERCURSO_BANCO=<url do banco servido> BASE=http://localhost:3011 SEED_ADMIN_SENHA=... \
 *      npx tsx scripts/percurso-v36-adiantamentos.mts
 * GRAVA. Recusa a 3010 e banco que não seja o fictício de Esperança.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const URL_BANCO = process.env["PERCURSO_BANCO"] ?? "";
if (!/\/gestao_publica_esperanca_ficticio(\?|$)/.test(URL_BANCO)) {
  throw new Error("Recusado: PERCURSO_BANCO tem de ser o banco gestao_publica_esperanca_ficticio que a BASE serve.");
}
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
if (senha === "") throw new Error("Senha do percurso ausente (PERCURSO_SENHA ou SEED_ADMIN_SENHA).");

const SUPRIDO = "52998224725";
const VIAJANTE = "11144477735";
const prisma = criarPrismaClient(URL_BANCO);
const sufixo = String(Date.now()).slice(-6);

const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

/** As pernas de um lançamento: para conferir que a baixa inverte a concessão. */
async function pernas(lancamentoId: string | null): Promise<readonly string[]> {
  if (lancamentoId === null) return [];
  const ps = await prisma.partidaContabil.findMany({
    where: { lancamentoId },
    select: { tipo: true, valor: true, conta: { select: { codigo: true } } },
  });
  return ps.map((x) => `${x.tipo} ${x.conta.codigo} ${x.valor.toFixed(2)}`).sort();
}
const inverter = (ps: readonly string[]): readonly string[] =>
  ps.map((s) => (s.startsWith("DEBITO") ? s.replace("DEBITO", "CREDITO") : s.replace("CREDITO", "DEBITO"))).sort();

async function empenhoPara(elemento: string, credor: string, numero: string, valor: string): Promise<void> {
  const ficha = await prisma.fichaOrcamentaria.findFirst({
    where: { exercicio: 2026, naturezaDespesa: { codigoCompleto: elemento } },
    orderBy: { numero: "asc" },
    select: { id: true },
  });
  if (ficha === null) throw new Error(`A base não tem ficha ${elemento} de 2026.`);
  await empenhar(
    {
      fichaId: ficha.id, numero, tipo: "ESTIMATIVO", valor, data: meioDiaCivil("2026-10-01"),
      credorCpfCnpj: credor, historico: `Empenho do percurso de adiantamentos ${sufixo}`,
      categoriaOrdemCronologica: "PRESTACAO_SERVICOS", criadoPor: usuario,
    },
    roteiroEmpenho(),
    criarM05Deps(prisma)
  );
}

const nav = await lancarNavegadorDoPercurso();
try {
  console.log("0. preparação por serviço: os empenhos em nome dos beneficiários");
  const neDiaria = `2026NE8${sufixo}`;
  const neSuprimento = `2026NE9${sufixo}`;
  await empenhoPara("339014", VIAJANTE, neDiaria, "800.00");
  await empenhoPara("339039", SUPRIDO, neSuprimento, "800.00");

  const page = await nav.newPage();
  page.setDefaultTimeout(120000);
  await entrar(n, page, usuario, senha);

  console.log("1. a diária, pela tela");
  const numDiaria = `DIA-${sufixo}`;
  const t1 = await irPara(n, page, "/despesa/adiantamentos");
  conferir(/diárias e suprimento de fundos/i.test(t1), "a tela de diárias e suprimento abre");
  await page.select('form[data-painel="conceder-adiantamento"] select[name="especie"]', "DIARIA");
  const r1 = await preencherEEnviar(page, 'form[data-painel="conceder-adiantamento"]', [
    { sel: 'input[name="numero"]', valor: numDiaria },
    { sel: "empenhoId", valor: "", tipo: "referencia", busca: neDiaria },
    { sel: 'input[name="beneficiarioNome"]', valor: "Servidor viajante do percurso" },
    { sel: 'input[name="beneficiarioDocumento"]', valor: VIAJANTE },
    { sel: 'input[name="finalidade"]', valor: "Participação em capacitação do Tribunal de Contas" },
    { sel: 'input[name="destino"]', valor: "João Pessoa" },
    { sel: 'input[name="diaInicio"]', valor: "2026-10-02", tipo: "data" },
    { sel: 'input[name="diaFim"]', valor: "2026-10-04", tipo: "data" },
    { sel: 'input[name="quantidadeDeDiarias"]', valor: "2,5" },
    { sel: 'input[inputmode="decimal"]', valor: "200,00", indice: 1 },
    { sel: 'input[inputmode="decimal"]', valor: "500,00", indice: 2 },
    { sel: 'input[name="atoAutorizativo"]', valor: "Portaria de diárias do percurso" },
    { sel: 'input[name="diaPrazoDePrestacao"]', valor: "2026-10-30", tipo: "data" },
    { sel: 'input[name="diaConcessao"]', valor: "2026-10-02", tipo: "data" },
  ], "conceder-adiantamento");
  conferir(r1.tipo === "ok", `diária concedida pela tela (${r1.texto.slice(0, 90)})`);
  const diaria = await prisma.concessaoDeAdiantamento.findFirst({
    where: { numero: numDiaria },
    select: { id: true, valor: true, destino: true, quantidadeDeDiarias: true, lancamentoId: true },
  });
  conferir(
    diaria?.valor.toFixed(2) === "500.00" && diaria.destino === "João Pessoa" && diaria.quantidadeDeDiarias?.toFixed(1) === "2.5",
    "a diária está gravada: 2,5 diárias para João Pessoa, 500,00"
  );
  const concDiaria = await pernas(diaria?.lancamentoId ?? null);
  conferir(
    concDiaria.some((s) => /^DEBITO 7\./.test(s)) && concDiaria.some((s) => /^CREDITO 8\./.test(s)),
    `o controle da responsabilidade foi lançado (${concDiaria.join(" | ")})`
  );

  console.log("2. a diária no portal da transparência");
  const t2 = await irPara(n, page, "/transparencia/diarias?exercicio=2026");
  conferir(/joão pessoa/i.test(t2) && /servidor viajante do percurso/i.test(t2), "a diária aparece no portal assim que concedida");
  conferir(!t2.includes(VIAJANTE), "o CPF do servidor não aparece inteiro no portal");

  console.log("3. o suprimento, e a devolução sem anulação");
  const numSup = `SUP-${sufixo}`;
  await irPara(n, page, "/despesa/adiantamentos");
  await page.select('form[data-painel="conceder-adiantamento"] select[name="especie"]', "SUPRIMENTO_DE_FUNDOS");
  const r3 = await preencherEEnviar(page, 'form[data-painel="conceder-adiantamento"]', [
    { sel: 'input[name="numero"]', valor: numSup },
    { sel: "empenhoId", valor: "", tipo: "referencia", busca: neSuprimento },
    { sel: 'input[name="beneficiarioNome"]', valor: "Servidora suprida do percurso" },
    { sel: 'input[name="beneficiarioDocumento"]', valor: SUPRIDO },
    { sel: 'input[name="finalidade"]', valor: "Pequenas despesas de pronto pagamento da secretaria" },
    { sel: 'input[name="diaInicio"]', valor: "2026-10-02", tipo: "data" },
    { sel: 'input[name="diaFim"]', valor: "2026-10-04", tipo: "data" },
    { sel: 'input[inputmode="decimal"]', valor: "500,00", indice: 0 },
    { sel: 'input[name="atoAutorizativo"]', valor: "Decreto de suprimento do percurso" },
    { sel: 'input[name="diaPrazoDePrestacao"]', valor: "2026-10-30", tipo: "data" },
    { sel: 'input[name="diaConcessao"]', valor: "2026-10-02", tipo: "data" },
  ], "conceder-adiantamento");
  conferir(r3.tipo === "ok", `suprimento concedido pela tela (${r3.texto.slice(0, 90)})`);
  const sup = await prisma.concessaoDeAdiantamento.findFirst({ where: { numero: numSup }, select: { id: true, lancamentoId: true } });
  const concSup = await pernas(sup?.lancamentoId ?? null);

  await irPara(n, page, "/despesa/adiantamentos");
  const r4 = await preencherEEnviar(page, `form[data-acao="registrar-prestacao"][data-concessao="${numSup}"]`, [
    { sel: 'input[inputmode="decimal"]', valor: "450,00", indice: 0 },
    { sel: 'input[inputmode="decimal"]', valor: "50,00", indice: 1 },
    { sel: 'input[name="relatorio"]', valor: "Notas de pronto pagamento e guia de devolução do saldo." },
    { sel: 'input[name="diaApresentacao"]', valor: "2026-10-05", tipo: "data" },
  ], "registrar-prestacao");
  conferir(r4.tipo === "ok", `prestação com 50,00 devolvidos registrada (${r4.texto.slice(0, 70)})`);
  const prest1 = await prisma.prestacaoDeContasDoAdiantamento.findFirst({ where: { concessaoId: sup?.id ?? "" }, orderBy: { criadoEm: "desc" }, select: { id: true } });

  await irPara(n, page, "/despesa/adiantamentos");
  const r5 = await preencherEEnviar(page, `form[data-acao="decidir-prestacao"][data-concessao="${numSup}"]`, [
    { sel: 'select[name="decisao"]', valor: "aprovar", tipo: "select" },
    { sel: 'input[name="diaDecisao"]', valor: "2026-10-05", tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Notas conferidas e devolução declarada." },
  ], "decidir-prestacao");
  conferir(r5.tipo === "erro" && /a devolução não voltou ao caixa/.test(r5.texto), `aprovar com devolução sem anulação é recusado, com o motivo (${r5.texto.slice(0, 120)})`);
  const semDecisao = await prisma.decisaoDaPrestacaoDoAdiantamento.count({ where: { prestacaoId: prest1?.id ?? "" } });
  conferir(semDecisao === 0, "a recusa não gravou decisão");

  console.log("4. rejeitar, apresentar de novo sem devolução, aprovar");
  await irPara(n, page, "/despesa/adiantamentos");
  const r6 = await preencherEEnviar(page, `form[data-acao="decidir-prestacao"][data-concessao="${numSup}"]`, [
    { sel: 'select[name="decisao"]', valor: "rejeitar", tipo: "select" },
    { sel: 'input[name="diaDecisao"]', valor: "2026-10-05", tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "A devolução não foi recolhida ao caixa; reapresentar." },
  ], "decidir-prestacao");
  conferir(r6.tipo === "ok", `rejeição gravada com parecer (${r6.texto.slice(0, 70)})`);
  await irPara(n, page, "/despesa/adiantamentos");
  const r7 = await preencherEEnviar(page, `form[data-acao="registrar-prestacao"][data-concessao="${numSup}"]`, [
    { sel: 'input[inputmode="decimal"]', valor: "500,00", indice: 0 },
    { sel: 'input[name="relatorio"]', valor: "Notas de pronto pagamento cobrindo o valor inteiro concedido." },
    { sel: 'input[name="diaApresentacao"]', valor: "2026-10-05", tipo: "data" },
  ], "registrar-prestacao");
  conferir(r7.tipo === "ok", `nova prestação, sem devolução (${r7.texto.slice(0, 70)})`);
  await irPara(n, page, "/despesa/adiantamentos");
  const r8 = await preencherEEnviar(page, `form[data-acao="decidir-prestacao"][data-concessao="${numSup}"]`, [
    { sel: 'select[name="decisao"]', valor: "aprovar", tipo: "select" },
    { sel: 'input[name="diaDecisao"]', valor: "2026-10-05", tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Notas conferidas, valor integralmente comprovado." },
  ], "decidir-prestacao");
  conferir(r8.tipo === "ok", `aprovação gravada (${r8.texto.slice(0, 70)})`);
  const aprov = await prisma.decisaoDaPrestacaoDoAdiantamento.findFirst({
    where: { prestacao: { concessaoId: sup?.id ?? "" }, aprovada: true },
    select: { lancamentoId: true },
  });
  const baixaSup = await pernas(aprov?.lancamentoId ?? null);
  conferir(baixaSup.length > 0 && JSON.stringify(baixaSup) === JSON.stringify(inverter(concSup)), `a baixa inverte o controle da concessão (${baixaSup.join(" | ")})`);

  console.log("5. a prestação da diária");
  await irPara(n, page, "/despesa/adiantamentos");
  const r9 = await preencherEEnviar(page, `form[data-acao="registrar-prestacao"][data-concessao="${numDiaria}"]`, [
    { sel: 'input[inputmode="decimal"]', valor: "500,00", indice: 0 },
    { sel: 'input[name="relatorio"]', valor: "Certificado da capacitação e bilhetes de viagem apresentados." },
    { sel: 'input[name="diaApresentacao"]', valor: "2026-10-05", tipo: "data" },
  ], "registrar-prestacao");
  conferir(r9.tipo === "ok", `prestação da diária registrada (${r9.texto.slice(0, 70)})`);
  await irPara(n, page, "/despesa/adiantamentos");
  const r10 = await preencherEEnviar(page, `form[data-acao="decidir-prestacao"][data-concessao="${numDiaria}"]`, [
    { sel: 'select[name="decisao"]', valor: "aprovar", tipo: "select" },
    { sel: 'input[name="diaDecisao"]', valor: "2026-10-05", tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Certificado e bilhetes conferidos." },
  ], "decidir-prestacao");
  conferir(r10.tipo === "ok", `aprovação da diária gravada (${r10.texto.slice(0, 70)})`);
  const aprovD = await prisma.decisaoDaPrestacaoDoAdiantamento.findFirst({
    where: { prestacao: { concessaoId: diaria?.id ?? "" }, aprovada: true },
    select: { lancamentoId: true },
  });
  const baixaD = await pernas(aprovD?.lancamentoId ?? null);
  conferir(baixaD.length > 0 && JSON.stringify(baixaD) === JSON.stringify(inverter(concDiaria)), "a baixa da diária inverte o controle da concessão");
  const t5 = await irPara(n, page, "/despesa/adiantamentos");
  conferir(
    // O texto lido da tela vem em minúsculas: a comparação ignora a caixa.
    new RegExp(`${numSup}[\\s\\S]*?comprovada`, "i").test(t5) && new RegExp(`${numDiaria}[\\s\\S]*?comprovada`, "i").test(t5),
    "recarga: as duas concessões aparecem como comprovadas"
  );
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso de diárias e suprimento completo.");
