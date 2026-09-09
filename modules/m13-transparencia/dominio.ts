import { ELEMENTOS } from "../../prisma/seed/dados/elementos.js";

/**
 * M13 — TRANSPARÊNCIA. DOMÍNIO PURO (sem I/O).
 *
 * ═══ O M13 NÃO TEM ARITMÉTICA, E NÃO TEM ESCRITA ═══
 * Ele COMPÕE os donos: o M05 dá as fases da despesa, o M04 e o M02 dão a receita, o
 * M06/M12 dão a fila do art. 141. Cada número que sai daqui tem uma função de dono
 * nomeada no comentário. Um `SUM` neste módulo seria a segunda verdade sobre o dinheiro
 * público — e a primeira a aparecer no jornal.
 *
 * ═══ A MÁSCARA É A ÚNICA COISA QUE O M13 FAZ COM O DADO ═══
 * E ela é o encontro de duas leis: a LGPD (Lei 13.709/2018, art. 6º — necessidade e
 * finalidade) manda expor o MÍNIMO; o TR 7.3.4 (e a LAI, art. 8º § 1º) manda identificar
 * o beneficiário do dinheiro público. As duas convivem no consenso já pacificado (STF,
 * ARE 652.777; CGU): PESSOA JURÍDICA é identificada por INTEIRO — o CNPJ é público por
 * natureza, e quem contrata com o ente aceita o escrutínio. PESSOA FÍSICA tem o CPF
 * PARCIALMENTE MASCARADO — o suficiente para conferir, insuficiente para fichar.
 */

// ═══════════════════════════════════════════════════════════════════════════
// BENEFICIÁRIO — máscara e omissão (TR 7.3.4 × LGPD)
// ═══════════════════════════════════════════════════════════════════════════

export type TipoDocumento = "CPF" | "CNPJ";

/**
 * Por que o beneficiário não aparece, quando não aparece. É um MOTIVO ESTRUTURADO, e
 * não um campo vazio: um vazio silencioso não se distingue de um bug.
 */
export type MotivoDeOmissao =
  /** TR 7.3.4 — folha de pagamento e benefícios previdenciários. */
  | "FOLHA_OU_PREVIDENCIA"
  /** O documento gravado não é CPF nem CNPJ. Ver `identificarDocumento`. */
  | "DOCUMENTO_INVALIDO";

export interface Beneficiario {
  readonly documento: string;
  readonly tipo: TipoDocumento;
}

const SO_DIGITOS = /^\d+$/;

/**
 * ⚠️ FAIL-CLOSED DE EXPOSIÇÃO: NA DÚVIDA, NÃO EXPÕE.
 *
 * O documento é distinguido pelo COMPRIMENTO (11 = CPF, 14 = CNPJ) — é o que o modelo
 * garante (`credorCpfCnpj String`, sem tipo). Qualquer outra coisa (12 dígitos, letras,
 * vazio, um CPF com pontuação que ninguém normalizou) é DADO QUEBRADO — e um dado
 * quebrado NÃO É PUBLICADO. Expor "1234567890" como se fosse um CPF mascarado seria
 * publicar um erro com cara de dado; e tratar 14 caracteres não-numéricos como CNPJ
 * exporia por inteiro algo que ninguém validou.
 *
 * ⚠️ NÃO validamos os dígitos verificadores. Isso é DE PROPÓSITO e está nomeado: um DV
 * inválido é um erro de CADASTRO (M05), e escondê-lo aqui — no portal — faria o portal
 * mentir para tapar o buraco do cadastro. O guard do DV, se vier, nasce onde o dado
 * entra. Ver MODULO.md.
 */
export function identificarDocumento(bruto: string): Beneficiario | null {
  const d = bruto.trim();
  if (!SO_DIGITOS.test(d)) return null;
  if (d.length === 11) return { documento: mascararCpf(d), tipo: "CPF" };
  if (d.length === 14) return { documento: exporCnpj(d), tipo: "CNPJ" };
  return null;
}

/**
 * ***.NNN.NNN-** — o padrão do Portal da Transparência federal.
 *
 * Os três primeiros dígitos e os dois do DV somem; o miolo fica. Dá para CONFERIR (quem
 * já sabe o CPF reconhece o seu) e não dá para DESCOBRIR (quem não sabe não completa).
 */
export function mascararCpf(cpf: string): string {
  const miolo1 = cpf.slice(3, 6);
  const miolo2 = cpf.slice(6, 9);
  return `***.${miolo1}.${miolo2}-**`;
}

