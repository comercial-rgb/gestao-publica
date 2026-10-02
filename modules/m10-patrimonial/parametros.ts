import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, toPercentual, zPercentual, type Money, type Percentual } from "../../packages/contracts/index.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import type { Tx } from "../m16-travamento/autorizacao.js";
import { competenciaParaData, validarParametrosDaClasse, type MetodoAtualizacao } from "./dominio.js";
import { competenciaCivil, janelaCivilDoMes } from "../../packages/datas/index.js";

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
  readonly percentualResidual: Percentual;
  readonly ativo: boolean;
  readonly origem: "VERSAO" | "LEGADO";
  /** V4: a primeira competência a que a versão se aplica; `null` = desde o início. */
  readonly vigenteDesde: Date | null;
}

/**
 * O PARÂMETRO APLICÁVEL A UMA COMPETÊNCIA (V4, §4.1) — vigência de negócio, não ordem de gravação.
 *
 * Entre as versões cuja `vigenteDesde` é nula ou ≤ a competência, vale a de maior número. Uma
 * versão que só começa DEPOIS da competência não a alcança: a prévia de março não absorve a
 * régua de maio por ela ser a mais recente. A linha legada só serve enquanto a classe não tem
 * versão nenhuma (é origem, não configuração). Classe com versões mas nenhuma vigente na
 * competência: `null` — e a prévia diz "sem parâmetro vigente nesta competência".
 */
export async function parametroVigenteEm(tx: Tx, classeDeBensId: string, competencia: string): Promise<ParametroVigente | null> {
  const inicio = competenciaParaData(competencia);
  const versoes = await tx.versaoDeParametroDeAtualizacao.count({ where: { classeDeBensId } });
  if (versoes === 0) return parametroVigente(tx, classeDeBensId);
  const v = await tx.versaoDeParametroDeAtualizacao.findFirst({
    where: { classeDeBensId, OR: [{ vigenteDesde: null }, { vigenteDesde: { lte: inicio } }] },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, metodo: true, vidaUtilMeses: true, percentualResidual: true, ativo: true, vigenteDesde: true },
  });
  if (v === null) return null;
  return {
    versaoId: v.id,
    numero: v.numero,
    metodo: v.metodo as MetodoAtualizacao,
    vidaUtilMeses: v.vidaUtilMeses,
    percentualResidual: toPercentual(v.percentualResidual.toFixed(6)),
    ativo: v.ativo,
    origem: "VERSAO",
    vigenteDesde: v.vigenteDesde,
  };
}

/** O parâmetro em vigor da classe: a última versão; a linha legada só enquanto não houver versão. */
export async function parametroVigente(tx: Tx, classeDeBensId: string): Promise<ParametroVigente | null> {
  const v = await tx.versaoDeParametroDeAtualizacao.findFirst({
    where: { classeDeBensId },
    orderBy: { numero: "desc" },
    select: { id: true, numero: true, metodo: true, vidaUtilMeses: true, percentualResidual: true, ativo: true, vigenteDesde: true },
  });
  if (v !== null) {
    return {
      versaoId: v.id,
      numero: v.numero,
      metodo: v.metodo as MetodoAtualizacao,
      vidaUtilMeses: v.vidaUtilMeses,
      percentualResidual: toPercentual(v.percentualResidual.toFixed(6)),
      ativo: v.ativo,
      origem: "VERSAO",
      vigenteDesde: v.vigenteDesde,
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
    percentualResidual: toPercentual(legado.percentualResidual.toFixed(6)),
    ativo: legado.ativo,
    origem: "LEGADO",
    vigenteDesde: null,
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
  /** V4: a primeira competência ("YYYY-MM") a que a versão se aplica; `null` = desde o início. */
  readonly vigenteDesde: string | null;
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
      motivo: true, criadoEm: true, criadoPor: true, vigenteDesde: true,
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
      vigenteDesde: v.vigenteDesde === null ? null : competenciaCivil(v.vigenteDesde),
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
  percentualResidual: zPercentual,
  /** `false` encerra a atualização da classe a partir desta versão. */
  ativo: z.boolean().default(true),
  motivo: z.string().trim().min(8, "O motivo é obrigatório — quem ler o histórico não terá a quem perguntar."),
  /**
   * V4: a primeira competência ("YYYY-MM") a que a versão se aplica. Omitida, é DERIVADA: a
   * competência seguinte à última já processada na classe (ou "desde o início" se nada foi
   * processado). Uma vigência que alcance competência já processada é RECUSADA — correção
   * retroativa é outro fluxo (estornar a competência e reprocessar), com prévia e histórico.
   */
  vigenteDesde: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM.").optional(),
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

    // ═══ V4 (§4.1) — A VIGÊNCIA NÃO ALCANÇA O QUE JÁ FOI CALCULADO ═══
    const ultimaProcessada = await tx.movimentoPatrimonial.findFirst({
      where: {
        classeDeBensId: d.classeDeBensId,
        competencia: { not: null },
        tipo: { in: ["DEPRECIACAO", "AMORTIZACAO", "EXAUSTAO"] },
        estornoDeId: null,
        estornos: { none: {} },
      },
      orderBy: { competencia: "desc" },
      select: { competencia: true },
    });
    let vigenteDesde: Date | null;
    if (d.vigenteDesde !== undefined) {
      vigenteDesde = competenciaParaData(d.vigenteDesde);
      if (ultimaProcessada?.competencia != null && vigenteDesde.getTime() <= ultimaProcessada.competencia.getTime()) {
        throw new Error(
          `VIGÊNCIA RETROATIVA: a competência ${competenciaCivil(ultimaProcessada.competencia)} da classe ${classe.codigo} ` +
            `já foi processada, e uma versão vigente desde ${d.vigenteDesde} a alcançaria. O que foi calculado não muda ` +
            `em silêncio: para corrigir o passado, estorne a competência e reprocesse — a prévia mostra o impacto. Nada foi gravado.`
        );
      }
    } else if (ultimaProcessada?.competencia != null) {
      const seguinte = new Date(ultimaProcessada.competencia);
      const c = competenciaCivil(seguinte);
      const [ano, mes] = c.split("-").map(Number) as [number, number];
      const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`;
      vigenteDesde = janelaCivilDoMes(proximo).inicio;
    } else {
      vigenteDesde = null;
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
          vigenteDesde,
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
