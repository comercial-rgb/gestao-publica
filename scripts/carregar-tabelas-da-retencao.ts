import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import {
  conferirRegrasDoISS,
  lerAliquotaEMinimoDaIN2110,
  lerAnexoIDaIN1234,
  lerBasesMinimasDaIN2110,
  lerServicosDaIN2110,
  montarListaDoISS,
  REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA,
} from "../modules/m07-extraorcamentario/fontes-da-retencao.js";

/**
 * CARREGA AS TABELAS DA RETENÇÃO NA FONTE (V24) a partir dos textos oficiais em `docs/oficial/`.
 *
 * Uso: `npx tsx scripts/carregar-tabelas-da-retencao.ts [url-do-banco]` (padrão: DATABASE_URL).
 * Conecta como DONO, como os seeds. Idempotente: reexecutar não duplica (chave única por código e
 * vigência). Cada arquivo tem o sha256 conferido contra `docs/oficial/MANIFEST-RETENCAO.json` antes de
 * qualquer linha ser lida — arquivo diferente do baixado para a carga inteira.
 *
 * A lista do ISS é a de Esperança/PB (o código IBGE vem do arquivo do IBGE, não daqui).
 */

const PASTA = join(process.cwd(), "docs", "oficial");
const CONSULTADO_EM = new Date("2026-09-29T00:00:00Z");
const POR = "carga:tabelas-da-retencao";

interface Entrada {
  readonly arquivo: string;
  readonly fonte: string;
  readonly vigenteDesde: string;
  readonly dataDownload: string;
  readonly sha256: string;
}
const manifesto = (JSON.parse(readFileSync(join(PASTA, "MANIFEST-RETENCAO.json"), "utf8")) as { arquivos: Entrada[] }).arquivos;

function lerConferido(arquivo: string): { readonly texto: string; readonly entrada: Entrada } {
  const entrada = manifesto.find((a) => a.arquivo === arquivo);
  if (entrada === undefined) throw new Error(`${arquivo} não está no manifesto. Nada foi gravado.`);
  const bytes = readFileSync(join(PASTA, arquivo));
  const sha = createHash("sha256").update(bytes).digest("hex");
  if (sha !== entrada.sha256) {
    throw new Error(`${arquivo}: sha256 ${sha}, o manifesto diz ${entrada.sha256}. O arquivo não é o baixado; nada foi gravado.`);
  }
  return { texto: bytes.toString("utf8"), entrada };
}
const data = (s: string): Date => new Date(`${s}T00:00:00Z`);

const url = process.argv[2] ?? process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("Informe a URL do banco (argumento ou DATABASE_URL).");

// Tudo lido e conferido ANTES de abrir o banco: uma fonte quebrada não deixa carga pela metade.
const anexo = lerConferido("receita-federal/in-rfb-1234-anexo-I.txt");
const in2110 = lerConferido("receita-federal/in-rfb-2110-2022-compilado.txt");
const lc132 = lerConferido("esperanca-pb/esperanca-alteracao.txt");
const descricoes = lerConferido("esperanca-pb/esperanca-lc132-2025-anexoI-descricoes-DERIVADO.csv");
const marcas = lerConferido("esperanca-pb/esperanca-lc132-2025-anexoI-colunas-DERIVADO.csv");
const ibge = lerConferido("ibge/municipios-pb.json");

const naturezas = lerAnexoIDaIN1234(anexo.texto);
for (const n of naturezas) {
  if (!n.ir.plus(n.csll).plus(n.cofins).plus(n.pis).equals(n.total)) throw new Error(`Anexo I, ${n.codigoReceita}: as colunas não somam o total.`);
}
const servicos = lerServicosDaIN2110(in2110.texto);
const bases = lerBasesMinimasDaIN2110(in2110.texto);
const parametro = lerAliquotaEMinimoDaIN2110(in2110.texto);
conferirRegrasDoISS(lc132.texto, REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA);
const itens = montarListaDoISS(descricoes.texto, marcas.texto, REGRAS_DE_ALIQUOTA_DO_ISS_ESPERANCA);
const esperanca = (JSON.parse(ibge.texto) as { id: number; nome: string }[]).filter((m) => m.nome === "Esperança");
if (esperanca.length !== 1) throw new Error("O arquivo do IBGE não tem exatamente um município chamado Esperança.");
const municipioIbge = String(esperanca[0]!.id);

