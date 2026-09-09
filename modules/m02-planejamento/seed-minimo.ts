/**
 * SEED MÍNIMO — só o necessário para montar 1 ficha válida nos testes.
 *
 * NÃO é o seed oficial: as tabelas STN reais (Portaria 42/99, Portaria 163,
 * naturezas de receita, fontes do TCE-PB) vêm na sessão M02a-seed. Nada aqui
 * deve ser usado em produção.
 */

export const SEED_ORGAOS = [
  { id: "org-01", codigo: "01", nome: "Prefeitura Municipal de Campina Grande" },
] as const;

export const SEED_UNIDADES = [
  {
    id: "uo-01",
    codigo: "01001",
    descricao: "Secretaria de Educação",
    orgaoId: "org-01",
  },
] as const;

export const SEED_FUNCOES = [
  { id: "fun-12", codigo: "12", nome: "Educação" },
  { id: "fun-10", codigo: "10", nome: "Saúde" },
] as const;

export const SEED_SUBFUNCOES = [
  { id: "sub-361", codigo: "361", nome: "Ensino Fundamental" },
  { id: "sub-362", codigo: "362", nome: "Ensino Médio" },
  { id: "sub-301", codigo: "301", nome: "Atenção Básica" },
] as const;

export const SEED_PROGRAMAS = [
  {
    id: "prg-0012",
    codigo: "0012",
    descricao: "Educação Básica de Qualidade",
    objetivo: "Ampliar o acesso e a qualidade do ensino fundamental",
    tipoObjetivoMilenio: "02",
  },
] as const;

export const SEED_ACOES = [
  {
    id: "aca-2001",
    codigo: "2001",
    descricao: "Manutenção do Ensino Fundamental",
    tipo: "ATIVIDADE" as const,
  },
] as const;

/** 3.3.90.39 — Outros Serviços de Terceiros, Pessoa Jurídica. */
export const SEED_NATUREZAS_DESPESA = [
  {
    id: "nd-339039",
    codCategoria: "3",
    codNatureza: "3",
    codModalidade: "90",
    codElemento: "39",
    codigoCompleto: "339039",
    descricao: "Outros Serviços de Terceiros - Pessoa Jurídica",
    mapeamentoStn: "339039",
  },
] as const;

export const SEED_FONTES = [
  {
    id: "fnt-500",
    codigo: "500",
    descricao: "Recursos não vinculados de impostos",
    codigoTce: "500",
    codigoStn: "1500",
    exercicioPadrao: 1,
  },
  {
    id: "fnt-540",
    codigo: "540",
    descricao: "Transferências do FUNDEB",
    codigoTce: "540",
    codigoStn: "1540",
    exercicioPadrao: 1,
  },
] as const;

export const SEED_COS = [
  { id: "co-0001", codigo: "0001", descricao: "Execução direta" },
] as const;

/** 1.1.1.8.01.1.1 — IPTU (código de 8 dígitos, exemplo). */
export const SEED_NATUREZAS_RECEITA = [
  {
    id: "nr-11121101",
    codigo: "11121101",
    descricao: "IPTU - Principal",
    mapeamentoStn: "11121101",
  },
] as const;

/** A classificação de uma ficha válida montada só com o seed acima. */
export const CLASSIFICACAO_VALIDA = {
  orgao: "01",
  unidadeOrc: "01001",
  funcao: "12",
  subfuncao: "361",
  programa: "0012",
  acao: "2001",
  naturezaDespesa: "339039",
  fonte: "500",
  co: "0001",
} as const;
