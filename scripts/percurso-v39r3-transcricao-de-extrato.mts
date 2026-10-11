import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R3 (R3-015, V39-029) — PELA TELA: A LINHA DE EXTRATO TRANSCRITA E REVISADA POR OUTRA PESSOA.
 *
 * Pré-requisito: a massa da R3 (o auxiliar e a conferente da tesouraria). Conta FIC-PM-500 (a FIC-CM-500 não é tocada).
 *   1. o auxiliar chega pela conciliação, transcreve DUAS linhas com o documento de suporte; a tela mostra as duas
 *      "aguardando revisão" e não lhe oferece revisar o que ele digitou;
 *   2. a conferente revisa: confirma uma (passa a valer como extrato) e marca a outra como divergente (não vale);
 *   3. repetir a mesma linha sem a declaração é recusado com o motivo;
 *   4. quem só consulta a tesouraria vê as linhas e não recebe formulário.
 * GRAVA (base de ensaio). Os valores mudam a cada corrida, para a repetição não barrar a corrida seguinte.
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
const conta = await prisma.contaBancaria.findFirst({ where: { codigo: "FIC-PM-500" }, select: { id: true } });
if (conta === null) throw new Error("A conta FIC-PM-500 não está nesta base.");
const marca = String(Date.now()).slice(-4);
const v1 = `1${marca}.37`; // saída
const v2 = `2${marca}.15`; // entrada
const dia = "2026-09-30";
const rota = `/financeiro/conciliacao/transcricao?conta=${conta.id}`;
const DOC = `Extrato impresso da agência, folha ${marca} (ensaio)`;
const linhaDoBanco = (valor: string) => prisma.lancamentoExtrato.findFirst({ where: { contaBancariaId: conta.id, valor, extrato: { origem: "DIGITADO" } }, orderBy: { criadoEm: "desc" }, select: { id: true, transcricao: { select: { id: true, criadoPor: true, documentoDeSuporte: true, revisao: { select: { resultado: true, criadoPor: true } } } } } });

