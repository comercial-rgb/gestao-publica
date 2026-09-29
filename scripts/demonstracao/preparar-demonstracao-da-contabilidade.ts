import "dotenv/config";
import { execFileSync } from "node:child_process";

/**
 * A DEMONSTRAÇÃO DA CONTABILIDADE (V22), DE PONTA A PONTA, NUM BANCO DE DEMONSTRAÇÃO JÁ PREPARADO
 * por `scripts/preparar-banco-de-percursos.ts` (a massa da POC, o plano oficial, usuários e
 * permissões). Aqui entra o que a apresentação da contabilidade usa por cima dela: cadastros de
 * apoio, correspondências dos demonstrativos, parametrização, execução da despesa, arrecadação,
 * receita prevista da LOA, a folha com encargos, campanhas e a classificação financeiro/permanente.
 *
 * ⚠️ A ORDEM É A DAS DEPENDÊNCIAS, e foi medida num banco limpo (2026-09-28): a parametrização
 * publica o roteiro da reserva que a despesa usa; as naturezas de receita vêm antes da arrecadação
 * e da previsão; a classificação F/P vem por último porque ela PARA se aparecer conta com saldo que
 * não classifica. Cada passo é idempotente — rodar de novo não duplica nada.
 *
 * Uso: DATABASE_URL=postgresql://…/gestao_publica_apresentacao npx tsx scripts/demonstracao/preparar-demonstracao-da-contabilidade.ts
 * Recusa qualquer banco que não seja um dos dois de demonstração.
 */

const url = process.env["DATABASE_URL"] ?? "";
if (!/\/gestao_publica_(local|apresentacao)(\?|$)/.test(url)) {
  throw new Error("Recusado: só prepara os bancos de demonstração (gestao_publica_local ou gestao_publica_apresentacao). Nada foi feito.");
}

const PASSOS: readonly (readonly [string, string])[] = [
  ["naturezas de receita e responsáveis do MANAD", "scripts/demonstracao/cadastrar-apoio-da-demonstracao.ts"],
  ["correspondências da RCL (anexo 3)", "prisma/seed/m12-depara-rcl.ts"],
  ["correspondências da saúde (anexo 12)", "prisma/seed/m12-asps-deparas.ts"],
  ["correspondências da educação (anexo 8)", "prisma/seed/m12-mde-deparas.ts"],
  ["parametrização (roteiros, poder dos órgãos, MANAD)", "scripts/demonstracao/parametrizar-demonstracao.ts"],
  ["execução da despesa (credores, ordens, contratos, reservas)", "scripts/demonstracao/semear-execucao-da-despesa.ts"],
  ["demonstrativos (PPA, LDO, fichas, arrecadação e execução)", "scripts/demonstracao/semear-demonstrativos.ts"],
  ["receita prevista que equilibra a LOA", "scripts/demonstracao/prever-receita-da-loa.ts"],
  ["folha com encargos, empenhada e liquidada", "scripts/demonstracao/semear-folha-da-demonstracao.ts"],
  ["campanhas publicitárias", "scripts/demonstracao/semear-campanhas-publicitarias.ts"],
  ["classificação financeiro/permanente das contas com saldo", "prisma/seed/m12-indicador-superavit-demo.ts"],
];

for (const [rotulo, arquivo] of PASSOS) {
  console.log(`\n[demonstração] ${rotulo}`);
  try {
    execFileSync("npx", ["tsx", arquivo], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  } catch {
    throw new Error(`[demonstração] o passo "${rotulo}" falhou — veja a saída acima. Os passos anteriores ficaram gravados; corrija e rode de novo (é idempotente).`);
  }
}
console.log("\n[demonstração] pronta.");
