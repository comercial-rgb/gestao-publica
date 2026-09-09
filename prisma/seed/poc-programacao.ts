import "dotenv/config";
import { pathToFileURL } from "node:url";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { proporCmdDaLoa, proporMbaDaLoa } from "../../modules/m02-planejamento/programacao.js";
import type { PrismaClient } from "../generated/client/client.js";

/**
 * MASSA POC — PREVISÃO DA RECEITA + PROGRAMAÇÃO FINANCEIRA (CMD/MBA).
 *
 * ⚠️ POR QUE ESTE SEED EXISTE SEPARADO DO `sagres-poc.ts`. Aquele é IDEMPOTENTE por guarda da UG
 * (`org-poc`): uma vez semeado, rodá-lo de novo é no-op, e acrescentar massa nova a ele exigiria
 * recriar o banco inteiro. Este roda DEPOIS, sobre a massa existente, e tem guarda própria — a
 * demonstração ganha o que lhe falta sem perder o que já tem.
 *
 * O QUE FALTAVA, E POR QUE ISSO QUEBRAVA TRÊS TELAS:
 * A massa POC fixou a DESPESA (ficha de 150k) mas nunca fixou a RECEITA PREVISTA da LOA. Sem ela:
 *   · `proporCmdDaLoa`/`proporMbaDaLoa` distribuem um total ZERO — a programação nasce vazia;
 *   · a tela de CMD/MBA não tem duodécimo nem meta para exibir;
 *   · a REPREVISÃO não tem previsão sobre a qual lançar o ajuste (LRF art. 12).
 * Todas as três dependem do mesmo fato ausente. É esse fato que este seed grava.
 *
 * ⚠️ OS VALORES SÃO SINTÉTICOS E COERENTES COM A MASSA, não arbitrários: a previsão da receita
 * (150.000,00) é igual à dotação fixada da despesa, que é o equilíbrio que a LOA tem de ter por
 * construção (art. 167). Disso saem duodécimos redondos de 12.500,00/mês e metas de 25.000,00 por
 * bimestre — números que a Comissão consegue conferir de cabeça na tela.
 *
 * ⚠️ NÃO CRIA USUÁRIOS, pela mesma razão do `sagres-poc.ts`: a identidade que assina TEM de
 * pré-existir (`seed:bootstrap`). As duas ações são autorizadas em escopo ENTE — a programação
 * financeira é do ente, não de uma UG (o caixa é um só).
 *
 * Uso:  npm run seed:poc-programacao   (depois de seed:bootstrap e seed:sagres-poc)
 */

const ADMIN_PADRAO = "admin@cg.pb.gov.br";
const EXERCICIO = 2026;
/** Igual à dotação fixada da ficha POC — a LOA fecha receita = despesa. */
const PREVISAO_TOTAL = "150000.00";

export async function semearProgramacaoPoc(prisma: PrismaClient, criadoPor = ADMIN_PADRAO): Promise<void> {
  // GUARDA: a programação já registrada é a verdade; este seed nunca a sobrescreve. Retificar CMD
  // é ato do ente (`registrarVersaoCmd`, versão N+1), não trabalho de seed.
  if ((await prisma.versaoCmd.count({ where: { exercicio: EXERCICIO } })) > 0) {
    console.log("[seed:poc-programacao] CMD já registrado para 2026 — no-op (idempotente).");
    return;
  }

  // (1) A PREVISÃO DA LOA. Natureza e fonte são as que a massa POC já usa (IPTU 11130211 / fonte
  // 500) — reaproveitá-las mantém a receita prevista e a arrecadada na MESMA chave, que é o que
  // faz o confronto do art. 9º (meta × realizado) ter sentido na tela.
  const fonte = await prisma.fonteRecurso.findUniqueOrThrow({ where: { codigo: "500" }, select: { id: true } });
  const natureza = await prisma.naturezaReceita.findUniqueOrThrow({ where: { codigo: "11130211" }, select: { id: true } });

  await prisma.receitaPrevista.upsert({
    where: {
      uq_receita_prevista: {
        exercicio: EXERCICIO,
        naturezaReceitaId: natureza.id,
        exercicioFonte: 1,
        fonteId: fonte.id,
        tipoReceita: "ORCAMENTARIA",
      },
    },
    update: {},
    create: {
      exercicio: EXERCICIO,
      naturezaReceitaId: natureza.id,
      fonteId: fonte.id,
      exercicioFonte: 1,
      tipoReceita: "ORCAMENTARIA",
      valorPrevisto: PREVISAO_TOTAL,
    },
  });

  // (2) CMD e MBA versão 1, PROPOSTOS DA LOA pelos serviços do M02 — nunca por escrita direta nas
  // tabelas. É a mesma função que o ente chamaria pela tela: a massa nasce do domínio, com as suas
  // travas e a sua autorização, e não de um INSERT que as contornaria.
  const vigenteDesde = new Date(Date.UTC(EXERCICIO, 0, 1));
  const cmd = await proporCmdDaLoa(prisma, { exercicio: EXERCICIO, atoRef: "Decreto POC nº 001/2026", vigenteDesde, criadoPor });
  const mba = await proporMbaDaLoa(prisma, { exercicio: EXERCICIO, atoRef: "Decreto POC nº 002/2026", vigenteDesde, criadoPor });

  console.log(
    `[seed:poc-programacao] previsão ${PREVISAO_TOTAL} (fonte 500 / natureza 11130211); ` +
      `CMD v1 com ${cmd.cotas} cota(s) mensal(is); MBA v1 com ${mba.metas} meta(s) bimestral(is).`
  );
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  const prisma = criarPrismaClient(url);
  try {
    await semearProgramacaoPoc(prisma as unknown as PrismaClient);
  } finally {
    await prisma.$disconnect();
  }
}

// Só roda como ENTRYPOINT direto — nunca quando IMPORTADO (mesma disciplina do sagres-poc).
const ehEntrada = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (ehEntrada) {
  main().catch((e: unknown) => {
    console.error("[seed:poc-programacao] FALHOU:", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
