/**
 * SUBFUNÇÕES — lista oficial definitiva: 111.
 *
 *   109  Portaria SOF/SETO/ME 42/1999, CONSOLIDADA (DOU 22/03/2022)
 *   + 2  Reservas (997, 999) — Portaria Interministerial STN/SOF 163/2001, art. 8º
 *
 * As duas reservas NÃO constam da Portaria 42: vêm da 163/2001 e estão marcadas
 * como tal no final do array. Sem elas não haveria como classificar a Reserva de
 * Contingência (Função 99) nem a Reserva do RPPS na LOA.
 *
 * REVOGADAS, não semear: 601, 602, 603, 604 (Agricultura). A consolidação de
 * 2022 as fundiu em 608 (Promoção da Produção Agropecuária) e 609 (Defesa
 * Agropecuária). Removidas do seed e do banco na sessão 2c-final, com zero
 * FichaOrcamentaria apontando para elas (confirmado antes de remover).
 */

export interface SubfuncaoOficial {
  readonly codigo: string;
  readonly nome: string;
}

export const SUBFUNCOES: readonly SubfuncaoOficial[] = [
  // 01 Legislativa
  { codigo: "031", nome: "Ação Legislativa" },
  { codigo: "032", nome: "Controle Externo" },

  // 02 Judiciária
  { codigo: "061", nome: "Ação Judiciária" },
  { codigo: "062", nome: "Defesa do Interesse Público no Processo Judiciário" },

  // 03 Essencial à Justiça
  { codigo: "091", nome: "Defesa da Ordem Jurídica" },
  { codigo: "092", nome: "Representação Judicial e Extrajudicial" },

  // 04 Administração
  { codigo: "121", nome: "Planejamento e Orçamento" },
  { codigo: "122", nome: "Administração Geral" },
  { codigo: "123", nome: "Administração Financeira" },
  { codigo: "124", nome: "Controle Interno" },
  { codigo: "125", nome: "Normatização e Fiscalização" },
  { codigo: "126", nome: "Tecnologia da Informação" },
  { codigo: "127", nome: "Ordenamento Territorial" },
  { codigo: "128", nome: "Formação de Recursos Humanos" },
  { codigo: "129", nome: "Administração de Receitas" },
  { codigo: "130", nome: "Administração de Concessões" },
  { codigo: "131", nome: "Comunicação Social" },

  // 05 Defesa Nacional
  { codigo: "151", nome: "Defesa Aérea" },
  { codigo: "152", nome: "Defesa Naval" },
  { codigo: "153", nome: "Defesa Terrestre" },

  // 06 Segurança Pública
  { codigo: "181", nome: "Policiamento" },
  { codigo: "182", nome: "Defesa Civil" },
  { codigo: "183", nome: "Informação e Inteligência" },

  // 07 Relações Exteriores
  { codigo: "211", nome: "Relações Diplomáticas" },
  { codigo: "212", nome: "Cooperação Internacional" },

  // 08 Assistência Social
  { codigo: "241", nome: "Assistência ao Idoso" },
  { codigo: "242", nome: "Assistência ao Portador de Deficiência" },
  { codigo: "243", nome: "Assistência à Criança e ao Adolescente" },
  { codigo: "244", nome: "Assistência Comunitária" },

  // 09 Previdência Social
  { codigo: "271", nome: "Previdência Básica" },
  { codigo: "272", nome: "Previdência do Regime Estatutário" },
  { codigo: "273", nome: "Previdência Complementar" },
  { codigo: "274", nome: "Previdência Especial" },

  // 10 Saúde
  { codigo: "301", nome: "Atenção Básica" },
  { codigo: "302", nome: "Assistência Hospitalar e Ambulatorial" },
  { codigo: "303", nome: "Suporte Profilático e Terapêutico" },
  { codigo: "304", nome: "Vigilância Sanitária" },
  { codigo: "305", nome: "Vigilância Epidemiológica" },
  { codigo: "306", nome: "Alimentação e Nutrição" },

  // 11 Trabalho
  { codigo: "331", nome: "Proteção e Benefícios ao Trabalhador" },
  { codigo: "332", nome: "Relações de Trabalho" },
  { codigo: "333", nome: "Empregabilidade" },
  { codigo: "334", nome: "Fomento ao Trabalho" },

  // 12 Educação
  { codigo: "361", nome: "Ensino Fundamental" },
  { codigo: "362", nome: "Ensino Médio" },
  { codigo: "363", nome: "Ensino Profissional" },
  { codigo: "364", nome: "Ensino Superior" },
  { codigo: "365", nome: "Educação Infantil" },
  { codigo: "366", nome: "Educação de Jovens e Adultos" },
  { codigo: "367", nome: "Educação Especial" },
  { codigo: "368", nome: "Educação Básica" },

  // 13 Cultura
  { codigo: "391", nome: "Patrimônio Histórico, Artístico e Arqueológico" },
  { codigo: "392", nome: "Difusão Cultural" },

  // 14 Direitos da Cidadania
  { codigo: "421", nome: "Custódia e Reintegração Social" },
  { codigo: "422", nome: "Direitos Individuais, Coletivos e Difusos" },
  { codigo: "423", nome: "Assistência aos Povos Indígenas" },

  // 15 Urbanismo
  { codigo: "451", nome: "Infra-Estrutura Urbana" },
  { codigo: "452", nome: "Serviços Urbanos" },
  { codigo: "453", nome: "Transportes Coletivos Urbanos" },

  // 16 Habitação
  { codigo: "481", nome: "Habitação Rural" },
  { codigo: "482", nome: "Habitação Urbana" },

  // 17 Saneamento
  { codigo: "511", nome: "Saneamento Básico Rural" },
  { codigo: "512", nome: "Saneamento Básico Urbano" },

  // 18 Gestão Ambiental
  { codigo: "541", nome: "Preservação e Conservação Ambiental" },
  { codigo: "542", nome: "Controle Ambiental" },
  { codigo: "543", nome: "Recuperação de Áreas Degradadas" },
  { codigo: "544", nome: "Recursos Hídricos" },
  { codigo: "545", nome: "Meteorologia" },

  // 19 Ciência e Tecnologia
  { codigo: "571", nome: "Desenvolvimento Científico" },
  { codigo: "572", nome: "Desenvolvimento Tecnológico e Engenharia" },
  { codigo: "573", nome: "Difusão do Conhecimento Científico e Tecnológico" },

  // 20 Agricultura — a consolidação de 2022 fundiu 601–604 em 608 e 609.
  { codigo: "605", nome: "Abastecimento" },
  { codigo: "606", nome: "Extensão Rural" },
  { codigo: "607", nome: "Irrigação" },
  { codigo: "608", nome: "Promoção da Produção Agropecuária" },
  { codigo: "609", nome: "Defesa Agropecuária" },

  // 21 Organização Agrária
  { codigo: "631", nome: "Reforma Agrária" },
  { codigo: "632", nome: "Colonização" },

  // 22 Indústria
  { codigo: "661", nome: "Promoção Industrial" },
  { codigo: "662", nome: "Produção Industrial" },
  { codigo: "663", nome: "Mineração" },
  { codigo: "664", nome: "Propriedade Industrial" },
  { codigo: "665", nome: "Normalização e Qualidade" },

  // 23 Comércio e Serviços
  { codigo: "691", nome: "Promoção Comercial" },
  { codigo: "692", nome: "Comercialização" },
  { codigo: "693", nome: "Comércio Exterior" },
  { codigo: "694", nome: "Serviços Financeiros" },
  { codigo: "695", nome: "Turismo" },

  // 24 Comunicações
  { codigo: "721", nome: "Comunicações Postais" },
  { codigo: "722", nome: "Telecomunicações" },

  // 25 Energia
  { codigo: "751", nome: "Conservação de Energia" },
  { codigo: "752", nome: "Energia Elétrica" },
  { codigo: "753", nome: "Combustíveis Minerais" },
  { codigo: "754", nome: "Biocombustíveis" },

  // 26 Transporte
  { codigo: "781", nome: "Transporte Aéreo" },
  { codigo: "782", nome: "Transporte Rodoviário" },
  { codigo: "783", nome: "Transporte Ferroviário" },
  { codigo: "784", nome: "Transporte Hidroviário" },
  { codigo: "785", nome: "Transportes Especiais" },

  // 27 Desporto e Lazer
  { codigo: "811", nome: "Desporto de Rendimento" },
  { codigo: "812", nome: "Desporto Comunitário" },
  { codigo: "813", nome: "Lazer" },

  // 28 Encargos Especiais
  { codigo: "841", nome: "Refinanciamento da Dívida Interna" },
  { codigo: "842", nome: "Refinanciamento da Dívida Externa" },
  { codigo: "843", nome: "Serviço da Dívida Interna" },
  { codigo: "844", nome: "Serviço da Dívida Externa" },
  { codigo: "845", nome: "Outras Transferências" },
  { codigo: "846", nome: "Outros Encargos Especiais" },
  { codigo: "847", nome: "Transferências para a Educação Básica" },

  // STN 163/2001 art.8º — Reserva (não consta Portaria 42)
  { codigo: "997", nome: "Reserva do RPPS" },
  { codigo: "999", nome: "Reserva de Contingência" },
];
