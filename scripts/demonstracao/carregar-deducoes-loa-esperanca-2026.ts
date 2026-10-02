import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { criarM02Deps } from "../../modules/m02-planejamento/adapter-prisma.js";
import { criarReceitaPrevista } from "../../modules/m02-planejamento/servico.js";
import { detalharReceitaPrevista } from "../../modules/m02-planejamento/detalhe-da-receita-prevista.js";
import { cadastrarNaturezaReceita } from "../../modules/m04-receita/ementario.js";
import { toMoney } from "../../packages/contracts/index.js";

/**
 * V26 (ordem, item 2.5) — AS DEDUÇÕES DA RECEITA PREVISTA DA LOA 2026 DE ESPERANÇA, como o Anexo II da Lei 613/2025 as traz.
 *
 * Quatro linhas, fonte 500, todas dedução para o Fundeb (tipo 3 do Tribunal), com o código local ".00" preservado no
 * detalhe. Nenhuma linha dos tipos 4 e 5 (o anexo não as traz), e o ITR fica fora (dedução zero no anexo): nada é
 * acrescentado para cobrir a tabela. A diferença de R$ 11.760,00 para o demonstrativo da MDE é registrada em
 * `docs/oficial/esperanca/loa-2026-deducoes.md`, não corrigida aqui.
 *
 * Idempotente: a linha que já existe com o mesmo valor é mantida; com valor diferente, o script para e diz qual, sem
 * alterar nada (a previsão publicada não se reescreve por carga). Fail-closed: natureza ou fonte ausente para tudo.
 *
 * Uso: CARGA_POR=<identificador de quem carrega> DATABASE_URL=<banco> npx tsx scripts/demonstracao/carregar-deducoes-loa-esperanca-2026.ts
 */

const DOCUMENTO = "Lei 613/2025 (LOA 2026 de Esperança), Anexo II";
const LINHAS = [
  // A descrição é a do ementário da STN 2026 (aba 2, linhas 1211, 1294, 1295 e 1296, do agregador terminado em 0),
  // com " - Principal" pelo último dígito 1 (ver docs/oficial/stn-sof/ementario-2026/LEIA-ME.md).
  { natureza: "17115111", descricao: "FPM mensal", ementario: "Cota-Parte do Fundo de Participação dos Municípios - Cota Mensal - Principal", valor: "10147500.00" },
  { natureza: "17215001", descricao: "ICMS", ementario: "Cota-Parte do ICMS - Principal", valor: "2940300.00" },
  { natureza: "17215101", descricao: "IPVA", ementario: "Cota-Parte do IPVA - Principal", valor: "427900.00" },
  { natureza: "17215201", descricao: "IPI", ementario: "Cota-Parte do IPI - Municípios - Principal", valor: "1540.00" },
] as const;
const TOTAL = "13517240.00";

async function main(): Promise<void> {
  const por = process.env.CARGA_POR ?? "";
  if (por === "") throw new Error("Informe CARGA_POR (o identificador do usuário que responde pela carga).");
  const soma = LINHAS.reduce((s, l) => s.plus(toMoney(l.valor)), toMoney("0"));
  if (!soma.equals(toMoney(TOTAL))) throw new Error(`A soma das linhas (${soma.toFixed(2)}) não é o total do anexo (${TOTAL}).`);

  const url = process.env.DATABASE_URL ?? "";
  if (url === "") throw new Error("Informe DATABASE_URL (o banco em que a carga entra).");
  const prisma = criarPrismaClient(url);
  try {
    // A natureza que falta no cadastro entra pelo ementário da STN (a descrição oficial acima), não inventada.
    for (const l of LINHAS) {
      if ((await prisma.naturezaReceita.findUnique({ where: { codigo: l.natureza }, select: { id: true } })) !== null) continue;
      await cadastrarNaturezaReceita(prisma, { codigo: l.natureza, descricao: l.ementario, criadoPor: por });
      console.log(`+ natureza ${l.natureza} ${l.ementario}`);
    }
    const fonte = await prisma.fonteRecurso.findFirst({ where: { codigo: "500" }, select: { id: true } });
    const naturezas = await prisma.naturezaReceita.findMany({ where: { codigo: { in: LINHAS.map((l) => l.natureza) } }, select: { id: true, codigo: true } });
    const faltam = [...(fonte === null ? ["fonte 500"] : []), ...LINHAS.filter((l) => !naturezas.some((n) => n.codigo === l.natureza)).map((l) => `natureza ${l.natureza} (${l.descricao})`)];
    if (faltam.length > 0) throw new Error(`Cadastro ausente, nada foi gravado: ${faltam.join(", ")}.`);

    // Primeiro confere tudo; só depois grava (uma divergência no meio não deixa carga pela metade).
    const existentes = await prisma.receitaPrevista.findMany({
      where: { exercicio: 2026, tipoReceita: "DEDUCAO", exercicioFonte: 1, fonteId: fonte!.id, naturezaReceita: { codigo: { in: LINHAS.map((l) => l.natureza) } } },
      select: { id: true, valorPrevisto: true, naturezaReceita: { select: { codigo: true } }, detalhe: { select: { tipoDeducaoSagres: true } } },
    });
    for (const e of existentes) {
      const l = LINHAS.find((x) => x.natureza === e.naturezaReceita.codigo)!;
      if (!toMoney(e.valorPrevisto.toFixed(2)).equals(toMoney(l.valor))) {
        throw new Error(`A dedução ${l.natureza} já está prevista com ${e.valorPrevisto.toFixed(2)}, e o anexo traz ${l.valor}. Nada foi gravado; confira a origem antes.`);
      }
      if (e.detalhe !== null && e.detalhe.tipoDeducaoSagres !== "3") throw new Error(`A dedução ${l.natureza} já tem outro subtipo (${e.detalhe.tipoDeducaoSagres ?? "nenhum"}). Nada foi gravado.`);
    }

    const deps = criarM02Deps(prisma);
    for (const l of LINHAS) {
      let id = existentes.find((e) => e.naturezaReceita.codigo === l.natureza)?.id;
      const ja = id !== undefined;
      id ??= await criarReceitaPrevista({ exercicio: 2026, naturezaReceita: l.natureza, fonte: "500", exercicioFonte: 1, tipoReceita: "DEDUCAO", valorPrevisto: l.valor, criadoPor: por }, deps);
      const temDetalhe = existentes.find((e) => e.id === id)?.detalhe != null;
      if (!temDetalhe) await detalharReceitaPrevista(prisma, { receitaPrevistaId: id, tipoDeducaoSagres: "3", codigoNoDocumento: `${l.natureza}.00`, documento: DOCUMENTO, criadoPor: por });
      console.log(`${ja ? "=" : "+"} ${l.natureza} ${l.descricao}: ${l.valor} (dedução para o Fundeb)`);
    }
    console.log(`Total das deduções: ${TOTAL}. A diferença para o demonstrativo da MDE fica registrada no documento da carga.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