/** CNPJ INTEIRO, formatado. Pessoa jurídica que recebe dinheiro público é pública. */
export function exporCnpj(cnpj: string): string {
  return (
    `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/` +
    `${cnpj.slice(8, 12)}-${cnpj.slice(12, 14)}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A EXCEÇÃO DO 7.3.4 — POR ELEMENTO DE DESPESA
// ═══════════════════════════════════════════════════════════════════════════

export type ExposicaoDoBeneficiario = "IDENTIFICA" | "OMITE_FOLHA_OU_PREVIDENCIA";

/**
 * ⚠️ RECORD EXAUSTIVO SOBRE OS 78 ELEMENTOS OFICIAIS (`prisma/seed/dados/elementos.ts`,
 * Anexo II da Portaria 163/2001). Um elemento novo NÃO COMPILA até alguém decidir se o
 * beneficiário dele é identificado ou omitido — e essa é exatamente a decisão que
 * ninguém toma quando a regra é um `if` com meia dúzia de códigos.
 *
 * ═══ O CRITÉRIO, ESCRITO ═══
 * OMITE quando o crédito é PESSOAL ou PREVIDENCIÁRIO: o beneficiário é uma pessoa
 * física na condição de SERVIDOR (ativo, inativo), PENSIONISTA ou BENEFICIÁRIO DE
 * BENEFÍCIO PREVIDENCIÁRIO. Publicar a remuneração nominal individual já é feito no
 * portal de PESSOAL (com regime próprio); repeti-la aqui, cruzada com CPF e valor
 * líquido pago, extrapola a finalidade (LGPD, art. 6º, I e III).
 *
 * IDENTIFICA em todo o resto — inclusive quando o pagamento vai a uma pessoa física que
 * PRESTOU SERVIÇO ou VENDEU (elemento 36, "Outros Serviços de Terceiros - Pessoa
 * Física"): aí ela não é servidor, é FORNECEDOR, e o CPF sai mascarado como o de
 * qualquer outro. IDENTIFICA é o DEFAULT — a transparência é a regra; a omissão, a
 * exceção nomeada.
 *
 * ⚠️ E OS BENEFÍCIOS ASSISTENCIAIS FICAM DE FORA DA EXCEÇÃO — DE PROPÓSITO, E DECLARADO.
 * O elemento 06 (Benefício Mensal ao Deficiente e ao Idoso), o 08 (Outros Benefícios
 * Assistenciais), o 18 (Auxílio Financeiro a Estudantes) e o 48 (Outros Auxílios
 * Financeiros a Pessoas Físicas) pagam pessoas físicas que NÃO são servidores nem
 * previdenciários — e a exceção que o TR 7.3.4 nomeia é "folha ou previdência", não
 * "assistência". Alargá-la por conta própria seria ESCONDER pagamento público com base
 * numa regra que ninguém escreveu. Eles saem IDENTIFICADOS (com o CPF mascarado, como
 * todos). Se o jurídico do ente decidir que a LGPD os alcança, a mudança é UMA LINHA
 * aqui — e é assim que tem de ser. Ver MODULO.md.
 */
export const EXPOSICAO_DO_BENEFICIARIO: Record<string, ExposicaoDoBeneficiario> = {
  // ─── PESSOAL E PREVIDÊNCIA: o beneficiário é servidor, pensionista ou segurado ───
  "01": "OMITE_FOLHA_OU_PREVIDENCIA", // Aposentadorias do RPPS, Reserva Remunerada e Reformas dos Militares
  "03": "OMITE_FOLHA_OU_PREVIDENCIA", // Pensões, exclusive do RGPS
  "04": "OMITE_FOLHA_OU_PREVIDENCIA", // Contratação por Tempo Determinado (é folha)
  "05": "OMITE_FOLHA_OU_PREVIDENCIA", // Outros Benefícios Previdenciários do RPPS
  "09": "OMITE_FOLHA_OU_PREVIDENCIA", // Salário-Família
  "11": "OMITE_FOLHA_OU_PREVIDENCIA", // Vencimentos e Vantagens Fixas - Pessoal Civil
  "12": "OMITE_FOLHA_OU_PREVIDENCIA", // Vencimentos e Vantagens Fixas - Pessoal Militar
  "16": "OMITE_FOLHA_OU_PREVIDENCIA", // Outras Despesas Variáveis - Pessoal Civil
  "17": "OMITE_FOLHA_OU_PREVIDENCIA", // Outras Despesas Variáveis - Pessoal Militar
  "53": "OMITE_FOLHA_OU_PREVIDENCIA", // Aposentadorias do RGPS - Área Rural
  "54": "OMITE_FOLHA_OU_PREVIDENCIA", // Aposentadorias do RGPS - Área Urbana
  "55": "OMITE_FOLHA_OU_PREVIDENCIA", // Pensões do RGPS - Área Rural
  "56": "OMITE_FOLHA_OU_PREVIDENCIA", // Pensões do RGPS - Área Urbana
  "57": "OMITE_FOLHA_OU_PREVIDENCIA", // Outros Benefícios do RGPS - Área Rural
  "58": "OMITE_FOLHA_OU_PREVIDENCIA", // Outros Benefícios do RGPS - Área Urbana

  // ─── O RESTO IDENTIFICA. Alguns merecem a razão escrita: ───
  // 07/13/97: o credor é a ENTIDADE (fundo de previdência, RPPS) — pessoa JURÍDICA.
  "07": "IDENTIFICA", // Contribuição a Entidades Fechadas de Previdência
  "13": "IDENTIFICA", // Obrigações Patronais
  "97": "IDENTIFICA", // Aporte para Cobertura do Déficit Atuarial do RPPS
  // 14/15: DIÁRIA é o item mais clássico do portal — publicar quem viajou é o ponto.
  "14": "IDENTIFICA", // Diárias - Civil
  "15": "IDENTIFICA", // Diárias - Militar
  // 34/36/37: quem presta serviço é FORNECEDOR, não servidor — mesmo sendo PF.
  "34": "IDENTIFICA", // Outras Despesas de Pessoal decorrentes de Contratos de Terceirização
  "36": "IDENTIFICA", // Outros Serviços de Terceiros - Pessoa Física
  "37": "IDENTIFICA", // Locação de Mão-de-Obra
  // 06/08/18/48: benefício ASSISTENCIAL — ver o aviso acima. Fora da exceção.
  "06": "IDENTIFICA", // Benefício Mensal ao Deficiente e ao Idoso
  "08": "IDENTIFICA", // Outros Benefícios Assistenciais
  "18": "IDENTIFICA", // Auxílio Financeiro a Estudantes
  "48": "IDENTIFICA", // Outros Auxílios Financeiros a Pessoas Físicas

  "10": "IDENTIFICA", // Seguro Desemprego e Abono Salarial
  "19": "IDENTIFICA", // Auxílio-Fardamento
  "20": "IDENTIFICA", // Auxílio Financeiro a Pesquisadores
  "21": "IDENTIFICA", // Juros sobre a Dívida por Contrato
  "22": "IDENTIFICA", // Outros Encargos sobre a Dívida por Contrato
  "23": "IDENTIFICA", // Juros, Deságios e Descontos da Dívida Mobiliária
  "24": "IDENTIFICA", // Outros Encargos sobre a Dívida Mobiliária
  "25": "IDENTIFICA", // Encargos sobre Operações de Crédito por Antecipação da Receita
  "26": "IDENTIFICA", // Obrigações decorrentes de Política Monetária
  "27": "IDENTIFICA", // Encargos pela Honra de Avais, Garantias, Seguros e Similares
  "28": "IDENTIFICA", // Remuneração de Cotas de Fundos Autárquicos
  "29": "IDENTIFICA", // Distribuição de Resultado de Empresas Estatais Dependentes
  "30": "IDENTIFICA", // Material de Consumo
  "31": "IDENTIFICA", // Premiações Culturais, Artísticas, Científicas, Desportivas e Outras
  "32": "IDENTIFICA", // Material, Bem ou Serviço para Distribuição Gratuita
  "33": "IDENTIFICA", // Passagens e Despesas com Locomoção
  "35": "IDENTIFICA", // Serviços de Consultoria
  "38": "IDENTIFICA", // Arrendamento Mercantil
  "39": "IDENTIFICA", // Outros Serviços de Terceiros - Pessoa Jurídica
  "41": "IDENTIFICA", // Contribuições
  "42": "IDENTIFICA", // Auxílios
  "43": "IDENTIFICA", // Subvenções Sociais
  "45": "IDENTIFICA", // Subvenções Econômicas
  "46": "IDENTIFICA", // Auxílio-Alimentação
  "47": "IDENTIFICA", // Obrigações Tributárias e Contributivas
  "49": "IDENTIFICA", // Auxílio-Transporte
  "51": "IDENTIFICA", // Obras e Instalações
  "52": "IDENTIFICA", // Equipamentos e Material Permanente
  "61": "IDENTIFICA", // Aquisição de Imóveis
  "62": "IDENTIFICA", // Aquisição de Produtos para Revenda
  "63": "IDENTIFICA", // Aquisição de Títulos de Crédito
  "64": "IDENTIFICA", // Aquisição de Títulos Representativos de Capital já Integralizado
  "65": "IDENTIFICA", // Constituição ou Aumento de Capital de Empresas
  "66": "IDENTIFICA", // Concessão de Empréstimos e Financiamentos
  "67": "IDENTIFICA", // Depósitos Compulsórios
  "70": "IDENTIFICA", // Rateio pela Participação em Consórcio Público
  "71": "IDENTIFICA", // Principal da Dívida Contratual Resgatado
  "72": "IDENTIFICA", // Principal da Dívida Mobiliária Resgatado
  "73": "IDENTIFICA", // Correção Monetária ou Cambial da Dívida Contratual Resgatada
  "74": "IDENTIFICA", // Correção Monetária ou Cambial da Dívida Mobiliária Resgatada
  "75": "IDENTIFICA", // Correção Monetária da Dívida de Op. de Crédito por Antecipação da Receita
  "76": "IDENTIFICA", // Principal Corrigido da Dívida Mobiliária Refinanciado
  "77": "IDENTIFICA", // Principal Corrigido da Dívida Contratual Refinanciado
  "81": "IDENTIFICA", // Distribuição Constitucional ou Legal de Receitas
  "91": "IDENTIFICA", // Sentenças Judiciais
  "92": "IDENTIFICA", // Despesas de Exercícios Anteriores
  "93": "IDENTIFICA", // Indenizações e Restituições
  "94": "IDENTIFICA", // Indenizações e Restituições Trabalhistas
  "95": "IDENTIFICA", // Indenização pela Execução de Trabalhos de Campo
  "96": "IDENTIFICA", // Ressarcimento de Despesas de Pessoal Requisitado
  "99": "IDENTIFICA", // A Classificar
};

/**
 * FAIL-CLOSED: elemento fora do rol oficial NÃO é publicado com beneficiário.
 *
 * Um código que a Portaria 163 não emite é um cadastro quebrado — e a resposta de um
 * portal a um cadastro quebrado nunca pode ser "expõe assim mesmo".
 */
export function exposicaoDoElemento(codElemento: string): ExposicaoDoBeneficiario {
  return EXPOSICAO_DO_BENEFICIARIO[codElemento] ?? "OMITE_FOLHA_OU_PREVIDENCIA";
}

/** Todo elemento oficial está classificado, e nenhum código estranho entrou. */
export function conferirCoberturaDosElementos(): void {
  const oficiais = new Set(ELEMENTOS.map((e) => e.codigo));
  const classificados = new Set(Object.keys(EXPOSICAO_DO_BENEFICIARIO));

  const semClassificacao = [...oficiais].filter((c) => !classificados.has(c));
  const inventados = [...classificados].filter((c) => !oficiais.has(c));

  if (semClassificacao.length > 0 || inventados.length > 0) {
    throw new Error(
      `EXPOSICAO_DO_BENEFICIARIO não cobre o rol oficial de elementos. ` +
        `Sem classificação: [${semClassificacao.join(", ")}]. ` +
        `Códigos que não existem na Portaria 163: [${inventados.join(", ")}]. ` +
        `Um elemento sem decisão de exposição é um beneficiário publicado (ou ` +
        `escondido) por acidente.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CSV — RFC 4180 (TR 7.48)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Uma linha de dataset já SERIALIZADA: só strings (e `null` para "não há").
 *
 * ⚠️ É O MESMO OBJETO QUE VAI PARA O JSON E PARA O CSV. Uma verdade, dois formatos —
 * um `paraCsv` que reformatasse números ou datas teria a sua própria noção de "2.500,00"
 * e o CSV divergiria do JSON no dia em que alguém mexesse num dos dois.
 */
export type LinhaSerializada = Readonly<Record<string, string | null>>;

const PRECISA_DE_ASPAS = /[",\r\n]/;

/**
 * RFC 4180, à risca:
 *   · separador VÍRGULA; terminador CRLF (§2.1) — inclusive na última linha;
 *   · campo com vírgula, aspas ou quebra vai ENTRE ASPAS (§2.6);
 *   · aspas dentro do campo são DUPLICADAS (§2.7);
 *   · cabeçalho na primeira linha (§2.3).
 *
 * ⚠️ SEM BOM, e é uma escolha. O BOM UTF-8 faz o Excel abrir o arquivo com acento certo
 * — e faz TODO parser conforme (o `csv-parse`, o `pandas`, o `awk`) ver três bytes de
 * lixo no primeiro cabeçalho. O TR 7.48 pede DADO ABERTO, legível por MÁQUINA; o
 * conforto do Excel é problema de quem exporta para o Excel, e não do dado. Se o ente
 * quiser o BOM, ele é um `﻿` no início — e um teste que prova o contrário.
 *
 * `null` vira campo VAZIO (não a string "null"): num CSV, vazio é a ausência.
 */
export function paraCsv(linhas: readonly LinhaSerializada[]): string {
  if (linhas.length === 0) return "";

  const colunas = Object.keys(linhas[0]!);
  const escapar = (v: string | null | undefined): string => {
    const s = v ?? "";
    return PRECISA_DE_ASPAS.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };

  const linha = (celulas: readonly (string | null | undefined)[]): string =>
    celulas.map(escapar).join(",") + "\r\n";

  return (
    linha(colunas) + linhas.map((l) => linha(colunas.map((c) => l[c]))).join("")
  );
}
