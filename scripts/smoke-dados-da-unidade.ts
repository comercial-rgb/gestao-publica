import "dotenv/config";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { diaCivil } from "../packages/datas/index.js";
import {
  entrar,
  irPara,
  lancarNavegadorDoPercurso,
  preencherEEnviar,
  registroDePassos,
  type Navegador,
} from "./percursos-navegador.js";

/**
 * V21 — OS DADOS DA UNIDADE ORÇAMENTÁRIA, PELA TELA, ATÉ O PACOTE DO SAGRES.
 *
 *   1. a tela lista as unidades e diz quantas estão sem dados;
 *   2. a prévia do SAGRES mostra a recusa nomeada ("Dados da unidade ausentes") e o arquivo das
 *      unidades NÃO está no pacote;
 *   3. um CPF inválido é recusado com o motivo, e nada é gravado;
 *   4. declarar as unidades pela tela (a confirmação aparece e a tabela recarregada mostra o secretário);
 *   5. a prévia do SAGRES passa a trazer o arquivo UnidadeOrcamentaria, e a recusa some;
 *   6. declarar de novo (troca de secretário) conta duas declarações — nada foi apagado.
 *
 * ⚠️ BANCO DESCARTÁVEL. A porta 3010 é recusada.
 */
const BASE = process.argv[2] ?? "http://localhost:3012";
const ADMIN = process.argv[3] ?? "admin@cg.pb.gov.br";
const SENHA_ADMIN = process.argv[4] ?? process.env["SEED_ADMIN_SENHA"] ?? "";
const N: Navegador = { base: BASE };
const ROTA = "/planejamento/unidades-orcamentarias";
const CPF_VALIDO = "529.982.247-25";

if (BASE.includes(":3010")) {
  throw new Error("Este percurso grava declarações. A porta 3010 é a da apresentação — use um clone. Nada foi feito.");
}

