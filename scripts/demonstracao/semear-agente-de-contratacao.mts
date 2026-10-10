import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import { concederPerfil, criarUsuario } from "../../modules/m16-travamento/servico-usuarios.js";

/**
 * V39-R2 — SÓ o papel do agente de contratação da base fictícia, para uma base já semeada antes dele (o semeador inteiro
 * já o inclui). Mesmo caminho do semeador: perfil com as ações, usuário pelo serviço, concessão pelo serviço. Idempotente.
 * Recusa base que não esteja declarada como de demonstração ou ensaio.
 * Uso: DATABASE_URL=<…/gestao_publica_esperanca_ficticio> [FICTICIO_SENHA=…] npx tsx scripts/demonstracao/semear-agente-de-contratacao.mts
 */
const ADMIN = process.env["FICTICIO_ADMIN"] ?? "admin@cg.pb.gov.br";
const SENHA = process.env["FICTICIO_SENHA"] ?? "Ficticio#2026";
const EMAIL = "agente.contratacao@ficticio.local";
const ACOES = ["CADASTRAR_PROCESSO", "REGISTRAR_RESULTADO_DA_LICITACAO", "CADASTRAR_CONTRATO", "CONSULTAR_LICITACOES", "CONSULTAR_CADASTROS"] as const;
const prisma = criarPrismaClient(process.env["DATABASE_URL"] ?? "");
try {
  const natureza = await prisma.declaracaoDaNaturezaDaBase.findFirst({ orderBy: { numero: "desc" }, select: { natureza: true } });
  if (natureza === null || !["DEMONSTRACAO", "ENSAIO"].includes(natureza.natureza)) throw new Error(`Recusado: a base não está declarada como de demonstração ou ensaio (${natureza?.natureza ?? "não declarada"}).`);
  if ((await prisma.usuario.findUnique({ where: { identificador: EMAIL }, select: { id: true } })) !== null) {
    console.log(`${EMAIL} já existe: nada a fazer.`);
  } else {
    const perfil = await prisma.$transaction(async (tx) => {
      const criado = await tx.perfil.create({ data: { nome: "AGENTE DE CONTRATAÇÃO — FICTÍCIO", descricao: `Papel da base fictícia: ${ACOES.join(", ")}.`, criadoPor: ADMIN }, select: { id: true } });
      await tx.permissaoDePerfil.createMany({ data: ACOES.map((acao) => ({ perfilId: criado.id, acao, unidadeOrcId: null, criadoPor: ADMIN })) });
      return criado;
    });
    const { usuarioId } = await criarUsuario(prisma, { nome: "Agente de contratação (fictício)", email: EMAIL, senhaInicial: SENHA, criadoPor: ADMIN });
    await concederPerfil(prisma, { usuarioId, perfilId: perfil.id, criadoPor: ADMIN });
    console.log(`${EMAIL} criado com ${ACOES.join(", ")}.`);
  }
} finally {
  await prisma.$disconnect();
}
