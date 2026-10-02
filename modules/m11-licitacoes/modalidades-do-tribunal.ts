/**
 * V26 — §6.2 MODALIDADES DE LICITAÇÕES do leiaute SAGRES 2026 v1.1 (`docs/oficial/tce-pb/layout-contabilidade-2026-v1.1-
 * 12122025.html`), transcrita inteira — a tabela chega ao 39, e não se congela em 35. Conferida contra o HTML por leitor
 * independente em `adapters/tribunais/tce-pb/sagres/m15-licitacao-v26.test.ts`. (*) = restrita a empresas públicas e
 * sociedades de economia mista.
 */
export const MODALIDADES_DO_TRIBUNAL: Readonly<Record<string, string>> = {
  "1": "Concorrência",
  "2": "Tomada de Preços",
  "3": "Convite",
  "4": "Concurso",
  "5": "Leilão",
  "6": "Dispensa por Valor",
  "7": "Dispensa por outros motivos",
  "8": "Inexigível",
  "9": "Sem Licitação",
  "10": "Pregão Eletrônico",
  "11": "Pregão Presencial",
  "12": "Adesão a Registro de Preço",
  "13": "Chamada Pública",
  "14": "RDC - Regime Diferenciado de Contratações Públicas",
  "15": "Lei Nº 13.303/2016 (*)",
  "16": "Lei Nº 13.303/2016 (Art. 29 ou 30) (*)",
  "17": "Internacional (GN 2349-9)",
  "18": "Internacional (GN 2350-9)",
  "19": "Contratação Emergencial de Organização (Art. 12, II da Lei Nº 9.454/2011)",
  "20": "Dispensa COVID-19 (Art. 4º da Lei 13.979/2020)",
  "21": "Dispensa (Lei 14.133/21)",
  "22": "Inexigibilidade (Lei 14.133/21)",
  "23": "Concorrência (Lei 14.133/21)",
  "24": "Pregão (Lei 14.133/21)",
  "25": "Concurso (Lei 14.133/21)",
  "26": "Pregão (Medida Provisória 1.047/21)",
  "27": "Dispensa (Medida Provisória 1.047/21)",
  "28": "Internacional Não Competitiva",
  "29": "Licitação Internacional Competitiva",
  "30": "Credenciamento - (Lei Nº 14.133/2021)",
  "31": "Concorrência - Publicidade (Lei Nº 12.232/2010)",
  "32": "Diálogo Competitivo - (Lei Nº 14.133/2021)",
  "33": "Alienação de bens, dispensada a licitação - (Lei Nº 14.133/2021)",
  "34": "Leilão - (Lei Nº 14.133/2021)",
  "35": "Adesão a Ata de Registro de Preços - (Lei Nº 14.133/2021)",
  "36": "Licitação Credenciamento - (Lei Nº 8.666/93)",
  "37": "Dispensa por valor (art. 29, incisos I e II da Lei 13.303/2016) (*)",
  "38": "Dispensa demais motivos (art. 29, incisos III a XVIII, e §§ 1º, 2º e 3º, todos da Lei 13.303/2026) (*)",
  "39": "Inexigibilidade (art. 30 da Lei 13.303/2016) (*)",
};

/**
 * O DE-PARA PERMITIDO do procedimento do processo (Lei 14.133/2021, como o M11 o registra) para a modalidade do Tribunal
 * (ordem V26 2.8). Lei de regência e procedimento são coisas distintas: o pregão da 14.133 é 24, não 10/11 por ser
 * eletrônico ou presencial. A adesão a ata (35) não tem procedimento próprio no M11 e fica fora até ter.
 */
export const MODALIDADES_PERMITIDAS: Readonly<Record<"PREGAO_ELETRONICO" | "PREGAO_PRESENCIAL" | "CONCORRENCIA" | "CONCURSO" | "LEILAO" | "DIALOGO_COMPETITIVO" | "DISPENSA" | "INEXIGIBILIDADE", readonly string[]>> = {
  PREGAO_ELETRONICO: ["24"],
  PREGAO_PRESENCIAL: ["24"],
  CONCORRENCIA: ["23"],
  CONCURSO: ["25"],
  LEILAO: ["34"],
  DIALOGO_COMPETITIVO: ["32"],
  DISPENSA: ["21", "33"],
  INEXIGIBILIDADE: ["22", "30"],
};

/**
 * As exceções de preenchimento do número (§4.8): modalidade 9 sai com zeros; modalidade 6 com o número se a licitação
 * foi realizada, senão zeros; qualquer outra exige o número. A 21 NÃO está nas exceções — não se estende a ela.
 */
export const MODALIDADES_COM_NUMERO_OPCIONAL: ReadonlySet<string> = new Set(["6", "9"]);