const nav = await lancarNavegadorDoPercurso();
try {
  // ── 1. o auxiliar transcreve ──
  const ctxA = await nav.createBrowserContext();
  const pa = await ctxA.newPage();
  pa.setDefaultTimeout(300000);
  await entrar(n, pa, "auxiliar.tesouraria@ficticio.local", senha);
  await irPara(n, pa, "/financeiro/conciliacao");
  conferir((await pa.$("a[data-link-transcricao]")) !== null, "a conciliação oferece transcrever linhas quando não há arquivo do banco");
  await irPara(n, pa, rota);
  // O botão "Mais uma linha" só responde depois da hidratação; a chave do comando pronta é o sinal (medido: o clique
  // antes dela, em modo dev, não acrescentava a linha e o percurso esperava em vão).
  await pa.waitForSelector('form[data-acao="transcrever-extrato"] input[name="__chave"][data-chave-de-comando="pronta"]', { timeout: 120000 });
  await pa.click('form[data-acao="transcrever-extrato"] [data-acao="mais-uma-linha"]');
  await pa.waitForSelector('[data-linha-da-transcricao="2"]');
  const r = await preencherEEnviar(pa, "transcrever-extrato", [
    { sel: 'input[name="documentoDeSuporte"]', valor: DOC },
    { sel: 'input[name="linhaData"]', valor: dia, tipo: "data", indice: 0 },
    { sel: 'select[name="linhaNatureza"]', valor: "DEBITO", tipo: "select", indice: 0 },
    { sel: '[data-mascara="valor"]', valor: v1.replace(".", ","), indice: 0 },
    { sel: 'input[name="linhaHistorico"]', valor: `TARIFA ENSAIO ${marca}`, indice: 0 },
    { sel: 'input[name="linhaData"]', valor: dia, tipo: "data", indice: 1 },
    { sel: 'select[name="linhaNatureza"]', valor: "CREDITO", tipo: "select", indice: 1 },
    { sel: '[data-mascara="valor"]', valor: v2.replace(".", ","), indice: 1 },
    { sel: 'input[name="linhaHistorico"]', valor: `DEPOSITO ENSAIO ${marca}`, indice: 1 },
  ]);
  const l1 = await linhaDoBanco(v1);
  const l2 = await linhaDoBanco(v2);
  conferir(
    r.tipo === "ok" && l1?.transcricao?.criadoPor === "auxiliar.tesouraria@ficticio.local" && l2?.transcricao?.documentoDeSuporte === DOC && l1.transcricao.revisao === null,
    `duas linhas transcritas pela tela, com o documento e o autor (${r.texto.slice(0, 90)})`,
  );
  if (l1?.transcricao == null || l2?.transcricao == null) throw new Error("sem as linhas, o percurso não segue");
  await irPara(n, pa, rota);
  const condicoes = await pa.$$eval("[data-linha-digitada]", (els) => els.map((e) => `${e.getAttribute("data-linha-digitada") ?? ""}=${e.getAttribute("data-condicao") ?? ""}`));
  const t1 = l1.transcricao.id;
  const t2 = l2.transcricao.id;
  conferir(condicoes.includes(`${t1}=AGUARDANDO_REVISAO`) && condicoes.includes(`${t2}=AGUARDANDO_REVISAO`), "a tela mostra as duas aguardando revisão");
  conferir((await pa.$(`form[data-acao="revisar-transcricao"][data-transcricao="${t1}"]`)) === null, "quem digitou não recebe o formulário de revisão das próprias linhas");
  // ── 3. repetir sem a declaração ──
  const rep = await preencherEEnviar(pa, "transcrever-extrato", [
    { sel: 'input[name="documentoDeSuporte"]', valor: DOC },
    { sel: 'input[name="linhaData"]', valor: dia, tipo: "data", indice: 0 },
    { sel: 'select[name="linhaNatureza"]', valor: "DEBITO", tipo: "select", indice: 0 },
    { sel: '[data-mascara="valor"]', valor: v1.replace(".", ","), indice: 0 },
    { sel: 'input[name="linhaHistorico"]', valor: `TARIFA ENSAIO ${marca}`, indice: 0 },
  ]);
  const quantas = await prisma.lancamentoExtrato.count({ where: { contaBancariaId: conta.id, valor: v1 } });
  conferir(rep.tipo === "erro" && /Já existe uma linha digitada igual na conta FIC-PM-500/.test(rep.texto) && quantas === 1, `a mesma linha de novo, sem a declaração, é recusada com o motivo (${rep.texto.slice(0, 90)})`);
  await ctxA.close();

  // ── 2. a conferente revisa ──
  const ctxB = await nav.createBrowserContext();
  const pb = await ctxB.newPage();
  pb.setDefaultTimeout(300000);
  await entrar(n, pb, "conferente.tesouraria@ficticio.local", senha);
  await irPara(n, pb, rota);
  const c1 = await preencherEEnviar(pb, `form[data-acao="revisar-transcricao"][data-transcricao="${t1}"]`, [
    { sel: 'select[name="resultado"]', valor: "CONFIRMADA", tipo: "select" },
    { sel: 'input[name="meio"]', valor: "Extrato impresso na mão" },
  ], `revisar-transcricao-${t1}`);
  const c2 = await preencherEEnviar(pb, `form[data-acao="revisar-transcricao"][data-transcricao="${t2}"]`, [
    { sel: 'select[name="resultado"]', valor: "DIVERGENTE", tipo: "select" },
    { sel: 'input[name="meio"]', valor: "O impresso traz outro valor" },
  ], `revisar-transcricao-${t2}`);
  const r1 = (await linhaDoBanco(v1))?.transcricao?.revisao;
  const r2 = (await linhaDoBanco(v2))?.transcricao?.revisao;
  conferir(c1.tipo === "ok" && r1?.resultado === "CONFIRMADA" && r1.criadoPor === "conferente.tesouraria@ficticio.local", `a conferente confirma a primeira pela tela (${c1.texto.slice(0, 80)})`);
  conferir(c2.tipo === "ok" && r2?.resultado === "DIVERGENTE", `e marca a segunda como divergente (${c2.texto.slice(0, 80)})`);
  await irPara(n, pb, rota);
  const depois = await pb.$$eval("[data-linha-digitada]", (els) => els.map((e) => `${e.getAttribute("data-linha-digitada") ?? ""}=${e.getAttribute("data-condicao") ?? ""}|${(e.textContent ?? "").replace(/\s+/g, " ")}`));
  const d1 = depois.find((x) => x.startsWith(`${t1}=`)) ?? "";
  const d2 = depois.find((x) => x.startsWith(`${t2}=`)) ?? "";
  conferir(d1.startsWith(`${t1}=VALE|`) && /Vale como extrato/.test(d1) && /Revisada por conferente\.tesouraria@ficticio\.local/.test(d1), "depois de recarregar, a confirmada aparece valendo como extrato, com quem revisou");
  conferir(d2.startsWith(`${t2}=REVISADA_DIVERGENTE|`) && /Não vale como extrato: revisada e considerada divergente/.test(d2), "a divergente aparece como não valendo, com o motivo");
  conferir((await pb.$(`form[data-acao="revisar-transcricao"][data-transcricao="${t1}"]`)) === null, "a linha revisada não oferece segunda revisão");
  await ctxB.close();

  // ── 4. quem só consulta ──
  const ctxC = await nav.createBrowserContext();
  const pc = await ctxC.newPage();
  pc.setDefaultTimeout(300000);
  await entrar(n, pc, "tesoureiro@ficticio.local", senha);
  await irPara(n, pc, rota);
  const temLinhas = (await pc.$(`[data-linha-digitada="${t1}"]`)) !== null;
  const temForm = (await pc.$('form[data-acao="transcrever-extrato"]')) !== null || (await pc.$('form[data-acao="revisar-transcricao"]')) !== null;
  const aviso = (await pc.content()).includes("Transcrever e revisar linhas cabe a quem tem a permissão de transcrever extrato");
  conferir(temLinhas && !temForm && aviso, "quem só consulta vê as linhas, não recebe formulário e lê por quê");
  await ctxC.close();
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da transcrição de extrato completo.");
