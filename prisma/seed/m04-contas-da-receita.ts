import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";

/**
 * V28 — PONTO DE PARTIDA PARA A VPA DA ARRECADAÇÃO POR NATUREZA (`ContaDaReceitaPorNatureza`).
 *
 * ⚠️ NÃO É A DECISÃO DO ENTE: é a sugestão conferida pelo NOME da conta no plano do TCE-PB 2025 carregado
 * (`Pcasp_2025.xlsx`), para que uma instalação nova e os bancos de percurso não recusem toda guia. A tela
 * Contabilidade > Contas da receita por natureza mostra cada linha com este fundamento e o contador do ente
 * confirma ou troca, numa versão nova.
 *
 * ⚠️ FAIL-CLOSED POR LINHA: se a conta não existir ou não for analítica no plano carregado, a linha NÃO é
 * gravada e o seed diz qual faltou. Prefixo já declarado (por qualquer versão) não é tocado: o seed nunca
 * passa por cima de uma decisão do ente.
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) throw new Error("DATABASE_URL não definida — veja .env.example.");
const prisma = criarPrismaClient(DATABASE_URL);
const AUTOR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";

/** Natureza (prefixo do ementário da STN) → conta de VPA do plano com o MESMO nome. */
const SUGESTOES: readonly { readonly prefixo: string; readonly conta: string; readonly porque: string }[] = [
  { prefixo: "11180111", conta: "4.1.1.2.1.02.00", porque: "IPTU — 4.1.1.2.1.02.00 Imposto sobre a propriedade predial e territorial urbana" },
  { prefixo: "11180141", conta: "4.1.1.2.1.04.00", porque: "ITBI — 4.1.1.2.1.04.00 ITBI" },
  { prefixo: "11180231", conta: "4.1.1.3.1.02.00", porque: "ISSQN — 4.1.1.3.1.02.00 ISS" },
  { prefixo: "1113031", conta: "4.1.1.2.1.03.01", porque: "IR retido sobre o trabalho — 4.1.1.2.1.03.01 IR - pessoas físicas" },
  { prefixo: "1113021", conta: "4.1.1.2.1.03.02", porque: "IR retido sobre outros rendimentos de pessoa jurídica — 4.1.1.2.1.03.02 IR - pessoas jurídicas" },
  { prefixo: "711302", conta: "4.1.1.2.2.00.00", porque: "receita intraorçamentária de imposto sobre a renda — 4.1.1.2.2.00.00 Impostos sobre patrimônio e a renda - intra OFSS" },
];

let gravadas = 0;
const recusadas: string[] = [];
for (const s of SUGESTOES) {
  const ja = await prisma.contaDaReceitaPorNatureza.findFirst({ where: { naturezaPrefixo: s.prefixo }, select: { id: true } });
  if (ja !== null) continue;
  const conta = await prisma.contaPcasp.findUnique({ where: { codigo: s.conta }, select: { analitica: true } });
  if (conta === null || !conta.analitica) {
    recusadas.push(`${s.prefixo} → ${s.conta} (${conta === null ? "não está no plano" : "sintética"})`);
    continue;
  }
  await prisma.contaDaReceitaPorNatureza.create({
    data: {
      naturezaPrefixo: s.prefixo,
      contaVpaCodigo: s.conta,
      fundamento: `Sugestão da instalação pelo nome da conta no PCASP do TCE-PB 2025 (${s.porque}); a contabilidade do ente confirma ou troca.`,
      versao: 1,
      criadoPor: AUTOR,
    },
  });
  gravadas += 1;
}
console.log(`[contas da receita] ${String(gravadas)} declaração(ões) gravada(s).`);
if (recusadas.length > 0) console.log(`[contas da receita] não gravadas: ${recusadas.join("; ")}`);
await prisma.$disconnect();
