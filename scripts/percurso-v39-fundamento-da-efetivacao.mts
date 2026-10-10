import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { entrar, irPara, lancarNavegadorDoPercurso, preencherEEnviar, type Navegador } from "./percursos-navegador.js";

/**
 * V39-021 — GERAR O ORÇAMENTO PELA TELA, ESCOLHENDO O FUNDAMENTO. Pega a proposta mais recente ainda não efetivada (na base
 * de demonstração) e confere, pela tela:
 *   1. a escolha do fundamento aparece; "lei aprovada" desabilitada quando a aprovação não está registrada; o ensaio
 *      oferecido porque a base é de demonstração; o botão desabilitado enquanto nada é escolhido;
 *   2. abre o exercício de destino, se preciso, escolhe ENSAIO e gera;
 *   3. a efetivação grava `fundamento = ENSAIO` (lido no banco) e a página diz "em ensaio".
 * GRAVA: o exercício de destino (se faltava) e o orçamento dele. O destino e a natureza da base são conferidos pelo
 * `entrar` (V39-002); a conferência no banco usa `PERCURSO_BANCO`.
 */
const n: Navegador = { base: process.env["BASE"] ?? "http://localhost:3011" };
if (/:3010\b/.test(n.base)) throw new Error("Recusado: a 3010 é a apresentação; este percurso grava.");
const prisma = criarPrismaClient(process.env["PERCURSO_BANCO"] ?? process.env["DATABASE_URL"] ?? "");
const usuario = process.env["PERCURSO_USUARIO"] ?? "admin@cg.pb.gov.br";
const senha = process.env["PERCURSO_SENHA"] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const falhas: string[] = [];
const conferir = (ok: boolean, o: string): void => {
  console.log(`${ok ? "ok " : "FALHA"} ${o}`);
  if (!ok) falhas.push(o);
};

const proposta = await prisma.propostaOrcamentaria.findFirst({ where: { efetivacao: null }, orderBy: { criadoEm: "desc" }, select: { id: true, exercicio: true } });
if (proposta === null) throw new Error("Nenhuma proposta pendente de efetivação nesta base.");
const rota = `/planejamento/proposta-orcamentaria/${proposta.id}`;
const nav = await lancarNavegadorDoPercurso();
try {
  const page = await nav.newPage();
  page.setDefaultTimeout(300000);
  page.on("dialog", (d) => void d.accept());
  await entrar(n, page, usuario, senha);
  await irPara(n, page, rota);
  if ((await prisma.exercicio.findUnique({ where: { ano: proposta.exercicio } })) === null) {
    const ra = await preencherEEnviar(page, "abrir-exercicio", []);
    conferir(ra.tipo === "ok", `exercício ${String(proposta.exercicio)} aberto pela tela (${ra.texto.slice(0, 50)})`);
    await irPara(n, page, rota);
  }
  const F = 'form[data-acao="efetivar-proposta"]';
  const estado = await page.$eval(F, (f) => ({
    escolha: f.querySelector("[data-fundamento-da-efetivacao]") !== null,
    leiDesabilitada: (f.querySelector('input[name="fundamento"][value="LEI_APROVADA"]') as HTMLInputElement | null)?.disabled ?? null,
    ensaio: f.querySelector('input[name="fundamento"][value="ENSAIO"]') !== null,
    botaoDesabilitado: (f.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.disabled ?? null,
  }));
  const lei = await prisma.leiOrcamentariaAnual.findUnique({ where: { exercicio: proposta.exercicio }, select: { aprovacao: { select: { id: true } } } });
  conferir(estado.escolha, "a tela pede o que permite executar o orçamento");
  conferir(estado.leiDesabilitada === (lei?.aprovacao == null), `"lei aprovada" ${estado.leiDesabilitada === true ? "desabilitada (aprovação não registrada)" : "habilitada"}, coerente com o banco`);
  conferir(estado.ensaio, "o ensaio é oferecido: o banco declara a base de demonstração");
  conferir(estado.botaoDesabilitado === true || lei?.aprovacao != null, "sem escolha, o botão de gerar fica desabilitado");

  await page.click(`${F} input[name="fundamento"][value="ENSAIO"]`);
  await page.click(`${F} button[type="submit"]`);
  let efetivacao: { fundamento: string | null; fichasCriadas: number } | null = null;
  for (let i = 0; i < 240 && efetivacao === null; i += 1) {
    efetivacao = await prisma.efetivacaoDaProposta.findUnique({ where: { propostaOrcamentariaId: proposta.id }, select: { fundamento: true, fichasCriadas: true } });
    if (efetivacao === null) await new Promise((r) => setTimeout(r, 1000));
  }
  conferir(efetivacao?.fundamento === "ENSAIO", `orçamento de ${String(proposta.exercicio)} gerado com fundamento ${efetivacao?.fundamento ?? "nenhum"} (${String(efetivacao?.fichasCriadas ?? 0)} fichas)`);
  const t = await irPara(n, page, rota);
  conferir(/em ensaio nesta base de demonstração/i.test(t), "a proposta efetivada diz que o orçamento foi gerado em ensaio");
} finally {
  await nav.close();
  await prisma.$disconnect();
}
if (falhas.length > 0) {
  console.error(`\n${String(falhas.length)} falha(s).`);
  process.exitCode = 1;
} else console.log("\nPercurso do fundamento da efetivação completo.");
