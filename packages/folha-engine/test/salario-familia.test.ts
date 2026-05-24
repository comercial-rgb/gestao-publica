import { describe, it, expect } from 'vitest'
import { calcularSalarioFamilia } from '../src/calculadoras/salario-familia.js'
import type {
  PessoaDependente,
  SalarioFamiliaTabela,
  RppsAliquotas,
} from '../src/types.js'

const TABELA_FEDERAL_2026: SalarioFamiliaTabela = {
  id: 't1',
  vigenciaInicio: '2026-01-01',
  vigenciaFim: null,
  rendaMaxima: '1906.04',
  valorPorFilho: '65.00',
  idadeMaximaFilho: 14,
  oficial: true,
  fundamentacaoLegal: 'Portaria Interm. MPS/MF 13/2026',
  ativa: true,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
} as SalarioFamiliaTabela

function dep(props: Partial<PessoaDependente>): PessoaDependente {
  return {
    id: 'd1',
    pessoaId: 'p1',
    nome: 'Filho Teste',
    cpf: null,
    dataNascimento: '2020-01-01',
    parentesco: 'FILHO',
    invalido: false,
    dependenteIR: false,
    dependenteSalarioFamilia: true,
    dependentePlanoSaude: false,
    dataInicioDependencia: '2020-01-01',
    dataFimDependencia: null,
    documentoComprobatorioUrl: null,
    observacoes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    createdBy: null,
    ...props,
  } as PessoaDependente
}

const COMP = new Date('2026-05-01T00:00:00Z')

describe('calcularSalarioFamilia', () => {
  it('servidor com renda baixa + 2 filhos elegiveis = R$ 130', () => {
    const r = calcularSalarioFamilia({
      rendaMensal: 1500,
      dependentes: [
        dep({ id: 'f1', nome: 'Joao', dataNascimento: '2018-03-15' }), // 8 anos
        dep({ id: 'f2', nome: 'Maria', dataNascimento: '2020-01-01' }), // 6 anos
      ],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP,
    })

    expect(r.numeroFilhosElegiveis).toBe(2)
    expect(r.valorTotal).toBe(130.0)
    expect(r.fonteValor).toBe('FEDERAL_OFICIAL')
  })

  it('renda acima do limite zera mesmo com filhos', () => {
    const r = calcularSalarioFamilia({
      rendaMensal: 3000,
      dependentes: [dep({ dataNascimento: '2020-01-01' })],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP,
    })

    expect(r.valorTotal).toBe(0)
    expect(r.numeroFilhosElegiveis).toBe(0)
  })

  it('filho que faz 14 anos no mes ainda recebe', () => {
    // Filho nasceu em 2012-05-15 -> faz 14 em 15/05/2026
    // Competencia 01/05/2026 -> idade calculada = 13 (paga)
    const r = calcularSalarioFamilia({
      rendaMensal: 1500,
      dependentes: [dep({ dataNascimento: '2012-05-15' })],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP,
    })

    expect(r.numeroFilhosElegiveis).toBe(1)
    expect(r.valorTotal).toBe(65.0)
  })

  it('filho invalido de qualquer idade recebe', () => {
    const r = calcularSalarioFamilia({
      rendaMensal: 1500,
      dependentes: [
        dep({ dataNascimento: '1995-01-01', invalido: true }), // 31 anos invalido
      ],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP,
    })

    expect(r.numeroFilhosElegiveis).toBe(1)
    expect(r.valorTotal).toBe(65.0)
  })

  it('RPPS com override municipal usa valor proprio', () => {
    const rppsAliquota = {
      id: 'r1',
      salarioFamiliaValor: '80.00',
      salarioFamiliaRendaMaxima: '2500.00',
      aliquotaServidor: '0.1400',
      aliquotaPatronalNormal: '0.2200',
      fundamentacaoLegal: 'Lei Mun. 100/2024',
    } as unknown as RppsAliquotas

    const r = calcularSalarioFamilia({
      rendaMensal: 2200, // acima do federal (1906) mas dentro do municipal (2500)
      dependentes: [dep({ dataNascimento: '2020-01-01' })],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota,
      regimePrevidenciario: 'rpps',
      competencia: COMP,
    })

    expect(r.fonteValor).toBe('RPPS_OVERRIDE')
    expect(r.valorTotal).toBe(80.0)
    expect(r.rendaMaximaAplicada).toBe(2500.0)
  })

  it('dependente sem flag dependenteSalarioFamilia eh ignorado', () => {
    const r = calcularSalarioFamilia({
      rendaMensal: 1500,
      dependentes: [
        dep({ id: 'f1', dataNascimento: '2020-01-01', dependenteSalarioFamilia: false }),
      ],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP,
    })

    expect(r.numeroFilhosElegiveis).toBe(0)
    expect(r.valorTotal).toBe(0)
  })

  it('dependencia com data_fim anterior eh ignorada', () => {
    const r = calcularSalarioFamilia({
      rendaMensal: 1500,
      dependentes: [
        dep({
          dataNascimento: '2020-01-01',
          dataFimDependencia: '2025-12-31', // dependencia terminou em 2025
        }),
      ],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP, // 2026-05
    })

    expect(r.numeroFilhosElegiveis).toBe(0)
    expect(r.filhosConsiderados[0]!.elegivel).toBe(false)
  })

  it('renda EXATA no limite paga (= limite, nao > limite)', () => {
    const r = calcularSalarioFamilia({
      rendaMensal: 1906.04, // exatamente o limite
      dependentes: [dep({ dataNascimento: '2020-01-01' })],
      tabelaFederal: TABELA_FEDERAL_2026,
      rppsAliquota: null,
      regimePrevidenciario: 'rgps',
      competencia: COMP,
    })

    expect(r.numeroFilhosElegiveis).toBe(1)
    expect(r.valorTotal).toBe(65.0)
  })
})
