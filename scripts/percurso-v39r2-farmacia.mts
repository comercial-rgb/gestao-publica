import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-030, R2-031) — PELA TELA: A FARMÁCIA COM O DEPÓSITO DELA E A TELA DE OPERAÇÃO.
 *   1. cadastra a farmácia PERCURSO_FARMACIA (padrão 0000901) e um depósito para ela, se faltarem;
 *   2. na tela de operação, vincula o depósito; o vínculo fica gravado e o formulário some;
 *   3. a tela mostra o estoque por lote (vazio nesta base), o formulário de dispensação e o de perda ou sobra;
 *   4. a dispensação sem medicamento é recusada com o motivo, e nada é gravado.
 * O ESTOQUE COM LOTE, A DISPENSAÇÃO, O VENCIDO, A PERDA E A SOBRA ficam provados no teste do domínio: nesta base não há
 * estoque de medicamento, e a entrada depende da liquidação e do roteiro do almoxarifado, que é decisão da contadora
 * (pendência nomeada ESTOQUE-DE-MEDICAMENTO-NA-BASE-DE-ENSAIO). GRAVA (base de demonstração ou ensaio).
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const codigo = process.env["PERCURSO_FARMACIA"] ?? "0000901";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // 1. a farmácia e o depósito
  let farmacia = await prisma.farmaciaPublica.findFirst({ where: { codigo }, select: { id: true } });
  if (farmacia === null) {
    await irPara(n, page, "/patrimonio/farmacias");
    const ug = await page.$$eval('form[data-acao="cadastrar-farmacia"] select[name="ugId"] option', (os) => os.map((o) => o.getAttribute("value") ?? "").find((v) => v !== "") ?? "");
    const r = await preencherEEnviar(page, "cadastrar-farmacia", [
      { sel: 'select[name="ugId"]', valor: ug, tipo: "select" },
      { sel: 'input[name="codigo"]', valor: codigo },
      { sel: 'input[name="descricao"]', valor: "Farmácia Básica (ensaio)" },
      { sel: 'input[name="endereco"]', valor: "Rua da Saúde, 10 (ensaio)" },
      { sel: 'input[name="nomeResponsavel"]', valor: "Farmacêutica de ensaio" },
      { sel: 'input[name="cpfResponsavel"]', valor: "11144477735" },
      { sel: 'input[name="crfResponsavel"]', valor: "PB-9001" },
      { sel: 'input[name="vigenteDesde"]', valor: "2026-01-02", tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "Portaria de designação (ensaio)" },
    ]);
    farmacia = await prisma.farmaciaPublica.findFirst({ where: { codigo }, select: { id: true } });
    conferir(r.tipo === "ok" && farmacia !== null, `farmácia ${codigo} cadastrada pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, `farmácia ${codigo} já cadastrada`);
  if (farmacia === null) throw new Error("sem farmácia");
  const codDep = `FAR-${codigo.slice(-3)}`;
  let dep = await prisma.deposito.findUnique({ where: { codigo: codDep }, select: { id: true } });
  if (dep === null) {
    await irPara(n, page, "/patrimonio/almoxarifado/depositos");
    const uo = await page.$$eval('form[data-acao="criar-depositos"] select[name="unidadeOrcId"] option', (os) => os.map((o) => o.getAttribute("value") ?? "").find((v) => v !== "") ?? "");
    const r = await preencherEEnviar(page, "criar-depositos", [
      { sel: 'input[name="codigo"]', valor: codDep },
      { sel: 'input[name="nome"]', valor: "Estoque da farmácia básica (ensaio)" },
      { sel: 'select[name="unidadeOrcId"]', valor: uo, tipo: "select" },
    ]);
    dep = await prisma.deposito.findUnique({ where: { codigo: codDep }, select: { id: true } });
    conferir(r.tipo === "ok" && dep !== null, `depósito ${codDep} cadastrado pela tela (${r.texto.slice(0, 50)})`);
  } else conferir(true, `depósito ${codDep} já cadastrado`);
  if (dep === null) throw new Error("sem depósito");

  // 2. o vínculo pela tela de operação
  await irPara(n, page, "/patrimonio/farmacias");
  conferir((await page.$(`a[data-operar-farmacia="${codigo}"]`)) !== null, "a lista das farmácias leva à tela de operação");
  await irPara(n, page, `/patrimonio/farmacias/${farmacia.id}`);
  if ((await prisma.depositoDaFarmacia.count({ where: { farmaciaId: farmacia.id } })) === 0) {
    const r = await preencherEEnviar(page, "vincular-deposito", [
      { sel: 'select[name="depositoId"]', valor: dep.id, tipo: "select" },
      { sel: 'input[name="fundamento"]', valor: "Organização da farmácia básica (ensaio)" },
    ], "vincular-deposito");
    const v = await prisma.depositoDaFarmacia.findUnique({ where: { farmaciaId: farmacia.id }, select: { depositoId: true } });
    // Depois do vínculo o formulário sai da tela (não há o que vincular), e a resposta vai com ele: o resultado é a página
    // dizendo de que depósito é o estoque (conferido no passo 3) e o vínculo gravado.
    conferir(r.tipo !== "erro" && v?.depositoId === dep.id, `depósito vinculado pela tela e gravado${r.texto === "" ? "" : ` (${r.texto.slice(0, 60)})`}`);
  } else conferir(true, "depósito já vinculado (corrida anterior)");

  // 3. a tela de operação
  const t = await irPara(n, page, `/patrimonio/farmacias/${farmacia.id}`);
  conferir(/o estoque desta farmácia é o do depósito/.test(t) && (await page.$('form[data-acao="vincular-deposito"]')) === null, "a tela diz de que depósito é o estoque, e o vínculo não se oferece de novo");
  const lotes = await page.$$("[data-estoque-por-lote] tr[data-lote]");
  conferir((await page.$("[data-estoque-por-lote]")) !== null && (lotes.length > 0 || /nenhum lote com saldo no depósito/.test(t)), `estoque por lote na tela (${String(lotes.length)} lote(s) com saldo)`);
  conferir((await page.$('form[data-acao="dispensar"]')) !== null && (await page.$('form[data-acao="ajustar"]')) !== null, "os formulários de dispensação e de perda ou sobra aparecem para quem tem as ações");

  // 4. dispensação sem medicamento
  const antes = await prisma.dispensacaoDeMedicamento.count({ where: { farmaciaId: farmacia.id } });
  const rd = await preencherEEnviar(page, "dispensar", [
    { sel: 'input[name="identificacaoDoUsuario"]', valor: "CNS 700000000000005" },
    { sel: 'input[name="receita"]', valor: "Receita 1 (ensaio)" },
    { sel: 'input[name="prescritor"]', valor: "Médica de ensaio, CRM-PB 0001" },
  ], "dispensar");
  conferir(rd.tipo === "erro" && /Informe ao menos um medicamento\. Nada foi gravado\./.test(rd.texto) && (await prisma.dispensacaoDeMedicamento.count({ where: { farmaciaId: farmacia.id } })) === antes,
    `dispensação sem medicamento recusada com o motivo, nada gravado (${rd.texto.slice(0, 60)})`);
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da farmácia completo.");
