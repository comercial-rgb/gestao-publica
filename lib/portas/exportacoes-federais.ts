import {
  conferirM3,
  gerarManad,
  responsaveisDoPeriodo,
  gerarMsc,
  serializarMscCsv,
  zipar,
  type PendenciaManad,
  type ResultadoMsc,
  type TipoMsc,
} from "../../modules/m14-exports-federais/index";
import { cliente, PortaSemBancoError } from "./cliente";
import { exigirLeituraDoEntePara } from "./leitura";
import { exigirSessao, type Identidade } from "./sessao";

/**
 * PORTA — OS ARQUIVOS FEDERAIS (MSC para a STN, MANAD para a Receita). LEITURA PURA.
 *
 * ═══ O QUE ESTA PORTA FAZ, E O QUE ELA NÃO FAZ ═══
 * Ela chama os geradores do M14 (`gerarMsc`, `gerarManad`) e devolve o RESUMO para a tela e os
 * BYTES para a rota de download. Não soma nada: a contagem de linhas é contagem de linhas, e toda
 * aritmética de dinheiro fica no gerador (que roda as identidades antes de o arquivo existir).
 * ⚠️ NÃO TRANSMITE. Não há envio ao SICONFI nem à Receita, não há recibo, não há credencial: o
 * arquivo é gerado para download e conferência. Transmissão fiscal é proibida neste repositório.
 *
 * ═══ A AUTORIZAÇÃO: `CONSULTAR_CONTABILIDADE`, NO ENTE ═══
 * O censo (`modules/m16-travamento/acoes.ts`) não tem ação própria de exportação federal. A MSC e
 * o MANAD são o razão do ENTE inteiro reescrito em leiaute externo — não têm dimensão de unidade
 * gestora — e a tela mora na área de contabilidade. Logo: a leitura da contabilidade, na
 * concessão GLOBAL (`exigirLeituraDoEntePara`). Uma concessão restrita a uma unidade não basta:
 * um arquivo "só das minhas unidades" seria uma MSC parcial com o nome do município.
 * (`CONSULTAR_INTEGRACOES`, usada pelo SAGRES, foi descartada: ela abre a área de integrações, e
 * dar a quem cuida de integrações o razão inteiro por este caminho seria alargar a leitura.)
 *
 * ⚠️ O GATE ESTÁ AQUI DENTRO, e não só na página. A rota de download entrega o arquivo por `GET`
 * direto, sem menu; se a autorização morasse só na tela, a rota seria a porta dos fundos.
 *
 * ═══ AS MENSAGENS DO GERADOR NÃO VÃO PARA A TELA ═══
 * Os erros do M14 são escritos para quem mantém o código (nomes de tabela, siglas de identidade,
 * caixa alta). A porta os TRADUZ para o que o servidor municipal precisa saber — o que falta e
 * onde — e manda o texto bruto para o log do servidor. Nada é engolido: o que a porta não
 * reconhece vira uma recusa genérica COM o registro no log, nunca um sucesso.
 */

export { PortaSemBancoError };

// ═══════════════════════════════════════════════════════════════════════════
// O PEDIDO
// ═══════════════════════════════════════════════════════════════════════════

/** O pedido veio malformado (exercício ou mês que não existem). A rota responde 400. */
export class PedidoDeExportacaoInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PedidoDeExportacaoInvalidoError";
  }
}

/** O arquivo não pôde ser gerado — com o motivo em linguagem de negócio. A rota responde 409. */
export class ArquivoFederalIndisponivelError extends Error {
  constructor(
    mensagem: string,
    /** O que falta, item a item, quando a recusa é de cadastro incompleto. */
    readonly faltas: readonly string[] = []
  ) {
    super(mensagem);
    this.name = "ArquivoFederalIndisponivelError";
  }
}

export type TipoDaMatriz = "MENSAL" | "ENCERRAMENTO";

export interface PedidoDaMsc {
  readonly exercicio: number;
  /** 1 a 12. Na matriz de encerramento é sempre dezembro — a porta ignora outro valor. */
  readonly mes: number;
  readonly tipo: TipoDaMatriz;
}

const ANO_MINIMO = 2000;
const ANO_MAXIMO = 2100;

