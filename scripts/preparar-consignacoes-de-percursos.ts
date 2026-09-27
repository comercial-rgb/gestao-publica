import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { registrarIngressoExtra } from "../modules/m07-extraorcamentario/extraorcamentario.js";
import { roteiroIngressoExtra } from "../modules/m07-extraorcamentario/dominio.js";

/**
 * ═══ A SEGUNDA RETENÇÃO, NO EXERCÍCIO SEGUINTE (C34) ═══
 *
 * O banco de percursos já traz uma retenção de ISS de 2026 e um recolhimento de 300,00 **sem
 * composição** — herdado, de antes da composição existir. Falta o que torna o C34 verificável: uma
 * retenção do exercício SEGUINTE, na MESMA obrigação, para que uma guia possa compor as duas e
 * "vincular a retenções atuais ou anteriores" deixe de ser frase.
 *
 * ⚠️ FIXTURE N=2 POR CONSTRUÇÃO: com uma retenção só, a composição por origem passaria por
 * vacuidade — havendo uma origem possível, qualquer implementação que ignorasse a origem acertaria.
 *
 * ⚠️ E O RECOLHIMENTO HERDADO É O ACHADO QUE ELA DEIXA À VISTA: ele reduz o saldo AGREGADO e não
 * reduz o que cada retenção tem a recolher, porque não disse de onde saiu. A diferença entre as
 * duas medidas é exatamente ele — e é essa diferença que a coluna "recolhido sem composição"
 * existe para nomear, em vez de deixar o operador descobrir na conferência do tribunal.
 *
 * Pelos COMANDOS DE DOMÍNIO, nunca por INSERT.
 *
 * Uso:  DATABASE_URL=<clone dos percursos> npx tsx scripts/preparar-consignacoes-de-percursos.ts
 */

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const VALOR = "300.00";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url.endsWith("/gestao_publica_percursos")) {
    throw new Error(
      "Esta fixture GRAVA fatos. Aponte DATABASE_URL para um clone — o banco base serve outras frentes."
    );
  }
  const prisma = criarPrismaClient(url);
  try {
    // A obrigação e as contas saem do que JÁ existe: nada de tipo novo, nada de conta nova.
    const modelo = await prisma.movimentoExtraorcamentario.findFirst({
      where: { tipo: "INGRESSO" },
      orderBy: { data: "asc" },
      select: {
        tipoConsignacaoId: true,
        credorConsignatario: true,
        contaBancaria: { select: { codigo: true, fonteId: true, contaContabilId: true } },
        tipoConsignacao: { select: { codigo: true, contaPassivo: { select: { codigo: true } } } },
      },
    });
    if (modelo === null) {
      throw new Error(
        "Este banco não tem nenhuma retenção para servir de modelo. A fixture compõe sobre o " +
          "preparador de percursos e não cria consignação nem conta bancária própria."
      );
    }
    const passivo = modelo.tipoConsignacao.contaPassivo?.codigo;
    if (passivo === undefined || passivo === null) {
      throw new Error(
        `A consignação ${modelo.tipoConsignacao.codigo} não tem conta de passivo. Nada foi gravado.`
      );
    }
    const contaContabilId = modelo.contaBancaria.contaContabilId;
    if (contaContabilId === null) {
      throw new Error(
        `A conta bancária ${modelo.contaBancaria.codigo} não tem conta contábil. Nada foi gravado.`
      );
    }
    const disponibilidade = await prisma.contaPcasp.findUniqueOrThrow({
      where: { id: contaContabilId },
      select: { codigo: true },
    });

    const ja = await prisma.movimentoExtraorcamentario.count({
      where: { tipo: "INGRESSO", data: { gte: new Date("2027-01-01T00:00:00Z") } },
    });
    if (ja > 0) {
      console.log("[fixture] já existe retenção de 2027 — nada a fazer.");
      return;
    }

    const r = await registrarIngressoExtra(
      prisma,
      {
        tipoConsignacaoId: modelo.tipoConsignacaoId,
        credorConsignatario: modelo.credorConsignatario,
        contaBancaria: modelo.contaBancaria.codigo,
        fonteId: modelo.contaBancaria.fonteId,
        valor: VALOR,
        data: new Date("2027-02-10T12:00:00Z"),
        historico: "Retencao de fevereiro de 2027",
        criadoPor: POR,
      } as never,
      roteiroIngressoExtra({
        disponibilidade: disponibilidade.codigo,
        consignacaoAPagar: passivo,
      })
    );
    console.log(
      `[fixture] retencao de ${VALOR} em 2027-02-10 registrada para ${modelo.tipoConsignacao.codigo} / ` +
        `${modelo.credorConsignatario} (${r.movimentoId}).`
    );
    console.log("[fixture] pronta: DUAS retencoes, em exercicios diferentes, na mesma obrigacao.");
  } finally {
    await prisma.$disconnect();
  }
}

await main();
