import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarM02Deps } from "../modules/m02-planejamento/adapter-prisma.js";
import { criarReceitaPrevista } from "../modules/m02-planejamento/servico.js";

/**
 * ═══ O VOCABULÁRIO DA GUIA REPARTIDA ENTRE FONTES (V16/C30) ═══
 *
 * O banco de percursos tem UMA natureza de receita (11130211), UMA fonte (500), NENHUMA previsão
 * na LOA e contas com o rol VAZIO. Falta o que torna o C30 verificável, e cada peça por um motivo:
 *
 *   · UMA SEGUNDA FONTE, de natureza de destinação DIFERENTE (540/FUNDEB, vinculada). Com duas
 *     fontes ORDINÁRIAS a partição da classe 7 passaria por vacuidade — as duas debitariam a mesma
 *     conta, e um roteiro que ignorasse a natureza acertaria por acidente.
 *   · UMA TERCEIRA FONTE **FORA DA PREVISÃO** (700), para o caso da "alteração autorizada no ato":
 *     é ela que exige o motivo escrito e a autorização própria.
 *   · A PREVISÃO DA LOA nas duas primeiras — sem ela a tela do segundo passo não tem que fontes
 *     oferecer, e "conforme LOA" não é verificável.
 *
 * ⚠️ O QUE ESTA FIXTURE **NÃO** FAZ, DE PROPÓSITO: não declara a natureza de destinação das fontes
 * nem mexe no rol das contas. As duas coisas TÊM TELA agora
 * (`/contabilidade/natureza-das-fontes` e `/financeiro/contas-bancarias`), e é o percurso que as
 * exercita — preparar por fora justamente o que a tela faz seria esconder o que se quer medir.
 *
 * ⚠️ A PREVISÃO ENTRA PELO COMANDO DE DOMÍNIO (`criarReceitaPrevista`), não por INSERT. As FONTES
 * entram por `create` porque fonte de recurso não tem serviço de cadastro em nenhum módulo — é
 * cadastro básico, e a ausência fica nomeada aqui em vez de virar um INSERT sem explicação.
 *
 * Uso:  DATABASE_URL=<clone dos percursos> npx tsx scripts/preparar-receita-por-fontes-de-percursos.ts
 */

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const ANO = new Date().getFullYear();

/** As fontes da fixture: a vinculada que a LOA prevê e a que ela NÃO prevê. */
const FONTES = [
  { codigo: "540", descricao: "FUNDEB - vinculado a educacao", codigoTce: "540" },
  { codigo: "700", descricao: "Convenio federal sem credito na LOA", codigoTce: "700" },
];

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url.endsWith("/gestao_publica_percursos")) {
    throw new Error(
      "Esta fixture GRAVA cadastro e previsao. Aponte DATABASE_URL para um clone — o banco base serve outras frentes."
    );
  }
  const prisma = criarPrismaClient(url);
  try {
    const natureza = await prisma.naturezaReceita.findFirst({
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    });
    if (natureza === null) {
      throw new Error(
        "Este banco nao tem natureza de receita cadastrada. A fixture compoe sobre o preparador de percursos."
      );
    }

    for (const f of FONTES) {
      const ja = await prisma.fonteRecurso.findUnique({ where: { codigo: f.codigo }, select: { codigo: true } });
      if (ja !== null) {
        console.log(`[fixture] fonte ${f.codigo} ja existe`);
        continue;
      }
      await prisma.fonteRecurso.create({ data: f });
      console.log(`[fixture] fonte ${f.codigo} cadastrada — ${f.descricao}`);
    }

    // ⚠️ A PREVISÃO SÓ NAS DUAS PRIMEIRAS (500 e 540). A 700 fica FORA: é ela que faz a tela pedir
    // motivo escrito e o servidor cobrar a autorização própria. Prever as três apagaria o caso.
    const deps = criarM02Deps(prisma);
    for (const par of [
      { fonte: "500", valorPrevisto: "1000000.00" },
      { fonte: "540", valorPrevisto: "400000.00" },
    ]) {
      const ja = await prisma.receitaPrevista.findFirst({
        where: {
          exercicio: ANO,
          naturezaReceita: { codigo: natureza.codigo },
          fonte: { codigo: par.fonte },
        },
        select: { id: true },
      });
      if (ja !== null) {
        console.log(`[fixture] previsao ${natureza.codigo}/${par.fonte} ja existe`);
        continue;
      }
      await criarReceitaPrevista(
        {
          exercicio: ANO,
          naturezaReceita: natureza.codigo,
          fonte: par.fonte,
          exercicioFonte: 1,
          tipoReceita: "ORCAMENTARIA",
          valorPrevisto: par.valorPrevisto,
          criadoPor: POR,
        },
        deps
      );
      console.log(
        `[fixture] LOA ${String(ANO)}: ${natureza.codigo} previsto em ${par.fonte} = ${par.valorPrevisto}`
      );
    }

    const contas = await prisma.contaBancaria.findMany({
      where: { contaContabilId: { not: null } },
      select: { codigo: true, fonte: { select: { codigo: true } } },
      orderBy: { codigo: "asc" },
    });
    if (contas.length === 0) {
      throw new Error(
        "Nenhuma conta bancaria com conta contabil mapeada: a guia nao saberia em que conta do razao o dinheiro entrou."
      );
    }
    console.log(
      `[fixture] contas disponiveis (rol pela TELA): ${contas.map((c) => `${c.codigo} (padrao ${c.fonte.codigo})`).join(", ")}`
    );
    console.log(
      `[fixture] natureza do percurso: ${natureza.codigo} — ${natureza.descricao}; ` +
        `fontes previstas 500 e 540; fonte FORA da previsao: 700.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
