import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  CONTA_CREDITO_ADICIONAL_ESPECIAL,
  CONTA_CREDITO_ADICIONAL_EXTRAORDINARIO,
  CONTA_CREDITO_ADICIONAL_SUPLEMENTAR,
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
 * IDEMPOTENTE (pelo par tipo + tipo de crédito). Uso: npm run seed:roteiro-orc
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
 *
 * ⚠️ O CRÉDITO ADICIONAL SÃO TRÊS LINHAS, NÃO UMA (V11 V7.1). O plano oficial chama
 * `5.2.2.1.2` de DOTAÇÃO ADICIONAL **POR TIPO DE CREDITO**, e o débito muda conforme a lei
 * tenha autorizado crédito suplementar, especial ou extraordinário. Só a SUPLEMENTAR tem
 * uma analítica única no plano; as outras duas caem na recusa abaixo, que imprime as
 * candidatas lidas do banco. Ver `ROTEIRO-CREDITO-ADICIONAL-POR-TIPO` e
 * `CREDITO-ESPECIAL-ABERTO-OU-REABERTO` em `modules/m01-core-contabil/roteiros.ts`.
 */
const ROTEIROS: readonly {
  readonly tipo:
    | "DOTACAO_INICIAL"
    | "CREDITO_ADICIONAL"
    | "ANULACAO_CREDITO"
    | "RESERVA"
    | "RESERVA_LIBERADA";
  readonly tipoCredito?: "SUPLEMENTAR" | "ESPECIAL" | "EXTRAORDINARIO";
  readonly debito: string;
  readonly credito: string;
  /**
   * Ressalva impressa JUNTO com a recusa, quando as analíticas sob a conta recusada NÃO são
   * as candidatas certas. ⚠️ MEDIDO: para a ANULAÇÃO, a lista automática (filhas do código
   * recusado) mostra o ramo do crédito adicional, que é o ramo ERRADO — e candidata errada é
   * pior que candidata nenhuma para quem vai decidir.
   */
  readonly ressalva?: string;
}[] = [
  { tipo: "DOTACAO_INICIAL", debito: CONTA_DOTACAO_INICIAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "SUPLEMENTAR", debito: CONTA_CREDITO_ADICIONAL_SUPLEMENTAR, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "ESPECIAL", debito: CONTA_CREDITO_ADICIONAL_ESPECIAL, credito: CONTA_CREDITO_DISPONIVEL },
  { tipo: "CREDITO_ADICIONAL", tipoCredito: "EXTRAORDINARIO", debito: CONTA_CREDITO_ADICIONAL_EXTRAORDINARIO, credito: CONTA_CREDITO_DISPONIVEL },
  {
    tipo: "ANULACAO_CREDITO",
    debito: CONTA_CREDITO_DISPONIVEL,
    credito: CONTA_DOTACAO_ADICIONAL,
    ressalva:
      "⚠️ IGNORE as analíticas listadas acima: redução de dotação NÃO mora em 5.2.2.1.2. " +
      "As candidatas reais são DUAS, com o nome IDÊNTICO — 5.2.2.1.3.09.00 (-) CANCELAMENTO " +
      "DE DOTAÇÕES, sob DOTAÇÃO ADICIONAL POR FONTE, e 5.2.2.1.9.04.00 (-) CANCELAMENTO DE " +
      "DOTAÇÕES, sob CANCELAMENTO/REMANEJAMENTO DE DOTAÇÃO.",
  },
  { tipo: "RESERVA", debito: CONTA_CREDITO_DISPONIVEL, credito: CONTA_CREDITO_RESERVADO },
  { tipo: "RESERVA_LIBERADA", debito: CONTA_CREDITO_RESERVADO, credito: CONTA_CREDITO_DISPONIVEL },
];

/** O rótulo do roteiro em uma linha — "CREDITO_ADICIONAL/ESPECIAL" quando há tipo. */
function rotulo(r: { readonly tipo: string; readonly tipoCredito?: string }): string {
  return r.tipoCredito === undefined ? r.tipo : `${r.tipo}/${r.tipoCredito}`;
}

