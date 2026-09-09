/**
 * DE-PARAS do RREO Anexo 8 (MDE) — seed MÍNIMO.
 *
 * ⚠️ NÃO é o mapa oficial completo. As naturezas do FUNDEB (Portaria 163) e o rol de fontes (STN
 * 710) são PENDÊNCIA DE DADO — entram com o plano do ente. Aqui vai o mínimo/convencional.
 */

export const PAPEL_RETORNO = "RETORNO";
export const PAPEL_VAAF = "VAAF";
export const PAPEL_VAAT = "VAAT";
export const PAPEL_RENDIMENTOS = "RENDIMENTOS";
export const PAPEIS_FUNDEB: readonly string[] = [PAPEL_RETORNO, PAPEL_VAAF, PAPEL_VAAT, PAPEL_RENDIMENTOS];

export interface FundebReceitaSeed {
  readonly naturezaCodigo: string;
  readonly papel: string;
}

/** Naturezas do FUNDEB → papel. Códigos canônicos (origem 17.5 transferências FUNDEB / 13 rendimentos). */
export const FUNDEB_RECEITA: readonly FundebReceitaSeed[] = [
  { naturezaCodigo: "17510151", papel: PAPEL_RETORNO }, // retorno da distribuição
  { naturezaCodigo: "17520151", papel: PAPEL_VAAF }, // complementação União VAAF
  { naturezaCodigo: "17530151", papel: PAPEL_VAAT }, // complementação União VAAT
  { naturezaCodigo: "13210051", papel: PAPEL_RENDIMENTOS }, // rendimentos de aplicação
];

export const CLASSE_EDU_FUNDEB = "FUNDEB";
export const CLASSE_EDU_VAAT = "VAAT";
export const CLASSE_EDU_IMPOSTOS_MDE = "IMPOSTOS_MDE";
export const CLASSE_EDU_OUTRAS = "OUTRAS";
export const CLASSES_EDUCACAO: readonly string[] = [CLASSE_EDU_FUNDEB, CLASSE_EDU_VAAT, CLASSE_EDU_IMPOSTOS_MDE, CLASSE_EDU_OUTRAS];

export interface FonteClasseEducacaoSeed {
  readonly fonteCodigo: string;
  readonly classe: string;
}

/** Fontes → classe de educação. Seed com as fontes que o ente usa. */
export const FONTE_CLASSE_EDUCACAO: readonly FonteClasseEducacaoSeed[] = [
  { fonteCodigo: "540", classe: CLASSE_EDU_FUNDEB }, // FUNDEB
  { fonteCodigo: "500", classe: CLASSE_EDU_IMPOSTOS_MDE }, // impostos (25% MDE)
  { fonteCodigo: "777", classe: CLASSE_EDU_OUTRAS }, // salário-educação (vinculada, fora do mínimo)
];
