import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  CONTA_CREDITO_DISPONIVEL,
  CONTA_CREDITO_RESERVADO,
  CONTA_DOTACAO_ADICIONAL,
  CONTA_DOTACAO_INICIAL,
} from "../../modules/m01-core-contabil/roteiros.js";

/**
 * SEED do ROTEIRO ORÇAMENTÁRIO — a tabela-parâmetro sem a qual NENHUMA FICHA NASCE.
 *
 * ═══ ⚠️ ESTE SEED FALTAVA, E A FALTA ERA INVISÍVEL ═══
 * `RoteiroOrcamentario` é fail-closed por desenho: um movimento de dotação que deveria
 * lançar no razão e não acha roteiro derruba a operação inteira. Isso está certo — foi
 * essa exigência que curou o furo em que o crédito disponível era debitado pelo empenho
 * e nunca creditado pela dotação.
 *
 * O que faltava era o outro lado: **quem semeia o roteiro em produção**. Os roteiros
 * existiam só num helper de TESTE (`test/roteiro-orcamentario.ts`), então a suíte inteira
 * passava e um banco de verdade não conseguia criar a primeira ficha. A suíte não podia
 * pegar isso: ela mesma semeava o que faltava.
 *
 * ═══ AS CONTAS VÊM DO DOMÍNIO, NÃO DAQUI ═══
 * Os códigos são importados de `modules/m01-core-contabil/roteiros.ts`. Redigitá-los
 * neste arquivo criaria a segunda verdade sobre qual conta é o crédito disponível — e a
 * primeira divergência só apareceria num balancete, meses depois.
 *
 * ⚠️ O EMPENHO NÃO ENTRA AQUI. O M05 já lança o empenho pelo roteiro que o chamador
 * passa; um roteiro paralelo o lançaria DUAS vezes.
 *
 * IDEMPOTENTE (upsert por `tipo`). Uso: npm run seed:roteiro-orc
 */

const DATABASE_URL = process.env["DATABASE_URL"];
if (DATABASE_URL === undefined) {
  throw new Error("DATABASE_URL não definida — veja .env.example.");
}

const prisma = criarPrismaClient(DATABASE_URL);

/**
 * Cada movimento de dotação é a passagem de um ESTADO a outro:
 *
 *   DOTACAO_INICIAL    D dotação inicial    / C crédito disponível
 *     "a LOA fixou X, e X está disponível para gastar"
 *   CREDITO_ADICIONAL  D dotação adicional  / C crédito disponível
 *   ANULACAO_CREDITO   D crédito disponível / C dotação adicional   (o inverso exato)
 *   RESERVA            D crédito disponível / C crédito reservado
 *   RESERVA_LIBERADA   D crédito reservado  / C crédito disponível
 */
const ROTEIROS: readonly {
  readonly tipo:
    | "DOTACAO_INICIAL"
    | "CREDITO_ADICIONAL"
    | "ANULACAO_CREDITO"
    | "RESERVA"
    | "RESERVA_LIBERADA";
  readonly debito: string;
  readonly credito: string;
}[] = [
  { tipo: "DOTACAO_INICIAL", debito: CONTA_DOTACAO_INICIAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", debito: CONTA_DOTACAO_ADICIONAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "ANULACAO_CREDITO", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_DOTACAO_ADICIONAL },
  { tipo: "RESERVA", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_CREDITO_RESERVADO },
  { tipo: "RESERVA_LIBERADA", debito: CONTA_CREDITO_RESERVADO, credito: CONTA_CREDITO_DISPONIVEL },
];

/** Fail-closed: conta ausente ou SINTÉTICA derruba o seed, nomeando o problema. */
async function contaAnalitica(codigo: string, tipo: string): Promise<string> {
  const c = await prisma.contaPcasp.findUnique({
    where: { codigo },
    select: { id: true, analitica: true },
  });
  if (c === null) {
    throw new Error(
      `Roteiro ${tipo}: a conta ${codigo} não existe no plano. Rode antes: npm run seed:pcasp.`
    );
  }
  if (!c.analitica) {
    throw new Error(
      `Roteiro ${tipo}: a conta ${codigo} é SINTÉTICA. Conta sintética não recebe partida — ` +
        `a criação da primeira ficha cairia no meio da transação.`
    );
  }
  return c.id;
}

for (const r of ROTEIROS) {
  const debito = await contaAnalitica(r.debito, r.tipo);
  const credito = await contaAnalitica(r.credito, r.tipo);
  await prisma.roteiroOrcamentario.upsert({
    where: { tipo: r.tipo },
    update: { contaDebitoId: debito, contaCreditoId: credito },
    create: { tipo: r.tipo, contaDebitoId: debito, contaCreditoId: credito, criadoPor: "SEED" },
  });
}

const todos = await prisma.roteiroOrcamentario.findMany({
  orderBy: { tipo: "asc" },
  include: {
    contaDebito: { select: { codigo: true } },
    contaCredito: { select: { codigo: true } },
  },
});

console.log(`ROTEIRO ORÇAMENTÁRIO (${todos.length}):\n`);
for (const r of todos) {
  console.log(
    `  ${r.tipo.padEnd(20)} D ${r.contaDebito.codigo}  /  C ${r.contaCredito.codigo}`
  );
}
console.log(
  `\n  ⚠️ Sem estas linhas nenhuma ficha nasce: o movimento de dotação lança no razão, e o\n` +
    `     lançamento é fail-closed. O EMPENHO não entra aqui — o M05 já o lança pelo roteiro\n` +
    `     que o chamador passa.`
);

await prisma.$disconnect();