/**
 * ═══ ⚠️ A CONFERÊNCIA CONTINUA IGUAL; O QUE MUDOU É QUEM ELA DERRUBA (V11 V6.1) ═══
 *
 * Conta ausente ou SINTÉTICA continua REPROVANDO — a validação não foi afrouxada uma vírgula, e
 * afrouxá-la para o seed passar seria plantar no banco um roteiro que estoura no meio da primeira
 * transação de ficha. O que mudou é o ALCANCE da reprovação: ela agora derruba **aquele roteiro**,
 * não a instalação inteira.
 *
 * ⚠️ POR QUE, E ISSO FOI MEDIDO. Com o tudo-ou-nada, uma classificação pendente matava
 * `migrate → SQL → PCASP → roteiro → exercício → bootstrap → cenário → percursos`: o procedimento
 * documentado de instalação não terminava, e nenhum banco novo nascia.
 *
 * ⚠️ E O PLACAR MUDOU EM V7.1, PARA MELHOR E PARA PIOR AO MESMO TEMPO. São agora SETE roteiros
 * (o crédito adicional virou três, um por tipo de crédito). Passaram a ser parametrizados a
 * DOTAÇÃO INICIAL e o CRÉDITO ADICIONAL **SUPLEMENTAR** — que é o caso comum de um município.
 * Continuam recusados, cada um com a sua causa nomeada em `modules/m01-core-contabil/roteiros.ts`:
 *
 *   CREDITO_ADICIONAL/ESPECIAL e /EXTRAORDINARIO  `CREDITO-ESPECIAL-ABERTO-OU-REABERTO`
 *     falta um FATO (aberto ou reaberto), não uma conta.
 *   ANULACAO_CREDITO                              `ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS`
 *     o plano tem DUAS analíticas com o nome idêntico, em ramos diferentes.
 *   RESERVA e RESERVA_LIBERADA                    `ROTEIRO-RESERVA-SEM-CONTA`
 *
 * ⚠️ CONSEQUÊNCIA QUE PRECISA SER DITA EM VOZ ALTA: um decreto de crédito adicional por ANULAÇÃO
 * tem DUAS pernas, e a de anulação continua recusada. Em instalação limpa passa a funcionar o
 * crédito suplementar por RECURSO NOVO (superávit financeiro, excesso de arrecadação, operação de
 * crédito); o suplementar por anulação, não.
 *
 * É a mesma doutrina do gerador da MSC (M14): o arquivo SAI, e o furo aparece com nome e conta.
 * Um instalador que se recusa a existir por causa de uma classificação pendente deixa o ente sem
 * nada; um que instala e NOMEIA o que ficou de fora deixa a decisão com quem pode tomá-la.
 *
 * ⚠️ E O FAIL-CLOSED NÃO MUDOU DE LUGAR, ELE CONTINUA ONDE SEMPRE ESTEVE: no USO.
 * `RoteiroOrcamentario` é consultado a cada movimento de dotação, e movimento sem roteiro derruba
 * a operação. Um roteiro NÃO semeado é exatamente um movimento que o sistema recusa — o estado
 * correto para uma classificação contábil que ninguém decidiu.
 */
interface Recusa {
  readonly tipo: string;
  readonly codigo: string;
  readonly motivo: string;
  readonly ressalva?: string;
}

async function contaAnalitica(codigo: string, tipo: string): Promise<{ readonly id: string } | Recusa> {
  const c = await prisma.contaPcasp.findUnique({
    where: { codigo },
    select: { id: true, analitica: true, nome: true },
  });
  if (c === null) {
    return { tipo, codigo, motivo: `a conta não existe no plano carregado. Rode antes: npm run seed:pcasp-oficial.` };
  }
  if (!c.analitica) {
    // As filhas analíticas, lidas do MESMO plano que está no banco — quem for decidir precisa
    // ver as candidatas, e vê-las da fonte, não de uma lista escrita aqui.
    // ⚠️ O PREFIXO É O CÓDIGO SEM OS SEGMENTOS ZERADOS DO FIM, e não um `slice` de tamanho
    // fixo. `slice(0, 9)` acertava enquanto toda sintética aqui era de nível 5; para
    // `5.2.2.1.2.02.00` (CREDITO ADICIONAL - ESPECIAL) ele devolveria `5.2.2.1.2` e listaria
    // como candidata a SUPLEMENTAR, que é de outro ramo — candidata errada é pior que
    // candidata nenhuma para quem vai decidir.
    const segmentos = codigo.split(".");
    while (segmentos.length > 1 && Number(segmentos[segmentos.length - 1]) === 0) segmentos.pop();
    const prefixo = `${segmentos.join(".")}.`;
    const filhas = await prisma.contaPcasp.findMany({
      where: { codigo: { startsWith: prefixo }, analitica: true },
      orderBy: { codigo: "asc" },
      select: { codigo: true, nome: true },
    });
    const candidatas = filhas.map((f) => `${f.codigo} ${f.nome}`).join("; ");
    return {
      tipo,
      codigo,
      motivo:
        `a conta é SINTÉTICA no plano ("${c.nome}") e não recebe partida. ` +
        `Analíticas sob ela: ${candidatas === "" ? "nenhuma" : candidatas}.`,
    };
  }
  return { id: c.id };
}

