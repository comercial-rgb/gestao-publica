/**
 * M01 — O NÍVEL DE CONSOLIDAÇÃO DA CONTA PCASP (C07).
 *
 * ═══ O QUE ESTE ARQUIVO RESPONDE ═══
 * "Esta conta é de transação INTRAGOVERNAMENTAL?" — a pergunta que a consolidação faz antes de
 * eliminar. No PCASP a resposta é o **5º nível** do código (`X.X.X.X.**D**.XX.XX`): 1 consolidação,
 * 2 INTRA OFSS, 3/4/5 INTER OFSS (União / Estado / Município).
 *
 * ═══ ⚠️ PROPRIEDADE, NÃO PADRÃO — E AQUI A DIFERENÇA FOI MEDIDA ═══
 * O 5º nível **só é** nível de consolidação onde o plano o declara, e ele o declara no NOME da
 * âncora `X.X.X.X.D.00.00`. Três candidatas foram medidas no `Pcasp_2025.xlsx` (7.864 contas), e
 * deram três respostas (`docs/varreduras/varredura-v17-eliminacoes-intragovernamentais.md`):
 *
 *   · o NOME diz "INTRA"              -> 296 contas, e perde 699: o nome está na âncora, e item
 *                                       e subitem herdam a natureza sem repetir o nome;
 *   · o 5º dígito é 2                 -> 1.130 contas, e marca 137 A MAIS;
 *   · o dígito **e** a âncora declara -> 993 contas. É esta.
 *
 * ⚠️ E AS 137 A MAIS NÃO SÃO CONTAS OBSCURAS — SÃO AS QUE ESTE SISTEMA ESCREVE:
 *
 *   `5.2.2.1.2.01.00` DOTAÇÃO ADICIONAL — SUPLEMENTAR  (`CONTA_CREDITO_ADICIONAL_SUPLEMENTAR`)
 *   `8.2.1.1.2.01.00` DDR COMPROMETIDA POR EMPENHO     (`CONTA_DDR_COMPROMETIDA_EMPENHO`)
 *   `7.2.1.1.2.00.00` RECURSOS VINCULADOS              (`NATUREZA_DA_FONTE.VINCULADOS`)
 *   `6.2.2.1.2.00.00` CRÉDITO INDISPONÍVEL
 *
 * Nas classes 5 e 6 o 5º nível não é nível de consolidação em lugar nenhum; nas 7 e 8 ele é no
 * grupo `x.1` e NÃO é no `x.2` (a DDR). A regra do dígito eliminaria do consolidado a
 * suplementação, o empenho e a fonte vinculada do próprio município.
 *
 * ⚠️ E A REGRA **NÃO** É "TEM IRMÃ `.1 CONSOLIDAÇÃO`", que era a formulação mais bonita: em
 * `3.5.1.x` / `4.5.1.x` (TRANSFERÊNCIAS INTRAGOVERNAMENTAIS) não existe irmã `.1`, porque uma
 * transferência intragovernamental só pode ser intra — e essas 93 contas de VPD/VPA são justamente
 * as mais relevantes de um município (a prefeitura que repassa ao fundo). A autoridade é o nome da
 * PRÓPRIA âncora.
 *
 * ═══ ⚠️ POR QUE NÃO É UMA COLUNA EM `ContaPcasp` ═══
 * Seria uma SEGUNDA verdade sobre o mesmo fato: o nível já está no plano, que é tabela oficial
 * carregada do arquivo do TCE com `sha256` conferido. Uma coluna exigiria migração, backfill e o
 * dia em que ela divergisse do plano ninguém saberia qual das duas é autoridade. Aqui a conta é
 * classificada **contra o plano que está no banco**, e instalação sem a âncora devolve
 * `NAO_CLASSIFICADO` — que é estado honesto, não zero.
 *
 * Zero I/O, zero Prisma: o leitor que busca as âncoras é `consultas.ts`.
 */

/** O nível de consolidação do PCASP. `NAO_CLASSIFICADO` = o plano não o declara para esta conta. */
export type NivelDeConsolidacao =
  | "CONSOLIDACAO"
  | "INTRA_OFSS"
  | "INTER_OFSS_UNIAO"
  | "INTER_OFSS_ESTADO"
  | "INTER_OFSS_MUNICIPIO"
  | "NAO_CLASSIFICADO";

/** Rótulos para tela — o vocabulário do MCASP, sem identificador de cláusula. */
export const ROTULO_DO_NIVEL: Readonly<Record<NivelDeConsolidacao, string>> = {
  CONSOLIDACAO: "Consolidação",
  INTRA_OFSS: "Intragovernamental (intra OFSS)",
  INTER_OFSS_UNIAO: "Com a União (inter OFSS)",
  INTER_OFSS_ESTADO: "Com o Estado (inter OFSS)",
  INTER_OFSS_MUNICIPIO: "Com outro município (inter OFSS)",
  NAO_CLASSIFICADO: "Nível não declarado no plano",
};

/** O dígito do 5º nível, por nível de consolidação. */
const DIGITO_DO_NIVEL: Readonly<Record<string, NivelDeConsolidacao>> = {
  "1": "CONSOLIDACAO",
  "2": "INTRA_OFSS",
  "3": "INTER_OFSS_UNIAO",
  "4": "INTER_OFSS_ESTADO",
  "5": "INTER_OFSS_MUNICIPIO",
};

const SEM_PONTOS = /^\d\.\d\.\d\.\d\.\d\.\d{2}\.\d{2}$/;

