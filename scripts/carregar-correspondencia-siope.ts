import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { conferirTranscricao, grupoDaSecao, TRANSCRICAO_DO_MANUAL } from "../modules/m12-relatorios/siope.js";

/**
 * V39-R3 (R3-023) — CARREGA A CORRESPONDÊNCIA DO SIOPE (subfunção → grupo e tratamento no cálculo da manutenção e
 * desenvolvimento do ensino) a partir do manual guardado em `docs/oficial/fnde-siope/`, com o sha256 no manifesto.
 *
 * Uso: `npx tsx scripts/carregar-correspondencia-siope.ts [url-do-banco]` (padrão: DATABASE_URL). Conecta como dono, como
 * as demais cargas. Texto diferente do manifesto, ou transcrição que não confere com o texto, recusa a carga inteira.
 * Idempotente: o mesmo texto e a mesma transcrição no mesmo exercício não gravam outra versão; texto ou transcrição
 * diferente (a correção de uma linha transcrita, por exemplo) grava a versão seguinte.
 */

const PASTA = join(process.cwd(), "docs", "oficial", "fnde-siope");
const POR = "carga:correspondencia-siope";
const ARQUIVO = "Manual_SIOPE_2026.txt";

const manifesto = (JSON.parse(readFileSync(join(PASTA, "MANIFEST-SIOPE.json"), "utf8")) as { arquivos: { arquivo: string; sha256: string; fonte: string; exercicio: number }[] }).arquivos;
const entrada = manifesto.find((a) => a.arquivo === ARQUIVO);
if (entrada === undefined) throw new Error(`${ARQUIVO} não está no manifesto. Nada foi gravado.`);
const bytes = readFileSync(join(PASTA, ARQUIVO));
const sha = createHash("sha256").update(bytes).digest("hex");
if (sha !== entrada.sha256) throw new Error(`${ARQUIVO}: sha256 ${sha}, o manifesto diz ${entrada.sha256}. O arquivo não é o guardado; nada foi gravado.`);
const erros = conferirTranscricao(bytes.toString("utf8"));
if (erros.length > 0) throw new Error(`A transcrição não confere com o manual: ${erros.join(" ")} Nada foi gravado.`);

const shaDaTranscricao = createHash("sha256").update(JSON.stringify(TRANSCRICAO_DO_MANUAL)).digest("hex");

const url = process.argv[2] ?? process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("Informe a URL do banco (argumento ou DATABASE_URL).");
const prisma = criarPrismaClient(url);
try {
  await prisma.$transaction(async (tx) => {
    const ja = await tx.correspondenciaSiope.findUnique({ where: { exercicio_shaDoTexto_shaDaTranscricao: { exercicio: entrada.exercicio, shaDoTexto: sha, shaDaTranscricao } }, select: { versao: true } });
    if (ja !== null) {
      console.log(`[siope] correspondência de ${String(entrada.exercicio)} já carregada deste texto e desta transcrição (versão ${String(ja.versao)}).`);
      return;
    }
    const ultima = await tx.correspondenciaSiope.findFirst({ where: { exercicio: entrada.exercicio }, orderBy: { versao: "desc" }, select: { versao: true } });
    const versao = (ultima?.versao ?? 0) + 1;
    await tx.correspondenciaSiope.create({
      data: {
        exercicio: entrada.exercicio, versao, fonte: `${entrada.fonte}, unidade do SIOPE Municipal`, shaDoTexto: sha, shaDaTranscricao, criadoPor: POR,
        itens: { create: TRANSCRICAO_DO_MANUAL.map((t) => ({ subfuncaoCodigo: t.codigo, nome: t.nome, grupo: grupoDaSecao(t.secao), tratamento: t.tratamento, secao: t.secao, linhaNoManual: t.linha })) },
      },
    });
    console.log(`[siope] correspondência de ${String(entrada.exercicio)} carregada: versão ${String(versao)}, ${String(TRANSCRICAO_DO_MANUAL.length)} subfunções.`);
  });
} finally {
  await prisma.$disconnect();
}
