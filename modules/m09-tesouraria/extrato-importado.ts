import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { toMoney, type Money } from "../../packages/contracts/index.js";
import { vinculoLiquido } from "./dominio.js";
import { instanteDoDiaDoBanco } from "./dia-do-banco.js";

/**
 * V36 — O EXTRATO IMPORTADO, COMO O BANCO O MANDOU, para consulta e impressão (TR 5.10.2.44, "permitir a impressão
 * do extrato importado").
 *
 * Leitura pura: as linhas gravadas na importação, na ordem do banco (data, depois FITID em ordem natural), com o
 * total de créditos e de débitos do arquivo. A situação de cada linha na conciliação é DERIVADA dos vínculos vivos
 * (`vinculoLiquido`, o mesmo do motor): conciliada quando o vínculo cobre o valor, parcial quando cobre uma parte,
 * pendente quando não há vínculo. Nada aqui é flag.
 *
 * ⚠️ SEM SALDO CORRIDO: o extrato gravado não guarda o saldo inicial do arquivo, e um saldo calculado a partir de
 * zero pareceria o saldo do banco sem ser. Os totais são do movimento do arquivo, e assim são rotulados.
 */

export type SituacaoDaLinha = "CONCILIADA" | "PARCIAL" | "PENDENTE";

export interface LinhaDoExtratoImportado {
  readonly id: string;
  readonly data: Date;
  readonly fitid: string;
  readonly documento: string | null;
  readonly memo: string;
  readonly natureza: "CREDITO" | "DEBITO";
  readonly valor: Money;
  readonly vinculado: Money;
  readonly situacao: SituacaoDaLinha;
}

export interface ExtratoImportadoCompleto {
  readonly id: string;
  readonly contaBancariaId: string;
  readonly origem: "OFX" | "API_BB";
  readonly periodoInicio: Date;
  readonly periodoFim: Date;
  readonly importadoPor: string;
  readonly importadoEm: Date;
  readonly arquivoHash: string;
  readonly bancoDoArquivo: string | null;
  readonly contaDoArquivo: string | null;
  readonly linhas: readonly LinhaDoExtratoImportado[];
  readonly totalCreditos: Money;
  readonly totalDebitos: Money;
  /** Créditos menos débitos do arquivo — o movimento do período, não o saldo da conta. */
  readonly movimentoLiquido: Money;
}

const ordemNatural = new Intl.Collator("pt-BR", { numeric: true });

export function situacaoDaLinha(valor: Money, vinculado: Money): SituacaoDaLinha {
  if (!vinculado.greaterThan(0)) return "PENDENTE";
  return vinculado.greaterThanOrEqualTo(valor) ? "CONCILIADA" : "PARCIAL";
}

export async function lerExtratoImportado(prisma: PrismaClient, extratoId: string): Promise<ExtratoImportadoCompleto | null> {
  const e = await prisma.extratoBancario.findUnique({
    where: { id: extratoId },
    select: {
      id: true,
      contaBancariaId: true,
      origem: true,
      periodoInicio: true,
      periodoFim: true,
      importadoPor: true,
      criadoEm: true,
      arquivoHash: true,
      bancoDoArquivo: true,
      contaDoArquivo: true,
      lancamentos: {
        select: {
          id: true,
          fitid: true,
          dataPostagem: true,
          valor: true,
          natureza: true,
          documento: true,
          memo: true,
          vinculos: { select: { tipo: true, valor: true } },
        },
      },
    },
  });
  if (e === null) return null;

  const linhas = e.lancamentos
    .map((l): LinhaDoExtratoImportado => {
      const valor = toMoney(l.valor.toFixed(2));
      const vinculado = vinculoLiquido(l.vinculos.map((v) => ({ tipo: v.tipo, valor: toMoney(v.valor.toFixed(2)) })));
      return {
        id: l.id,
        data: instanteDoDiaDoBanco(l.dataPostagem),
        fitid: l.fitid,
        documento: l.documento,
        memo: l.memo,
        natureza: l.natureza,
        valor,
        vinculado,
        situacao: situacaoDaLinha(valor, vinculado),
      };
    })
    .sort((a, b) => a.data.getTime() - b.data.getTime() || ordemNatural.compare(a.fitid, b.fitid));

  let creditos = toMoney("0.00");
  let debitos = toMoney("0.00");
  for (const l of linhas) {
    if (l.natureza === "CREDITO") creditos = toMoney(creditos.plus(l.valor));
    else debitos = toMoney(debitos.plus(l.valor));
  }

  return {
    id: e.id,
    contaBancariaId: e.contaBancariaId,
    origem: e.origem,
    periodoInicio: e.periodoInicio,
    periodoFim: e.periodoFim,
    importadoPor: e.importadoPor,
    importadoEm: e.criadoEm,
    arquivoHash: e.arquivoHash,
    bancoDoArquivo: e.bancoDoArquivo,
    contaDoArquivo: e.contaDoArquivo,
    linhas,
    totalCreditos: creditos,
    totalDebitos: debitos,
    movimentoLiquido: toMoney(creditos.minus(debitos)),
  };
}
