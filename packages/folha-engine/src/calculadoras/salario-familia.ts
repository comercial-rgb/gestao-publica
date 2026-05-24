/**
 * Calculadora de salario-familia.
 *
 * Decisao B34.5 n. 5: federal padrao + override municipal RPPS.
 *
 * Regras:
 *   - Pago apenas se renda mensal do servidor <= renda_maxima
 *   - Pago por FILHO < idade_maxima (default 14 anos) OU filho INVALIDO de qualquer idade
 *   - Servidor RPPS pode ter valor diferente (rpps_aliquotas.salario_familia_valor)
 *   - Filho que faz 14 anos no MEIO do mes: paga INTEGRAL nesse mes (regra fiscal BR)
 *
 * Edge cases:
 *   - Renda 1 centavo acima do limite -> nao paga (sem proporcionalidade)
 *   - Dependente sem flag dependenteSalarioFamilia -> nao conta
 *   - Dependente com data_fim_dependencia anterior a competencia -> nao conta
 *   - Pessoa sem dependentes registrados -> valor zero (mas nao e erro)
 */

import { parseNumeric, arredondar2 } from '../utils/decimal.js'
import { idadeNaData, vigenciaAtiva } from '../utils/data.js'
import type {
  SalarioFamiliaTabela,
  RppsAliquotas,
  PessoaDependente,
  RegimePrevidenciario,
} from '../types.js'
import type { ResultadoSalarioFamilia } from '../types.js'

export type CalcularSalarioFamiliaParams = {
  /** Renda do servidor no mes (proventos brutos da folha) */
  rendaMensal: number
  /** Lista de dependentes da pessoa (ja filtrados por dependente_salario_familia) */
  dependentes: PessoaDependente[]
  /** Tabela federal vigente */
  tabelaFederal: SalarioFamiliaTabela
  /** Aliquota RPPS pode ter override de valor (decisao 5) */
  rppsAliquota: RppsAliquotas | null
  /** Regime previdenciario do vinculo */
  regimePrevidenciario: RegimePrevidenciario
  /** Competencia (primeiro dia do mes) */
  competencia: Date
}

export function calcularSalarioFamilia(
  params: CalcularSalarioFamiliaParams,
): ResultadoSalarioFamilia {
  const {
    rendaMensal,
    dependentes,
    tabelaFederal,
    rppsAliquota,
    regimePrevidenciario,
    competencia,
  } = params

  // ============================================================
  // 1. Resolve renda maxima e valor por filho
  //    Decisao 5: RPPS pode sobrescrever ambos
  // ============================================================
  let rendaMaxima: number
  let valorPorFilho: number
  let fonteValor: 'FEDERAL_OFICIAL' | 'RPPS_OVERRIDE'
  let fundamentacao: string

  if (
    regimePrevidenciario === 'rpps' &&
    rppsAliquota?.salarioFamiliaValor != null &&
    rppsAliquota?.salarioFamiliaRendaMaxima != null
  ) {
    rendaMaxima = parseNumeric(rppsAliquota.salarioFamiliaRendaMaxima)
    valorPorFilho = parseNumeric(rppsAliquota.salarioFamiliaValor)
    fonteValor = 'RPPS_OVERRIDE'
    fundamentacao = `${rppsAliquota.fundamentacaoLegal} (override RPPS)`
  } else {
    rendaMaxima = parseNumeric(tabelaFederal.rendaMaxima)
    valorPorFilho = parseNumeric(tabelaFederal.valorPorFilho)
    fonteValor = 'FEDERAL_OFICIAL'
    fundamentacao = tabelaFederal.fundamentacaoLegal
  }

  const idadeMaxima = tabelaFederal.idadeMaximaFilho ?? 14

  // ============================================================
  // 2. Avalia cada dependente
  // ============================================================
  const filhosConsiderados: ResultadoSalarioFamilia['filhosConsiderados'] = []
  let numeroFilhosElegiveis = 0

  // Idade calculada no PRIMEIRO DIA da competencia:
  // Filho que faz 14 anos durante o mes ainda recebe esse mes completo
  const dataReferencia = competencia

  for (const dep of dependentes) {
    // Filtra apenas dependentes com flag dependente_salario_familia
    if (!dep.dependenteSalarioFamilia) continue

    // Filtra apenas FILHO, ENTEADO, TUTELADO, GUARDA_JUDICIAL
    const parentescosValidos = ['FILHO', 'ENTEADO', 'TUTELADO', 'GUARDA_JUDICIAL']
    if (!parentescosValidos.includes(dep.parentesco)) {
      filhosConsiderados.push({
        dependenteId: dep.id,
        nome: dep.nome,
        idadeAnos: idadeNaData(new Date(dep.dataNascimento), dataReferencia),
        elegivel: false,
        motivoInelegibilidade: `Parentesco inelegivel: ${dep.parentesco}`,
      })
      continue
    }

    // Vigencia da dependencia precisa estar ativa
    if (
      !vigenciaAtiva(dep.dataInicioDependencia, dep.dataFimDependencia, competencia)
    ) {
      filhosConsiderados.push({
        dependenteId: dep.id,
        nome: dep.nome,
        idadeAnos: idadeNaData(new Date(dep.dataNascimento), dataReferencia),
        elegivel: false,
        motivoInelegibilidade: 'Vinculo de dependencia nao vigente nesta competencia',
      })
      continue
    }

    const idade = idadeNaData(new Date(dep.dataNascimento), dataReferencia)

    // Regra: < idade_maxima OU invalido (qualquer idade)
    if (idade < idadeMaxima || dep.invalido) {
      numeroFilhosElegiveis++
      filhosConsiderados.push({
        dependenteId: dep.id,
        nome: dep.nome,
        idadeAnos: idade,
        elegivel: true,
      })
    } else {
      filhosConsiderados.push({
        dependenteId: dep.id,
        nome: dep.nome,
        idadeAnos: idade,
        elegivel: false,
        motivoInelegibilidade: `Idade ${idade} >= limite ${idadeMaxima} (e nao invalido)`,
      })
    }
  }

  // ============================================================
  // 3. Verifica renda maxima do servidor
  // ============================================================
  if (rendaMensal > rendaMaxima) {
    // Renda acima do limite -- nao paga nada (nao ha proporcionalidade legal)
    return {
      base: arredondar2(rendaMensal),
      numeroFilhosElegiveis: 0,
      valorPorFilho: arredondar2(valorPorFilho),
      valorTotal: 0,
      rendaMaximaAplicada: arredondar2(rendaMaxima),
      fonteValor,
      filhosConsiderados: filhosConsiderados.map((f) => ({
        ...f,
        elegivel: false,
        motivoInelegibilidade:
          f.motivoInelegibilidade ?? `Renda do servidor (${rendaMensal}) acima do limite (${rendaMaxima})`,
      })),
      fundamentacao,
    }
  }

  // ============================================================
  // 4. Calcula valor total
  // ============================================================
  const valorTotal = arredondar2(numeroFilhosElegiveis * valorPorFilho)

  return {
    base: arredondar2(rendaMensal),
    numeroFilhosElegiveis,
    valorPorFilho: arredondar2(valorPorFilho),
    valorTotal,
    rendaMaximaAplicada: arredondar2(rendaMaxima),
    fonteValor,
    filhosConsiderados,
    fundamentacao,
  }
}
