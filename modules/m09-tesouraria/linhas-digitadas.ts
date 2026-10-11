import { toMoney } from "../../packages/contracts/index.js";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaDoBanco } from "./dia-do-banco.js";
import { vinculoLiquido } from "./dominio.js";

/**
 * V39-R3 (R3-015, V39-029) — QUANDO A LINHA DIGITADA VALE COMO EXTRATO.
 *
 * A linha transcrita à mão (origem DIGITADO) entra na mesma tabela das linhas do banco, para a conciliação ter uma
 * aritmética só. Mas digitar não é prova bancária: a linha só vale como extrato (saldo da conciliação, vínculo com o
 * fato interno, saldo mensal ao tribunal, termo de conferência de caixa) quando
 *   1. foi revisada por outra pessoa e CONFIRMADA contra o documento de suporte; e
 *   2. o dia dela NÃO está coberto por um extrato do banco (arquivo ou API) da mesma conta. Chegando o extrato do
 *      banco, ele substitui a transcrição daqueles dias.
 *
 * Quem lê linhas do extrato para somar ou vincular EXCLUI as linhas desta função. Ela fica fora de `vinculo.ts` e de
 * `extrato.ts` (que a usam) para não haver import circular; lê só o banco.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Os dias ("AAAA-MM-DD", do banco) que algum extrato do banco cobre nesta conta, como intervalos fechados. */
async function periodosDoBanco(tx: Tx, contaBancariaId: string, conhecimento: Date | null = null): Promise<readonly { readonly de: string; readonly ate: string }[]> {
  const extratos = await tx.extratoBancario.findMany({
    where: { contaBancariaId, origem: { not: "DIGITADO" }, ...(conhecimento === null ? {} : { criadoEm: { lte: conhecimento } }) },
    select: { periodoInicio: true, periodoFim: true },
  });
  return extratos.map((e) => ({ de: diaDoBanco(e.periodoInicio), ate: diaDoBanco(e.periodoFim) }));
}

const cobre = (periodos: readonly { readonly de: string; readonly ate: string }[], dia: string): boolean =>
  periodos.some((p) => p.de <= dia && dia <= p.ate);

export type MotivoDaLinhaDigitada = "AGUARDANDO_REVISAO" | "REVISADA_DIVERGENTE" | "COBERTA_PELO_BANCO";

/**
 * O motivo de cada linha digitada da conta que NÃO vale como extrato (as que valem não aparecem). Leitura.
 *
 * `conhecimento`: COMO ESTAVA naquela data — a revisão e o extrato do banco gravados depois dela não contam, e a linha
 * digitada depois dela ainda não estava revisada. Sem data: o estado de agora. A conciliação passa a data do
 * conhecimento dela, e uma conciliação já fechada não muda porque uma linha foi confirmada depois.
 */
export async function linhasDigitadasQueNaoValem(tx: Tx, contaBancariaId: string, conhecimento: Date | null = null): Promise<ReadonlyMap<string, MotivoDaLinhaDigitada>> {
  const linhas = await tx.lancamentoExtrato.findMany({
    where: { contaBancariaId, extrato: { origem: "DIGITADO" } },
    select: { id: true, dataPostagem: true, criadoEm: true, transcricao: { select: { revisao: { select: { resultado: true, criadoEm: true } } } } },
  });
  const saida = new Map<string, MotivoDaLinhaDigitada>();
  if (linhas.length === 0) return saida;
  const periodos = await periodosDoBanco(tx, contaBancariaId, conhecimento);
  const conhecida = (d: Date): boolean => conhecimento === null || d.getTime() <= conhecimento.getTime();
  for (const l of linhas) {
    const revisao = l.transcricao?.revisao ?? null;
    const resultado = revisao !== null && conhecida(revisao.criadoEm) && conhecida(l.criadoEm) ? revisao.resultado : null;
    // Fail-closed: linha DIGITADO sem transcrição (não deveria existir) também não vale.
    if (cobre(periodos, diaDoBanco(l.dataPostagem))) saida.set(l.id, "COBERTA_PELO_BANCO");
    else if (resultado === null) saida.set(l.id, "AGUARDANDO_REVISAO");
    else if (resultado !== "CONFIRMADA") saida.set(l.id, "REVISADA_DIVERGENTE");
  }
  return saida;
}

/** O texto de cada motivo, para recusa e tela. */
export const TEXTO_DO_MOTIVO: Readonly<Record<MotivoDaLinhaDigitada, string>> = {
  AGUARDANDO_REVISAO: "digitada e ainda não revisada por outra pessoa",
  REVISADA_DIVERGENTE: "revisada e considerada divergente do documento",
  COBERTA_PELO_BANCO: "o dia dela já está coberto pelo extrato do banco, que substitui a transcrição",
};

/** Os ids a excluir de quem soma ou vincula (lista, para `id: { notIn }`). Leitura. */
export async function idsDeLinhasQueNaoValem(tx: Tx, contaBancariaId: string, conhecimento: Date | null = null): Promise<string[]> {
  return [...(await linhasDigitadasQueNaoValem(tx, contaBancariaId, conhecimento)).keys()];
}

/**
 * Na chegada de um extrato do BANCO: as linhas digitadas que ele vai cobrir deixam de valer. Se alguma delas já está
 * vinculada a um fato interno, o vínculo ficaria apontando para uma linha que não vale mais, e o fato pareceria
 * conciliado pelo que foi digitado: recusa, nomeando a linha, para o vínculo ser estornado antes. Leitura.
 */
export async function exigirDigitadasSemVinculoNoPeriodo(tx: Tx, contaBancariaId: string, inicio: Date, fim: Date): Promise<void> {
  const de = diaDoBanco(inicio);
  const ate = diaDoBanco(fim);
  const linhas = await tx.lancamentoExtrato.findMany({
    where: { contaBancariaId, extrato: { origem: "DIGITADO" } },
    select: { id: true, dataPostagem: true, valor: true, memo: true, vinculos: { select: { tipo: true, valor: true } } },
  });
  for (const l of linhas) {
    const dia = diaDoBanco(l.dataPostagem);
    if (dia < de || dia > ate) continue;
    const vinculado = vinculoLiquido(l.vinculos.map((v) => ({ tipo: v.tipo, valor: toMoney(v.valor.toFixed(2)) })));
    if (vinculado.greaterThan(0)) {
      throw new Error(
        `O extrato do banco cobre o dia ${dia.split("-").reverse().join("/")}, em que há uma linha digitada já conciliada ` +
          `(R$ ${l.valor.toFixed(2).replace(".", ",")}, "${l.memo}"). Estorne o vínculo dessa linha antes de importar: ` +
          `o extrato do banco substitui a transcrição. Nada foi importado.`
      );
    }
  }
}

/** Para recusar cedo o dia que o banco já cobre, na transcrição. Leitura. */
export async function diaCobertoPeloBanco(tx: Tx, contaBancariaId: string, dia: string): Promise<boolean> {
  return cobre(await periodosDoBanco(tx, contaBancariaId), dia);
}
