import type { PrismaClient } from "../prisma/generated/client/client.js";
import { registrarMovimentoDotacao } from "../modules/m05-despesa/dotacao-razao.js";
import { semearRoteiroOrcamentario } from "./roteiro-orcamentario.js";
import { recalcularCache } from "../modules/m05-despesa/adapter-prisma.js";

/**
 * Cria uma ficha DE TESTE com id explícito — e com a sua DOTACAO_INICIAL.
 *
 * POR QUE ISTO EXISTE: os testes do M03/M05 precisam de fichas com id fixo
 * (`"ficha-a"`), o que o caso de uso `criarFicha()` não permite (o id vem do
 * `IdPort`). Antes eles chamavam `prisma.fichaOrcamentaria.create()` direto — e
 * assim produziam fichas SEM dotação inicial, exatamente a ficha órfã que o
 * `garantirDotacaoInicial` agora rejeita.
 *
 * Este helper replica o que o adapter do M02 faz: ficha + DOTACAO_INICIAL +
 * recálculo do cache, tudo na MESMA transação. Se o adapter do M02 mudar, mude
 * aqui junto — ou, melhor, faça o adapter aceitar id explícito e apague isto.
 */
export interface FichaDeTeste {
  readonly id: string;
  readonly exercicio: number;
  readonly numero: number;
  readonly orgaoId: string;
  readonly unidadeOrcId: string;
  readonly funcaoId: string;
  readonly subfuncaoId: string;
  readonly programaId: string;
  readonly acaoId: string;
  readonly naturezaDespesaId: string;
  readonly fonteId: string;
  readonly coId?: string;
  readonly exercicioFonte?: number;
  /** String decimal — nunca number (regra de ouro). */
  readonly valorDotado: string;
}

export async function criarFichaDeTeste(
  prisma: PrismaClient,
  f: FichaDeTeste
): Promise<string> {
  // ⚠️ FAIL-CLOSED: a dotação lança no razão, e sem roteiro a criação da ficha CAI.
  // Semear aqui alcança TODAS as fixtures de uma vez — ver `roteiro-orcamentario.ts`.
  await semearRoteiroOrcamentario(prisma);

  // M08: ficha só existe dentro de um exercício ABERTO. Garantir aqui evita que
  // cada teste tenha de lembrar de abrir o exercício — e mantém o helper fiel ao
  // que o adapter do M02 exige.
  await prisma.exercicio.upsert({
    where: { ano: f.exercicio },
    update: {},
    create: { ano: f.exercicio, criadoPor: "TESTE" },
  });

  return prisma.$transaction(async (tx) => {
    const criada = await tx.fichaOrcamentaria.create({
      data: {
        id: f.id,
        exercicio: f.exercicio,
        numero: f.numero,
        orgaoId: f.orgaoId,
        unidadeOrcId: f.unidadeOrcId,
        funcaoId: f.funcaoId,
        subfuncaoId: f.subfuncaoId,
        programaId: f.programaId,
        acaoId: f.acaoId,
        naturezaDespesaId: f.naturezaDespesaId,
        fonteId: f.fonteId,
        coId: f.coId ?? null,
        exercicioFonte: f.exercicioFonte ?? 1,
        valorDotado: f.valorDotado,
      },
      select: { id: true },
    });

    // ⚠️ O MESMO ESCRITOR DO ADAPTER DO M02 — movimento E perna no razão, na mesma tx.
    // Este helper DUPLICAVA a lógica do adapter (um `movimentoDotacao.create` solto), e
    // era exatamente por isso que a perna nova precisava ser lembrada em dois lugares.
    // Agora é um só: se o M05 mudar, o helper acompanha de graça.
    await registrarMovimentoDotacao(tx, {
      fichaId: criada.id,
      tipo: "DOTACAO_INICIAL",
      valor: f.valorDotado,
      origemTipo: "LOA",
      origemId: criada.id,
      criadoPor: "LOA",
      data: new Date(Date.UTC(f.exercicio, 0, 1, 12, 0, 0)),
      historico: `Dotação inicial da ficha ${f.numero} (LOA ${f.exercicio})`,
    });

    await recalcularCache(tx, criada.id);
    return criada.id;
  });
}

/** Cria várias de uma vez (mesma semântica, uma transação por ficha). */
export async function criarFichasDeTeste(
  prisma: PrismaClient,
  fichas: readonly FichaDeTeste[]
): Promise<void> {
  for (const f of fichas) {
    await criarFichaDeTeste(prisma, f);
  }
}