async function main(): Promise<void> {
  if (SENHA_ADMIN === "") throw new Error("SEED_ADMIN_SENHA ausente.");
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL ausente — o percurso confere a persistência no clone.");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  const R = registroDePassos();
  const hoje = diaCivil(new Date());
  const rotaSagres = `/integracoes/sagres?dia=${hoje}&mes=${hoje.slice(0, 7)}`;
  const unidades = await prisma.unidadeOrcamentaria.findMany({ orderBy: { codigo: "asc" }, select: { id: true, codigo: true } });
  if (unidades.length < 2) throw new Error("O percurso precisa de ao menos duas unidades. Nada foi feito.");

  const navegador = await lancarNavegadorDoPercurso();
  try {
    const page = await navegador.newPage();
    page.setDefaultTimeout(120000);
    /** O cartão de arquivo da prévia tem o nome da entidade em <strong> — é o arquivo, não a violação. */
    const temCartaoDasUnidades = (): Promise<boolean> =>
      // A linha de VIOLAÇÃO também nomeia a entidade em <strong>, mas dentro de um <li>; o cartão não.
      page.evaluate(() =>
        Array.from(document.querySelectorAll("strong")).some((x) => (x.textContent ?? "").trim() === "UnidadeOrcamentaria" && x.closest("li") === null)
      );
    await entrar(N, page, ADMIN, SENHA_ADMIN);
    R.ok("0.1 login do administrador");
    await irPara(N, page, "/administracao/perfis");
    for (let i = 0; i < 12; i += 1) {
      const pendente = await page.evaluate(() => document.querySelector('li[data-atualizacao] [data-situacao="pendente"]') !== null);
      if (!pendente) break;
      await preencherEEnviar(page, "aplicar-atualizacao", []);
      await irPara(N, page, "/administracao/perfis");
    }
    R.ok("0.2 fila de atualizações de permissões esgotada");

    // ══ 1. A TELA ══
    const t1 = await irPara(N, page, ROTA);
    R.conferir("1.1 a tela das unidades abre", /unidades orçamentárias/i.test(t1), t1.slice(0, 200));
    const semDados = await page.evaluate(() => document.querySelector("[data-unidades-sem-dados]")?.getAttribute("data-unidades-sem-dados") ?? "0");
    R.conferir(`1.2 a tela diz quantas unidades estão sem dados (${String(unidades.length)})`, semDados === String(unidades.length), `diz ${semDados}`);
    R.conferir("1.3 o menu leva à tela", await page.evaluate(() => document.querySelector('a[href="/planejamento/unidades-orcamentarias"]') !== null), "sem link");

    // ══ 2. A PRÉVIA ANTES ══
    const s1 = await irPara(N, page, rotaSagres);
    R.conferir("2.1 a prévia do SAGRES nomeia a recusa das unidades", /dados da unidade ausentes/i.test(s1), s1.slice(0, 300));
    R.conferir("2.2 e o arquivo das unidades NÃO está no pacote", !(await temCartaoDasUnidades()), "o arquivo apareceu sem declaração");

    // ══ 3. CPF INVÁLIDO ══
    await irPara(N, page, ROTA);
    const r0 = await preencherEEnviar(page, "declarar-dados-da-unidade", [
      { sel: 'select[name="unidadeOrcId"]', valor: unidades[0]!.id, tipo: "select" },
      { sel: 'select[name="naturezaJuridica"]', valor: "PREFEITURA_OU_SECRETARIA", tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: `${hoje.slice(0, 4)}-01-01`, tipo: "data" },
      { sel: 'input[name="nomeSecretario"]', valor: "Maria das Dores Silva" },
      { sel: 'input[name="cpfSecretario"]', valor: "529.982.247-26" },
      { sel: 'select[name="atoDeNomeacao"]', valor: "PORTARIA", tipo: "select" },
    ]);
    R.conferir("3.1 CPF com dígito errado é recusado nomeando o motivo", r0.tipo === "erro" && /cpf do secretário inválido/i.test(r0.texto), `${r0.tipo}: ${r0.texto}`);
    R.conferir("3.2 e nada foi gravado", (await prisma.declaracaoDaUnidadeOrcamentaria.count()) === 0, "gravou");

    // ══ 4. DECLARAR AS UNIDADES ══
    for (const u of unidades) {
      await irPara(N, page, ROTA);
      const r = await preencherEEnviar(page, "declarar-dados-da-unidade", [
        { sel: 'select[name="unidadeOrcId"]', valor: u.id, tipo: "select" },
        { sel: 'select[name="naturezaJuridica"]', valor: "PREFEITURA_OU_SECRETARIA", tipo: "select" },
        { sel: 'input[name="vigenteDesde"]', valor: `${hoje.slice(0, 4)}-01-01`, tipo: "data" },
        { sel: 'input[name="nomeSecretario"]', valor: "Maria das Dores Silva" },
        { sel: 'input[name="cpfSecretario"]', valor: CPF_VALIDO },
        { sel: 'select[name="atoDeNomeacao"]', valor: "PORTARIA", tipo: "select" },
      ]);
      R.conferir(`4.1 a unidade ${u.codigo} é declarada e confirma`, r.tipo === "ok" && r.texto.includes(u.codigo), `${r.tipo}: ${r.texto}`);
    }
    const t2 = await irPara(N, page, ROTA);
    R.conferir("4.2 a tabela recarregada mostra o secretário e não há unidade sem dados", t2.includes("maria das dores silva") && !/não declarada/i.test(t2), t2.slice(0, 400));

    // ══ 5. A PRÉVIA DEPOIS ══
    const s2 = await irPara(N, page, rotaSagres);
    R.conferir("5.1 a recusa das unidades sumiu da prévia", !/dados da unidade ausentes/i.test(s2), "a recusa continua");
    R.conferir("5.2 o arquivo UnidadeOrcamentaria está no pacote", await temCartaoDasUnidades(), s2.slice(0, 300));

    // ══ 6. TROCA DE SECRETÁRIO ══
    await irPara(N, page, ROTA);
    const r2 = await preencherEEnviar(page, "declarar-dados-da-unidade", [
      { sel: 'select[name="unidadeOrcId"]', valor: unidades[0]!.id, tipo: "select" },
      { sel: 'select[name="naturezaJuridica"]', valor: "PREFEITURA_OU_SECRETARIA", tipo: "select" },
      { sel: 'input[name="vigenteDesde"]', valor: hoje, tipo: "data" },
      { sel: 'input[name="nomeSecretario"]', valor: "Jose Carlos Pereira" },
      { sel: 'input[name="cpfSecretario"]', valor: "111.444.777-35" },
      { sel: 'select[name="atoDeNomeacao"]', valor: "DECRETO", tipo: "select" },
    ]);
    R.conferir("6.1 a troca de secretário confirma", r2.tipo === "ok", `${r2.tipo}: ${r2.texto}`);
    R.conferir(
      "6.2 a unidade passa a ter DUAS declarações — a anterior não foi apagada",
      (await prisma.declaracaoDaUnidadeOrcamentaria.count({ where: { unidadeOrcId: unidades[0]!.id } })) === 2,
      "contagem errada"
    );
    const t3 = await irPara(N, page, ROTA);
    R.conferir("6.3 a tabela mostra o secretário novo", t3.includes("jose carlos pereira"), t3.slice(0, 400));
  } finally {
    await navegador.close();
    await prisma.$disconnect();
  }
  R.encerrar();
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack ?? e.message : e);
  process.exit(1);
});
