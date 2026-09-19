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

/**
 * ⚠️ A CONFERÊNCIA CONTINUA IGUAL; MUDOU QUEM ELA DERRUBA (V11 V6.1) — o mesmo conserto de
 * `prisma/seed/roteiro-orcamentario.ts`, pela mesma razão medida. `2.1.8.8.1.01.00` é SINTÉTICA no
 * PCASP oficial ("CONSIGNAÇÕES", com trinta analíticas sob ela), e o tudo-ou-nada fazia UM tipo de
 * consignação sem conta decidida matar a instalação inteira — e com ela os outros seis, que estão
 * certos.
 *
 * Reter continua fail-closed no USO: tipo não semeado é retenção que não aparece na tela, e é esse
 * o estado correto para uma classificação que ninguém decidiu.
 */
const recusados: { readonly codigo: string; readonly conta: string; readonly motivo: string }[] = [];

for (const t of TIPOS_CONSIGNACAO) {
  // ⚠️ FAIL-CLOSED: a conta de passivo TEM de existir no plano. Semear o tipo sem ela
  // deixaria a retenção indisponível na tela sem que ninguém soubesse por quê — e o
  // motivo apareceria só na hora de reter, no meio de um pagamento.
  const conta = await prisma.contaPcasp.findUnique({
    where: { codigo: t.contaPassivo },
    select: { id: true, analitica: true, nome: true },
  });
  if (conta === null) {
    recusados.push({
      codigo: t.codigo,
      conta: t.contaPassivo,
      motivo: "a conta não existe no plano carregado. Rode antes: npm run seed:pcasp-oficial.",
    });
    continue;
  }
  if (!conta.analitica) {
    const filhas = await prisma.contaPcasp.findMany({
      where: { codigo: { startsWith: t.contaPassivo.slice(0, 9) }, analitica: true },
      orderBy: { codigo: "asc" },
      select: { codigo: true, nome: true },
    });
    recusados.push({
      codigo: t.codigo,
      conta: t.contaPassivo,
      motivo:
        `a conta é SINTÉTICA no plano ("${conta.nome}") e não recebe partida — a retenção seria ` +
        `recusada pelo M01 no meio do pagamento. ${filhas.length} analítica(s) sob ela; qual delas ` +
        `corresponde a esta consignação é decisão do ente, com fundamento.`,
    });
    continue;
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

if (recusados.length > 0) {
  console.log(`\n  ⚠️ ${recusados.length} TIPO(S) NÃO SEMEADO(S) — a retenção deles não aparece na tela:\n`);
  for (const r of recusados) console.log(`     ${r.codigo.padEnd(24)} ${r.conta}: ${r.motivo}`);
  console.log(
    `\n     Escolher a analítica aqui seria inventar classificação contábil. Pendência\n` +
      `     CONSIGNACAO-CONTA-SINTETICA. A instalação PROSSEGUE: os demais tipos foram semeados.`
  );
}

await prisma.$disconnect();
