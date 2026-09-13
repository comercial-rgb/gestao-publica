import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { criarUsuario, concederPerfil } from "../modules/m16-travamento/servico-usuarios.js";
import type { PrismaClient } from "../prisma/generated/client/client.js";
import type { AcaoDoSistema } from "../modules/m16-travamento/acoes.js";

/**
 * USUÁRIOS SINTÉTICOS POR PAPEL — banco dos PERCURSOS (V6 P1.3 / V4 §9).
 *
 * Cria, se não existirem, quatro perfis e quatro usuários com o recorte de cada função — nunca o
 * admin universal em todos os passos. A leitura é permissão (V3 4.1): cada perfil recebe o
 * CONSULTAR_<ÁREA> das áreas em que age. Concessões GLOBAIS (o ente): os smokes exercitam o ente
 * inteiro; a segregação por unidade continua provada pelo `operador.poc` (ENT10).
 *
 * Uso: `DATABASE_URL=<percursos> SEED_IDENTIDADE=admin@... npx tsx scripts/percursos-usuarios-por-papel.ts`
 * Senha: `PERCURSOS_SENHA_PAPEIS` (ou a padrão de demonstração abaixo). Não é produção.
 * Idempotente: usuário existente é no-op (senha inalterada); perfil órfão de execução anterior é refeito.
 */

const ADMIN = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["PERCURSOS_SENHA_PAPEIS"] ?? "Percurso#2026";

interface Papel {
  readonly identificador: string;
  readonly nome: string;
  readonly perfil: string;
  readonly descricao: string;
  readonly acoes: readonly AcaoDoSistema[];
}

export const PAPEIS: readonly Papel[] = [
  {
    identificador: "compras@percursos.local",
    nome: "Servidor de Compras (percurso)",
    perfil: "COMPRAS — PERCURSO",
    descricao: "Solicita, autoriza, pesquisa preços, emite e vincula ordens. Não recebe, não empenha, não paga.",
    acoes: ["REGISTRAR_SOLICITACAO_DE_COMPRA", "MOVIMENTAR_SOLICITACAO_DE_COMPRA", "REGISTRAR_PESQUISA_DE_PRECOS", "EMITIR_ORDEM_DE_COMPRA", "ESTORNAR_ORDEM_DE_COMPRA", "CONSULTAR_LICITACOES", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "almoxarifado@percursos.local",
    nome: "Almoxarife (percurso)",
    perfil: "ALMOXARIFADO — PERCURSO",
    descricao: "Registra e confere o documento fiscal e o recebimento da ordem. Não emite ordem, não empenha.",
    acoes: ["REGISTRAR_RECEBIMENTO_DE_ORDEM", "REGISTRAR_DOCUMENTO_FISCAL", "CONFERIR_DOCUMENTO_FISCAL", "CONSULTAR_LICITACOES", "CONSULTAR_PATRIMONIO", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "contabilidade@percursos.local",
    nome: "Contador (percurso)",
    perfil: "CONTABILIDADE — PERCURSO",
    descricao: "Empenha e liquida. Não paga, não compra.",
    acoes: ["EMPENHAR", "LIQUIDAR", "CONSULTAR_DESPESA", "CONSULTAR_LICITACOES", "CONSULTAR_PLANEJAMENTO", "CONSULTAR_CONTABILIDADE", "CONSULTAR_CADASTROS"],
  },
  {
    identificador: "tesouraria@percursos.local",
    nome: "Tesoureiro (percurso)",
    perfil: "TESOURARIA — PERCURSO",
    descricao: "Paga, arrecada e concilia. Não empenha, não compra.",
    acoes: ["PAGAR", "REGISTRAR_ARRECADACAO", "VINCULAR_CONCILIACAO", "ABRIR_CONCILIACAO", "ENCERRAR_CONCILIACAO", "REGISTRAR_PENDENCIA_MANUAL", "JUSTIFICAR_PENDENCIA", "ATRIBUIR_CONTA_A_ARRECADACAO", "CONSULTAR_DESPESA", "CONSULTAR_RECEITA", "CONSULTAR_FINANCEIRO", "CONSULTAR_CADASTROS"],
  },
];

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida (.env).");
  const prisma = criarPrismaClient(url) as unknown as PrismaClient;
  try {
    for (const papel of PAPEIS) {
      const ja = await prisma.usuario.findUnique({ where: { identificador: papel.identificador }, select: { id: true } });
      if (ja !== null) {
        console.log(`[papéis] ${papel.identificador} já existe — no-op.`);
        continue;
      }
      const orfao = await prisma.perfil.findFirst({ where: { nome: papel.perfil }, select: { id: true } });
      if (orfao !== null) {
        await prisma.$transaction(async (tx) => {
          await tx.permissaoDePerfil.deleteMany({ where: { perfilId: orfao.id } });
          await tx.perfil.delete({ where: { id: orfao.id } });
        });
      }
      const perfil = await prisma.$transaction(async (tx) => {
        const p = await tx.perfil.create({ data: { nome: papel.perfil, descricao: papel.descricao, criadoPor: ADMIN }, select: { id: true } });
        await tx.permissaoDePerfil.createMany({ data: papel.acoes.map((acao) => ({ perfilId: p.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
        return p;
      });
      const { usuarioId } = await criarUsuario(prisma, { nome: papel.nome, email: papel.identificador, senhaInicial: SENHA, criadoPor: ADMIN });
      await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
      console.log(`[papéis] ${papel.identificador} CRIADO — perfil "${papel.perfil}": ${papel.acoes.length} permissões globais.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e: unknown) => {
  console.error("[papéis] FALHOU:", e instanceof Error ? e.message : e);
  process.exit(1);
});
