import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { documentoTemDigitoValido } from "../../packages/documento/index.js";
import { meioDiaCivil } from "../../packages/datas/index.js";
import { registrarNormaNoTce } from "../../modules/m03-creditos/norma-no-tce.js";
import { anexarArquivo } from "../../modules/m22-documentos/anexos.js";
import { cadastrarUnidadeGestora } from "../../modules/m01-core-contabil/unidade-gestora.js";

/**
 * V27 (ordem, itens 1, 3 e 7) — A BASE PRÓPRIA DE ESPERANÇA/PB. Nunca roda na apresentação de Campina Grande: os fatos
 * dela não viram de Esperança trocando nome e IBGE. Roda num banco novo, já com as migrations, o SQL manual, o papel de
 * runtime, o plano de contas do Tribunal (`seed:pcasp-oficial`) e o administrador (`seed:bootstrap`).
 *
 * O que entra, e de onde:
 *   1. a identidade do ente — IBGE 2506004 conferido no arquivo do IBGE do repositório; CNPJ 08.993.909/0001-08
 *      (SNC, ordem V27) com o dígito conferido; o Tribunal (TCE-PB). O código Poder/Órgão da MSC (STN) NÃO está em
 *      documento do repositório: sem ESPERANCA_PODER_ORGAO (com ESPERANCA_PODER_ORGAO_FONTE), a identidade não é gravada;
 *   2. a Lei 613/2025 (LOA 2026) no cadastro de normas, com o PDF conferido pelo SHA-256 do manifesto e anexado. Sem o
 *      protocolo do banco de legislação do Tribunal (ele vem do comprovante, depois);
 *   3. as unidades gestoras do Tribunal SÓ com a data de início que o município informar (ESPERANCA_UGS = arquivo JSON
 *      `{ "201078": { "vigenteDesde": "AAAA-MM-DD", "fundamento": "..." }, ... }`). A evidência dos dados abertos (ano em
 *      que o código aparece) não vira data de início.
 *
 * Idempotente: o que já existe é conferido e não regravado. Saída: o que foi feito e o que falta, nomeado.
 *
 * Uso: DATABASE_URL=<banco de Esperança> CARGA_POR=<administrador> [ESPERANCA_PODER_ORGAO=... ESPERANCA_PODER_ORGAO_FONTE=...]
 *      [ESPERANCA_UGS=<arquivo.json>] npx tsx scripts/implantacao/esperanca-instalar-base.ts
 */

const RAIZ = resolve(import.meta.dirname, "../..");
const url = process.env["DATABASE_URL"] ?? "";
const banco = /\/([^/?]+)(\?|$)/.exec(url)?.[1] ?? "";
if (!banco.startsWith("gestao_publica_esperanca")) {
  console.error(`Recusado: o banco "${banco}" não é de Esperança (o nome tem de começar por gestao_publica_esperanca). A apresentação não recebe esta carga.`);
  process.exit(2);
}
const por = process.env["CARGA_POR"] ?? "";
if (por === "") {
  console.error("Informe CARGA_POR (o administrador que faz a carga).");
  process.exit(2);
}
const prisma = criarPrismaClient(url);
const feito: string[] = [];
const falta: string[] = [];

const IBGE = "2506004";
const CNPJ = "08993909000108";
const NOME = "Prefeitura Municipal de Esperança"; // nome da UG 201078 no Tribunal e a identificação institucional da ordem
const UGS_DO_TRIBUNAL: readonly { readonly codigo: string; readonly nome: string; readonly natureza: "PREFEITURA_OU_SECRETARIA" | "CAMARA_MUNICIPAL" | "AUTARQUIA" | "FUNDO_PREVIDENCIARIO" | "AUTARQUIA_PREVIDENCIARIA"; readonly evidencia: string }[] = [
  { codigo: "201078", nome: "Prefeitura Municipal de Esperança", natureza: "PREFEITURA_OU_SECRETARIA", evidencia: "dados abertos do TCE-PB, despesas de 2010 a 2026" },
  { codigo: "101078", nome: "Câmara Municipal de Esperança", natureza: "CAMARA_MUNICIPAL", evidencia: "dados abertos do TCE-PB, despesas de 2010 a 2026" },
  { codigo: "301078", nome: "Autarquia Municipal de Proteção e Defesa do Consumidor - PROCON", natureza: "AUTARQUIA", evidencia: "dados abertos do TCE-PB, despesas de 2022 a 2026" },
  { codigo: "601078", nome: "Fundo de Previdência Social dos Serv. do Mun. de Esperança", natureza: "FUNDO_PREVIDENCIARIO", evidencia: "dados abertos do TCE-PB, despesas de 2010 a 2026" },
];

