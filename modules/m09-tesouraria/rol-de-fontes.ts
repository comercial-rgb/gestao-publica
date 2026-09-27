import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";

/**
 * O ROL DE FONTES DE UMA CONTA BANCÁRIA — TR 5.10.2.6, o CADASTRO que faltava.
 *
 * ═══ ⚠️ POR QUE ISTO SÓ NASCEU AGORA, E O QUE O TORNOU BLOQUEANTE ═══
 * A `ADR-conta-bancaria-com-varias-fontes` (aceita em 2026-09-10) criou o vínculo
 * `FonteDaContaBancaria` e fez o guard do movimento olhar para ELE. O catálogo registrou, junto,
 * a pendência `ROL-DE-FONTES-UI`: "a tela MOSTRA o rol por conta, mas o CADASTRO do rol ainda não
 * tem superfície". Enquanto cada conta tinha uma fonte só (a do backfill), a ausência não
 * impedia nada — o fallback do guard admite exatamente a fonte padrão.
 *
 * A guia REPARTIDA entre fontes (V16/C30) tornou a ausência bloqueante: um depósito que pertence
 * a duas fontes só entra numa conta que comporte as duas, e sem este cadastro nenhuma conta
 * comporta duas. Em instalação nova, C30 ficava inalcançável — "código que existe não é
 * comportamento provado", e sem tela um servidor municipal não alcança.
 *
 * ═══ ⚠️ ISTO É DECISÃO VIGENTE, NÃO FATO — e por isso NÃO é append-only ═══
 * O rol diz o que a conta comporta HOJE. Ele não escritura nada, não tem saldo e não é lançamento:
 * é o mesmo tipo de objeto que a declaração de titular. Remover uma fonte do rol NÃO invalida os
 * movimentos que ela já teve — eles são fatos, e continuam lá, com a fonte que declararam.
 *
 * ⚠️ AS TRÊS RECUSAS, e cada uma fecha um estrago diferente:
 *   1. **a última fonte do rol não sai.** Rol vazio cai, no guard, para a fonte PADRÃO da conta —
 *      então "esvaziar o rol" não bloqueia a conta: muda o guard de volta para a regra antiga, em
 *      silêncio. Quem quisesse restringir a conta a uma fonte conseguiria o oposto do que pediu.
 *   2. **a fonte PADRÃO da conta não sai do rol.** `ContaBancaria.fonteId` é `NOT NULL` e é ela
 *      que o fallback usa; tirá-la deixaria a coluna apontando para um recurso que a conta diz
 *      não comportar — duas verdades sobre a mesma conta, sem árbitro.
 *   3. **fonte repetida não entra.** O índice único do banco já recusaria; aqui a recusa chega
 *      como frase, e não como erro de banco.
 */

const zAlterarRol = z.object({
  contaCodigo: z.string().trim().min(1, "Informe a conta bancária"),
  fonteCodigo: z.string().trim().length(3, "Fonte de recurso tem 3 dígitos"),
  criadoPor: z.string().min(1),
});

export type AlterarRolInput = z.input<typeof zAlterarRol>;

interface ContaDoRol {
  readonly id: string;
  readonly codigo: string;
  readonly fonteId: string;
  readonly fontePadraoCodigo: string;
  readonly rol: readonly { readonly fonteId: string; readonly codigo: string }[];
}

async function carregar(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">,
  codigo: string
): Promise<ContaDoRol> {
  const c = await tx.contaBancaria.findUnique({
    where: { codigo },
    select: {
      id: true,
      codigo: true,
      fonteId: true,
      fonte: { select: { codigo: true } },
      fontesPermitidas: {
        orderBy: { fonte: { codigo: "asc" } },
        select: { fonteId: true, fonte: { select: { codigo: true } } },
      },
    },
  });
  if (c === null) {
    throw new Error(`Conta bancária ${codigo} não cadastrada. Nada foi gravado.`);
  }
  return {
    id: c.id,
    codigo: c.codigo,
    fonteId: c.fonteId,
    fontePadraoCodigo: c.fonte.codigo,
    rol: c.fontesPermitidas.map((f) => ({ fonteId: f.fonteId, codigo: f.fonte.codigo })),
  };
}

