import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { limparBanco } from "../test/limpar-banco.js";
import { semearSagresPoc } from "../prisma/seed/sagres-poc.js";
import { lerFatosEmpenhos, validarDominioEmpenhos } from "../adapters/tribunais/tce-pb/sagres/index.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";

/**
 * POC — O ERRO PROPOSITAL E A SUA CORREÇÃO, em um comando (passos 6 e 7 do roteiro).
 *
 * ⚠️ POR QUE UM SCRIPT, E NÃO O TESTE. `prisma/seed/sagres-poc-erro.test.ts` já prova os dois
 * lados, mas a saída do Vitest é "2 passed" — ela não MOSTRA a rejeição. Numa demonstração, o que
 * convence é o validador NOMEANDO o arquivo, o campo, a regra e o valor recusado. Este script roda
 * exatamente a mesma lógica do teste e IMPRIME o que o teste apenas afirma.
 *
 * ═══ ⚠️ POR QUE ISTO NÃO PODE RODAR NO BANCO DA DEMONSTRAÇÃO ═══
 * Duas razões, e as duas são intransponíveis:
 *   1. `semearSagresPoc` é IDEMPOTENTE por guarda da UG POC — num banco já semeado ele é no-op,
 *      então a variante com erro simplesmente NÃO nasceria e o passo 6 mostraria um verde falso;
 *   2. plantar um subelemento inválido na massa principal contaminaria tudo o que vem depois —
 *      e o roteiro promete à Comissão que "a variante é isolada por construção".
 * Por isso este script exige `DATABASE_URL_TEST` e opera SÓ nela, LIMPANDO-A antes. A massa da
 * apresentação não é tocada em nenhum momento — e é isso que se diz à Comissão, com verdade.
 *
 * Uso:  npm run poc:erro-proposital
 */

const UG = "999001";
const DIA_EMPENHO = new Date(Date.UTC(2026, 6, 10)); // 10/07/2026 — o dia do empenho na massa
const POR = "m05@cg.pb.gov.br";

const linha = (c = "─"): string => c.repeat(78);

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL_TEST"];
  const urlDemo = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL_TEST não definida. Este script SÓ roda em base descartável — é o que garante " +
        "que a massa da apresentação não é tocada. Configure-a no .env e rode de novo."
    );
  }
  if (url === urlDemo) {
    throw new Error(
      "DATABASE_URL_TEST é IGUAL a DATABASE_URL. Recusado: este script LIMPA a base em que roda, e " +
        "apontá-lo para o banco da demonstração apagaria a massa da POC. Nada foi tocado."
    );
  }

  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    console.log(linha("═"));
    console.log("POC — VARIANTE COM ERRO PROPOSITAL (passo 6) e CORREÇÃO (passo 7)");
    console.log(`base descartável: ${url.replace(/:\/\/[^@]*@/, "://***@")}`);
    console.log(`massa da apresentação: INTOCADA (${urlDemo?.replace(/:\/\/[^@]*@/, "://***@") ?? "—"})`);
    console.log(linha("═"));

    // ── PASSO 6 — A VARIANTE COM O ERRO ──────────────────────────────────────
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { comErroProposital: true, criadoPor: POR });
    const comErro = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: DIA_EMPENHO });
    const violacoes = validarDominioEmpenhos(comErro);

    console.log("\n▶ PASSO 6 — variante com subelemento FORA do domínio oficial\n");
    console.log(`  Empenhos lidos: ${comErro.length} · subelemento gravado: "${comErro[0]?.codSubelemento ?? "—"}"`);
    if (violacoes.length === 0) {
      throw new Error("ESPERAVA REJEIÇÃO E NÃO HOUVE — a variante não plantou o erro. NÃO use este passo na POC.");
    }
    console.log(`\n  🛑 ${violacoes.length} VIOLAÇÃO(ÕES) — o pacote NÃO é liberado:\n`);
    for (const v of violacoes) {
      console.log(`     arquivo : ${"arquivo" in v ? String(v.arquivo) : "Empenhos.txt"}`);
      console.log(`     campo   : ${v.campo}`);
      console.log(`     regra   : ${v.regra}`);
      console.log(`     detalhe : ${v.detalhe}`);
      console.log("");
    }

    // ── PASSO 7 — A CORREÇÃO ─────────────────────────────────────────────────
    // O "conserto" é o seed PADRÃO: subelemento 040, que consta da tabela oficial. Mesma massa,
    // mesmas regras, mesmo validador — muda só o valor que estava errado.
    await limparBanco(prisma);
    await semearSagresPoc(prisma, { criadoPor: POR });
    const corrigido = await lerFatosEmpenhos(prisma, { codUnidadeGestora: UG, dia: DIA_EMPENHO });
    const depois = validarDominioEmpenhos(corrigido);

    console.log(linha());
    console.log("\n▶ PASSO 7 — corrigido e revalidado pelas MESMAS regras\n");
    console.log(`  Subelemento agora: "${corrigido[0]?.codSubelemento ?? "—"}" (consta da tabela oficial)`);
    if (depois.length > 0) {
      console.log(`\n  🛑 ainda há ${depois.length} violação(ões) — NÃO apresente este passo.`);
      process.exitCode = 1;
      return;
    }
    console.log("\n  ✅ 0 VIOLAÇÃO — pacote liberado localmente.\n");
    console.log(linha("═"));
    console.log("Resultado local — NÃO é aceite do TCE. Nenhuma transmissão foi realizada.");
    console.log("A massa da apresentação não foi tocada por este comando.");
    console.log(linha("═"));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("[poc:erro-proposital] FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