async function migracoes(): Promise<void> {
  const noRepo = readdirSync(resolve(RAIZ, "prisma/migrations"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const aplicadas = new Set((await prisma.$queryRawUnsafe<{ migration_name: string }[]>(`select migration_name from _prisma_migrations where finished_at is not null`)).map((r) => r.migration_name));
  const faltam = noRepo.filter((m) => !aplicadas.has(m));
  if (faltam.length > 0) throw new Error(`Migrations não aplicadas (${String(faltam.length)}): ${faltam.slice(0, 5).join(", ")}… Rode prisma migrate deploy antes.`);
  feito.push(`${String(noRepo.length)} migrations conferidas.`);
}

async function identidade(): Promise<void> {
  const ibge = JSON.parse(readFileSync(resolve(RAIZ, "docs/oficial/ibge/municipios-pb.json"), "utf8")) as { id: number; nome: string }[];
  const m = ibge.find((x) => String(x.id) === IBGE);
  if (m?.nome !== "Esperança") throw new Error(`O IBGE ${IBGE} não é Esperança no arquivo oficial do repositório (achou: ${m?.nome ?? "nada"}).`);
  if (!documentoTemDigitoValido(CNPJ)) throw new Error(`CNPJ ${CNPJ} com dígito inválido.`);
  const ja = await prisma.enteConfig.findUnique({ where: { id: "unico" }, select: { codigoIbge: true, cnpj: true, nome: true } });
  if (ja !== null) {
    if (ja.codigoIbge !== IBGE) throw new Error(`Este banco já é de outro ente (IBGE ${ja.codigoIbge}). Nada foi gravado.`);
    feito.push(`Identidade já gravada: ${ja.nome}, IBGE ${ja.codigoIbge}, CNPJ ${ja.cnpj ?? "sem CNPJ"}.`);
    return;
  }
  const po = process.env["ESPERANCA_PODER_ORGAO"] ?? "";
  const fonte = process.env["ESPERANCA_PODER_ORGAO_FONTE"] ?? "";
  if (po === "" || fonte.length < 10) {
    falta.push("Identidade do ente NÃO gravada: falta o código Poder/Órgão da MSC (tabela da STN) com a fonte (ESPERANCA_PODER_ORGAO e ESPERANCA_PODER_ORGAO_FONTE).");
    return;
  }
  await prisma.enteConfig.create({
    data: { id: "unico", codigoIbge: IBGE, poderOrgao: po, nome: NOME, cnpj: CNPJ, uf: "PB", tribunalCodigo: "TCE-PB", tribunalUf: "PB", planoContasSeed: "pcasp-tce-pb-2025", conferidoPor: por, conferidoEm: new Date() },
  });
  feito.push(`Identidade gravada: ${NOME}, IBGE ${IBGE} (arquivo do IBGE), CNPJ ${CNPJ} (SNC), TCE-PB, Poder/Órgão ${po} (${fonte}).`);
  falta.push("Razão social cadastral do CNPJ: conferir no comprovante da Receita Federal (o agregador não oficial diz MUNICIPIO DE ESPERANCA); a identificação institucional gravada é a da UG 201078 no Tribunal.");
}

async function lei613(): Promise<void> {
  const manifesto = JSON.parse(readFileSync(resolve(RAIZ, "docs/oficial/esperanca-pb/MANIFEST-LOA-2026.json"), "utf8")) as { arquivos: { arquivo: string; sha256: string }[] };
  const entrada = manifesto.arquivos.find((a) => a.arquivo.endsWith(".pdf"));
  if (entrada === undefined) throw new Error("O manifesto da LOA 2026 não tem o PDF.");
  const bytes = readFileSync(resolve(RAIZ, "docs/oficial", entrada.arquivo));
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== entrada.sha256) throw new Error(`O PDF da Lei 613/2025 no disco (${hash}) não é o do manifesto (${entrada.sha256}). Nada foi gravado.`);
  let norma = await prisma.normaOrcamentariaNoTce.findFirst({ where: { tipo: "LOA", numero: "613", ano: 2025 }, select: { id: true } });
  if (norma === null) {
    norma = await registrarNormaNoTce(prisma, {
      tipo: "LOA",
      numero: "613",
      ano: 2025,
      dataPublicacao: meioDiaCivil("2025-12-19"),
      protocoloTce: null,
      autorizacaoPercentual: true,
      valor: "50",
      leiCreditoId: null,
      fundamento: `Lei Ordinária 613, de 19/12/2025 (LOA 2026), art. 5º, II: créditos suplementares até 50% da despesa autorizada. Publicada no Quinzenário Oficial, edição extra de 19/12/2025 (PDF SHA-256 ${hash.slice(0, 16)}…).`,
      criadoPor: por,
    });
    feito.push("Lei 613/2025 registrada no cadastro de normas (LOA, 19/12/2025, suplementação até 50%), sem o protocolo do Tribunal.");
  } else {
    feito.push("Lei 613/2025 já estava no cadastro de normas.");
  }
  const anexo = await prisma.anexo.findFirst({ where: { normaOrcamentariaId: norma.id, sha256: hash }, select: { id: true } });
  if (anexo === null) {
    await anexarArquivo(prisma, { nomeOriginal: "lei-613-2025-loa-2026.pdf", mimeType: "application/pdf", conteudo: new Uint8Array(bytes), normaOrcamentariaId: norma.id, criadoPor: por });
    feito.push(`PDF da Lei 613/2025 anexado à norma (SHA-256 conferido: ${hash}).`);
  } else {
    feito.push("PDF da Lei 613/2025 já anexado (mesmo SHA-256).");
  }
  falta.push("Protocolo da Lei 613/2025 no banco de legislação do TCE-PB: informar quando o comprovante for apresentado (Planejamento › Créditos adicionais › Leis no Tribunal).");
}

async function ugs(): Promise<void> {
  const arquivo = process.env["ESPERANCA_UGS"] ?? "";
  const datas: Record<string, { vigenteDesde: string; fundamento: string }> = arquivo === "" ? {} : (JSON.parse(readFileSync(arquivo, "utf8")) as Record<string, { vigenteDesde: string; fundamento: string }>);
  for (const u of UGS_DO_TRIBUNAL) {
    const ja = await prisma.unidadeGestora.findUnique({ where: { codigoTce: u.codigo }, select: { id: true } });
    if (ja !== null) {
      feito.push(`UG ${u.codigo} já cadastrada.`);
      continue;
    }
    const d = datas[u.codigo];
    if (d === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(d.vigenteDesde) || d.fundamento.trim().length < 10) {
      falta.push(`UG ${u.codigo} (${u.nome}): código e nome conferidos nos ${u.evidencia}; falta a data de início com o fundamento (não se presume).`);
      continue;
    }
    // A UG entra como de fora (sem entidade): a entidade que a escritura aqui é cadastrada com o ato de criação dela.
    await cadastrarUnidadeGestora(prisma, { codigoTce: u.codigo, nome: u.nome, cnpj: u.codigo === "201078" ? CNPJ : null, naturezaJuridica: u.natureza, entidadeContabilId: null, vigenteDesde: meioDiaCivil(d.vigenteDesde), fundamento: `${d.fundamento} Código e nome: ${u.evidencia}.`, criadoPor: por });
    feito.push(`UG ${u.codigo} cadastrada desde ${d.vigenteDesde}.`);
  }
}

try {
  await migracoes();
  await identidade();
  await lei613();
  await ugs();
  console.log("Feito:");
  for (const f of feito) console.log(`  - ${f}`);
  console.log("Falta (dado ou documento de terceiro):");
  for (const f of falta) console.log(`  - ${f}`);
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
