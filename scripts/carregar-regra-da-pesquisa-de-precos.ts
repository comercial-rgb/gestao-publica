import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { regraDoTextoDaIn65 } from "../modules/m11-licitacoes/fontes-da-pesquisa.js";

/**
 * V39-R3 (R3-020) — CARREGA A REGRA DO NÚMERO MÍNIMO DE PREÇOS da pesquisa de preços a partir do texto oficial da
 * Instrução Normativa SEGES/ME nº 65/2021 (art. 6º), guardado em `docs/oficial/compras/` com o sha256 no manifesto.
 *
 * Uso: `npx tsx scripts/carregar-regra-da-pesquisa-de-precos.ts [url-do-banco]` (padrão: DATABASE_URL). Conecta como
 * dono, como as demais cargas. Idempotente (única por vigência). O número sai da própria frase do art. 6º ("um conjunto
 * de três ou mais preços"); texto diferente do baixado, ou frase ausente, recusa a carga inteira.
 */

const PASTA = join(process.cwd(), "docs", "oficial", "compras");
const POR = "carga:regra-da-pesquisa-de-precos";
const ARQUIVO = "in-seges-me-65-2021.txt";

const manifesto = (JSON.parse(readFileSync(join(PASTA, "MANIFEST-PESQUISA-DE-PRECOS.json"), "utf8")) as { arquivos: { arquivo: string; sha256: string; fonte: string }[] }).arquivos;
const entrada = manifesto.find((a) => a.arquivo === ARQUIVO);
if (entrada === undefined) throw new Error(`${ARQUIVO} não está no manifesto. Nada foi gravado.`);
const bytes = readFileSync(join(PASTA, ARQUIVO));
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== entrada.sha256) throw new Error(`${ARQUIVO}: sha256 ${sha}, o manifesto diz ${entrada.sha256}. O arquivo não é o baixado; nada foi gravado.`);
const texto = bytes.toString("utf8");

// A leitura é a do módulo (a mesma que o teste usa sobre o mesmo arquivo).
const { minimoDePrecos: minimo, vigenteDesde } = regraDoTextoDaIn65(texto);

const url = process.argv[2] ?? process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("Informe a URL do banco (argumento ou DATABASE_URL).");
const prisma = criarPrismaClient(url);
try {
  const ja = await prisma.regraDaPesquisaDePrecos.findUnique({ where: { vigenteDesde }, select: { minimoDePrecos: true } });
  if (ja !== null) {
    if (ja.minimoDePrecos !== minimo) throw new Error(`Já há regra de ${vigenteDesde.toISOString().slice(0, 10)} com mínimo ${String(ja.minimoDePrecos)}, e o texto diz ${String(minimo)}. Nada foi gravado.`);
    console.log(`[pesquisa de preços] regra já carregada: mínimo de ${String(minimo)} preços (${entrada.fonte}).`);
  } else {
    await prisma.regraDaPesquisaDePrecos.create({ data: { minimoDePrecos: minimo, fonte: `${entrada.fonte}, art. 6º (${ARQUIVO}, sha256 ${sha.slice(0, 12)})`, vigenteDesde, criadoPor: POR } });
    console.log(`[pesquisa de preços] regra carregada: mínimo de ${String(minimo)} preços, vigente desde ${vigenteDesde.toISOString().slice(0, 10)}.`);
  }
} finally {
  await prisma.$disconnect();
}
