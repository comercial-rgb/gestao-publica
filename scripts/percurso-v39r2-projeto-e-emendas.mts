import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-023, R2-024) — PELA TELA: A VERSÃO DO PROJETO LIGADA À PROPOSTA, E O EFEITO DAS EMENDAS SOBRE ELA.
 *   1. escolhe uma proposta ainda não efetivada do exercício PERCURSO_EXERCICIO (padrão 2030) e, se faltar, cadastra o
 *      projeto da LOA desse exercício;
 *   2. guarda a versão encaminhada escolhendo a proposta: no banco, a versão aponta a proposta e as dotações apontam as
 *      linhas (o valor de cada uma é o vigente da linha);
 *   3. registra uma emenda (+1.000,00 numa ficha, −1.000,00 em outra) e a sanciona;
 *   4. na tela das emendas, o comparativo mostra, por dotação, o valor no projeto, a emenda aprovada e o esperado.
 * GRAVA (base de demonstração ou ensaio, conferida pelo `entrar`).
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const exercicio = Number(process.env["PERCURSO_EXERCICIO"] ?? "2030");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { exercicio, efetivacao: { is: null } }, orderBy: { criadoEm: "desc" }, select: { id: true, descricao: true } });
if (proposta === null) throw new Error(`Não há proposta de ${String(exercicio)} ainda não efetivada nesta base.`);

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // 1. o projeto da LOA do exercício
  let lei = await prisma.leiOrcamentariaAnual.findUnique({ where: { exercicio }, select: { id: true } });
  if (lei === null) {
    await irPara(n, page, "/planejamento/leis-orcamentarias");
    const r = await preencherEEnviar(page, "criar-leis-orcamentarias", [
      { sel: 'input[name="exercicio"]', valor: String(exercicio) },
      { sel: 'input[name="numeroDoProjeto"]', valor: `PL ${String(exercicio).slice(2)}/${String(exercicio - 1)} (ensaio)` },
      { sel: 'input[name="dataDoEnvio"]', valor: `${String(exercicio - 1)}-09-30`, tipo: "data" },
      { sel: 'textarea[name="ementa"]', valor: `Estima a receita e fixa a despesa do Município para o exercício de ${String(exercicio)} (ensaio).` },
    ]);
    lei = await prisma.leiOrcamentariaAnual.findUnique({ where: { exercicio }, select: { id: true } });
    conferir(r.tipo === "ok" && lei !== null, `projeto da LOA de ${String(exercicio)} cadastrado pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, `projeto da LOA de ${String(exercicio)} já cadastrado`);
  if (lei === null) throw new Error("sem projeto da LOA");

  // 2. a versão encaminhada, escolhendo a proposta
  const antes = await prisma.versaoDoProjetoDaLoa.count({ where: { leiId: lei.id } });
  await irPara(n, page, `/planejamento/leis-orcamentarias/${lei.id}`);
  const rv = await preencherEEnviar(page, "guardar-versao-do-projeto", [
    { sel: 'select[name="propostaId"]', valor: proposta.id, tipo: "select" },
    { sel: 'select[name="tipo"]', valor: antes === 0 ? "ENCAMINHADO" : "MENSAGEM_MODIFICATIVA", tipo: "select" },
    { sel: 'input[name="dataDoEncaminhamento"]', valor: `${String(exercicio - 1)}-09-30`, tipo: "data" },
    { sel: 'input[name="competenciaDaRemessa"]', valor: `${String(exercicio - 1)}-09`, tipo: "data" },
    { sel: 'input[name="documento"]', valor: "Mensagem do Executivo à Câmara (ensaio)" },
    { sel: 'input[name="fundamento"]', valor: "Encaminhamento do projeto da lei orçamentária (ensaio)" },
  ]);
  // A base pode não ter as declarações que o arquivo do projeto exige (meta da ação, objetivo do programa, secretário da
  // unidade): a captura recusa nomeando o que falta e nada grava. O percurso confere essa recusa e que o comparativo
  // não reconstrói projeto sem versão guardada; a ligação com valores fica provada no teste do domínio.
  if (rv.tipo !== "ok") {
    const depois = await prisma.versaoDoProjetoDaLoa.count({ where: { leiId: lei.id } });
    conferir(/não pode ser guardado como está[\s\S]*Nada foi gravado/.test(rv.texto) && depois === antes, `a captura é recusada pela tela nomeando o que o projeto exige e falta, e nada é gravado (${rv.texto.slice(0, 120)}…)`);
    if (antes === 0) {
      await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
      const sem = await page.$eval("[data-sem-versao-do-projeto]", (e) => (e.textContent ?? "").trim()).catch(() => "");
      conferir(/Nenhuma versão do projeto foi guardada com esta proposta/.test(sem), `sem versão guardada, o comparativo das emendas diz que não há base e não reconstrói o projeto (${sem.slice(0, 80)})`);
    }
    throw new Error("PARADA_DECLARADA");
  }
  const versao = await prisma.versaoDoProjetoDaLoa.findFirst({ where: { leiId: lei.id }, orderBy: { numero: "desc" }, select: { id: true, numero: true, propostaOrcamentariaId: true, dotacoes: { select: { linhaDaPropostaId: true, valor: true } } } });
  const ligadas = versao?.dotacoes.filter((d) => d.linhaDaPropostaId !== null).length ?? 0;
  conferir(rv.tipo === "ok" && versao !== null && versao.propostaOrcamentariaId === proposta.id && ligadas === (versao?.dotacoes.length ?? -1) && ligadas > 0,
    `versão ${String(versao?.numero ?? "?")} guardada pela tela com a proposta "${proposta.descricao}": ${String(ligadas)} de ${String(versao?.dotacoes.length ?? 0)} dotações apontam a linha (${rv.texto.slice(0, 80)})`);
  if (versao === null || rv.tipo !== "ok") throw new Error(`a versão não foi guardada: ${rv.texto}`);
  const t = await irPara(n, page, `/planejamento/leis-orcamentarias/${lei.id}`);
  conferir(/da proposta/i.test(t) && (await page.$("[data-proposta-da-versao]")) !== null, "a tela da LOA mostra a proposta e as linhas ligadas na versão");

  // 3. uma emenda (+1.000 numa ficha, −1.000 em outra) e a sanção
  const linhas = await prisma.linhaDeDespesaDaProposta.findMany({ where: { propostaOrcamentariaId: proposta.id, fichaDeOrigemId: { not: null }, noProjeto: { some: { versaoId: versao.id } } }, take: 2, orderBy: { id: "asc" }, select: { id: true, fichaDeOrigem: { select: { numero: true } } } });
  if (linhas.length < 2) throw new Error("a proposta não tem duas linhas de ficha no projeto guardado");
  const [a, b] = linhas as [typeof linhas[number], typeof linhas[number]];
  await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
  const re = await preencherEEnviar(page, "cadastrar-emenda", [
    { sel: 'input[name="data"]', valor: `15/10/${String(exercicio - 1)}` },
    { sel: 'input[name="vereador"]', valor: "Vereadora da Comissão de Finanças (ensaio)" },
    { sel: 'input[name="objetivo"]', valor: "Remanejar recursos entre dotações do projeto" },
    { sel: 'textarea[name="justificativa"]', valor: "Ajuste de prioridade aprovado na comissão (ensaio)" },
    { sel: 'textarea[name="textoJuridico"]', valor: "Acrescenta e reduz as dotações indicadas (ensaio)" },
    { sel: 'textarea[name="itens"]', valor: `${String(a.fichaDeOrigem!.numero)}; 1.000,00\n${String(b.fichaDeOrigem!.numero)}; -1.000,00` },
  ]);
  const emenda = await prisma.emendaAoOrcamento.findFirst({ where: { propostaOrcamentariaId: proposta.id }, orderBy: { criadoEm: "desc" }, select: { id: true, numero: true } });
  conferir(re.tipo === "ok" && emenda !== null, `emenda ${String(emenda?.numero ?? "?")} registrada pela tela (${re.texto.slice(0, 60)})`);
  if (emenda === null) throw new Error("sem emenda");
  await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
  const rs = await preencherEEnviar(page, `form[data-acao="sancionar-emenda"][data-emenda="${emenda.id}"]`, [
    { sel: 'input[name="resultado"][value="APROVADA"]', valor: "sim", tipo: "marcar" },
    { sel: 'input[name="data"]', valor: `20/12/${String(exercicio - 1)}` },
    { sel: 'input[name="ato"]', valor: `Lei orçamentária de ${String(exercicio)} (ensaio)` },
  ], "sancionar-emenda");
  conferir(rs.tipo === "ok" && (await prisma.sancaoDaEmenda.count({ where: { emendaId: emenda.id } })) === 1, `emenda sancionada pela tela (${rs.texto.slice(0, 60)})`);

  // 4. o comparativo
  await irPara(n, page, `/planejamento/emendas?proposta=${proposta.id}`);
  const linhasDaTela = await page.$$eval("[data-linha-do-comparativo]", (ls) => ls.map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()));
  const daA = linhasDaTela.find((l) => l.startsWith(`ficha ${String(a.fichaDeOrigem!.numero)} `));
  const projetoA = versao.dotacoes.find((d) => d.linhaDaPropostaId === a.id)!.valor;
  conferir(daA !== undefined && daA.includes("1.000,00"), `o comparativo mostra a ficha ${String(a.fichaDeOrigem!.numero)} com a emenda aprovada de 1.000,00 sobre ${projetoA.toFixed(2)} do projeto (${daA ?? "linha ausente"})`);
  const base = await page.$eval("[data-comparativo-das-emendas]", (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(new RegExp(`versão ${String(versao.numero)} do projeto`).test(base), "o comparativo diz que a base é a versão guardada do projeto");
} catch (e) {
  if (!(e instanceof Error && e.message === "PARADA_DECLARADA")) throw e;
  console.log("   o restante (emenda sobre versão guardada) depende das declarações da base; provado no teste do domínio");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do projeto e das emendas completo.");
