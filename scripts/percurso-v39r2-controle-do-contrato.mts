import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import { exigirDestinoDoPercurso } from "./destino-do-percurso.js";
import { entrar, hrefDoRegistro, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-R2 (R2-008 a 013) — PELA TELA: O CONTROLE CONTÁBIL DO CONTRATO.
 *   1. em Roteiros de precatórios, convênios e adiantamentos, declara (se ainda não declarado) o roteiro de cada evento
 *      do controle de contratos, com contas do PLANO CARREGADO (as de contratos de serviços) e fundamento;
 *   2. cadastra um processo, homologa, e cadastra o contrato dele (R$ 12.000,00);
 *   3. a página do contrato mostra o REGISTRO no controle e o saldo a executar de R$ 12.000,00;
 *   4. registra um acréscimo de R$ 1.000,00 e uma supressão de R$ 250,00: a executar 12.750,00;
 *   5. estorna o acréscimo: a executar 11.750,00, e o estorno usa as contas do acréscimo invertidas (conferido no banco).
 * GRAVA (base de demonstração ou ensaio, conferida pelo `entrar`): roteiros, processo, contrato, aditivos e estorno.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
await exigirDestinoDoPercurso(n.base);
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};
const hoje = diaCivil(new Date());
const ano = hoje.slice(0, 4);
const marca = String(Date.now()).slice(-6);
const ROTEIROS = [
  ["REGISTRO", "7.1.2.3.1.02.00", "8.1.2.3.1.02.01", "Registro do contrato de serviços a executar"],
  ["ACRESCIMO", "7.1.2.3.1.02.00", "8.1.2.3.1.02.01", "Acréscimo do contrato de serviços a executar"],
  ["SUPRESSAO", "8.1.2.3.1.02.01", "7.1.2.3.1.02.00", "Supressão do contrato de serviços a executar"],
  ["EXECUCAO", "8.1.2.3.1.02.01", "8.1.2.3.1.02.02", "Execução do contrato de serviços pela liquidação"],
] as const;
const FUNDAMENTO = "MCASP, Parte V (controle): obrigações contratuais registradas em 7.1.2.3 e executadas em 8.1.2.3, contas do plano carregado.";

