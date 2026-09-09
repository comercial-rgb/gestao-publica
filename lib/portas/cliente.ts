import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma";

/**
 * O CLIENT PRISMA das portas — singleton preguiçoso (um por processo do servidor), COMPARTILHADO
 * por todas as portas (RREO, RGF, livros). Reabrir o pool a cada request esgota conexões; um
 * singleton por processo é o padrão do Prisma em Server Components. O adaptador (@prisma/adapter-pg)
 * mora dentro do `criarPrismaClient`.
 */
let clientePrisma: ReturnType<typeof criarPrismaClient> | null = null;

export function cliente(): ReturnType<typeof criarPrismaClient> {
  if (clientePrisma !== null) return clientePrisma;
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") {
    // fail-hard NOMEADO: sem banco não há relatório. A página traduz num estado de erro com nome.
    throw new PortaSemBancoError();
  }
  clientePrisma = criarPrismaClient(url);
  return clientePrisma;
}

/** Erro nomeado: a variável de ambiente do banco não está configurada. */
export class PortaSemBancoError extends Error {
  constructor() {
    super("DATABASE_URL não configurada — a porta de relatórios não tem banco para ler.");
    this.name = "PortaSemBancoError";
  }
}
