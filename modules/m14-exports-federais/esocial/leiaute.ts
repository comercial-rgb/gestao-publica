import { compararPorDiaCivil, diaCivilBr } from "../../../packages/datas/index.js";

/**
 * ═══ O REGISTRO DO LEIAUTE DO eSOCIAL E A CONSISTÊNCIA DERIVADA DELE (V11 V2.1) ═══
 *
 * ⚠️ ESTE ARQUIVO NÃO CONHECE UM ÚNICO CÓDIGO DO eSOCIAL — e o `e19` roda o grep contra a
 * FORMA do código, não contra uma lista. Não há código de evento aqui, nem lista de campos, nem
 * tabela de categoria de trabalhador. O leiaute é documento oficial da União, ele
 * não está no repositório, e em 2026-09-18 o portal recusou o download automatizado (HTTP 403).
 * Escrever os códigos no código seria inventar norma federal — a mesma proibição que fez
 * `IcExigidaPorConta` nascer vazia em vez de trazer o Anexo II da MSC transcrito de memória.
 *
 * O que existe aqui é a MÁQUINA: dado um leiaute REGISTRADO (com fonte, sha256 e conferente),
 * ela escolhe a versão vigente para o ambiente e o dia, e confere se a ORIGEM do ente tem o que
 * aquele leiaute pede. Sem leiaute registrado, `escolherLeiauteVigente` devolve `null` e a
 * consistência recusa nomeando o ambiente e o dia. Fail-closed: a ausência do insumo oficial
 * produz recusa nomeada, nunca um XML plausível.
 *
 * ⚠️ A CONSISTÊNCIA NÃO MAPEIA, SÓ CONFERE PRESENÇA. Ela diz "este vínculo não tem NIS" — não
 * diz qual código de categoria do eSocial corresponde a `TipoVinculoRh.COMISSIONADO`. Essa
 * correspondência é tabela oficial e não foi obtida; inventá-la produziria um XML que o
 * validador aceita e a Receita interpreta como outra coisa, que é o pior dos dois resultados.
 *
 * ⚠️ E ELA NÃO CORRIGE. Nenhuma função daqui escreve. Fato funcional se corrige no cadastro,
 * por quem tem a ação, com o ato que o fundamenta — a tela dá a rota, não o atalho.
 */

// ────────────────────────────────────────────────────────────────────────────
// A ORIGEM — universo fechado, espelhando `OrigemDoCampoDoESocial` do schema
// ────────────────────────────────────────────────────────────────────────────

export type OrigemDoCampo =
  | "CPF_DO_TRABALHADOR"
  | "NOME_DO_TRABALHADOR"
  | "NOME_SOCIAL_DO_TRABALHADOR"
  | "DATA_DE_NASCIMENTO"
  | "SEXO"
  | "NIS_DO_TRABALHADOR"
  | "NOME_DA_MAE"
  | "NOME_DO_PAI"
  | "MATRICULA_DO_VINCULO"
  | "DATA_DE_ADMISSAO"
  | "TIPO_DE_VINCULO"
  | "REGIME_JURIDICO"
  | "REGIME_PREVIDENCIARIO"
  | "CNPJ_DO_ENTE";

export type Obrigatoriedade = "OBRIGATORIO" | "CONDICIONAL" | "FACULTATIVO";
export type Ambiente = "PRODUCAO" | "PRODUCAO_RESTRITA";

export interface DescricaoDaOrigem {
  readonly rotulo: string;
  /** Onde o dado mora, em português de quem vai corrigir. */
  readonly onde: string;
  /**
   * A ROTA da correção — o "link à origem" que a tela de consistência mostra. `{id}` é
   * substituído pelo identificador da entidade correspondente.
   */
  readonly rota: string;
  /** Qual entidade o `{id}` da rota identifica: quem corrige precisa saber o que abrir. */
  readonly alvo: "SERVIDOR" | "VINCULO" | "ENTE";
}

/**
 * ⚠️ RECORD EXAUSTIVO, pelo mesmo motivo de `COLUNAS_DO_DEMONSTRATIVO` (M13): uma origem nova
 * não compila até alguém escrever de onde ela sai e para onde manda quem vai corrigir. Um
 * leiaute registrado NÃO pode apontar para fora deste conjunto — o enum do banco fecha isso.
 */