const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br", process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "");

  // 1. roteiros
  for (const [chave, d, c, historico] of ROTEIROS) {
    const vigente = await prisma.roteiroPatrimonialDeclarado.findFirst({ where: { familia: "CONTRATO", chave }, orderBy: { versao: "desc" }, select: { versao: true } });
    if (vigente !== null) {
      conferir(true, `roteiro de ${chave} já declarado (versão ${String(vigente.versao)})`);
      continue;
    }
    await irPara(n, page, "/contabilidade/roteiros-patrimoniais");
    const r = await preencherEEnviar(page, 'form[data-painel="declarar-roteiro-patrimonial"]', [
      { sel: 'select[name="movimento"]', valor: `CONTRATO|${chave}`, tipo: "select" },
      { sel: "contaDebitoCodigo", valor: d, tipo: "referencia", busca: d },
      { sel: "contaCreditoCodigo", valor: c, tipo: "referencia", busca: c },
      { sel: 'input[name="historicoPadrao"]', valor: historico },
      { sel: 'input[name="fundamento"]', valor: FUNDAMENTO },
    ], "declarar-roteiro-patrimonial");
    const gravado = await prisma.roteiroPatrimonialDeclarado.findFirst({ where: { familia: "CONTRATO", chave }, orderBy: { versao: "desc" }, select: { contaDebitoCodigo: true, contaCreditoCodigo: true } });
    conferir(r.tipo === "ok" && gravado?.contaDebitoCodigo === d && gravado.contaCreditoCodigo === c, `roteiro de ${chave} declarado pela tela: D ${d} / C ${c} (${r.texto.slice(0, 70)})`);
  }

  // 2. processo, homologação, contrato
  const numeroProcesso = `${ano}/R2-${marca}`;
  await irPara(n, page, "/licitacoes/processos");
  const rp = await preencherEEnviar(page, "criar-processos-licitatorios", [
    { sel: 'input[name="numeroProcesso"]', valor: numeroProcesso },
    { sel: 'select[name="modalidade"]', valor: "PREGAO_ELETRONICO", tipo: "select" },
    { sel: 'input[data-mascara="valor"]:has(+ input[name="valorLicitado"])', valor: "15000,00" },
    { sel: 'textarea[name="objeto"]', valor: "Manutenção predial preventiva e corretiva dos prédios da administração (ensaio)" },
  ]);
  const proc = await prisma.processoLicitatorio.findFirst({ where: { numeroProcesso }, select: { id: true } });
  conferir(rp.tipo === "ok" && proc !== null, `processo ${numeroProcesso} cadastrado pela tela (${rp.texto.slice(0, 60)})`);
  if (proc === null) throw new Error("sem processo, o percurso não continua");
  await irPara(n, page, `/licitacoes/processos/${proc.id}`);
  const rh = await preencherEEnviar(page, "homologar", [{ sel: 'input[name="data"]', valor: `${ano}-01-02`, tipo: "data" }]);
  conferir(rh.tipo === "ok" && (await prisma.homologacaoProcesso.count({ where: { processoId: proc.id } })) === 1, `processo homologado pela tela (${rh.texto.slice(0, 60)})`);
  const numeroContrato = `CT-R2-${marca}`;
  await irPara(n, page, `/licitacoes/processos/${proc.id}`);
  const rc = await preencherEEnviar(page, "contratar", [
    { sel: 'input[name="numeroContrato"]', valor: numeroContrato },
    { sel: 'input:has(+ input[type="hidden"][name="contratadoDocumento"])', valor: "11222333000181" },
    { sel: 'input[name="contratadoNome"]', valor: "Construtora Esperança Serviços Ltda (fictícia)" },
    { sel: 'input[data-mascara="valor"]:has(+ input[name="valorInicial"])', valor: "12000,00" },
    { sel: 'input[name="vigenciaInicio"]', valor: `${ano}-01-05`, tipo: "data" },
    { sel: 'input[name="vigenciaFimInicial"]', valor: `${ano}-12-31`, tipo: "data" },
    { sel: 'select[name="categoriaOrdemCronologica"]', valor: "PRESTACAO_SERVICOS", tipo: "select" },
  ]);
  const ctr = await prisma.contrato.findFirst({ where: { numeroContrato }, select: { id: true } });
  conferir(rc.tipo === "ok" && ctr !== null, `contrato ${numeroContrato} cadastrado pela tela (${rc.texto.slice(0, 60)})`);
  if (ctr === null) throw new Error("sem contrato, o percurso não continua");

  // 3. a página do contrato mostra o controle
  const lerControle = async (): Promise<{ aExecutar: string; eventos: string[]; semRoteiro: string; diverge: boolean }> => {
    await irPara(n, page, `/licitacoes/contratos/${ctr.id}`);
    return {
      aExecutar: await page.$eval("[data-a-executar]", (e) => e.getAttribute("data-a-executar") ?? "").catch(() => ""),
      eventos: await page.$$eval("[data-evento-do-controle]", (ls) => ls.map((l) => l.getAttribute("data-evento-do-controle") ?? "")),
      semRoteiro: await page.$eval("[data-eventos-sem-roteiro]", (e) => e.getAttribute("data-eventos-sem-roteiro") ?? "").catch(() => ""),
      diverge: (await page.$("[data-controle-diverge]")) !== null,
    };
  };
  let c = await lerControle();
  conferir(c.aExecutar === "12000.00" && c.eventos.join(",") === "REGISTRO" && c.semRoteiro === "", `a página do contrato mostra o registro no controle e a executar ${c.aExecutar}`);

  // 4. acréscimo e supressão
  const aditivo = async (tipo: string, valor: string, numero: string): Promise<string> => {
    await irPara(n, page, `/licitacoes/contratos/${ctr.id}`);
    const r = await preencherEEnviar(page, "aditivo", [
      { sel: 'select[name="tipo"]', valor: tipo, tipo: "select" },
      { sel: 'input[data-mascara="valor"]:has(+ input[name="valor"])', valor },
      { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="numeroAditivo"]', valor: numero },
      { sel: 'input[name="motivo"]', valor: "Ajuste quantitativo do objeto por necessidade da administração (ensaio)" },
    ]);
    return `${r.tipo}: ${r.texto.slice(0, 60)}`;
  };
  conferir((await aditivo("ACRESCIMO_VALOR", "1000,00", "TA-01")).startsWith("ok"), "acréscimo de R$ 1.000,00 registrado pela tela");
  conferir((await aditivo("SUPRESSAO_VALOR", "250,00", "TA-02")).startsWith("ok"), "supressão de R$ 250,00 registrada pela tela");
  c = await lerControle();
  conferir(c.aExecutar === "12750.00" && c.eventos.join(",") === "REGISTRO,ACRESCIMO,SUPRESSAO", `a executar ${c.aExecutar} (12.000 + 1.000 − 250), eventos ${c.eventos.join(",")}`);

  // 5. estorno do acréscimo
  await irPara(n, page, `/licitacoes/contratos/${ctr.id}`);
  const opcao = await page.$$eval('form[data-acao="estornar-movimento"] select[name="movimentoId"] option', (os) => os.find((o) => /acr[eé]scimo/i.test(o.textContent ?? ""))?.getAttribute("value") ?? "");
  const re = await preencherEEnviar(page, "estornar-movimento", [
    { sel: 'select[name="movimentoId"]', valor: opcao, tipo: "select" },
    { sel: 'input[name="data"]', valor: hoje, tipo: "data" },
    { sel: 'input[name="motivo"]', valor: "Aditivo registrado com valor de outro termo (ensaio)" },
  ]);
  c = await lerControle();
  conferir(!c.diverge, "o controle confere com os fatos do contrato (valor atualizado menos o liquidado): nenhuma divergência na tela");
  conferir(re.tipo === "ok" && c.aExecutar === "11750.00" && c.eventos.join(",") === "REGISTRO,ACRESCIMO,SUPRESSAO,ESTORNO", `acréscimo estornado pela tela: a executar ${c.aExecutar}, eventos ${c.eventos.join(",")} (${re.texto.slice(0, 50)})`);

  // conferência no banco: o estorno inverte as contas do acréscimo; a versão do roteiro está nos fatos
  const elos = await prisma.lancamentoDeControleDoContrato.findMany({ where: { contratoId: ctr.id }, orderBy: { criadoEm: "asc" }, select: { evento: true, versaoDoRoteiro: true, estornoDeId: true, id: true, lancamento: { select: { partidas: { select: { tipo: true, subsistema: true, conta: { select: { codigo: true } } } } } } } });
  const pernas = (e: (typeof elos)[number]): string => e.lancamento.partidas.map((p) => `${p.tipo[0]}${p.conta.codigo}`).sort().join(" ");
  const acr = elos.find((e) => e.evento === "ACRESCIMO");
  const est = elos.find((e) => e.evento === "ESTORNO");
  conferir(acr !== undefined && est !== undefined && est.estornoDeId === acr.id && pernas(acr) === "C8.1.2.3.1.02.01 D7.1.2.3.1.02.00" && pernas(est) === "C7.1.2.3.1.02.00 D8.1.2.3.1.02.01", `no banco: acréscimo ${acr === undefined ? "?" : pernas(acr)}; estorno ${est === undefined ? "?" : pernas(est)}`);
  conferir(elos.every((e) => e.lancamento.partidas.every((p) => p.subsistema === "CONTROLE")) && elos.filter((e) => e.evento !== "ESTORNO").every((e) => e.versaoDoRoteiro !== null), "todas as partidas no subsistema de controle; cada fato guarda a versão do roteiro");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do controle do contrato completo.");
