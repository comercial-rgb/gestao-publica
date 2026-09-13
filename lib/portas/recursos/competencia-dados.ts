import { diaCivil, diaCivilBr } from "../../../packages/datas/index.js";
import { parametroVigente } from "../../../modules/m10-patrimonial/parametros.js";
import {
  atualizarCompetencia,
  preverCompetencia,
  type ResultadoAtualizacao,
  type SituacaoDaCompetencia,
} from "../../../modules/m10-patrimonial/patrimonio.js";
import { comEscritaAutenticada } from "../sessao";
import { cliente, PortaSemBancoError } from "../cliente";
import { residualEmPorcento } from "./parametros-dados.js";
import { OPCOES_DE_METODO } from "./parametros.js";
import { rotuloDoTipoPatrimonial } from "./roteiros.js";

/**
 * ═══ O PROCESSAMENTO POR COMPETÊNCIA — M10, V3 pacote 2 ═══
 *
 * Três leituras e uma escrita:
 *   - as classes que TÊM parâmetro em vigor (o seletor da tela — classe sem parâmetro não
 *     aparece porque o domínio a recusaria, e a tela não monta armadilha);
 *   - a PRÉVIA de uma competência: a mesma conta que a atualização faz, sem escrever
 *     (`preverCompetencia`); a tela mostra a memória ANTES de o operador lançar;
 *   - o HISTÓRICO do que já foi processado na classe, com a memória gravada de cada um;
 *   - processar: `atualizarCompetencia`, com o crachá `ATUALIZAR_COMPETENCIA_PATRIMONIAL`.
 *
 * ⚠️ `GET` não produz transição de estado: a prévia é lida pela URL; processar é POST.
 */

export { PortaSemBancoError };

type Campos = Readonly<Record<string, string>>;
const t = (c: Campos, k: string): string => (c[k] ?? "").trim();

const ROTULO_DO_METODO: Readonly<Record<string, string>> = Object.fromEntries(
  OPCOES_DE_METODO.map((o) => [o.valor, o.rotulo])
);

export interface ClasseParametrizada {
  readonly id: string;
  readonly rotulo: string;
  readonly metodo: string;
}

export async function classesComParametro(): Promise<readonly ClasseParametrizada[]> {
  const prisma = cliente();
  const classes = await prisma.classeDeBens.findMany({
    where: { ativa: true },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
    take: 500,
  });
  const saida: ClasseParametrizada[] = [];
  for (const c of classes) {
    const p = await parametroVigente(prisma, c.id);
    if (p === null || !p.ativo) continue;
    saida.push({ id: c.id, rotulo: `${c.codigo} — ${c.descricao}`, metodo: ROTULO_DO_METODO[p.metodo] ?? p.metodo });
  }
  return saida;
}

export interface PreviaLida {
  readonly classe: { readonly id: string; readonly rotulo: string };
  readonly competencia: string;
  readonly situacao: SituacaoDaCompetencia;
  readonly recusa: string | null;
  readonly parametro: {
    readonly versao: string;
    readonly metodo: string;
    readonly vidaUtilMeses: number;
    readonly residual: string;
  } | null;
  readonly tipo: string | null;
  readonly base: string;
  readonly valorContabil: string;
  readonly jaAplicado: string;
  readonly calculo: {
    readonly valorResidual: string;
    readonly parcelaCheia: string;
    readonly teto: string;
    readonly valorDaParcela: string;
  } | null;
}

/** A prévia — `null` quando a classe não existe. Competência malformada ESTOURA nomeando. */
export async function previaDaCompetencia(classeId: string, competencia: string): Promise<PreviaLida | null> {
  const prisma = cliente();
  const classe = await prisma.classeDeBens.findUnique({ where: { id: classeId }, select: { codigo: true, descricao: true } });
  if (classe === null) return null;
  const p = await preverCompetencia(prisma, { classeDeBensId: classeId, competencia });
  return {
    classe: { id: classeId, rotulo: `${classe.codigo} — ${classe.descricao}` },
    competencia,
    situacao: p.situacao,
    recusa: p.recusa,
    parametro:
      p.parametro === null
        ? null
        : {
            versao: p.parametro.origem === "LEGADO" ? "parâmetro de origem (sem versão)" : `versão ${p.parametro.numero}`,
            metodo: ROTULO_DO_METODO[p.parametro.metodo] ?? p.parametro.metodo,
            vidaUtilMeses: p.parametro.vidaUtilMeses,
            residual: residualEmPorcento(p.parametro.percentualResidual),
          },
    tipo: p.tipo === null ? null : rotuloDoTipoPatrimonial(p.tipo),
    base: p.base.toFixed(2),
    valorContabil: p.valorContabil.toFixed(2),
    jaAplicado: p.jaAplicado.toFixed(2),
    calculo:
      p.calculo === null
        ? null
        : {
            valorResidual: p.calculo.valorResidual.toFixed(2),
            parcelaCheia: p.calculo.parcelaCheia.toFixed(2),
            teto: p.calculo.teto.toFixed(2),
            valorDaParcela: p.calculo.valorDaParcela.toFixed(2),
          },
  };
}