export const DESCRICAO_DA_ORIGEM: Record<OrigemDoCampo, DescricaoDaOrigem> = {
  CPF_DO_TRABALHADOR: {
    rotulo: "CPF",
    onde: "Cadastro de pessoas — o documento da pessoa do servidor.",
    rota: "/cadastros/pessoas/{id}",
    alvo: "SERVIDOR",
  },
  NOME_DO_TRABALHADOR: {
    rotulo: "Nome",
    onde: "Cadastro de pessoas — a versão vigente do nome.",
    rota: "/cadastros/pessoas/{id}",
    alvo: "SERVIDOR",
  },
  NOME_SOCIAL_DO_TRABALHADOR: {
    rotulo: "Nome social",
    onde: "Ficha do servidor — nome social.",
    rota: "/pessoal/servidores/{id}",
    alvo: "SERVIDOR",
  },
  DATA_DE_NASCIMENTO: {
    rotulo: "Data de nascimento",
    onde: "Ficha do servidor.",
    rota: "/pessoal/servidores/{id}",
    alvo: "SERVIDOR",
  },
  SEXO: { rotulo: "Sexo", onde: "Ficha do servidor.", rota: "/pessoal/servidores/{id}", alvo: "SERVIDOR" },
  NIS_DO_TRABALHADOR: {
    rotulo: "PIS/PASEP/NIT",
    onde: "Ficha do servidor — PIS/PASEP.",
    rota: "/pessoal/servidores/{id}",
    alvo: "SERVIDOR",
  },
  NOME_DA_MAE: { rotulo: "Nome da mae", onde: "Ficha do servidor — filiação.", rota: "/pessoal/servidores/{id}", alvo: "SERVIDOR" },
  NOME_DO_PAI: { rotulo: "Nome do pai", onde: "Ficha do servidor — filiação.", rota: "/pessoal/servidores/{id}", alvo: "SERVIDOR" },
  MATRICULA_DO_VINCULO: { rotulo: "Matrícula", onde: "Vínculo funcional.", rota: "/pessoal/vinculos/{id}", alvo: "VINCULO" },
  DATA_DE_ADMISSAO: { rotulo: "Data de admissão", onde: "Vínculo funcional.", rota: "/pessoal/vinculos/{id}", alvo: "VINCULO" },
  TIPO_DE_VINCULO: { rotulo: "Tipo de vínculo", onde: "Vínculo funcional.", rota: "/pessoal/vinculos/{id}", alvo: "VINCULO" },
  REGIME_JURIDICO: { rotulo: "Regime jurídico", onde: "Vínculo funcional.", rota: "/pessoal/vinculos/{id}", alvo: "VINCULO" },
  REGIME_PREVIDENCIARIO: {
    rotulo: "Regime previdenciário",
    onde: "Vínculo funcional — RGPS, RPPS ou isento.",
    rota: "/pessoal/vinculos/{id}",
    alvo: "VINCULO",
  },
  CNPJ_DO_ENTE: {
    rotulo: "CNPJ do ente",
    onde: "Identificação do ente — o mesmo campo que o MANAD exige.",
    rota: "/administracao/ente",
    alvo: "ENTE",
  },
};

export const TODAS_AS_ORIGENS: readonly OrigemDoCampo[] = Object.keys(DESCRICAO_DA_ORIGEM) as OrigemDoCampo[];

// ────────────────────────────────────────────────────────────────────────────
// A LEITURA DA ORIGEM
// ────────────────────────────────────────────────────────────────────────────

/** O que a porta lê de M32/M19/M14 para um vínculo. Tudo opcional: a ausência é o achado. */
export interface LinhaDeOrigem {
  readonly servidorId: string;
  readonly vinculoId: string;
  /** Só para a tela — quem é a pessoa da pendência. Nunca sai em arquivo por este caminho. */
  readonly identificacao: string;
  readonly cpf: string | null;
  readonly nome: string | null;
  readonly nomeSocial: string | null;
  readonly dataNascimento: Date | null;
  readonly sexo: string | null;
  readonly nis: string | null;
  readonly nomeMae: string | null;
  readonly nomePai: string | null;
  readonly matricula: string | null;
  readonly dataAdmissao: Date | null;
  readonly tipoDeVinculo: string | null;
  readonly regimeJuridico: string | null;
  readonly regimePrevidenciario: string | null;
  readonly cnpjDoEnte: string | null;
}

