import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, zMoney, type Money } from "../../packages/contracts/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { validarParametrosDaClasse, type MetodoAtualizacao } from "./dominio.js";

/**
 * M10 — O PARÂMETRO DE ATUALIZAÇÃO É VERSIONADO (orquestração V3, pacote 2, unidade 3).
 *
 * ═══ O QUE MUDA ═══
 * `ParametroAtualizacaoClasse` era uma linha por classe, mutável e sem serviço que a
 * escrevesse — só seeds e testes a criavam. Método, vida útil e residual decidem o valor de
 * cada parcela de depreciação, e uma troca em silêncio faz a competência de março e a de
 * abril contarem histórias diferentes sem que ninguém saiba quando a régua mudou.
 *
 * ═══ A DECISÃO, NO MOLDE DOS ROTEIROS (V3 4.5) ═══
 *   - append-only: cada definição é uma `VersaoDeParametroDeAtualizacao` com número
 *     sequencial por classe, autor, momento e motivo; a VIGENTE é a de maior número;
 *   - a linha legada é ORIGEM: `parametroVigente` só cai nela enquanto a classe não tiver
 *     versão nenhuma;
 *   - a memória de cálculo de cada competência (`MemoriaDeAtualizacao`) aponta para a
 *     versão que a calculou — a pergunta "por que 450,00?" continua respondível depois
 *     que o parâmetro mudou;
 *   - encerrar a atualização de uma classe é uma versão com `ativo = false`, com motivo;
 *   - concorrência é do índice único `(classe, numero)`; repetição idêntica é recusada.
 *
 * ⚠️ A REGRA DO PARÂMETRO (vida útil inteira > 0; residual em [0, 1)) é UMA, em
 * `validarParametrosDaClasse` — a mesma que `calcularParcela` aplica. Uma versão inválida
 * não nasce.
 */

export interface ParametroVigente {
  /** `null` quando o parâmetro vem da linha legada (sem versão). */
  readonly versaoId: string | null;
  readonly numero: number | null;
  readonly metodo: MetodoAtualizacao;
  readonly vidaUtilMeses: number;
  readonly percentualResidual: Money;
  readonly ativo: boolean;
  readonly origem: "VERSAO" | "LEGADO";
}

/** O parâmetro em vigor da classe: a última versão; a linha legada só enquanto não houver versão. */
export async function parametroVigente(tx: Tx, classeDeBensId: string): Promise<ParametroVigente | null> {
  const v = await tx.versaoDeParametroDeAtualizacao.findFirst({
    where: { classeDeBensId },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, metodo: true, vidaUtilMeses: true, percentualResidual: true, ativo: true },
  });
  if (v !== null) {
    return {
      versaoId: v.id,
      numero: v.numero,
      metodo: v.metodo as MetodoAtualizacao,
      vidaUtilMeses: v.vidaUtilMeses,
      percentualResidual: toMoney(v.percentualResidual.toFixed(6)),
      ativo: v.ativo,
      origem: "VERSAO",
    };
  }
  const legado = await tx.parametroAtualizacaoClasse.findUnique({
    where: { classeDeBensId },
    select: { metodo: true, vidaUtilMeses: true, percentualResidual: true, ativo: true },
  });
  if (legado === null) return null;
  return {
    versaoId: null,
    numero: null,
    metodo: legado.metodo as MetodoAtualizacao,
    vidaUtilMeses: legado.vidaUtilMeses,
    percentualResidual: toMoney(legado.percentualResidual.toFixed(6)),
    ativo: legado.ativo,
    origem: "LEGADO",
  };
}

export interface VersaoDeParametroLida {
  readonly id: string;
  readonly numero: number;
  readonly metodo: MetodoAtualizacao;
  readonly vidaUtilMeses: number;
  /** Fração com 6 casas, como gravada. */
  readonly percentualResidual: string;
  readonly ativo: boolean;
  readonly motivo: string;
  readonly criadoEm: Date;
  readonly criadoPor: string;
  /** Derivada: o instante em que a versão seguinte entrou. `null` = em vigor. */
  readonly vigenciaFim: Date | null;
  readonly vigente: boolean;
  /** Quantas competências foram calculadas por esta versão. */
  readonly atualizacoes: number;
}

