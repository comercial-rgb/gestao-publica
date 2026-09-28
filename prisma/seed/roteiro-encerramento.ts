import "dotenv/config";
import { pathToFileURL } from "node:url";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../generated/client/client.js";

/**
 * O ROTEIRO DE ENCERRAMENTO — a conta do patrimônio líquido que recebe o resultado do exercício.
 *
 * ⚠️ POR QUE ESTE SEED EXISTE (V19). `apurarResultadoDoExercicio` (M08) transfere o saldo das
 * classes 3 e 4 para o patrimônio líquido, e ele recusa sem este parâmetro, com estas palavras:
 * *"ROTEIRO DE ENCERRAMENTO NÃO PARAMETRIZADO: falta a conta de RESULTADOS ACUMULADOS. O M08 não
 * inventa conta — parametrize antes de apurar"*. A recusa está certa; o que faltava era o
 * parâmetro existir em qualquer instalação. Medido: zero linhas de `RoteiroEncerramento` no banco
 * montado pela sequência canônica, e nenhum seed nem cadastro que as criasse.
 *
 * ⚠️ A CONTA É DO PLANO OFICIAL, e ela se escolhe na tabela — nunca de memória:
 * `2.3.7.1.1.01.00 SUPERÁVITS OU DÉFICITS DO EXERCÍCIO`, analítica, do grupo de resultados
 * acumulados (2.3.7). É a conta em que o MCASP manda o resultado do exercício pousar; o nível de
 * consolidação `.1` é o de CONSOLIDAÇÃO, que é o do resultado do próprio ente.
 *
 * ⚠️ E ELE É IDEMPOTENTE POR RECUSA NOMEADA: o roteiro é `@@unique` pela chave PADRAO, então
 * reexecutar não duplica — diz que já existe e qual conta está lá.
 *
 * Uso:  SEED_IDENTIDADE=fulano@ente DATABASE_URL=… npx tsx prisma/seed/roteiro-encerramento.ts
 */

const CONTA_RESULTADOS_ACUMULADOS = "2.3.7.1.1.01.00";

export async function semearRoteiroDeEncerramento(prisma: PrismaClient, criadoPor: string): Promise<void> {
  const existente = await prisma.roteiroEncerramento.findUnique({
    where: { chave: "PADRAO" },
    select: { contaResultadosAcumulados: { select: { codigo: true, nome: true } } },
  });
  if (existente !== null) {
    console.log(
      `[seed:roteiro-encerramento] já existe: ${existente.contaResultadosAcumulados.codigo} ` +
        `${existente.contaResultadosAcumulados.nome}. Nada a fazer.`
    );
    return;
  }

  const conta = await prisma.contaPcasp.findUnique({
    where: { codigo: CONTA_RESULTADOS_ACUMULADOS },
    select: { id: true, codigo: true, nome: true, analitica: true },
  });
  if (conta === null) {
    throw new Error(
      `A conta ${CONTA_RESULTADOS_ACUMULADOS} não está no plano instalado. Carregue o plano de ` +
        `contas oficial antes (prisma/seed/pcasp-oficial.ts). Nada foi gravado.`
    );
  }
  if (!conta.analitica) {
    throw new Error(
      `A conta ${conta.codigo} é SINTÉTICA no plano instalado e não recebe partida. Escolha a ` +
        `analítica correspondente. Nada foi gravado.`
    );
  }

  await prisma.roteiroEncerramento.create({
    data: { contaResultadosAcumuladosId: conta.id, criadoPor },
  });
  console.log(
    `[seed:roteiro-encerramento] conta de resultados acumulados: ${conta.codigo} ${conta.nome}.`
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const por = process.env["SEED_IDENTIDADE"];
  if (por === undefined || por.trim() === "") {
    throw new Error(
      "SEED_IDENTIDADE não definida. O roteiro é decisão do ente e fica assinado por quem a tomou."
    );
  }
  const prisma = criarPrismaClient(process.env["DATABASE_URL"] ?? "");
  try {
    await semearRoteiroDeEncerramento(prisma, por);
  } finally {
    await prisma.$disconnect();
  }
}