function exigirExercicio(exercicio: number): void {
  if (!Number.isInteger(exercicio) || exercicio < ANO_MINIMO || exercicio > ANO_MAXIMO) {
    throw new PedidoDeExportacaoInvalidoError(
      `O exercício "${String(exercicio)}" não é um ano válido. Informe o ano com quatro dígitos.`
    );
  }
}

/** Lê o pedido da URL (`?exercicio=&mes=&tipo=`). Ausente, cai no padrão dado; inválido, recusa. */
export function pedidoDaMscDaUrl(
  params: Readonly<Record<string, string | string[] | undefined>>,
  padrao: { readonly exercicio: number; readonly mes: number }
): PedidoDaMsc {
  const texto = (k: string): string => {
    const v = params[k];
    return typeof v === "string" ? v.trim() : "";
  };
  const ex = texto("exercicio");
  const me = texto("mes");
  const ti = texto("tipo");
  if (ex !== "" && !/^\d{4}$/.test(ex)) {
    throw new PedidoDeExportacaoInvalidoError(
      `O exercício "${ex}" não é um ano válido. Informe o ano com quatro dígitos.`
    );
  }
  if (me !== "" && !/^\d{1,2}$/.test(me)) {
    throw new PedidoDeExportacaoInvalidoError(`O mês "${me}" não é válido. Escolha um mês de 1 a 12.`);
  }
  if (ti !== "" && ti !== "MENSAL" && ti !== "ENCERRAMENTO") {
    throw new PedidoDeExportacaoInvalidoError(
      "O tipo de matriz pedido não existe. Escolha a matriz mensal ou a de encerramento do exercício."
    );
  }
  const tipo: TipoDaMatriz = ti === "ENCERRAMENTO" ? "ENCERRAMENTO" : "MENSAL";
  const exercicio = ex === "" ? padrao.exercicio : Number(ex);
  const mes = tipo === "ENCERRAMENTO" ? 12 : me === "" ? padrao.mes : Number(me);
  exigirExercicio(exercicio);
  if (mes < 1 || mes > 12) {
    throw new PedidoDeExportacaoInvalidoError(`O mês "${me}" não é válido. Escolha um mês de 1 a 12.`);
  }
  return { exercicio, mes, tipo };
}

/** Lê o exercício do MANAD da URL (`?exercicio=`). */
export function exercicioDoManadDaUrl(
  params: Readonly<Record<string, string | string[] | undefined>>,
  padrao: number
): number {
  const v = params["exercicio"];
  const ex = typeof v === "string" ? v.trim() : "";
  if (ex === "") return padrao;
  if (!/^\d{4}$/.test(ex)) {
    throw new PedidoDeExportacaoInvalidoError(
      `O exercício "${ex}" não é um ano válido. Informe o ano com quatro dígitos.`
    );
  }
  const exercicio = Number(ex);
  exigirExercicio(exercicio);
  return exercicio;
}

// ═══════════════════════════════════════════════════════════════════════════
// A TRADUÇÃO DAS RECUSAS DO GERADOR
// ═══════════════════════════════════════════════════════════════════════════

function contaNaMensagem(msg: string): string {
  return /na conta (\S+)/.exec(msg)?.[1] ?? /a conta (?:SINTÉTICA )?(\S+)/.exec(msg)?.[1] ?? "";
}

/**
 * Traduz a recusa do gerador da MSC. O que não é recusa conhecida do gerador (banco fora do ar,
 * defeito de programa) SOBE intacto — devolver "não foi possível" para tudo esconderia defeito.
 */
