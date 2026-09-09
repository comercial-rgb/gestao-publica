/**
 * ELEMENTOS DE DESPESA — Anexo II da Portaria Interministerial STN/SOF
 * 163/2001 consolidada. 5º e 6º dígitos da natureza da despesa.
 *
 * ROL FECHADO: 78 elementos, confirmado contra o Anexo II.
 *
 * ⚠️ COLISÃO DE CÓDIGO com MODALIDADE DE APLICAÇÃO: os códigos
 * 32, 35, 45, 46, 67, 73, 93 e 94 existem nos DOIS domínios com significados
 * DIFERENTES (ex.: elemento 46 = Auxílio-Alimentação; modalidade 46 =
 * fundo a fundo SUAS). São posições distintas da natureza da despesa
 * (`codElemento` vs `codModalidade`) e NÃO podem se contaminar — há teste
 * provando isso em `prisma/seed/seed.test.ts`.
 */

export interface ElementoOficial {
  readonly codigo: string;
  readonly nome: string;
}

export const ELEMENTOS: readonly ElementoOficial[] = [
  { codigo: "01", nome: "Aposentadorias do RPPS, Reserva Remunerada e Reformas dos Militares" },
  { codigo: "03", nome: "Pensões, exclusive do RGPS" },
  { codigo: "04", nome: "Contratação por Tempo Determinado" },
  { codigo: "05", nome: "Outros Benefícios Previdenciários do RPPS" },
  { codigo: "06", nome: "Benefício Mensal ao Deficiente e ao Idoso" },
  { codigo: "07", nome: "Contribuição a Entidades Fechadas de Previdência" },
  { codigo: "08", nome: "Outros Benefícios Assistenciais" },
  { codigo: "09", nome: "Salário-Família" },
  { codigo: "10", nome: "Seguro Desemprego e Abono Salarial" },
  { codigo: "11", nome: "Vencimentos e Vantagens Fixas - Pessoal Civil" },
  { codigo: "12", nome: "Vencimentos e Vantagens Fixas - Pessoal Militar" },
  { codigo: "13", nome: "Obrigações Patronais" },
  { codigo: "14", nome: "Diárias - Civil" },
  { codigo: "15", nome: "Diárias - Militar" },
  { codigo: "16", nome: "Outras Despesas Variáveis - Pessoal Civil" },
  { codigo: "17", nome: "Outras Despesas Variáveis - Pessoal Militar" },
  { codigo: "18", nome: "Auxílio Financeiro a Estudantes" },
  { codigo: "19", nome: "Auxílio-Fardamento" },
  { codigo: "20", nome: "Auxílio Financeiro a Pesquisadores" },
  { codigo: "21", nome: "Juros sobre a Dívida por Contrato" },
  { codigo: "22", nome: "Outros Encargos sobre a Dívida por Contrato" },
  { codigo: "23", nome: "Juros, Deságios e Descontos da Dívida Mobiliária" },
  { codigo: "24", nome: "Outros Encargos sobre a Dívida Mobiliária" },
  { codigo: "25", nome: "Encargos sobre Operações de Crédito por Antecipação da Receita" },
  { codigo: "26", nome: "Obrigações decorrentes de Política Monetária" },
  { codigo: "27", nome: "Encargos pela Honra de Avais, Garantias, Seguros e Similares" },
  { codigo: "28", nome: "Remuneração de Cotas de Fundos Autárquicos" },
  { codigo: "29", nome: "Distribuição de Resultado de Empresas Estatais Dependentes" },
  { codigo: "30", nome: "Material de Consumo" },
  { codigo: "31", nome: "Premiações Culturais, Artísticas, Científicas, Desportivas e Outras" },
  { codigo: "32", nome: "Material, Bem ou Serviço para Distribuição Gratuita" },
  { codigo: "33", nome: "Passagens e Despesas com Locomoção" },
  { codigo: "34", nome: "Outras Despesas de Pessoal decorrentes de Contratos de Terceirização" },
  { codigo: "35", nome: "Serviços de Consultoria" },
  { codigo: "36", nome: "Outros Serviços de Terceiros - Pessoa Física" },
  { codigo: "37", nome: "Locação de Mão-de-Obra" },
  { codigo: "38", nome: "Arrendamento Mercantil" },
  { codigo: "39", nome: "Outros Serviços de Terceiros - Pessoa Jurídica" },
  { codigo: "41", nome: "Contribuições" },
  { codigo: "42", nome: "Auxílios" },
  { codigo: "43", nome: "Subvenções Sociais" },
  { codigo: "45", nome: "Subvenções Econômicas" },
  { codigo: "46", nome: "Auxílio-Alimentação" },
  { codigo: "47", nome: "Obrigações Tributárias e Contributivas" },
  { codigo: "48", nome: "Outros Auxílios Financeiros a Pessoas Físicas" },
  { codigo: "49", nome: "Auxílio-Transporte" },
  { codigo: "51", nome: "Obras e Instalações" },
  { codigo: "52", nome: "Equipamentos e Material Permanente" },
  { codigo: "53", nome: "Aposentadorias do RGPS - Área Rural" },
  { codigo: "54", nome: "Aposentadorias do RGPS - Área Urbana" },
  { codigo: "55", nome: "Pensões do RGPS - Área Rural" },
  { codigo: "56", nome: "Pensões do RGPS - Área Urbana" },
  { codigo: "57", nome: "Outros Benefícios do RGPS - Área Rural" },
  { codigo: "58", nome: "Outros Benefícios do RGPS - Área Urbana" },
  { codigo: "61", nome: "Aquisição de Imóveis" },
  { codigo: "62", nome: "Aquisição de Produtos para Revenda" },
  { codigo: "63", nome: "Aquisição de Títulos de Crédito" },
  { codigo: "64", nome: "Aquisição de Títulos Representativos de Capital já Integralizado" },
  { codigo: "65", nome: "Constituição ou Aumento de Capital de Empresas" },
  { codigo: "66", nome: "Concessão de Empréstimos e Financiamentos" },
  { codigo: "67", nome: "Depósitos Compulsórios" },
  { codigo: "70", nome: "Rateio pela Participação em Consórcio Público" },
  { codigo: "71", nome: "Principal da Dívida Contratual Resgatado" },
  { codigo: "72", nome: "Principal da Dívida Mobiliária Resgatado" },
  { codigo: "73", nome: "Correção Monetária ou Cambial da Dívida Contratual Resgatada" },
  { codigo: "74", nome: "Correção Monetária ou Cambial da Dívida Mobiliária Resgatada" },
  { codigo: "75", nome: "Correção Monetária da Dívida de Operações de Crédito por Antecipação da Receita" },
  { codigo: "76", nome: "Principal Corrigido da Dívida Mobiliária Refinanciado" },
  { codigo: "77", nome: "Principal Corrigido da Dívida Contratual Refinanciado" },
  { codigo: "81", nome: "Distribuição Constitucional ou Legal de Receitas" },
  { codigo: "91", nome: "Sentenças Judiciais" },
  { codigo: "92", nome: "Despesas de Exercícios Anteriores" },
  { codigo: "93", nome: "Indenizações e Restituições" },
  { codigo: "94", nome: "Indenizações e Restituições Trabalhistas" },
  { codigo: "95", nome: "Indenização pela Execução de Trabalhos de Campo" },
  { codigo: "96", nome: "Ressarcimento de Despesas de Pessoal Requisitado" },
  { codigo: "97", nome: "Aporte para Cobertura do Déficit Atuarial do RPPS" },
  { codigo: "99", nome: "A Classificar" },
];