/** As versões da classe, da primeira à vigente, com a vigência DERIVADA. */
export async function versoesDoParametro(tx: Tx, classeDeBensId: string): Promise<readonly VersaoDeParametroLida[]> {
  const linhas = await tx.versaoDeParametroDeAtualizacao.findMany({
    where: { classeDeBensId },
    orderBy: { numero: "asc" },
    select: {
      id: true, numero: true, metodo: true, vidaUtilMeses: true, percentualResidual: true, ativo: true,
      motivo: true, criadoEm: true, criadoPor: true,
      _count: { select: { memorias: true } },
    },
  });
  return linhas.map((v, i) => {
    const seguinte = linhas[i + 1];
    return {
      id: v.id,
      numero: v.numero,
      metodo: v.metodo as MetodoAtualizacao,
      vidaUtilMeses: v.vidaUtilMeses,
      percentualResidual: v.percentualResidual.toFixed(6),
      ativo: v.ativo,
      motivo: v.motivo,
      criadoEm: v.criadoEm,
      criadoPor: v.criadoPor,
      vigenciaFim: seguinte === undefined ? null : seguinte.criadoEm,
      vigente: seguinte === undefined,
      atualizacoes: v._count.memorias,
    };
  });
}

export const zDefinirParametroDeAtualizacaoInput = z.object({
  classeDeBensId: z.string().min(1),
  metodo: z.enum(["DEPRECIACAO", "AMORTIZACAO", "EXAUSTAO"]),
  /** Em MESES, inteiro > 0. */
  vidaUtilMeses: z.coerce.number().int(),
  /** Fração em [0, 1) — "0.100000" é 10%. Decimal, nunca float. */
  percentualResidual: zMoney,
  /** `false` encerra a atualização da classe a partir desta versão. */
  ativo: z.boolean().default(true),
  motivo: z.string().trim().min(8, "O motivo é obrigatório — quem ler o histórico não terá a quem perguntar."),
  criadoPor: z.string().min(1),
});
export type DefinirParametroDeAtualizacaoInput = z.input<typeof zDefinirParametroDeAtualizacaoInput>;

export async function definirParametroDeAtualizacao(
  prisma: PrismaClient,
  input: DefinirParametroDeAtualizacaoInput
): Promise<{ readonly versaoId: string; readonly numero: number }> {
  const d = zDefinirParametroDeAtualizacaoInput.parse(input);
  // A regra é UMA: a mesma de `calcularParcela`. Uma versão inválida não nasce.
  validarParametrosDaClasse({ vidaUtilMeses: d.vidaUtilMeses, percentualResidual: d.percentualResidual });

  return prisma.$transaction(async (tx) => {
    // SEM UG: o parâmetro é da CLASSE, e a classe é do ente.
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.definirParametroDeAtualizacao, "ENTE");

    const classe = await tx.classeDeBens.findUnique({
      where: { id: d.classeDeBensId },
      select: { codigo: true, descricao: true, ativa: true },
    });
    if (classe === null) {
      throw new Error(`CLASSE INEXISTENTE: não há classe de bens com id "${d.classeDeBensId}". Nada foi gravado.`);
    }
    if (!classe.ativa) {
      throw new Error(
        `CLASSE INATIVA: ${classe.codigo} — ${classe.descricao} está inativa e não recebe parâmetro ` +
          `novo — ela não recebe movimento nenhum. Nada foi gravado.`
      );
    }

    const vigente = await parametroVigente(tx, d.classeDeBensId);
    if (
      vigente !== null &&
      vigente.origem === "VERSAO" &&
      vigente.metodo === d.metodo &&
      vigente.vidaUtilMeses === d.vidaUtilMeses &&
      vigente.percentualResidual.equals(d.percentualResidual) &&
      vigente.ativo === d.ativo
    ) {
      throw new Error(
        `VERSÃO IDÊNTICA À VIGENTE: a versão ${vigente.numero} da classe ${classe.codigo} já é ` +
          `${d.metodo}, ${d.vidaUtilMeses} meses, residual ${d.percentualResidual.toFixed(6)}` +
          `${d.ativo ? "" : ", encerrada"}. Não há o que versionar. Nada foi gravado.`
      );
    }

    const ultima = await tx.versaoDeParametroDeAtualizacao.aggregate({
      where: { classeDeBensId: d.classeDeBensId },
      _max: { numero: true },
    });
    const numero = (ultima._max.numero ?? 0) + 1;
    try {
      const v = await tx.versaoDeParametroDeAtualizacao.create({
        data: {
          classeDeBensId: d.classeDeBensId,
          numero,
          metodo: d.metodo,
          vidaUtilMeses: d.vidaUtilMeses,
          percentualResidual: d.percentualResidual.toFixed(6),
          ativo: d.ativo,
          motivo: d.motivo,
          criadoPor: d.criadoPor,
        },
        select: { id: true, numero: true },
      });
      return { versaoId: v.id, numero: v.numero };
    } catch (e) {
      const codigo = (e as { code?: string }).code;
      if (codigo === "P2002") {
        throw new Error(
          `CONCORRÊNCIA: outra versão do parâmetro da classe ${classe.codigo} nasceu enquanto esta ` +
            `era definida (a versão ${numero} já existe). Nada seu foi gravado — recarregue, leia a ` +
            `versão que entrou, e defina de novo se ainda fizer sentido.`
        );
      }
      throw e;
    }
  });
}