export interface CompetenciaProcessada {
  readonly movimentoId: string;
  readonly competencia: string;
  readonly tipo: string;
  readonly valor: string;
  readonly lancadaEm: string;
  readonly por: string;
  readonly estornada: boolean;
  readonly memoria: {
    readonly versao: string;
    readonly metodo: string;
    readonly vidaUtilMeses: number;
    readonly residual: string;
    readonly base: string;
    readonly valorContabilAntes: string;
    readonly valorResidual: string;
    readonly parcelaCheia: string;
    readonly teto: string;
  } | null;
}

/** O que já foi processado na classe, da competência mais recente à mais antiga. */
export async function competenciasProcessadas(classeId: string): Promise<readonly CompetenciaProcessada[]> {
  const movimentos = await cliente().movimentoPatrimonial.findMany({
    where: { classeDeBensId: classeId, competencia: { not: null }, tipo: { in: ["DEPRECIACAO", "AMORTIZACAO", "EXAUSTAO"] } },
    orderBy: [{ competencia: "desc" }, { criadoEm: "desc" }],
    take: 240,
    select: {
      id: true, tipo: true, valor: true, competencia: true, criadoEm: true, criadoPor: true,
      estornos: { select: { id: true } },
      memoriaDeAtualizacao: {
        select: {
          metodo: true, vidaUtilMeses: true, percentualResidual: true, base: true, valorContabilAntes: true,
          valorResidual: true, parcelaCheia: true, teto: true,
          versaoDeParametro: { select: { numero: true } },
        },
      },
    },
  });
  return movimentos.map((m) => ({
    movimentoId: m.id,
    competencia: m.competencia === null ? "—" : diaCivil(m.competencia).slice(0, 7),
    tipo: rotuloDoTipoPatrimonial(m.tipo),
    valor: m.valor.toFixed(2),
    lancadaEm: diaCivilBr(m.criadoEm),
    por: m.criadoPor,
    estornada: m.estornos.length > 0,
    memoria:
      m.memoriaDeAtualizacao === null
        ? null
        : {
            versao:
              m.memoriaDeAtualizacao.versaoDeParametro === null
                ? "parâmetro de origem (sem versão)"
                : `versão ${m.memoriaDeAtualizacao.versaoDeParametro.numero}`,
            metodo: ROTULO_DO_METODO[m.memoriaDeAtualizacao.metodo] ?? m.memoriaDeAtualizacao.metodo,
            vidaUtilMeses: m.memoriaDeAtualizacao.vidaUtilMeses,
            residual: residualEmPorcento(m.memoriaDeAtualizacao.percentualResidual.toFixed(6)),
            base: m.memoriaDeAtualizacao.base.toFixed(2),
            valorContabilAntes: m.memoriaDeAtualizacao.valorContabilAntes.toFixed(2),
            valorResidual: m.memoriaDeAtualizacao.valorResidual.toFixed(2),
            parcelaCheia: m.memoriaDeAtualizacao.parcelaCheia.toFixed(2),
            teto: m.memoriaDeAtualizacao.teto.toFixed(2),
          },
  }));
}

export async function processarCompetencia(c: Campos): Promise<ResultadoAtualizacao> {
  return comEscritaAutenticada("ATUALIZAR_COMPETENCIA_PATRIMONIAL", (criadoPor) =>
    atualizarCompetencia(cliente(), {
      classeDeBensId: t(c, "classeDeBensId"),
      competencia: t(c, "competencia"),
      criadoPor,
    })
  );
}