/** Acrescenta uma fonte ao rol da conta. */
export async function acrescentarFonteAoRol(
  prisma: PrismaClient,
  input: AlterarRolInput
): Promise<{ readonly codigoDaConta: string; readonly fontes: readonly string[] }> {
  const d = zAlterarRol.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.acrescentarFonteAoRol, "ENTE");

    const conta = await carregar(tx, d.contaCodigo);
    const fonte = await tx.fonteRecurso.findUnique({
      where: { codigo: d.fonteCodigo },
      select: { id: true, codigo: true },
    });
    if (fonte === null) {
      throw new Error(
        `A fonte ${d.fonteCodigo} não está no cadastro de fontes de recurso. Nada foi gravado.`
      );
    }
    if (conta.rol.some((f) => f.fonteId === fonte.id)) {
      throw new Error(
        `A conta ${conta.codigo} já comporta a fonte ${fonte.codigo}. Acrescentar de novo não é um ` +
          `fato novo — o rol passaria a mostrar a fonte repetida. Nada foi gravado.`
      );
    }

    // ⚠️ A FONTE PADRÃO ENTRA JUNTO, quando o rol ainda está vazio. Sem isto, a primeira fonte
    // acrescentada SUBSTITUIRIA a padrão no guard (rol não vazio deixa de cair no fallback), e a
    // conta perderia, em silêncio, a fonte com que ela sempre operou.
    const aCriar: { contaBancariaId: string; fonteId: string; criadoPor: string }[] = [];
    if (conta.rol.length === 0 && conta.fonteId !== fonte.id) {
      aCriar.push({ contaBancariaId: conta.id, fonteId: conta.fonteId, criadoPor: d.criadoPor });
    }
    aCriar.push({ contaBancariaId: conta.id, fonteId: fonte.id, criadoPor: d.criadoPor });
    await tx.fonteDaContaBancaria.createMany({ data: aCriar });

    const depois = await carregar(tx, d.contaCodigo);
    return { codigoDaConta: depois.codigo, fontes: depois.rol.map((f) => f.codigo) };
  });
}

/** Remove uma fonte do rol da conta — com as duas recusas do cabeçalho. */
export async function removerFonteDoRol(
  prisma: PrismaClient,
  input: AlterarRolInput
): Promise<{ readonly codigoDaConta: string; readonly fontes: readonly string[] }> {
  const d = zAlterarRol.parse(input);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.removerFonteDoRol, "ENTE");

    const conta = await carregar(tx, d.contaCodigo);
    const alvo = conta.rol.find((f) => f.codigo === d.fonteCodigo);
    if (alvo === undefined) {
      throw new Error(
        `A conta ${conta.codigo} não tem a fonte ${d.fonteCodigo} no rol. As fontes do rol são: ` +
          `${conta.rol.map((f) => f.codigo).join(", ") || "(nenhuma)"}. Nada foi gravado.`
      );
    }
    if (conta.rol.length === 1) {
      throw new Error(
        `A fonte ${d.fonteCodigo} é a ÚNICA do rol da conta ${conta.codigo}, e por isso não sai. ` +
          `Rol vazio não restringe a conta: ele faz o guard voltar a admitir a fonte PADRÃO dela, ` +
          `o oposto do que se pretende ao restringir. Acrescente outra fonte antes de remover esta. ` +
          `Nada foi gravado.`
      );
    }
    if (alvo.fonteId === conta.fonteId) {
      throw new Error(
        `A fonte ${d.fonteCodigo} é a fonte PADRÃO da conta ${conta.codigo} e não sai do rol. A ` +
          `coluna que a declara é obrigatória no cadastro, e removê-la do rol deixaria a conta ` +
          `dizendo que não comporta o recurso que ela própria declara como padrão. Nada foi gravado.`
      );
    }

    await tx.fonteDaContaBancaria.deleteMany({
      where: { contaBancariaId: conta.id, fonteId: alvo.fonteId },
    });

    const depois = await carregar(tx, d.contaCodigo);
    return { codigoDaConta: depois.codigo, fontes: depois.rol.map((f) => f.codigo) };
  });
}
