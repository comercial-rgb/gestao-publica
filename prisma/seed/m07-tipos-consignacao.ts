import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { TIPOS_CONSIGNACAO } from "./dados/tipos-consignacao.js";

/**
 * SEED dos tipos de consignação. IDEMPOTENTE (upsert por `codigo`).
 *
 * NÃO tem guard de cardinalidade — o rol NÃO é fechado (o ente cria tipos
 * próprios). É o oposto das subfunções e dos elementos, onde a contagem é o
 * invariante.
 *
 * Uso: npx tsx prisma/seed/m07-tipos-consignacao.ts
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

for (const t of TIPOS_CONSIGNACAO) {
  // ⚠️ FAIL-CLOSED: a conta de passivo TEM de existir no plano. Semear o tipo sem ela
  // deixaria a retenção indisponível na tela sem que ninguém soubesse por quê — e o
  // motivo apareceria só na hora de reter, no meio de um pagamento.
  const conta = await prisma.contaPcasp.findUnique({
    where: { codigo: t.contaPassivo },
    select: { id: true, analitica: true },
  });
  if (conta === null) {
    throw new Error(
      `Conta ${t.contaPassivo} (passivo da consignação ${t.codigo}) não existe no plano. ` +
        `Rode o seed do PCASP antes: npm run seed:pcasp.`
    );
  }
  if (!conta.analitica) {
    throw new Error(
      `Conta ${t.contaPassivo} (passivo da consignação ${t.codigo}) é SINTÉTICA. ` +
        `Conta sintética não recebe partida — o lançamento da retenção seria recusado ` +
        `pelo M01 no meio do pagamento.`
    );
  }

  await prisma.tipoConsignacao.upsert({
    where: { codigo: t.codigo },
    update: { descricao: t.descricao, contaPassivoId: conta.id },
    create: {
      codigo: t.codigo,
      descricao: t.descricao,
      contaPassivoId: conta.id,
      criadoPor: "SEED",
    },
  });
}

const todos = await prisma.tipoConsignacao.findMany({
  orderBy: { codigo: "asc" },
  include: { contaPassivo: { select: { codigo: true } } },
});

console.log(`TIPOS DE CONSIGNAÇÃO (${todos.length}):\n`);
for (const t of todos) {
  // A conta aparece no relatório do seed porque é ela que decide se a retenção fica
  // DISPONÍVEL na tela. Um tipo sem conta é um tipo que ninguém consegue usar.
  const conta = t.contaPassivo?.codigo ?? "SEM CONTA DE PASSIVO";
  console.log(
    `  ${t.ativo ? " " : "x"} ${t.codigo.padEnd(24)} ${conta.padEnd(18)} ${t.descricao}`
  );
}
console.log(
  `\n  ⚠️ Seed MÍNIMO. O rol oficial do SAGRES-PB é pendência de dados ` +
    `(token ASTEC).\n     O rol NÃO é fechado — o ente pode criar tipos próprios.`
);

await prisma.$disconnect();