const texto = (v: string | null): string | null => {
  if (v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
};

const data = (v: Date | null): string | null => (v === null ? null : diaCivilBr(v));

/**
 * ⚠️ RECONSTRÓI, NÃO FILTRA — o desenho de `projetarLinhaPublica` (M13). Cada origem tem o seu
 * extrator; um campo novo na `LinhaDeOrigem` não vira valor de campo nenhum até alguém
 * acrescentar a origem ao tipo e escrever o extrator.
 *
 * ⚠️ E O VALOR SAI CRU, DA ORIGEM. `TIPO_DE_VINCULO` devolve "EFETIVO", não o código de
 * categoria do eSocial — a tabela que faz essa correspondência é oficial e não foi obtida.
 */
export const EXTRATOR: Record<OrigemDoCampo, (l: LinhaDeOrigem) => string | null> = {
  CPF_DO_TRABALHADOR: (l) => texto(l.cpf),
  NOME_DO_TRABALHADOR: (l) => texto(l.nome),
  NOME_SOCIAL_DO_TRABALHADOR: (l) => texto(l.nomeSocial),
  DATA_DE_NASCIMENTO: (l) => data(l.dataNascimento),
  SEXO: (l) => texto(l.sexo),
  NIS_DO_TRABALHADOR: (l) => texto(l.nis),
  NOME_DA_MAE: (l) => texto(l.nomeMae),
  NOME_DO_PAI: (l) => texto(l.nomePai),
  MATRICULA_DO_VINCULO: (l) => texto(l.matricula),
  DATA_DE_ADMISSAO: (l) => data(l.dataAdmissao),
  TIPO_DE_VINCULO: (l) => texto(l.tipoDeVinculo),
  REGIME_JURIDICO: (l) => texto(l.regimeJuridico),
  REGIME_PREVIDENCIARIO: (l) => texto(l.regimePrevidenciario),
  CNPJ_DO_ENTE: (l) => texto(l.cnpjDoEnte),
};

/** O identificador que a rota de correção recebe, por alvo. */
export function idDoAlvo(alvo: DescricaoDaOrigem["alvo"], l: LinhaDeOrigem): string | null {
  if (alvo === "SERVIDOR") return l.servidorId;
  if (alvo === "VINCULO") return l.vinculoId;
  return null;
}

/** A rota de correção já resolvida. Nula quando o alvo é o ente (rota sem `{id}` fica literal). */
export function rotaDeCorrecao(origem: OrigemDoCampo, l: LinhaDeOrigem): string {
  const d = DESCRICAO_DA_ORIGEM[origem];
  const id = idDoAlvo(d.alvo, l);
  return id === null ? d.rota : d.rota.replace("{id}", id);
}

// ────────────────────────────────────────────────────────────────────────────
// A ESCOLHA DO LEIAUTE VIGENTE
// ────────────────────────────────────────────────────────────────────────────

export interface CampoLido {
  readonly id: string;
  readonly caminho: string;
  readonly rotulo: string;
  readonly origem: OrigemDoCampo;
  readonly obrigatoriedade: Obrigatoriedade;
  readonly condicao: string | null;
  readonly regra: string | null;
  readonly vigenciaInicio: Date | null;
  readonly vigenciaFim: Date | null;
}

export interface EventoLido {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
  readonly xsdArquivo: string | null;
  readonly xsdSha256: string | null;
  readonly vigenciaInicio: Date;
  readonly vigenciaFim: Date | null;
  readonly campos: readonly CampoLido[];
}

export interface LeiauteLido {
  readonly id: string;
  readonly versao: string;
  readonly ambiente: Ambiente;
  readonly fonte: string;
  readonly sha256: string;
  readonly arquivo: string;
  readonly publicadoEm: Date;
  readonly eventos: readonly EventoLido[];
}

export class LeiauteAmbiguoError extends Error {
  constructor(ambiente: Ambiente, dia: string, versoes: readonly string[]) {
    super(
      `Dois pacotes de leiaute do eSocial foram registrados para ${ambiente} com a mesma data de publicação mais recente em ${dia}: ${versoes.join(", ")}. Escolher "o primeiro" seria escolher por acidente de ordenação.`,
    );
    this.name = "LeiauteAmbiguoError";
  }
}

/**
 * QUAL PACOTE VALE NESTE AMBIENTE, NESTE DIA.
 *
 * ⚠️ O CRITÉRIO É A PUBLICAÇÃO MAIS RECENTE QUE NÃO É FUTURA — e nada além disso. A vigência
 * de CADA EVENTO é conferida depois, em `eventosVigentes`: a ordem V11 nomeia exatamente este
 * defeito ("não tratar data de publicação de uma nota como início de todas as suas regras"),
 * porque uma nota técnica publica de uma vez regras que entram em produção em dias diferentes.
 *
 * ⚠️ AMBIENTE NÃO CAI DE VOLTA. Sem pacote registrado para a produção restrita, a resposta é
 * `null` — nunca o pacote da produção. O leiaute da restrita costuma ser o mais novo, e trocar
 * um pelo outro montaria, em produção, um evento pela regra que ainda não entrou lá.
 */
export function escolherLeiauteVigente(
  leiautes: readonly LeiauteLido[],
  criterio: { readonly ambiente: Ambiente; readonly dia: Date },
): LeiauteLido | null {
  const candidatos = leiautes.filter(
    (l) => l.ambiente === criterio.ambiente && compararPorDiaCivil(l.publicadoEm, criterio.dia) <= 0,
  );
  if (candidatos.length === 0) return null;

  let melhor = candidatos[0]!;
  for (const c of candidatos.slice(1)) {
    if (compararPorDiaCivil(c.publicadoEm, melhor.publicadoEm) > 0) melhor = c;
  }
  const empatados = candidatos.filter((c) => compararPorDiaCivil(c.publicadoEm, melhor.publicadoEm) === 0);
  if (empatados.length > 1) {
    throw new LeiauteAmbiguoError(criterio.ambiente, diaCivilBr(criterio.dia), empatados.map((e) => `${e.versao} (${e.sha256.slice(0, 8)})`));
  }
  return melhor;
}

const vigenteNoDia = (inicio: Date, fim: Date | null, dia: Date): boolean =>
  compararPorDiaCivil(inicio, dia) <= 0 && (fim === null || compararPorDiaCivil(fim, dia) >= 0);

/** Os eventos do pacote que valem NO DIA — cada um pela sua própria janela. */
export function eventosVigentes(leiaute: LeiauteLido, dia: Date): readonly EventoLido[] {
  return leiaute.eventos.filter((e) => vigenteNoDia(e.vigenciaInicio, e.vigenciaFim, dia));
}

/**
 * Os campos do evento que valem NO DIA. Campo sem vigência própria herda a do evento — e é por
 * isso que a herança é explícita aqui em vez de um default no banco: nula significa "a do
 * evento", não "sempre".
 */
export function camposVigentes(evento: EventoLido, dia: Date): readonly CampoLido[] {
  return evento.campos.filter((c) =>
    vigenteNoDia(c.vigenciaInicio ?? evento.vigenciaInicio, c.vigenciaFim ?? evento.vigenciaFim, dia),
  );
}

// ────────────────────────────────────────────────────────────────────────────
// A CONSISTÊNCIA
// ────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ `AUSENTE` É ERRO; `CONFERIR` NÃO É. Campo obrigatório vazio impede o evento. Campo
 * condicional vazio pode estar certo — a condição é texto do leiaute e este sistema não a
 * avalia. Fundi-los encheria a tela de falso positivo até ninguém mais ler nenhuma linha.
 */
export type TipoDePendencia = "AUSENTE" | "CONFERIR";

export interface PendenciaDeConsistencia {
  readonly tipo: TipoDePendencia;
  readonly servidorId: string;
  readonly vinculoId: string;
  readonly identificacao: string;
  readonly evento: string;
  readonly campo: string;
  readonly caminho: string;
  readonly origem: OrigemDoCampo;
  /** O que está errado, em português. */
  readonly erro: string;
  /** O que fazer — e onde. Nunca o que o sistema fará sozinho. */
  readonly sugestao: string;
  readonly rota: string;
  /** A condição/regra TRANSCRITA do leiaute, quando houver. Nunca avaliada aqui. */
  readonly textoDoLeiaute: string | null;
}

/**
 * CONFERE UMA LINHA DE ORIGEM CONTRA UM EVENTO VIGENTE.
 *
 * Determinística e sem efeito: mesma entrada, mesma saída, nada escrito. A ordem é a dos campos
 * como vieram do registro — ordenar por gravidade aqui esconderia que dois campos do mesmo
 * bloco do leiaute falharam juntos.
 */
export function conferirEvento(
  evento: EventoLido,
  campos: readonly CampoLido[],
  linha: LinhaDeOrigem,
): readonly PendenciaDeConsistencia[] {
  const fora: PendenciaDeConsistencia[] = [];
  for (const c of campos) {
    if (c.obrigatoriedade === "FACULTATIVO") continue;
    const valor = EXTRATOR[c.origem](linha);
    if (valor !== null) continue;

    const d = DESCRICAO_DA_ORIGEM[c.origem];
    const obrigatorio = c.obrigatoriedade === "OBRIGATORIO";
    fora.push({
      tipo: obrigatorio ? "AUSENTE" : "CONFERIR",
      servidorId: linha.servidorId,
      vinculoId: linha.vinculoId,
      identificacao: linha.identificacao,
      evento: `${evento.codigo} — ${evento.nome}`,
      campo: c.rotulo,
      caminho: c.caminho,
      origem: c.origem,
      erro: obrigatorio
        ? `${d.rotulo} não está preenchido, e o leiaute vigente exige o campo ${c.caminho} no evento ${evento.codigo}.`
        : `${d.rotulo} não está preenchido e o campo ${c.caminho} é condicional. O sistema não avalia a condição do leiaute.`,
      sugestao: obrigatorio
        ? `Preencher no cadastro: ${d.onde}`
        : `Conferir a condição transcrita ao lado e, se ela se aplicar, preencher no cadastro: ${d.onde}`,
      rota: rotaDeCorrecao(c.origem, linha),
      textoDoLeiaute: c.condicao ?? c.regra ?? null,
    });
  }
  return fora;
}

export interface ResultadoDaConsistencia {
  readonly leiaute: { readonly versao: string; readonly ambiente: Ambiente; readonly sha256: string; readonly fonte: string; readonly arquivo: string } | null;
  /** Por que não há resultado, quando não há. Nomeado — nunca lista vazia sem motivo. */
  readonly indisponivel: string | null;
  readonly eventos: readonly { readonly codigo: string; readonly nome: string; readonly temXsd: boolean }[];
  readonly pendencias: readonly PendenciaDeConsistencia[];
  readonly vinculosConferidos: number;
}

export const SEM_LEIAUTE =
  "Nenhum pacote de leiaute do eSocial está registrado para este ambiente nesta data. O leiaute é documento oficial da União e não é fabricado pelo sistema: registre o pacote obtido no portal do eSocial, com a fonte, o arquivo e o sha256 dele, e a consistência passa a responder.";

export const SEM_EVENTO_VIGENTE =
  "Há pacote de leiaute registrado, mas nenhum evento dele entra em vigor nesta data. Uma nota técnica publica de uma vez regras que entram em produção em dias diferentes — confira a vigência registrada de cada evento.";

/**
 * A CONSISTÊNCIA COMPLETA — a composição pura, para a porta só trazer os dados.
 *
 * ⚠️ RECUSA NOMEADA, NUNCA LISTA VAZIA. Zero pendências e "não há leiaute" são respostas
 * opostas que uma tabela vazia confundiria — e a confusão levaria alguém a transmitir achando
 * que o ente estava em ordem.
 */
export function conferirConsistencia(
  leiautes: readonly LeiauteLido[],
  linhas: readonly LinhaDeOrigem[],
  criterio: { readonly ambiente: Ambiente; readonly dia: Date },
): ResultadoDaConsistencia {
  const leiaute = escolherLeiauteVigente(leiautes, criterio);
  if (leiaute === null) {
    return { leiaute: null, indisponivel: SEM_LEIAUTE, eventos: [], pendencias: [], vinculosConferidos: 0 };
  }

  const cabecalho = {
    versao: leiaute.versao,
    ambiente: leiaute.ambiente,
    sha256: leiaute.sha256,
    fonte: leiaute.fonte,
    arquivo: leiaute.arquivo,
  };

  const eventos = eventosVigentes(leiaute, criterio.dia);
  if (eventos.length === 0) {
    return { leiaute: cabecalho, indisponivel: SEM_EVENTO_VIGENTE, eventos: [], pendencias: [], vinculosConferidos: 0 };
  }

  const pendencias: PendenciaDeConsistencia[] = [];
  for (const e of eventos) {
    const campos = camposVigentes(e, criterio.dia);
    for (const l of linhas) pendencias.push(...conferirEvento(e, campos, l));
  }

  return {
    leiaute: cabecalho,
    indisponivel: null,
    eventos: eventos.map((e) => ({ codigo: e.codigo, nome: e.nome, temXsd: e.xsdArquivo !== null && e.xsdSha256 !== null })),
    pendencias,
    vinculosConferidos: linhas.length,
  };
}
