import { criarAutorizacaoPortPrisma } from "../m16-travamento/porta.js";
import { idsUuid } from "../m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { papeisVigentesEm, versaoVigente, type PapelDePessoa } from "./dominio.js";
import type {
  M19Deps,
  MovimentoDoHistorico,
  PessoaRepositoryPort,
  PessoaResumo,
  VersaoDoHistorico,
} from "./ports.js";

/**
 * M19 — a ÚNICA camada que conhece Prisma.
 *
 * ⚠️ TODA LEITURA DE PESSOA TRAZ VERSÕES E MOVIMENTOS, e a derivação é do domínio. A
 * tentação é gravar `nome` e `ativa` na `Pessoa` "para a listagem ficar rápida" — seria
 * uma segunda verdade sobre o mesmo dado, e o dia em que ela divergisse a lista mostraria
 * um nome e o detalhe outro. O índice `[pessoaId, criadoEm]` paga a leitura.
 */

/** O SELECT único das leituras — para que a lista e o detalhe nunca divirjam. */
const SELECT_PESSOA = {
  id: true,
  documento: true,
  tipo: true,
  versoes: {
    select: { nome: true, ativa: true, criadoEm: true },
    orderBy: { criadoEm: "desc" },
    take: 1,
  },
  movimentos: {
    select: { papel: true, movimento: true, data: true, criadoEm: true },
  },
} as const;

type LinhaDePessoa = {
  id: string;
  documento: string;
  tipo: "FISICA" | "JURIDICA";
  versoes: ReadonlyArray<{ nome: string; ativa: boolean; criadoEm: Date }>;
  movimentos: ReadonlyArray<{
    papel: PapelDePessoa;
    movimento: "CONCEDIDO" | "ENCERRADO";
    data: Date;
    criadoEm: Date;
  }>;
};

function paraResumo(linha: LinhaDePessoa, agora: Date): PessoaResumo {
  const vigente = versaoVigente(linha.versoes);
  if (vigente === undefined || vigente === null) {
    // ⚠️ FAIL-CLOSED: pessoa sem versão é cadastro sem nome, e ele não deveria existir —
    // `cadastrar` cria as duas na mesma transação. Se aparecer, alguém inseriu por fora.
    throw new Error(
      `Pessoa ${linha.id} não tem versão cadastral. Ela nasce com a primeira versão, ` +
        "na mesma transação — uma pessoa sem versão foi inserida por fora do caso de uso."
    );
  }
  return {
    id: linha.id,
    documento: linha.documento,
    tipo: linha.tipo,
    nome: vigente.nome,
    ativa: vigente.ativa,
    papeis: papeisVigentesEm(linha.movimentos, agora),
  };
}

export function criarPessoaRepositoryPrisma(
  prisma: PrismaClient
): PessoaRepositoryPort {
  return {
    async cadastrar(p) {
      // ⚠️ AS DUAS ESCRITAS NA MESMA TRANSAÇÃO. Uma pessoa sem versão é um documento com
      // id — e uma falha entre as duas a deixaria assim para sempre.
      return prisma.$transaction(async (tx) => {
        const pessoa = await tx.pessoa.create({
          data: {
            id: idsUuid.novo(),
            documento: p.documento,
            tipo: p.tipo,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        const versao = await tx.versaoDePessoa.create({
          data: {
            id: idsUuid.novo(),
            pessoaId: pessoa.id,
            nome: p.dados.nome,
            nomeFantasia: p.dados.nomeFantasia ?? null,
            email: p.dados.email ?? null,
            telefone: p.dados.telefone ?? null,
            logradouro: p.dados.logradouro ?? null,
            numero: p.dados.numero ?? null,
            complemento: p.dados.complemento ?? null,
            bairro: p.dados.bairro ?? null,
            municipio: p.dados.municipio ?? null,
            uf: p.dados.uf ?? null,
            cep: p.dados.cep ?? null,
            ativa: p.dados.ativa,
            // A primeira versão não corrige nada — ver `zAlterarPessoa`.
            motivo: null,
            criadoPor: p.criadoPor,
          },
          select: { id: true },
        });
        return { pessoaId: pessoa.id, versaoId: versao.id };
      });
    },

    async versionar(p) {
      const versao = await prisma.versaoDePessoa.create({
        data: {
          id: idsUuid.novo(),
          pessoaId: p.pessoaId,
          nome: p.dados.nome,
          nomeFantasia: p.dados.nomeFantasia ?? null,
          email: p.dados.email ?? null,
          telefone: p.dados.telefone ?? null,
          logradouro: p.dados.logradouro ?? null,
          numero: p.dados.numero ?? null,
          complemento: p.dados.complemento ?? null,
          bairro: p.dados.bairro ?? null,
          municipio: p.dados.municipio ?? null,
          uf: p.dados.uf ?? null,
          cep: p.dados.cep ?? null,
          ativa: p.dados.ativa,
          motivo: p.motivo,
          criadoPor: p.criadoPor,
        },
        select: { id: true },
      });
      return { versaoId: versao.id };
    },

    async moverPapel(p) {
      const movimento = await prisma.movimentoDePapelDaPessoa.create({
        data: {
          id: idsUuid.novo(),
          pessoaId: p.pessoaId,
          papel: p.papel,
          movimento: p.movimento,
          data: p.data,
          motivo: p.motivo ?? null,
          criadoPor: p.criadoPor,
        },
        select: { id: true },
      });
      return { movimentoId: movimento.id };
    },

    async buscarPorId(pessoaId) {
      const linha = await prisma.pessoa.findUnique({
        where: { id: pessoaId },
        select: SELECT_PESSOA,
      });
      return linha === null ? null : paraResumo(linha as LinhaDePessoa, new Date());
    },

    async buscarPorDocumento(documento) {
      const linha = await prisma.pessoa.findUnique({
        where: { documento },
        select: SELECT_PESSOA,
      });
      return linha === null ? null : paraResumo(linha as LinhaDePessoa, new Date());
    },

    async historico(pessoaId) {
      const [versoes, movimentos] = await Promise.all([
        prisma.versaoDePessoa.findMany({
          where: { pessoaId },
          select: {
            id: true,
            nome: true,
            ativa: true,
            motivo: true,
            criadoEm: true,
            criadoPor: true,
          },
          orderBy: { criadoEm: "desc" },
        }),
        prisma.movimentoDePapelDaPessoa.findMany({
          where: { pessoaId },
          select: {
            id: true,
            papel: true,
            movimento: true,
            data: true,
            motivo: true,
            criadoEm: true,
            criadoPor: true,
          },
          orderBy: { criadoEm: "desc" },
        }),
      ]);
      return {
        versoes: versoes as readonly VersaoDoHistorico[],
        movimentos: movimentos as readonly MovimentoDoHistorico[],
      };
    },
  };
}

export function criarM19Deps(prisma: PrismaClient): M19Deps {
  return {
    autz: criarAutorizacaoPortPrisma(prisma),
    pessoas: criarPessoaRepositoryPrisma(prisma),
    ids: idsUuid,
  };
}
