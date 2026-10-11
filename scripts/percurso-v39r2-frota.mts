import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-025 a R2-028) — PELA TELA: CONDUTOR, ORDEM DE ABASTECIMENTO CONFERIDA, LEITURA E CONSUMO, MANUTENÇÃO.
 *   1. cadastra o condutor (matrícula PERCURSO_MATRICULA, padrão E-9001) se faltar;
 *   2. emite a ordem de 50 L de gasolina para o primeiro veículo da frota;
 *   3. na tela da frota, abastece 30 L e 20 L pela ordem (com leituras de hodômetro); o terceiro, de 1 L, é recusado
 *      porque passa do autorizado;
 *   4. o consumo do veículo aparece (km/L entre as duas leituras);
 *   5. pede, autoriza e conclui uma manutenção, com o custo gravado.
 * GRAVA (base de demonstração ou ensaio). As datas são PERCURSO_DIA (padrão 2026-10-08) e o dia seguinte.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const matricula = process.env["PERCURSO_MATRICULA"] ?? "E-9001";
const dia = process.env["PERCURSO_DIA"] ?? "2026-10-08";
const diaSeguinte = new Date(new Date(`${dia}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const veiculo = await prisma.veiculoDaFrota.findFirst({ orderBy: { criadoEm: "asc" }, select: { id: true, placa: true } });
if (veiculo === null) throw new Error("Não há veículo na frota desta base.");
const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // 1. o condutor
  await irPara(n, page, "/patrimonio/frota");
  conferir((await page.$("a[data-operacao-da-frota]")) !== null, "a tela da frota leva à operação da frota");
  await irPara(n, page, "/patrimonio/frota/operacao");
  let condutor = await prisma.condutorDaFrota.findUnique({ where: { matricula }, select: { id: true } });
  if (condutor === null) {
    const r = await preencherEEnviar(page, "cadastrar-condutor", [
      { sel: 'input[name="nome"]', valor: "Condutora de ensaio" },
      { sel: 'input[name="matricula"]', valor: matricula },
      { sel: 'input[name="cnhNumero"]', valor: "12345678901" },
      { sel: 'select[name="cnhCategoria"]', valor: "B", tipo: "select" },
      { sel: 'input[name="cnhValidade"]', valor: "2027-12-31", tipo: "data" },
      { sel: 'input[name="vinculo"]', valor: "Servidora efetiva (ensaio)" },
      { sel: 'input[name="vigenteDesde"]', valor: "2026-10-01", tipo: "data" },
      { sel: 'input[name="fundamento"]', valor: "CNH apresentada (ensaio)" },
    ], "cadastrar-condutor");
    condutor = await prisma.condutorDaFrota.findUnique({ where: { matricula }, select: { id: true } });
    conferir(r.tipo === "ok" && condutor !== null, `condutor cadastrado pela tela (${r.texto.slice(0, 40)})`);
  } else conferir(true, "condutor já cadastrado");
  if (condutor === null) throw new Error("sem condutor");

  // 2. a ordem
  await irPara(n, page, "/patrimonio/frota/operacao");
  const ro = await preencherEEnviar(page, "emitir-ordem", [
    { sel: 'select[name="bem"]', valor: `v:${veiculo.id}`, tipo: "select" },
    { sel: 'select[name="condutorId"]', valor: condutor.id, tipo: "select" },
    { sel: 'select[name="combustivel"]', valor: "GASOLINA", tipo: "select" },
    { sel: 'input[name="quantidadeAutorizada"]', valor: "50" },
    { sel: 'input[name="emitidaEm"]', valor: dia, tipo: "data" },
    { sel: 'input[name="validaAte"]', valor: "2026-10-31", tipo: "data" },
    { sel: 'input[name="local"]', valor: "Posto do contrato de combustível (ensaio)" },
  ], "emitir-ordem");
  const ordem = await prisma.ordemDeAbastecimento.findFirst({ where: { veiculoId: veiculo.id }, orderBy: { numero: "desc" }, select: { id: true, numero: true } });
  conferir(ro.tipo === "ok" && ordem !== null && ro.texto.includes(`nº ${String(ordem.numero)}`), `ordem emitida pela tela (${ro.texto.slice(0, 50)})`);
  if (ordem === null) throw new Error("sem ordem");

  // 3. os abastecimentos pela ordem, com leitura
  const leituraBase = 20000 + ordem.numero * 1000;
  const abastecer = async (quantidade: string, data: string, leitura: string) => {
    await irPara(n, page, "/patrimonio/frota");
    return preencherEEnviar(page, `form[data-acao="registrar-abastecimento"][aria-label="Registrar abastecimento de ${veiculo.placa}"]`, [
      { sel: 'input[name="data"]', valor: data, tipo: "data" },
      { sel: 'select[name="combustivel"]', valor: "GASOLINA", tipo: "select" },
      { sel: 'input[name="quantidade"]', valor: quantidade },
      { sel: 'input[name="documento"]', valor: `Cupom ${data} (ensaio)` },
      { sel: 'input[name="ordemNumero"]', valor: String(ordem.numero) },
      { sel: 'input[name="leitura"]', valor: leitura },
    ], "registrar-abastecimento");
  };
  const fmt = (km: number): string => `${km.toLocaleString("pt-BR")},0`;
  const a1 = await abastecer("30", dia, fmt(leituraBase));
  const a2 = await abastecer("20", diaSeguinte, fmt(leituraBase + 300));
  const naOrdem = await prisma.abastecimentoDaFrota.count({ where: { ordemId: ordem.id, anulacao: null } });
  conferir(a1.tipo === "ok" && a2.tipo === "ok" && naOrdem === 2, `dois abastecimentos pela ordem nº ${String(ordem.numero)}, conferidos e gravados com a leitura (${a2.texto.slice(0, 60)})`);
  const a3 = await abastecer("1", diaSeguinte, "");
  conferir(a3.tipo === "erro" && /autoriza 50\.00, já foram abastecidos 50\.00, e este abastecimento é de 1\.00: passa do autorizado/.test(a3.texto) && (await prisma.abastecimentoDaFrota.count({ where: { ordemId: ordem.id } })) === 2,
    `o terceiro abastecimento passa do autorizado e é recusado com o motivo (${a3.texto.slice(0, 80)})`);

  // 4. o consumo
  await irPara(n, page, `/patrimonio/frota/operacao?bem=v:${veiculo.id}`);
  const linhas = await page.$$eval("[data-linha-do-consumo]", (ls) => ls.map((l) => (l.textContent ?? "").replace(/\s+/g, " ").trim()));
  conferir(linhas.some((l) => /20\.00\s*300\.0\s*15\.00$/.test(l.replace(/(\d)\s+(\d)/g, "$1 $2")) || (l.includes("300.0") && l.endsWith("15.00"))), `o consumo do veículo aparece: 300 km com 20 L = 15,00 km/L (${linhas.slice(-1)[0] ?? "nenhuma linha"})`);
  const ordemNaTela = await page.$eval(`tr[data-ordem="${String(ordem.numero)}"]`, (e) => (e.textContent ?? "").replace(/\s+/g, " ")).catch(() => "");
  conferir(/50\.00\s*50\.00\s*0\.00/.test(ordemNaTela) && /atendida/.test(ordemNaTela), `a ordem aparece atendida: autorizado 50, abastecido 50, saldo 0 (${ordemNaTela.slice(0, 90)})`);

  // 5. a manutenção
  const antes = await prisma.manutencaoDaFrota.count();
  const rp = await preencherEEnviar(page, "abrir-manutencao", [
    { sel: 'select[name="bem"]', valor: `v:${veiculo.id}`, tipo: "select" },
    { sel: 'select[name="tipo"]', valor: "CORRETIVA", tipo: "select" },
    { sel: 'input[name="descricao"]', valor: "Troca das pastilhas de freio (ensaio)" },
    { sel: 'input[name="solicitante"]', valor: "Chefe da garagem (ensaio)" },
    { sel: 'input[name="dataDoPedido"]', valor: diaSeguinte, tipo: "data" },
  ], "abrir-manutencao");
  const man = await prisma.manutencaoDaFrota.findFirst({ orderBy: { numero: "desc" }, select: { id: true, numero: true } });
  conferir(rp.tipo === "ok" && man !== null && (await prisma.manutencaoDaFrota.count()) === antes + 1, `manutenção pedida pela tela (${rp.texto.slice(0, 40)})`);
  if (man === null) throw new Error("sem manutenção");
  await irPara(n, page, "/patrimonio/frota/operacao");
  await preencherEEnviar(page, `form[data-acao="autorizar-manutencao"]:has(input[value="${man.id}"])`, [
    { sel: 'input[name="data"]', valor: diaSeguinte, tipo: "data" },
    { sel: 'input[name="fornecedor"]', valor: "Oficina de ensaio" },
    { sel: 'input[name="valorEstimado"]', valor: "450,00" },
  ], "autorizar-manutencao");
  conferir((await prisma.autorizacaoDaManutencaoDaFrota.count({ where: { manutencaoId: man.id } })) === 1, "manutenção autorizada pela tela e gravada");
  await irPara(n, page, "/patrimonio/frota/operacao");
  await preencherEEnviar(page, `form[data-acao="concluir-manutencao"]:has(input[value="${man.id}"])`, [
    { sel: 'input[name="data"]', valor: diaSeguinte, tipo: "data" },
    { sel: 'input[name="custo"]', valor: "430,00" },
    { sel: 'input[name="documento"]', valor: "NF 1234 (ensaio)" },
  ], "concluir-manutencao");
  const conc = await prisma.conclusaoDaManutencaoDaFrota.findUnique({ where: { manutencaoId: man.id }, select: { custo: true } });
  conferir(conc?.custo.toFixed(2) === "430.00", `manutenção concluída pela tela com o custo de 430,00 gravado (${conc?.custo.toFixed(2) ?? "nada"})`);
  const t = await irPara(n, page, "/patrimonio/frota/operacao");
  conferir(t.includes(`nº ${String(man.numero)}`) && /concluída em/.test(t), "a manutenção aparece concluída, com o custo e o documento");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso da frota completo.");
