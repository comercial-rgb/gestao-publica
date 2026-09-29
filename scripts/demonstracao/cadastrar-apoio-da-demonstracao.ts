import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { registrarContabilistaDoManad, registrarEmpresaGeradoraDoManad } from "../../modules/m01-core-contabil/responsaveis-do-manad.js";
import { cadastrarNaturezaReceita } from "../../modules/m04-receita/ementario.js";

/**
 * OS CADASTROS DE APOIO DA DEMONSTRAÇÃO DA CONTABILIDADE (V22) — o que no banco local foi digitado
 * pela tela e não tinha script: as naturezas de receita das arrecadações de IPTU, ITBI e ISS (códigos
 * e descrições do ementário da STN de 2026) e os responsáveis do MANAD (contador e empresa geradora,
 * fictícios e identificados como de demonstração).
 *
 * Cada item passa pelo MESMO serviço da tela (`/receita/naturezas`, `/exportacoes/manad`), com
 * autorização. Idempotente: o que já existe não é cadastrado de novo.
 *
 * Roda antes de `parametrizar-demonstracao.ts`, que classifica as naturezas para o MANAD.
 * Recusa rodar fora dos dois bancos de demonstração.
 */

const AUTOR = "admin@cg.pb.gov.br";

const NATUREZAS = [
  { codigo: "11130311", descricao: "IRRF - Trabalho - Principal" },
  { codigo: "11180111", descricao: "IPTU - Principal" },
  { codigo: "11180112", descricao: "IPTU - Multas e Juros de Mora" },
  { codigo: "11180113", descricao: "IPTU - Dívida Ativa" },
  { codigo: "11180114", descricao: "IPTU - M&J de Mora da Dívida Ativa" },
  { codigo: "11180141", descricao: "ITBI - Principal" },
  { codigo: "11180231", descricao: "ISSQN - Principal" },
  { codigo: "11180232", descricao: "ISSQN - Multas e Juros de Mora" },
] as const;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!/\/gestao_publica_(local|apresentacao)(\?|$)/.test(url)) {
    throw new Error("Recusado: este script só cadastra nos bancos de demonstração (gestao_publica_local ou gestao_publica_apresentacao). Nada foi feito.");
  }
  const prisma = criarPrismaClient(url);
  try {
    for (const n of NATUREZAS) {
      const ja = await prisma.naturezaReceita.findUnique({ where: { codigo: n.codigo }, select: { id: true } });
      if (ja !== null) {
        console.log(`= natureza ${n.codigo}: já cadastrada`);
        continue;
      }
      await cadastrarNaturezaReceita(prisma, { ...n, criadoPor: AUTOR });
      console.log(`+ natureza ${n.codigo}: ${n.descricao}`);
    }

    if ((await prisma.manadContabilista.count()) === 0) {
      await registrarContabilistaDoManad(
        prisma,
        {
          nome: "Contador de Demonstração",
          cpf: "12345678909",
          crc: "PB-000000/O",
          dtInicio: "2026-01-01",
          email: "contador.demonstracao@exemplo.invalid",
          criadoPor: AUTOR,
        },
        new Date()
      );
      console.log("+ MANAD: contador de demonstração");
    } else console.log("= MANAD: contador já registrado");

    if ((await prisma.manadEmpresaGeradora.count()) === 0) {
      await registrarEmpresaGeradoraDoManad(
        prisma,
        {
          empresaOuTecnico: "Engine Sistemas",
          cargo: "Fornecedora do sistema de gestão pública",
          cnpj: "11222333000181",
          dtInicioServico: "2026-01-01",
          criadoPor: AUTOR,
        },
        new Date()
      );
      console.log("+ MANAD: empresa geradora");
    } else console.log("= MANAD: empresa geradora já registrada");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