const recusas: Recusa[] = [];
for (const r of ROTEIROS) {
  const debito = await contaAnalitica(r.debito, rotulo(r));
  const credito = await contaAnalitica(r.credito, rotulo(r));
  const ressalva = r.ressalva === undefined ? {} : { ressalva: r.ressalva };
  if ("motivo" in debito) { recusas.push({ ...debito, ...ressalva }); continue; }
  if ("motivo" in credito) { recusas.push({ ...credito, ...ressalva }); continue; }
  // ⚠️ NÃO É `upsert`: a chave é o PAR (tipo, tipoCredito), e o Prisma recusa `null` dentro
  // de uma chave única composta. O `findFirst` + create/update faz o mesmo trabalho, e quem
  // garante a unicidade é o banco — o índice composto mais o parcial de `prisma/sql/`.
  const ja = await prisma.roteiroOrcamentario.findFirst({
    where: { tipo: r.tipo, tipoCredito: r.tipoCredito ?? null },
    select: { id: true },
  });
  if (ja === null) {
    await prisma.roteiroOrcamentario.create({
      data: {
        tipo: r.tipo,
        tipoCredito: r.tipoCredito ?? null,
        contaDebitoId: debito.id,
        contaCreditoId: credito.id,
        criadoPor: "SEED",
      },
    });
  } else {
    await prisma.roteiroOrcamentario.update({
      where: { id: ja.id },
      data: { contaDebitoId: debito.id, contaCreditoId: credito.id },
    });
  }
}

const todos = await prisma.roteiroOrcamentario.findMany({
  orderBy: [{ tipo: "asc" }, { tipoCredito: "asc" }],
  include: {
    contaDebito: { select: { codigo: true } },
    contaCredito: { select: { codigo: true } },
  },
});

console.log(`ROTEIRO ORÇAMENTÁRIO (${todos.length}):\n`);
for (const r of todos) {
  console.log(
    `  ${rotulo({ tipo: r.tipo, ...(r.tipoCredito === null ? {} : { tipoCredito: r.tipoCredito }) }).padEnd(34)}` +
      ` D ${r.contaDebito.codigo}  /  C ${r.contaCredito.codigo}`
  );
}
console.log(
  `\n  ⚠️ Sem estas linhas nenhuma ficha nasce: o movimento de dotação lança no razão, e o\n` +
    `     lançamento é fail-closed. O EMPENHO não entra aqui — o M05 já o lança pelo roteiro\n` +
    `     que o chamador passa.`
);

if (recusas.length > 0) {
  console.log(`\n  ⚠️ ${recusas.length} ROTEIRO(S) NÃO CONFIGURADO(S) — e o sistema RECUSA o movimento deles:\n`);
  for (const r of recusas) {
    console.log(`     ${r.tipo.padEnd(20)} ${r.codigo}: ${r.motivo}`);
    if (r.ressalva !== undefined) console.log(`       ${r.ressalva}`);
  }
  console.log(
    `\n     Isto NÃO é um seed pela metade: é a classificação contábil que falta, nomeada. Escolher\n` +
      `     a conta aqui seria inventar norma. Ver as pendências CREDITO-ESPECIAL-ABERTO-OU-REABERTO,\n` +
      `     ANULACAO-DE-DOTACAO-DOIS-CANCELAMENTOS-HOMONIMOS e ROTEIRO-RESERVA-SEM-CONTA em\n` +
      `     modules/m01-core-contabil/roteiros.ts.\n` +
      `     A instalação PROSSEGUE: o que depende destes movimentos é que fica recusado.`
  );
}

await prisma.$disconnect();
