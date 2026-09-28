import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import {
  declararCentralizacaoDaEscrituracao,
  INDICADORES_DE_CENTRALIZACAO,
} from "../modules/m01-core-contabil/responsaveis-do-manad.js";

/**
 * PASSO DE IMPLANTAÇÃO — declara o indicador de centralização da escrituração do ente (MANAD,
 * registro 0000, campo IND_CENTR).
 *
 * Uso:
 *   npx tsx scripts/declarar-centralizacao-da-escrituracao.ts --indicador 0 --por admin@ente.gov.br
 *
 *   0 = sem centralização · 1 = estabelecimento centralizador · 2 = centralizada em outro
 *
 * ⚠️ POR QUE É SCRIPT, E NÃO TELA: o indicador mora no `EnteConfig` (uma linha só), declarar é
 * UPDATE, e o papel da aplicação não tem UPDATE nessa tabela (censo `ESCRITA_MUTAVEL_DO_RUNTIME`,
 * `prisma/papel-runtime.ts`). Este passo roda com a credencial do DONO (`DATABASE_URL` da
 * implantação), a mesma via por que o CNPJ, a UF e o código IBGE do ente foram semeados.
 *
 * ⚠️ E A AUTORIZAÇÃO NÃO SOME POR SER SCRIPT: `--por` é a identidade de quem declara, e ela tem de
 * ter `CADASTRAR_ENTIDADE_CONTABIL` no ente. Sem ela, nada é gravado.
 */

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const indicador = argumento("indicador");
  const por = argumento("por");
  if (indicador === undefined || por === undefined) {
    throw new Error(
      "Informe --indicador (0, 1 ou 2) e --por (identificador de quem declara). Nada foi gravado."
    );
  }
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não está definida. Nada foi gravado.");

  const prisma = criarPrismaClient(url);
  try {
    const r = await declararCentralizacaoDaEscrituracao(prisma, { indicador, criadoPor: por });
    const texto = INDICADORES_DE_CENTRALIZACAO[r.atual as keyof typeof INDICADORES_DE_CENTRALIZACAO];
    console.log(
      `Indicador de centralização: ${r.anterior ?? "(não declarado)"} -> ${r.atual} (${texto}), declarado por ${por}.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