function traduzirRecusaDaMsc(e: unknown): never {
  if (e instanceof PortaSemBancoError || !(e instanceof Error)) throw e;
  const msg = e.message;
  const conta = contaNaMensagem(msg);
  const naConta = conta === "" ? "" : ` (conta ${conta.replace(/[.,:]+$/, "")})`;
  let traducao: string | null = null;
  if (msg.startsWith("A configuração do ente NÃO está semeada")) {
    traducao =
      "O cadastro do ente não está configurado. O código IBGE e o poder/órgão entram em todas as " +
      "linhas da matriz; sem eles o arquivo não tem a quem pertencer.";
  } else if (msg.startsWith("MSC — M1 NÃO FECHA")) {
    traducao = `O saldo inicial somado ao movimento do período não resulta no saldo final${naConta}. A matriz não foi gerada.`;
  } else if (msg.startsWith("MSC — M2 NÃO FECHA")) {
    traducao = "O total de débitos não é igual ao total de créditos no período. A matriz não foi gerada.";
  } else if (msg.startsWith("MSC — M3 NÃO FECHA")) {
    traducao = `A matriz de encerramento não parte do saldo final de dezembro${naConta}. A matriz não foi gerada.`;
  } else if (msg.startsWith("MSC — M4 NÃO FECHA")) {
    traducao = `O detalhamento por fonte e natureza não reconstitui o saldo da conta${naConta}. A matriz não foi gerada.`;
  } else if (msg.includes("NÃO existe no plano")) {
    traducao = `Há lançamentos numa conta que não está no plano de contas${naConta}. Corrija o plano antes de gerar a matriz.`;
  } else if (msg.includes("SINTÉTICA")) {
    traducao = `Há lançamentos numa conta sintética${naConta}; a matriz é por conta analítica. Corrija o lançamento antes de gerar a matriz.`;
  } else if (msg.includes("FONTE AMBÍGUA")) {
    traducao =
      "Um lançamento chega a duas fontes de recurso diferentes, e o sistema não escolhe entre elas. " +
      "Confira a fonte do pagamento e a da conta bancária antes de gerar a matriz.";
  } else if (msg.includes("ANO DE INSCRIÇÃO AMBÍGUO")) {
    traducao =
      "Um lançamento baixa restos a pagar inscritos em exercícios diferentes, e a matriz exige um " +
      "ano de inscrição por saldo. Separe a baixa por exercício antes de gerar a matriz.";
  } else if (msg.startsWith("Competência")) {
    traducao = "O mês de referência pedido não é válido.";
  }
  console.error(`[exportacoes-federais] MSC recusada pelo gerador: ${msg}`);
  throw new ArquivoFederalIndisponivelError(
    traducao ??
      "A matriz não pôde ser gerada. O motivo técnico foi registrado no servidor para a equipe de suporte."
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MSC
// ═══════════════════════════════════════════════════════════════════════════

/** As conferências que rodaram ANTES de o arquivo existir — cada uma teria impedido a geração. */
export interface ConferenciaDaMatriz {
  readonly nome: string;
  readonly descricao: string;
}

/** Uma informação complementar que o sistema não derivou, com o tamanho do furo. */
export interface PendenciaDaMatriz {
  readonly conta: string;
  readonly informacao: string;
  /** Quantos lançamentos ficaram sem a informação nesta conta (0 = pendência do cadastro da conta). */
  readonly lancamentos: number;
}

export interface LinhasPorTipoDeValor {
  readonly rotulo: string;
  readonly linhas: number;
}

export interface ResumoDaMsc {
  readonly exercicio: number;
  readonly mes: number;
  readonly tipo: TipoDaMatriz;
  /** "2026-07" — o período como vai no arquivo. */
  readonly periodo: string;
  /** Código IBGE do ente + poder. */
  readonly instituicao: string;
  readonly linhas: number;
  readonly contas: number;
  readonly porTipoDeValor: readonly LinhasPorTipoDeValor[];
  readonly conferencias: readonly ConferenciaDaMatriz[];
  readonly pendencias: readonly PendenciaDaMatriz[];
  /**
   * A tabela de informações complementares exigidas por conta está carregada? Vazia, o arquivo
   * traz toda informação que o sistema conseguiu derivar — mais detalhe do que o leiaute pedirá —
   * e precisa de conferência antes de qualquer envio.
   */
  readonly exigenciasPorContaCarregadas: boolean;
  readonly nomeDoArquivo: string;
}

export interface ArquivoFederal {
  readonly nome: string;
  readonly tipoDeConteudo: string;
  readonly bytes: Buffer;
}

const ROTULO_DO_TIPO_DE_VALOR: Readonly<Record<string, string>> = {
  beginning_balance: "Saldo inicial",
  period_change: "Movimento do período",
  ending_balance: "Saldo final",
};

/** A sigla da informação complementar do leiaute, em linguagem de negócio. */
const ROTULO_DA_INFORMACAO: Readonly<Record<string, string>> = {
  PO: "Poder e órgão",
  FP: "Financeiro ou permanente",
  FR: "Fonte de recurso",
  NR: "Natureza da receita",
  ND: "Natureza da despesa",
  FUNCIONAL: "Função e subfunção",
  AI: "Ano de inscrição do resto a pagar",
  CO: "Código de operação",
};

const CONFERENCIAS_MENSAL: readonly ConferenciaDaMatriz[] = [
  {
    nome: "Saldo inicial, movimento e saldo final",
    descricao: "Em cada conta, o saldo inicial somado ao movimento do período é igual ao saldo final.",
  },
  {
    nome: "Débitos e créditos",
    descricao: "Em cada tipo de valor, o total de débitos é igual ao total de créditos.",
  },
  {
    nome: "Detalhamento por fonte e natureza",
    descricao: "As linhas detalhadas de cada conta, somadas, reconstituem o saldo da conta.",
  },
];

const CONFERENCIA_ENCERRAMENTO: ConferenciaDaMatriz = {
  nome: "Encerramento e dezembro",
  descricao:
    "Em cada conta, o saldo inicial da matriz de encerramento é o saldo final da matriz mensal de dezembro.",
};

function tipoDoGerador(t: TipoDaMatriz): TipoMsc {
  return t === "ENCERRAMENTO" ? "ENCERRAMENTO" : "AGREGADA";
}

function competencia(p: PedidoDaMsc): string {
  return `${String(p.exercicio)}-${String(p.tipo === "ENCERRAMENTO" ? 12 : p.mes).padStart(2, "0")}`;
}

function nomeDaMsc(r: ResultadoMsc, tipo: TipoDaMatriz, extensao: "csv" | "zip"): string {
  const sufixo = tipo === "ENCERRAMENTO" ? "_encerramento" : "";
  return `msc_${r.instituicao}_${r.periodo}${sufixo}.${extensao}`;
}

/**
 * Gera a matriz e roda as conferências. Na de ENCERRAMENTO, gera também a mensal de dezembro e
 * confere a costura entre as duas (`conferirM3`) — o gerador sozinho não a roda, porque ela
 * precisa das DUAS matrizes. Sem ela, a tela anunciaria um encerramento que não parte de dezembro.
 */
async function gerarMscConferida(p: PedidoDaMsc): Promise<ResultadoMsc> {
  const prisma = cliente();
  const comp = competencia(p);
  try {
    const r = await gerarMsc(prisma, comp, tipoDoGerador(p.tipo));
    if (p.tipo === "ENCERRAMENTO") {
      const dezembro = await gerarMsc(prisma, comp, "AGREGADA");
      conferirM3(r.linhas, dezembro.linhas);
    }
    return r;
  } catch (e) {
    traduzirRecusaDaMsc(e);
  }
}

export async function resumoDaMscPara(sessao: Identidade, p: PedidoDaMsc): Promise<ResumoDaMsc> {
  await exigirLeituraDoEntePara(sessao, "CONSULTAR_CONTABILIDADE");
  exigirExercicio(p.exercicio);
  const r = await gerarMscConferida(p);

  const porTipo = new Map<string, number>();
  for (const l of r.linhas) porTipo.set(l.tipoValor, (porTipo.get(l.tipoValor) ?? 0) + 1);

  // A pendência sai do gerador por conta E por lançamento; aqui ela é CONTADA por (conta,
  // informação) — a tela diz o tamanho do furo, não lista cada lançamento.
  const pendencias = new Map<string, { conta: string; informacao: string; lancamentos: number }>();
  for (const x of r.pendencias) {
    const chave = `${x.conta}|${x.ic}`;
    const acc = pendencias.get(chave) ?? {
      conta: x.conta,
      informacao: ROTULO_DA_INFORMACAO[x.ic] ?? "Informação complementar",
      lancamentos: 0,
    };
    if (x.lancamentoId !== undefined && x.lancamentoId !== null) acc.lancamentos += 1;
    pendencias.set(chave, acc);
  }

  const exigencias = await cliente().icExigidaPorConta.count();

  return {
    exercicio: p.exercicio,
    mes: p.tipo === "ENCERRAMENTO" ? 12 : p.mes,
    tipo: p.tipo,
    periodo: r.periodo,
    instituicao: r.instituicao,
    linhas: r.linhas.length,
    contas: new Set(r.linhas.map((l) => l.conta)).size,
    porTipoDeValor: ["beginning_balance", "period_change", "ending_balance"].map((t) => ({
      rotulo: ROTULO_DO_TIPO_DE_VALOR[t] ?? t,
      linhas: porTipo.get(t) ?? 0,
    })),
    conferencias:
      p.tipo === "ENCERRAMENTO" ? [...CONFERENCIAS_MENSAL, CONFERENCIA_ENCERRAMENTO] : CONFERENCIAS_MENSAL,
    pendencias: [...pendencias.values()].sort((a, b) =>
      a.conta === b.conta ? a.informacao.localeCompare(b.informacao) : a.conta < b.conta ? -1 : 1
    ),
    exigenciasPorContaCarregadas: exigencias > 0,
    nomeDoArquivo: nomeDaMsc(r, p.tipo, "zip"),
  };
}

/** O pacote da MSC: o CSV do leiaute dentro de um .zip reprodutível (é como o SICONFI o recebe). */
export async function arquivoDaMscPara(sessao: Identidade, p: PedidoDaMsc): Promise<ArquivoFederal> {
  await exigirLeituraDoEntePara(sessao, "CONSULTAR_CONTABILIDADE");
  exigirExercicio(p.exercicio);
  const r = await gerarMscConferida(p);
  return {
    nome: nomeDaMsc(r, p.tipo, "zip"),
    tipoDeConteudo: "application/zip",
    bytes: zipar(nomeDaMsc(r, p.tipo, "csv"), serializarMscCsv(r)),
  };
}

export async function resumoDaMsc(p: PedidoDaMsc): Promise<ResumoDaMsc> {
  return resumoDaMscPara(await exigirSessao(), p);
}

export async function arquivoDaMsc(p: PedidoDaMsc): Promise<ArquivoFederal> {
  return arquivoDaMscPara(await exigirSessao(), p);
}

// ═══════════════════════════════════════════════════════════════════════════
// MANAD
// ═══════════════════════════════════════════════════════════════════════════

/** Uma pendência do MANAD, em linguagem de negócio. */
export interface PendenciaDoArquivo {
  readonly registro: string;
  readonly descricao: string;
  readonly quantidade: number | null;
}

export interface ResumoDoManad {
  readonly exercicio: number;
  readonly linhas: number;
  readonly bytes: number;
  /** Quantas linhas por bloco do leiaute (0, K, L, 9). */
  readonly porBloco: readonly { readonly bloco: string; readonly linhas: number }[];
  readonly pendencias: readonly PendenciaDoArquivo[];
  readonly nomeDoArquivo: string;
}

/**
 * O QUE CADA PENDÊNCIA DO GERADOR SIGNIFICA PARA QUEM VAI ENTREGAR O ARQUIVO. Os registros são
 * seções do leiaute da Receita (normativo externo) e podem aparecer na tela. O texto do gerador
 * não: ele fala com quem mantém o código.
 */
const DESCRICAO_DA_PENDENCIA_DO_MANAD: Readonly<Record<string, string>> = {
  L050:
    "A conta corrente do recurso vinculado sai vazia: o sistema não registra conta corrente por " +
    "recurso vinculado.",
  L250:
    "A atualização monetária da dotação, a suplementação e a redução por recurso vinculado e a " +
    "limitação de empenho saem vazias: esses fatos não são registrados no sistema.",
  L750:
    "O nome do fornecedor sai vazio para credores sem contrato (diárias, folha, sentenças), e o " +
    "endereço do fornecedor sai vazio sempre.",
  L800:
    "Há obras sem matrícula no cadastro específico do INSS: a linha sai com o campo vazio. " +
    "Cadastre a matrícula da obra quando ela for aberta na Receita.",
};

function descreverPendenciaDoManad(p: PendenciaManad): PendenciaDoArquivo {
  return {
    registro: p.registro,
    descricao:
      DESCRICAO_DA_PENDENCIA_DO_MANAD[p.registro] ??
      "Há campos deste registro sem dado correspondente no sistema; eles saem vazios.",
    quantidade: p.quantidade ?? null,
  };
}

/**
 * O QUE O REGISTRO DE ABERTURA DO MANAD EXIGE E AINDA NÃO ESTÁ CADASTRADO. O gerador recusa a
 * mesma coisa (fail-closed, e ele continua sendo a autoridade); a porta pergunta ANTES para
 * poder dizer TUDO o que falta de uma vez, e em linguagem de quem vai cadastrar.
 */
async function faltasDoCadastroDoManad(exercicio: number): Promise<readonly string[]> {
  const prisma = cliente();
  const janela = entradaDoManad(exercicio);
  // ⚠️ OS RESPONSÁVEIS CONTAM PELO PERÍODO, e pela MESMA função que o gerador usa
  // (`responsaveisDoPeriodo`). Contar "existe algum" diria que não falta nada quando o único
  // contabilista cadastrado respondeu por outro exercício — e o gerador recusaria em seguida.
  const [ente, contabilistas, geradoras] = await Promise.all([
    prisma.enteConfig.findUnique({
      where: { id: "unico" },
      select: { cnpj: true, uf: true, indCentralizacao: true, codigoIbge: true },
    }),
    prisma.manadContabilista
      .findMany({ select: { dtInicio: true, dtFim: true } })
      .then((l) => responsaveisDoPeriodo(l, (c) => ({ inicio: c.dtInicio, fim: c.dtFim }), janela).length),
    prisma.manadEmpresaGeradora
      .findMany({ select: { dtInicioServico: true, dtFimServico: true } })
      .then(
        (l) =>
          responsaveisDoPeriodo(l, (g) => ({ inicio: g.dtInicioServico, fim: g.dtFimServico }), janela).length
      ),
  ]);
  const faltas: string[] = [];
  if (ente === null) {
    faltas.push("o cadastro do ente (nome, CNPJ, UF e código IBGE)");
  } else {
    if (ente.cnpj === null || ente.cnpj === "") faltas.push("o CNPJ do ente");
    if (ente.uf === null || ente.uf === "") faltas.push("a UF do ente");
    if (ente.indCentralizacao === null || ente.indCentralizacao === "")
      faltas.push("a indicação de escrituração centralizada ou descentralizada do ente");
  }
  if (contabilistas === 0) faltas.push("o contabilista responsável, com CRC e período de responsabilidade");
  if (geradoras === 0) faltas.push("a empresa ou o técnico responsável pela geração do arquivo");
  return faltas;
}

/**
 * A CLASSIFICAÇÃO ORÇAMENTÁRIA QUE O MANAD EXIGE E O CADASTRO NÃO TEM (L400, L650, L700, L200).
 *
 * O gerador recusa nomeando o item (fail-closed, e ele não escolhe por ninguém). Sem esta
 * tradução a tela dizia só "o arquivo não pôde ser gerado", e quem lê não saberia QUAL cadastro
 * completar. O código e a descrição vêm da própria mensagem do gerador.
 */
function classificacaoAusente(msg: string): string | null {
  const item = /(unidade orçamentária|ação|rubrica|natureza de receita) (\S+) \("([^"]*)"\) não tem/u.exec(msg);
  if (item === null) return null;
  const [, tipo, codigo, descricao] = item;
  const exigencia: Readonly<Record<string, string>> = {
    "unidade orçamentária":
      "o tipo de unidade exigido pelo arquivo da Receita (Prefeitura, Câmara, Secretaria de Educação ou de Saúde, regime próprio de previdência, autarquia, fundação, entre outros)",
    "ação": "a indicação de pertencer ou não ao regime próprio de previdência, exigida pelo arquivo da Receita",
    rubrica: "o tipo de conta (sintética ou analítica) e o nível exigidos pelo arquivo da Receita",
    "natureza de receita": "o tipo de conta (sintética ou analítica) e o nível exigidos pelo arquivo da Receita",
  };
  const nome = tipo === "rubrica" ? "A natureza de despesa" : tipo === "ação" ? "A ação" : `A ${tipo ?? ""}`;
  return (
    `${nome} ${codigo ?? ""} (${descricao ?? ""}) não tem ${exigencia[tipo ?? ""] ?? "a classificação exigida pelo arquivo da Receita"}. ` +
    "O arquivo não foi gerado. Solicite o registro dessa classificação à equipe de implantação."
  );
}

function traduzirRecusaDoManad(e: unknown): never {
  if (e instanceof PortaSemBancoError || !(e instanceof Error)) throw e;
  const msg = e.message;
  let traducao: string | null = null;
  const registro = /no registro (\w+)/.exec(msg)?.[1];
  const noRegistro = registro === undefined ? "" : ` (registro ${registro} do leiaute)`;
  if (msg.includes("CARACTERE FORA DO ISO 8859-1")) {
    traducao =
      `Um texto cadastrado tem caractere que o arquivo da Receita não aceita, como travessão, ` +
      `aspas curvas ou símbolos${noRegistro}. Corrija o cadastro e gere de novo.`;
  } else if (msg.includes("PIPE (\"|\") DENTRO DO CAMPO")) {
    traducao = `Um texto cadastrado contém a barra vertical, que o arquivo usa como separador${noRegistro}. Corrija o cadastro e gere de novo.`;
  } else if (msg.includes("ACIMA DE") || msg.includes("LONGO DEMAIS") || msg.includes("não-dígito")) {
    traducao = `Um dado cadastrado não cabe no formato do arquivo da Receita${noRegistro}. Corrija o cadastro e gere de novo.`;
  } else if (classificacaoAusente(msg) !== null) {
    traducao = classificacaoAusente(msg);
  } else if (/N2(-RP)? NÃO FECHA|N3 NÃO FECHA/.test(msg)) {
    traducao =
      "O total empenhado no arquivo não confere com a execução da despesa. O arquivo não foi gerado.";
  }
  console.error(`[exportacoes-federais] MANAD recusado pelo gerador: ${msg}`);
  throw new ArquivoFederalIndisponivelError(
    traducao ??
      "O arquivo não pôde ser gerado. O motivo técnico foi registrado no servidor para a equipe de suporte."
  );
}

/** O exercício inteiro — o único recorte em que as conferências do MANAD fazem sentido. */
function entradaDoManad(exercicio: number): Parameters<typeof gerarManad>[1] {
  // ⚠️ UTC DE PROPÓSITO: é FORMATO EXTERNO (as datas do registro 0000 saem em AAAAMMDD, e o
  // gerador lê o exercício por `getUTCFullYear`). São as mesmas datas da suíte do gerador.
  return {
    dtInicio: new Date(Date.UTC(exercicio, 0, 1)),
    dtFim: new Date(Date.UTC(exercicio, 11, 31)),
    // 62 — movimento anual do órgão público.
    codFinalidade: "62",
  };
}

async function gerarManadConferido(exercicio: number): Promise<Awaited<ReturnType<typeof gerarManad>>> {
  const faltas = await faltasDoCadastroDoManad(exercicio);
  if (faltas.length > 0) {
    throw new ArquivoFederalIndisponivelError(
      `O arquivo para a Receita não pode ser gerado: falta cadastrar ${faltas.join("; ")}.`,
      faltas
    );
  }
  try {
    return await gerarManad(cliente(), entradaDoManad(exercicio));
  } catch (e) {
    traduzirRecusaDoManad(e);
  }
}

function nomeDoManad(exercicio: number): string {
  return `manad_${String(exercicio)}.txt`;
}

export async function resumoDoManadPara(sessao: Identidade, exercicio: number): Promise<ResumoDoManad> {
  await exigirLeituraDoEntePara(sessao, "CONSULTAR_CONTABILIDADE");
  exigirExercicio(exercicio);
  const r = await gerarManadConferido(exercicio);
  const porBloco = new Map<string, number>();
  for (const l of r.linhas) {
    const bloco = l.reg.charAt(0);
    porBloco.set(bloco, (porBloco.get(bloco) ?? 0) + 1);
  }
  return {
    exercicio,
    linhas: r.linhas.length,
    bytes: r.arquivo.length,
    porBloco: [...porBloco.entries()].map(([bloco, linhas]) => ({ bloco, linhas })),
    pendencias: r.pendencias.map(descreverPendenciaDoManad),
    nomeDoArquivo: nomeDoManad(exercicio),
  };
}

/** O MANAD: texto em ISO 8859-1, separado por barra vertical, como a Receita o recebe. */
export async function arquivoDoManadPara(sessao: Identidade, exercicio: number): Promise<ArquivoFederal> {
  await exigirLeituraDoEntePara(sessao, "CONSULTAR_CONTABILIDADE");
  exigirExercicio(exercicio);
  const r = await gerarManadConferido(exercicio);
  return {
    nome: nomeDoManad(exercicio),
    tipoDeConteudo: "text/plain; charset=iso-8859-1",
    bytes: r.arquivo,
  };
}

export async function resumoDoManad(exercicio: number): Promise<ResumoDoManad> {
  return resumoDoManadPara(await exigirSessao(), exercicio);
}

export async function arquivoDoManad(exercicio: number): Promise<ArquivoFederal> {
  return arquivoDoManadPara(await exigirSessao(), exercicio);
}