/** Os nove dígitos do código, sem pontos. Estoura em código fora do formato — fail-closed. */
function digitos(codigo: string): string {
  if (!SEM_PONTOS.test(codigo)) {
    throw new Error(
      `Código de conta fora do formato do PCASP ("${codigo}"). O esperado é 1.1.1.1.1.01.00.`
    );
  }
  return codigo.replace(/\./g, "");
}

/**
 * O código da ÂNCORA de nível 5 desta conta: zera o item e o subitem, preservando os cinco
 * primeiros dígitos (`X.X.X.X.D.NN.NN` -> `X.X.X.X.D.00.00`).
 *
 * ⚠️ O EXEMPLO É ESTRUTURAL, SEM CÓDIGO CONCRETO, e a razão é uma acusação de instrumento
 * (`test/contas-contra-o-plano-oficial.test.ts`): a primeira versão deste docblock ilustrava com um
 * código de caixa intra que NÃO EXISTE no PCASP do TCE-PB, e o instrumento acusa qualquer código
 * citado que o plano não tenha — inclusive em comentário, e com razão, porque exemplo inventado em
 * docblock é de onde alguém copia depois. Trocar por uma conta real também não resolve: o par
 * item -> âncora cita necessariamente uma SINTÉTICA (a âncora é sempre `.00.00`), e o segundo
 * instrumento do mesmo arquivo acusa conta sintética nova no código. O padrão em letras diz a mesma
 * coisa e não cita conta nenhuma.
 *
 * `null` quando a conta é mais alta que o 5º nível (o 5º dígito é zero): ela não tem nível de
 * consolidação próprio, e somar uma sintética ao consolidado seria contar o mesmo dinheiro duas
 * vezes.
 */
export function codigoDaAncoraDeConsolidacao(codigo: string): string | null {
  const d = digitos(codigo);
  if (d[4] === "0") return null;
  return `${d[0]}.${d[1]}.${d[2]}.${d[3]}.${d[4]}.00.00`;
}

/**
 * NORMALIZAÇÃO DO NOME OFICIAL — e ela existe porque o arquivo do TCE é sujo, medido.
 *
 * Para o dígito 2 há três grafias ("INTRA OFSS" 271, "INTRA - OFSS" 3, "- INTRA" 2); para os
 * demais, oito ("INTER OFSS - UNIÃO", "INTER OFSS UNIÃO", "INTER OFSS- UNIÃO", "INTER-OFSS -
 * ESTADO", "INTER OFSS -ESTADO", "INTER UNIÃO"...). Acento, hífen e espaço duplo viram um espaço
 * só; o resto é comparação de sufixo.
 */
function normalizar(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/**
 * O QUE O NOME DA ÂNCORA DECLARA — e a comparação é no FIM do nome, de propósito.
 *
 * ⚠️ `INTER` APARECE DENTRO DE `INTERNA`: `DESCENTRALIZAÇÃO INTERNA DE CRÉDITOS` e `OPERAÇÕES
 * CONTRATUAIS INTERNAS SUJEITAS AO LIMITE` são âncoras reais do plano, e uma busca por substring
 * as classificaria como transação com a União. Ancorar no fim resolve — o nível é sufixo, sempre.
 *
 * ⚠️ E `CONSOLIDADA` NÃO É `CONSOLIDAÇÃO`: `OUTRAS OPERAÇÕES QUE INTEGRAM A DÍVIDA CONSOLIDADA` é
 * âncora de dígito 5, e casá-la com "consolidação" diria que a dívida fundada é transação
 * eliminável.
 */
export function nivelDeclaradoNoNome(nomeDaAncora: string): NivelDeConsolidacao {
  const n = normalizar(nomeDaAncora);
  if (/ CONSOLIDACAO$/.test(n)) return "CONSOLIDACAO";
  if (/ INTRA( OFSS)?$/.test(n)) return "INTRA_OFSS";
  if (/ INTER( OFSS)? UNIAO$/.test(n)) return "INTER_OFSS_UNIAO";
  if (/ INTER( OFSS)? ESTADO$/.test(n)) return "INTER_OFSS_ESTADO";
  if (/ INTER( OFSS)? MUNICIPIO$/.test(n)) return "INTER_OFSS_MUNICIPIO";
  return "NAO_CLASSIFICADO";
}

/**
 * O NÍVEL DE CONSOLIDAÇÃO DA CONTA — o dígito E o nome da âncora, e os dois têm de CONCORDAR.
 *
 * Discordância devolve `NAO_CLASSIFICADO`, nunca um dos dois: quando o dígito diz uma coisa e a
 * tabela oficial diz outra, quem decide não é este arquivo. `nomeDaAncora === null` (âncora ausente
 * do plano instalado, ou conta acima do 5º nível) também devolve `NAO_CLASSIFICADO`.
 */
export function nivelDeConsolidacao(
  codigo: string,
  nomeDaAncora: string | null
): NivelDeConsolidacao {
  const d = digitos(codigo);
  const peloDigito = DIGITO_DO_NIVEL[d[4] ?? ""];
  if (peloDigito === undefined || nomeDaAncora === null) return "NAO_CLASSIFICADO";
  const peloNome = nivelDeclaradoNoNome(nomeDaAncora);
  return peloNome === peloDigito ? peloDigito : "NAO_CLASSIFICADO";
}

/** A conta é de transação intragovernamental — a que a consolidação elimina. */
export function ehIntraOfss(codigo: string, nomeDaAncora: string | null): boolean {
  return nivelDeConsolidacao(codigo, nomeDaAncora) === "INTRA_OFSS";
}