const prisma = criarPrismaClient(url);
try {
  const fonteIR = `${anexo.entrada.fonte}; coluna 02 (IR), art. 3º-A`;
  const r1 = await prisma.naturezaDaRetencaoDoIR.createMany({
    skipDuplicates: true,
    data: naturezas.map((n) => ({
      codigoReceita: n.codigoReceita,
      natureza: n.natureza,
      aliquota: n.ir.dividedBy(100).toString(),
      vigenteDesde: data(anexo.entrada.vigenteDesde),
      fonte: fonteIR,
      consultadoEm: CONSULTADO_EM,
      criadoPor: POR,
    })),
  });
  const r2 = await prisma.servicoDaRetencaoPrevidenciaria.createMany({
    skipDuplicates: true,
    data: servicos.map((s) => ({
      codigo: s.codigo,
      artigo: s.artigo,
      inciso: s.inciso,
      descricao: s.descricao,
      somenteCessaoDeMaoDeObra: s.somenteCessaoDeMaoDeObra,
      construcaoCivil: s.construcaoCivil,
      vigenteDesde: data(in2110.entrada.vigenteDesde),
      fonte: `IN RFB 2.110/2022, art. ${s.artigo}, ${s.inciso}`,
      consultadoEm: CONSULTADO_EM,
      criadoPor: POR,
    })),
  });
  const r3 = await prisma.parametroDaRetencaoPrevidenciaria.createMany({
    skipDuplicates: true,
    data: [{ aliquota: parametro.aliquota.toString(), valorMinimo: parametro.valorMinimo.toFixed(2), vigenteDesde: data(in2110.entrada.vigenteDesde), fonte: "IN RFB 2.110/2022, art. 110 (11%) e art. 238 (R$ 10,00), pela remissão do art. 115, I", consultadoEm: CONSULTADO_EM, criadoPor: POR }],
  });
  const r4 = await prisma.baseMinimaDaRetencaoPrevidenciaria.createMany({
    skipDuplicates: true,
    data: bases.map((b) => ({
      codigo: b.codigo,
      descricao: b.descricao,
      percentual: b.percentual.toString(),
      vigenteDesde: data(in2110.entrada.vigenteDesde),
      fonte: `IN RFB 2.110/2022, art. ${b.codigo.startsWith("117") ? "117" : "118, II"}`,
      consultadoEm: CONSULTADO_EM,
      criadoPor: POR,
    })),
  });
  const r5 = await prisma.itemDaListaDoISS.createMany({
    skipDuplicates: true,
    data: itens.map((i) => ({
      municipioIbge,
      subitem: i.subitem,
      descricao: i.descricao,
      aliquota: i.aliquota.toString(),
      localDeIncidencia: i.localDeIncidencia,
      marcadoRetencaoNaFonte: i.marcadoRetencaoNaFonte,
      vigenteDesde: data(lc132.entrada.vigenteDesde),
      fonte: "LC municipal 80/2017 de Esperança, art. 62, I e Anexo I, na redação da LC 132/2025 (arts. 4º e 11)",
      consultadoEm: CONSULTADO_EM,
      criadoPor: POR,
    })),
  });
  console.log(
    `[retenção] ${new URL(url).pathname.slice(1)}: IR ${r1.count}/${naturezas.length}, serviços do INSS ${r2.count}/${servicos.length}, ` +
      `parâmetro ${r3.count}/1, bases mínimas ${r4.count}/${bases.length}, ISS de ${municipioIbge} ${r5.count}/${itens.length} (novas/lidas).`
  );
} finally {
  await prisma.$disconnect();
}
