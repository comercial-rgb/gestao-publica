import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarCampanhaPublicitaria } from "../../modules/m05-despesa/campanha-publicitaria.js";

/**
 * AS CAMPANHAS PUBLICITÁRIAS DE DEMONSTRAÇÃO (V22) — duas campanhas, pelo MESMO serviço da tela
 * `/despesa/campanhas-publicitarias` (autorizado por CADASTRAR_CONTRATO). O vínculo com empenho
 * nasce pela tela de empenhos — o percurso da execução da despesa escolhe a CP-001/2026.
 *
 * Idempotente: identificador já cadastrado não é cadastrado de novo. Recusa rodar fora do banco
 * local da V22.
 */

const AUTOR = "admin@cg.pb.gov.br";
const CAMPANHAS = [
  {
    identificador: "CP-001/2026",
    titulo: "Vacinação contra a gripe 2026",
    objetivo: "Divulgar o calendário e os postos da campanha de vacinação contra a gripe para a população acima de 60 anos e os grupos prioritários.",
    inicio: "2026-04-01",
    fim: "2026-12-31",
  },
  {
    identificador: "CP-002/2026",
    titulo: "Matrícula escolar da rede municipal 2027",
    objetivo: "Informar o período, os documentos e os locais de matrícula na rede municipal de ensino para o ano letivo de 2027.",
    inicio: "2026-10-01",
    fim: "2026-12-15",
  },
] as const;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/\/gestao_publica_(local|apresentacao)(\?|$)/.test(url)) {
    throw new Error("Recusado: este script só semeia os bancos de demonstração (gestao_publica_local ou gestao_publica_apresentacao). Nada foi feito.");
  }
  const prisma = criarPrismaClient(url);
  try {
    for (const c of CAMPANHAS) {
      const ja = await prisma.campanhaPublicitaria.findUnique({ where: { identificador: c.identificador }, select: { id: true } });
      if (ja !== null) {
        console.log(`= ${c.identificador}: já cadastrada`);
        continue;
      }
      await cadastrarCampanhaPublicitaria(prisma, { ...c, criadoPor: AUTOR });
      console.log(`+ ${c.identificador}: ${c.titulo}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
