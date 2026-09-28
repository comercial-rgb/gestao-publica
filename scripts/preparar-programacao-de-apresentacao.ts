import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarM02Deps } from "../modules/m02-planejamento/adapter-prisma.js";
import { criarReceitaPrevista } from "../modules/m02-planejamento/servico.js";

/**
 * ═══ A PREVISÃO DA RECEITA QUE O CRONOGRAMA REPARTE (V19) ═══
 *
 * O cronograma mensal de desembolso é proposto A PARTIR DA PREVISÃO DA LOA: cada fonte tem a
 * previsão dela repartida em doze cotas que fecham ao centavo. Medido no banco de apresentação
 * montado pela sequência canônica: **zero `ReceitaPrevista`** — a massa de demonstração cria a
 * dotação (o lado da despesa) e a arrecadação (o realizado), mas não a PREVISÃO (o lado do
 * orçamento). Sem ela, "propor o cronograma da lei orçamentária" recusa nomeando, corretamente:
 * não há o que repartir.
 *
 * ⚠️ E ISSO NÃO É MULETA DE TESTE: o cenário de apresentação começa com um orçamento, e um
 * orçamento tem os dois lados. A previsão entra pelo SERVIÇO de domínio (`criarReceitaPrevista`,
 * autorizado no escopo do ente), com a natureza e a fonte que o banco já tem — nenhum código de
 * classificação inventado.
 *
 * Uso:  DATABASE_URL=<banco de apresentação> npx tsx scripts/preparar-programacao-de-apresentacao.ts
 */

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const ANO = Number(process.env["EXERCICIO"] ?? new Date().getFullYear());

/**
 * ⚠️ O VALOR É O DA DOTAÇÃO DA MASSA (150.000,00), e a igualdade é deliberada: com receita
 * prevista igual à despesa fixada, o orçamento de demonstração está EQUILIBRADO — que é o primeiro
 * número que qualquer comissão confere, e o que o relatório de consistência da lei orçamentária
 * verifica.
 */
const VALOR_PREVISTO = process.env["VALOR_PREVISTO"] ?? "150000.00";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url === "") throw new Error("DATABASE_URL ausente.");
  const prisma = criarPrismaClient(url);
  try {
    const natureza = await prisma.naturezaReceita.findFirstOrThrow({
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    });
    const fonte = await prisma.fonteRecurso.findFirstOrThrow({
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    });

    const jaTem = await prisma.receitaPrevista.count({ where: { exercicio: ANO } });
    if (jaTem > 0) {
      console.log(`[ja existe] ${jaTem} previsão(ões) de receita em ${ANO} — nada a fazer.`);
      return;
    }

    const id = await criarReceitaPrevista(
      {
        exercicio: ANO,
        naturezaReceita: natureza.codigo,
        fonte: fonte.codigo,
        // ⚠️ 1 = exercício ATUAL (é o `exercicioFonteRecurso` do leiaute do tribunal, não um ano).
        exercicioFonte: 1,
        tipoReceita: "ORCAMENTARIA",
        valorPrevisto: VALOR_PREVISTO,
        criadoPor: POR,
      },
      criarM02Deps(prisma)
    );
    console.log(
      `[ok] previsão de receita ${natureza.codigo} (${natureza.descricao}) · fonte ${fonte.codigo} · ` +
        `${ANO} · R$ ${VALOR_PREVISTO} — id ${id}`
    );
    console.log(
      "     agora o cronograma mensal pode ser proposto pela tela: /planejamento/cmd-mba"
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
