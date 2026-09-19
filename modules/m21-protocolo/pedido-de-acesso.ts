import { diaCivil, diaCivilBr } from "../../packages/datas/index.js";
import {
  limiteDoRecurso,
  podeProrrogar,
  podeRecorrer,
  prazoDoPedido,
  SEM_CONFIGURACAO,
  type ConfiguracaoLida,
  type Decisao,
  type PendenciaDaConfiguracao,
  type PrazoDoPedido,
} from "./acesso-a-informacao.js";

/**
 * ═══ O PEDIDO DE ACESSO À INFORMAÇÃO — A JORNADA, PURA (V11 V5.3) ═══
 *
 * Este arquivo é o IRMÃO de `dominio.ts`, não um motor novo: o pedido de acesso É um Processo do
 * M21 (numeração, código verificador, roteiro copiado, trâmite, recebimento, encerramento), e o
 * que mora aqui é o que o Processo NÃO modela — o prazo que nasce de lei, a prorrogação que a
 * norma limita, a resposta que se entrega ao cidadão e o recurso por instância.
 *
 * ⚠️ NENHUM NÚMERO DE NORMA AQUI DENTRO, e o tripwire do teste desta unidade varre a FORMA de um
 * prazo cravado — não uma lista de números conhecidos. Todo prazo, toda contagem de prorrogação e
 * toda instância de recurso vêm de `ConfiguracaoLida`, publicada pelo ente com a citação da lei.
 * A régua é `acesso-a-informacao.ts`, e ela é CONSUMIDA aqui, nunca reescrita: um segundo cálculo
 * do mesmo prazo é uma segunda verdade sobre a mesma data.
 *
 * ⚠️ A SITUAÇÃO É DERIVADA DOS FATOS. Mesma doutrina de `situacaoDoProcesso`: não existe coluna
 * `situacao`, e não se cria uma. A resposta não PODE divergir do histórico porque ela É o
 * histórico. O que o pedido guarda em coluna própria é só o que nasceu com ele e não muda: o
 * processo de origem, o instante do protocolo e a VERSÃO DA CONFIGURAÇÃO aplicada.
 *
 * ⚠️ A VERSÃO DA CONFIGURAÇÃO É CONGELADA NO PROTOCOLO, e cada fato repete a versão que aplicou.
 * É a doutrina do roteiro copiado (`EtapaDoProcesso`) e do `Empenho.credorCpfCnpj`: o fato guarda
 * o que valia quando aconteceu. Sem isso, publicar uma configuração nova hoje mudaria o prazo de
 * um pedido protocolado no mês passado — e um pedido que estava no prazo ficaria VENCIDO
 * retroativamente, sem que nada tivesse acontecido com ele.
 *
 * ⚠️ E O `agora` É PARÂMETRO, em toda função que compara datas. Função de prazo que lê o relógio
 * por dentro passa hoje e falha amanhã, sem ninguém saber por quê.
 */

// ────────────────────────────────────────────────────────────────────────────
// O PEDIDO E OS FATOS
// ────────────────────────────────────────────────────────────────────────────

/**
 * O pedido — só o que nasce com ele e não muda.
 *
 * ⚠️ `configuracaoVersao` NULA É RESPOSTA, NÃO LACUNA A PREENCHER DEPOIS. Um pedido protocolado
 * quando o ente ainda não tinha configuração publicada corre sem data prometida, e continua assim
 * mesmo depois de a configuração aparecer: aplicar a norma nova a um fato anterior a ela é
 * exatamente a retroatividade que o congelamento existe para impedir. A pendência fica declarada
 * em toda consulta do pedido — ausência nomeada, nunca silenciosa.
 */
export interface PedidoDeAcesso {
  readonly id: string;
  /** O Processo do M21 que executa o pedido. A jornada interna é a dele. */
  readonly processoId: string;
  /** "12/2026" — o número do processo, que é o número do pedido. Não há segunda numeração. */
  readonly protocolo: string;
  readonly protocoladoEm: Date;
  readonly configuracaoVersao: number | null;
}

export type NaturezaDoFato =
  | "PEDIDO_PROTOCOLADO"
  | "PEDIDO_DISTRIBUIDO"
  | "PEDIDO_RECEBIDO"
  | "PRORROGACAO_CONCEDIDA"
  | "RESPOSTA_PREVIA_REGISTRADA"
  | "RESPOSTA_ENTREGUE"
  | "RECURSO_INTERPOSTO"
  | "RECURSO_DECIDIDO"
  | "PEDIDO_ENCERRADO";

export type ClassificacaoDaResposta = "ACESSO_CONCEDIDO" | "ACESSO_PARCIAL" | "ACESSO_NEGADO";
export type ResultadoDoRecurso = "PROVIDO" | "PROVIDO_EM_PARTE" | "DESPROVIDO";

/**
 * UM FATO DO PEDIDO — append-only, como todo movimento deste módulo.
 *
 * ⚠️ `mensagemAoRequerente` E `fundamentoInterno` SÃO DUAS COISAS, e é por isso que são duas
 * colunas. É a doutrina de `DecisaoDaSolicitacao`: o que o cidadão lê e o que instrui o processo
 * não se misturam em um texto só, porque um texto só acaba vazando inteiro para o lado errado.
 */
export interface FatoDoPedido {
  readonly id: string;
  readonly pedidoId: string;
  readonly processoId: string;
  readonly natureza: NaturezaDoFato;
  /** Quem praticou. `"REQUERENTE"` no recurso interposto por quem não é usuário do sistema. */
  readonly ator: string;
  readonly em: Date;
  /** O dia civil do ente em que o fato aconteceu — gravado, não recalculado na leitura. */
  readonly dia: string;
  /** A versão da configuração EFETIVAMENTE aplicada. Nula só quando não havia configuração. */
  readonly configuracaoVersao: number | null;
  /** A chave de idempotência, com o escopo (o pedido) dentro dela. */
  readonly chave: string;
  readonly mensagemAoRequerente: string | null;
  readonly fundamentoInterno: string | null;
  /** O setor de destino, na distribuição. */
  readonly setorDestinoId: string | null;
  /** O documento que instrui o fato (id do anexo do M22), quando houver. */
  readonly documentoId: string | null;
  readonly classificacao: ClassificacaoDaResposta | null;
  readonly instancia: number | null;
  readonly resultadoDoRecurso: ResultadoDoRecurso | null;
}

// ────────────────────────────────────────────────────────────────────────────
// A CHAVE DE IDEMPOTÊNCIA — com o escopo DENTRO dela
// ────────────────────────────────────────────────────────────────────────────

const PREFIXO_DA_CHAVE = "acesso";

/**
 * A CHAVE DE UM FATO. O escopo (o pedido) vai DENTRO da chave, e não ao lado dela.
 *
 * ⚠️ UMA CHAVE SEM ESCOPO É UMA COLISÃO ESPERANDO ACONTECER. "resposta-1" vinda de dois pedidos
 * diferentes é a mesma string: o segundo pedido receberia o replay do primeiro e ficaria
 * respondido sem que ninguém o tivesse respondido. Com o pedido dentro da chave, a única coisa
 * que duas chaves iguais podem significar é o MESMO ato do MESMO pedido — que é o que a
 * idempotência deve deduplicar.
 */
export function chaveDoFato(pedidoId: string, natureza: NaturezaDoFato, sufixo: string): string {
  return `${PREFIXO_DA_CHAVE}:${pedidoId}:${natureza}:${sufixo.trim()}`;
}

/** O pedido a que uma chave pertence, ou `null` se ela não declara escopo nenhum. */
export function pedidoDaChave(chave: string): string | null {
  const partes = chave.split(":");
  if (partes.length < 4 || partes[0] !== PREFIXO_DA_CHAVE) return null;
  return partes[1] === "" ? null : (partes[1] as string);
}

// ────────────────────────────────────────────────────────────────────────────
// A SITUAÇÃO — derivada, como a do Processo
// ────────────────────────────────────────────────────────────────────────────

export type SituacaoDoPedido =
  | "PROTOCOLADO"
  | "EM_DISTRIBUICAO"
  | "EM_ANALISE"
  | "RESPONDIDO"
  | "EM_RECURSO"
  | "ENCERRADO";

/** Ordem cronológica estável: o instante e, no empate, o id. Mesma regra de `dominio.ts`. */
function emOrdem(fatos: readonly FatoDoPedido[]): readonly FatoDoPedido[] {
  return [...fatos].sort((a, b) => {
    const d = a.em.getTime() - b.em.getTime();
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

/**
 * A SITUAÇÃO — pela dobra dos fatos, em ordem.
 *
 * ⚠️ PRORROGAÇÃO E PRÉVIA NÃO MUDAM O PÉ EM QUE O PEDIDO ESTÁ. A prorrogação mexe na DATA (e o
 * prazo a lê de lá); a prévia é trabalho interno. Contar "o último fato" faria um pedido
 * prorrogado aparecer como um estado próprio, e a tela diria "prorrogado" sobre um pedido que
 * está, isso sim, em análise — com mais prazo.
 *
 * ⚠️ O RECURSO PENDENTE É ESTADO; O RECURSO DECIDIDO DEVOLVE O PEDIDO A RESPONDIDO. Um pedido com
 * dois recursos interpostos e um decidido continua EM_RECURSO: a dobra só sai da espera quando
 * NÃO SOBRA recurso sem decisão. É a mesma regra do parecer pendente em `situacaoDoProcesso`.
 */
export function situacaoDoPedido(fatos: readonly FatoDoPedido[]): SituacaoDoPedido {
  const recursosPendentes = new Set<number>();
  let situacao: SituacaoDoPedido = "PROTOCOLADO";
  let respondido = false;

  for (const f of emOrdem(fatos)) {
    switch (f.natureza) {
      case "PEDIDO_PROTOCOLADO":
        situacao = "PROTOCOLADO";
        break;
      case "PEDIDO_DISTRIBUIDO":
        situacao = "EM_DISTRIBUICAO";
        break;
      case "PEDIDO_RECEBIDO":
        situacao = "EM_ANALISE";
        break;
      case "RESPOSTA_ENTREGUE":
        respondido = true;
        situacao = "RESPONDIDO";
        break;
      case "RECURSO_INTERPOSTO":
        if (f.instancia !== null) recursosPendentes.add(f.instancia);
        situacao = "EM_RECURSO";
        break;
      case "RECURSO_DECIDIDO":
        if (f.instancia !== null) recursosPendentes.delete(f.instancia);
        if (recursosPendentes.size === 0) situacao = respondido ? "RESPONDIDO" : "EM_ANALISE";
        break;
      case "PEDIDO_ENCERRADO":
        situacao = "ENCERRADO";
        break;
      case "PRORROGACAO_CONCEDIDA":
      case "RESPOSTA_PREVIA_REGISTRADA":
        break;
    }
  }
  return situacao;
}

/** Encerrado é o único estado que não aceita fato novo. */
export function pedidoFechado(situacao: SituacaoDoPedido): boolean {
  return situacao === "ENCERRADO";
}

export function descreverSituacaoDoPedido(s: SituacaoDoPedido): string {
  const rotulos: Record<SituacaoDoPedido, string> = {
    PROTOCOLADO: "Protocolado",
    EM_DISTRIBUICAO: "Encaminhado (ainda não recebido pelo setor)",
    EM_ANALISE: "Em análise",
    RESPONDIDO: "Respondido",
    EM_RECURSO: "Recurso em julgamento",
    ENCERRADO: "Encerrado",
  };
  return rotulos[s];
}

/** O setor onde o pedido está. O encaminhamento já move o pedido; o recebimento apenas o aceita. */
export function setorDoPedido(setorDeEntradaId: string, fatos: readonly FatoDoPedido[]): string {
  let atual = setorDeEntradaId;
  for (const f of emOrdem(fatos)) {
    if (f.natureza === "PEDIDO_DISTRIBUIDO" && f.setorDestinoId !== null) atual = f.setorDestinoId;
  }
  return atual;
}

const daNatureza = (fatos: readonly FatoDoPedido[], n: NaturezaDoFato): readonly FatoDoPedido[] =>
  emOrdem(fatos).filter((f) => f.natureza === n);

/** Quantas prorrogações já foram concedidas — contadas dos FATOS, nunca de um contador em coluna. */
export function prorrogacoesAplicadas(fatos: readonly FatoDoPedido[]): number {
  return daNatureza(fatos, "PRORROGACAO_CONCEDIDA").length;
}

/** Quantas instâncias de recurso já foram usadas — interpostas, decididas ou não. */
export function instanciasUsadas(fatos: readonly FatoDoPedido[]): number {
  return daNatureza(fatos, "RECURSO_INTERPOSTO").length;
}

/** A RESPOSTA ENTREGUE (a primeira; ela é única por construção), ou nada. */
export function respostaEntregue(fatos: readonly FatoDoPedido[]): FatoDoPedido | null {
  return daNatureza(fatos, "RESPOSTA_ENTREGUE")[0] ?? null;
}

/** A instância pendente de decisão, ou nada. */
export function recursoPendente(fatos: readonly FatoDoPedido[]): FatoDoPedido | null {
  const decididas = new Set(daNatureza(fatos, "RECURSO_DECIDIDO").map((f) => f.instancia));
  return daNatureza(fatos, "RECURSO_INTERPOSTO").find((f) => !decididas.has(f.instancia)) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// O PRAZO — a régua é consumida, não reescrita
// ────────────────────────────────────────────────────────────────────────────

/**
 * A CONFIGURAÇÃO DO PEDIDO — a versão CONGELADA no protocolo, achada entre as publicadas.
 *
 * ⚠️ ELA NÃO É `escolherConfiguracaoVigente(hoje)`, E ESSA É A DIFERENÇA QUE IMPORTA. A vigente
 * hoje responde "qual é o prazo?"; esta responde "qual ERA o prazo quando este cidadão
 * protocolou?" — que é a única pergunta que o controle interno faz sobre um pedido antigo.
 *
 * Devolve `null` quando o pedido nasceu sem configuração OU quando a versão congelada não está
 * entre as publicadas informadas. As duas ausências são a mesma para quem lê: não há norma a
 * aplicar, e o sistema não inventa uma.
 */
export function configuracaoDoPedido(
  versoes: readonly ConfiguracaoLida[],
  pedido: PedidoDeAcesso,
): ConfiguracaoLida | null {
  if (pedido.configuracaoVersao === null) return null;
  return versoes.find((v) => v.versao === pedido.configuracaoVersao) ?? null;
}

/** O prazo de resposta do pedido, pela configuração dele e pelas prorrogações já concedidas. */
export function prazoDoPedidoDeAcesso(
  config: ConfiguracaoLida | null,
  pedido: PedidoDeAcesso,
  fatos: readonly FatoDoPedido[],
  agora: Date,
  fuso?: string,
): PrazoDoPedido {
  return prazoDoPedido(config, pedido.protocoladoEm, prorrogacoesAplicadas(fatos), agora, fuso);
}

/**
 * O PRAZO PARA RECORRER — contado da RESPOSTA ENTREGUE, e só dela.
 *
 * ⚠️ A PRÉVIA NÃO INICIA PRAZO NENHUM. Ela é o texto que o setor preparou e ainda não entregou;
 * fazer o prazo do cidadão correr a partir dela seria descontar do direito dele o tempo em que o
 * documento esteve na gaveta da administração.
 */
export function limiteParaRecorrer(
  config: ConfiguracaoLida | null,
  fatos: readonly FatoDoPedido[],
  fuso?: string,
): Date | null {
  const resposta = respostaEntregue(fatos);
  if (resposta === null) return null;
  return limiteDoRecurso(config, resposta.em, fuso);
}

// ────────────────────────────────────────────────────────────────────────────
// OS COMANDOS E AS RECUSAS
// ────────────────────────────────────────────────────────────────────────────

export type ComandoDoPedido =
  | { readonly natureza: "PEDIDO_DISTRIBUIDO"; readonly setorDestinoId: string; readonly fundamentoInterno: string }
  | { readonly natureza: "PEDIDO_RECEBIDO" }
  | {
      readonly natureza: "PRORROGACAO_CONCEDIDA";
      readonly fundamentoInterno: string;
      readonly mensagemAoRequerente: string;
    }
  | { readonly natureza: "RESPOSTA_PREVIA_REGISTRADA"; readonly fundamentoInterno: string; readonly documentoId?: string | null }
  | {
      readonly natureza: "RESPOSTA_ENTREGUE";
      readonly classificacao: ClassificacaoDaResposta;
      readonly mensagemAoRequerente: string;
      readonly fundamentoInterno?: string | null;
      readonly documentoId?: string | null;
    }
  | { readonly natureza: "RECURSO_INTERPOSTO"; readonly mensagemAoRequerente: string }
  | {
      readonly natureza: "RECURSO_DECIDIDO";
      readonly resultadoDoRecurso: ResultadoDoRecurso;
      readonly mensagemAoRequerente: string;
      readonly fundamentoInterno?: string | null;
    }
  | { readonly natureza: "PEDIDO_ENCERRADO"; readonly fundamentoInterno: string };

export type CodigoDeRecusa =
  | "CHAVE-FORA-DO-ESCOPO"
  | "CONFIGURACAO-DIVERGENTE"
  | "PEDIDO-ENCERRADO"
  | "SETOR-NAO-INFORMADO"
  | "RECEBIMENTO-SEM-ENCAMINHAMENTO"
  | "RECEBIMENTO-JA-REGISTRADO"
  | "SEM-CONFIGURACAO-DO-ACESSO"
  | "PRORROGACAO-ALEM-DA-NORMA"
  | "PRORROGACAO-APOS-RESPOSTA"
  | "PRORROGACAO-SEM-MOTIVACAO"
  | "PREVIA-APOS-RESPOSTA"
  | "PEDIDO-JA-RESPONDIDO"
  | "NEGATIVA-SEM-FUNDAMENTO"
  | "RECURSO-SEM-RESPOSTA"
  | "RECURSO-JA-PENDENTE"
  | "RECURSO-ALEM-DAS-INSTANCIAS"
  | "RECURSO-FORA-DO-PRAZO"
  | "RECURSO-SEM-RAZOES"
  | "RECURSO-NAO-PENDENTE"
  | "DESPROVIMENTO-SEM-FUNDAMENTO"
  | "TEXTO-INSUFICIENTE";

export type ResultadoDoRegistro =
  | { readonly aceito: true; readonly repetido: boolean; readonly fato: FatoDoPedido }
  | { readonly aceito: false; readonly codigo: CodigoDeRecusa; readonly motivo: string };

export interface EntradaDoRegistro {
  readonly pedido: PedidoDeAcesso;
  /** A configuração CONGELADA do pedido (`configuracaoDoPedido`), não a vigente hoje. */
  readonly config: ConfiguracaoLida | null;
  readonly fatos: readonly FatoDoPedido[];
  readonly comando: ComandoDoPedido;
  readonly ator: string;
  readonly em: Date;
  readonly chave: string;
  /** O id que o fato terá. Vem de fora porque esta camada é pura. */
  readonly id: string;
  readonly fuso?: string;
}

const recusa = (codigo: CodigoDeRecusa, motivo: string): ResultadoDoRegistro => ({ aceito: false, codigo, motivo });

const MINIMO_DE_TEXTO = 10;

const curto = (t: string | null | undefined): boolean => (t ?? "").trim().length < MINIMO_DE_TEXTO;

/**
 * REGISTRA UM FATO — ou recusa, com o motivo PRÓPRIO daquela recusa.
 *
 * ⚠️ TODA PRÉ-CONDIÇÃO É CONFERIDA ANTES DE QUALQUER COISA SER PRODUZIDA. É a lição do efeito
 * colateral antes da guarda: gravar o artefato e só então descobrir que ele não cabia deixa o
 * registro impossível de processar para sempre. Aqui a função é pura, mas o caso de uso que a
 * chamar herda a ordem: conferir, e só então gravar.
 *
 * ⚠️ A RECUSA NOMEIA O CÓDIGO E DIZ O MOTIVO. "Não pode" é compatível com o servidor tendo feito
 * a coisa errada por outra razão — e com o caso de uso tratando duas negativas diferentes como a
 * mesma. Cada transição incompatível tem código próprio.
 */
export function registrarFatoDoPedido(e: EntradaDoRegistro): ResultadoDoRegistro {
  // 1. IDEMPOTÊNCIA — a repetição devolve o fato que já existe, e não grava outro.
  //    ⚠️ O ESCOPO VEM ANTES: uma chave que não é deste pedido não é replay, é engano — e tratá-la
  //    como replay responderia "já feito" sobre um ato que nunca aconteceu neste pedido.
  if (pedidoDaChave(e.chave) !== e.pedido.id) {
    return recusa(
      "CHAVE-FORA-DO-ESCOPO",
      `A chave de comando "${e.chave}" não pertence ao pedido ${e.pedido.protocolo}. Uma chave sem o ` +
        `escopo dentro dela colide entre pedidos diferentes, e a colisão responderia a este pedido o ` +
        `resultado de outro. Nada foi registrado.`,
    );
  }
  const jaRegistrado = e.fatos.find((f) => f.chave === e.chave);
  if (jaRegistrado !== undefined) return { aceito: true, repetido: true, fato: jaRegistrado };

  // 2. A VERSÃO APLICADA TEM DE SER A DO PEDIDO. Um fato gravado sob outra versão seria a norma
  //    nova entrando por fora do congelamento.
  const versaoDoFato = e.config?.versao ?? null;
  if (versaoDoFato !== e.pedido.configuracaoVersao) {
    return recusa(
      "CONFIGURACAO-DIVERGENTE",
      `O pedido ${e.pedido.protocolo} foi protocolado sob a configuração ` +
        `${e.pedido.configuracaoVersao === null ? "inexistente" : `versão ${e.pedido.configuracaoVersao}`} e o ato ` +
        `chegou com ${versaoDoFato === null ? "nenhuma" : `a versão ${versaoDoFato}`}. Publicar configuração nova ` +
        `não reescreve pedido em andamento. Nada foi registrado.`,
    );
  }

  const situacao = situacaoDoPedido(e.fatos);
  if (pedidoFechado(situacao)) {
    return recusa(
      "PEDIDO-ENCERRADO",
      `O pedido ${e.pedido.protocolo} está ENCERRADO e não aceita ato novo. O encerramento é fato ` +
        `registrado, com autor, hora e fundamento; o que houver de novo entra por pedido novo. Nada foi registrado.`,
    );
  }

  const resposta = respostaEntregue(e.fatos);
  const c = e.comando;

  switch (c.natureza) {
    case "PEDIDO_DISTRIBUIDO": {
      if (c.setorDestinoId.trim() === "") {
        return recusa("SETOR-NAO-INFORMADO", "O encaminhamento precisa do setor de destino. Nada foi registrado.");
      }
      if (curto(c.fundamentoInterno)) {
        return recusa(
          "TEXTO-INSUFICIENTE",
          `O encaminhamento exige o motivo: é o que o setor de destino lê para saber o que se espera dele, e o ` +
            `que responde, meses depois, por que o pedido foi parar ali. Nada foi registrado.`,
        );
      }
      break;
    }

    case "PEDIDO_RECEBIDO": {
      const encaminhamentos = daNatureza(e.fatos, "PEDIDO_DISTRIBUIDO");
      if (encaminhamentos.length === 0) {
        return recusa(
          "RECEBIMENTO-SEM-ENCAMINHAMENTO",
          `O pedido ${e.pedido.protocolo} ainda não foi encaminhado a setor nenhum, e receber o que não chegou ` +
            `daria por entregue o que ninguém abriu. Nada foi registrado.`,
        );
      }
      if (situacao !== "EM_DISTRIBUICAO") {
        return recusa(
          "RECEBIMENTO-JA-REGISTRADO",
          `O último encaminhamento do pedido ${e.pedido.protocolo} já foi recebido. Encaminhe de novo antes de ` +
            `registrar outro recebimento. Nada foi registrado.`,
        );
      }
      break;
    }

    case "PRORROGACAO_CONCEDIDA": {
      // ⚠️ DEPOIS DA RESPOSTA NÃO HÁ O QUE PRORROGAR, e o motivo é próprio: o prazo que a
      // prorrogação esticaria já se cumpriu. Confundir isso com "acabaram as prorrogações" diria
      // ao servidor que ele precisa de outra norma, quando o que ele precisa é de outro ato.
      if (resposta !== null) {
        return recusa(
          "PRORROGACAO-APOS-RESPOSTA",
          `O pedido ${e.pedido.protocolo} já foi respondido em ${diaCivilBr(resposta.em, e.fuso)}; não há prazo de ` +
            `resposta a prorrogar. Nada foi registrado.`,
        );
      }
      if (curto(c.fundamentoInterno) || curto(c.mensagemAoRequerente)) {
        return recusa(
          "PRORROGACAO-SEM-MOTIVACAO",
          `A prorrogação é motivada, e a motivação vai em dois textos: o fundamento que instrui o processo e a ` +
            `mensagem que o requerente lê. Prorrogar sem dizer por quê é adiar sem responder. Nada foi registrado.`,
        );
      }
      const decisao = podeProrrogar(e.config, prorrogacoesAplicadas(e.fatos));
      if (!decisao.pode) {
        return recusa(
          e.config === null ? "SEM-CONFIGURACAO-DO-ACESSO" : "PRORROGACAO-ALEM-DA-NORMA",
          decisao.motivo ?? SEM_CONFIGURACAO,
        );
      }
      break;
    }

    case "RESPOSTA_PREVIA_REGISTRADA": {
      // ⚠️ A PRÉVIA É TRABALHO INTERNO: ela não entrega nada, não inicia prazo de recurso e não
      // aparece ao requerente. Depois da entrega ela não tem mais função — e permiti-la faria
      // parecer que a resposta ainda estava sendo preparada depois de já ter sido dada.
      if (resposta !== null) {
        return recusa(
          "PREVIA-APOS-RESPOSTA",
          `O pedido ${e.pedido.protocolo} já foi respondido; uma prévia depois da entrega não é rascunho de nada. ` +
            `Nada foi registrado.`,
        );
      }
      if (curto(c.fundamentoInterno)) {
        return recusa("TEXTO-INSUFICIENTE", "A prévia de resposta exige o texto que está sendo preparado. Nada foi registrado.");
      }
      break;
    }

    case "RESPOSTA_ENTREGUE": {
      if (resposta !== null) {
        return recusa(
          "PEDIDO-JA-RESPONDIDO",
          `O pedido ${e.pedido.protocolo} já foi respondido em ${diaCivilBr(resposta.em, e.fuso)}. Resposta nova é ` +
            `complemento ou decisão de recurso, e cada uma tem o seu ato. Nada foi registrado.`,
        );
      }
      if (curto(c.mensagemAoRequerente)) {
        return recusa("TEXTO-INSUFICIENTE", "A resposta ao requerente não pode ser vazia. Nada foi registrado.");
      }
      // ⚠️ NEGAR EXIGE FUNDAMENTO. O acesso concedido se prova pelo documento entregue; a negativa,
      // total ou parcial, só se sustenta pela razão escrita — e é ela que o recurso ataca.
      if (c.classificacao !== "ACESSO_CONCEDIDO" && curto(c.fundamentoInterno)) {
        return recusa(
          "NEGATIVA-SEM-FUNDAMENTO",
          `Negar o acesso, no todo ou em parte, exige fundamento escrito: é o que o requerente combate em recurso e ` +
            `o que o controle interno confere depois. Nada foi registrado.`,
        );
      }
      break;
    }

    case "RECURSO_INTERPOSTO": {
      if (resposta === null) {
        return recusa(
          "RECURSO-SEM-RESPOSTA",
          `Não há resposta entregue no pedido ${e.pedido.protocolo}, e o recurso ataca uma resposta. Uma prévia ` +
            `registrada internamente não conta: ela não foi entregue a ninguém. Nada foi registrado.`,
        );
      }
      if (recursoPendente(e.fatos) !== null) {
        return recusa(
          "RECURSO-JA-PENDENTE",
          `O pedido ${e.pedido.protocolo} já tem recurso aguardando decisão. Decida-o antes de receber outro. Nada foi registrado.`,
        );
      }
      if (curto(c.mensagemAoRequerente)) {
        return recusa("RECURSO-SEM-RAZOES", "O recurso exige as razões de quem recorre. Nada foi registrado.");
      }
      const decisao = podeRecorrer(e.config, instanciasUsadas(e.fatos));
      if (!decisao.pode) {
        return recusa(
          e.config === null ? "SEM-CONFIGURACAO-DO-ACESSO" : "RECURSO-ALEM-DAS-INSTANCIAS",
          decisao.motivo ?? SEM_CONFIGURACAO,
        );
      }
      // ⚠️ O PRAZO DE RECURSO SE COMPARA POR DIA CIVIL DO ENTE. Um recurso protocolado no último
      // dia, às onze da noite, está no prazo — e a aritmética de instantes o rejeitaria.
      const limite = limiteParaRecorrer(e.config, e.fatos, e.fuso);
      if (limite !== null && diaCivil(e.em, e.fuso) > diaCivil(limite, e.fuso)) {
        return recusa(
          "RECURSO-FORA-DO-PRAZO",
          `O prazo para recorrer da resposta do pedido ${e.pedido.protocolo} terminou em ` +
            `${diaCivilBr(limite, e.fuso)}, pela configuração versão ${e.config?.versao}. Nada foi registrado.`,
        );
      }
      break;
    }

    case "RECURSO_DECIDIDO": {
      const pendente = recursoPendente(e.fatos);
      if (pendente === null) {
        return recusa(
          "RECURSO-NAO-PENDENTE",
          `Não há recurso aguardando decisão no pedido ${e.pedido.protocolo}. Nada foi registrado.`,
        );
      }
      if (curto(c.mensagemAoRequerente)) {
        return recusa("TEXTO-INSUFICIENTE", "A decisão do recurso precisa do texto que o requerente lê. Nada foi registrado.");
      }
      if (c.resultadoDoRecurso !== "PROVIDO" && curto(c.fundamentoInterno)) {
        return recusa(
          "DESPROVIMENTO-SEM-FUNDAMENTO",
          `Desprover o recurso, no todo ou em parte, exige fundamento escrito — é o que a instância seguinte e o ` +
            `controle interno conferem. Nada foi registrado.`,
        );
      }
      break;
    }

    case "PEDIDO_ENCERRADO": {
      if (curto(c.fundamentoInterno)) {
        return recusa("TEXTO-INSUFICIENTE", "O encerramento exige o fundamento. Nada foi registrado.");
      }
      break;
    }
  }

  return { aceito: true, repetido: false, fato: montar(e, c) };
}

/** O fato, montado campo a campo. Nada de espalhar o comando dentro da linha. */
function montar(e: EntradaDoRegistro, c: ComandoDoPedido): FatoDoPedido {
  const base = {
    id: e.id,
    pedidoId: e.pedido.id,
    processoId: e.pedido.processoId,
    natureza: c.natureza,
    ator: e.ator,
    em: e.em,
    dia: diaCivil(e.em, e.fuso),
    configuracaoVersao: e.pedido.configuracaoVersao,
    chave: e.chave,
    mensagemAoRequerente: null as string | null,
    fundamentoInterno: null as string | null,
    setorDestinoId: null as string | null,
    documentoId: null as string | null,
    classificacao: null as ClassificacaoDaResposta | null,
    instancia: null as number | null,
    resultadoDoRecurso: null as ResultadoDoRecurso | null,
  };

  switch (c.natureza) {
    case "PEDIDO_DISTRIBUIDO":
      return { ...base, setorDestinoId: c.setorDestinoId, fundamentoInterno: c.fundamentoInterno.trim() };
    case "PEDIDO_RECEBIDO":
      return base;
    case "PRORROGACAO_CONCEDIDA":
      return { ...base, fundamentoInterno: c.fundamentoInterno.trim(), mensagemAoRequerente: c.mensagemAoRequerente.trim() };
    case "RESPOSTA_PREVIA_REGISTRADA":
      return { ...base, fundamentoInterno: c.fundamentoInterno.trim(), documentoId: c.documentoId ?? null };
    case "RESPOSTA_ENTREGUE":
      return {
        ...base,
        classificacao: c.classificacao,
        mensagemAoRequerente: c.mensagemAoRequerente.trim(),
        fundamentoInterno: (c.fundamentoInterno ?? "").trim() === "" ? null : (c.fundamentoInterno as string).trim(),
        documentoId: c.documentoId ?? null,
      };
    case "RECURSO_INTERPOSTO":
      return { ...base, instancia: instanciasUsadas(e.fatos) + 1, mensagemAoRequerente: c.mensagemAoRequerente.trim() };
    case "RECURSO_DECIDIDO":
      return {
        ...base,
        instancia: recursoPendente(e.fatos)?.instancia ?? null,
        resultadoDoRecurso: c.resultadoDoRecurso,
        mensagemAoRequerente: c.mensagemAoRequerente.trim(),
        fundamentoInterno: (c.fundamentoInterno ?? "").trim() === "" ? null : (c.fundamentoInterno as string).trim(),
      };
    case "PEDIDO_ENCERRADO":
      return { ...base, fundamentoInterno: c.fundamentoInterno.trim() };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// AS DUAS PROJEÇÕES — e elas RECONSTROEM, não filtram
// ────────────────────────────────────────────────────────────────────────────

/**
 * ⚠️ POR QUE DUAS FUNÇÕES, E NÃO UMA COM UM `omitir`. Uma projeção que parte do fato inteiro e
 * apaga campos entrega tudo no dia em que alguém acrescentar uma coluna e esquecer da lista de
 * exclusão — e ninguém percebe, porque o teste que existia continua verde. Aqui a visão do
 * requerente é MONTADA campo a campo a partir do que ele pode ver: um campo novo no fato não
 * chega a ela por omissão, só por decisão escrita.
 */

export interface LinhaDaTrilhaInterna {
  readonly natureza: NaturezaDoFato;
  readonly rotulo: string;
  readonly em: Date;
  readonly dia: string;
  readonly ator: string;
  readonly configuracaoVersao: number | null;
  readonly mensagemAoRequerente: string | null;
  readonly fundamentoInterno: string | null;
  readonly setorDestinoId: string | null;
  readonly documentoId: string | null;
}

export interface VisaoInternaDoPedido {
  readonly protocolo: string;
  readonly situacao: SituacaoDoPedido;
  readonly rotulo: string;
  readonly setorAtualId: string;
  readonly prazo: PrazoDoPedido;
  readonly prorrogacoesAplicadas: number;
  readonly instanciasUsadas: number;
  readonly limiteParaRecorrer: Date | null;
  readonly podeProrrogar: Decisao;
  readonly podeRecorrer: Decisao;
  readonly trilha: readonly LinhaDaTrilhaInterna[];
  readonly pendencias: readonly PendenciaDaConfiguracao[];
}

const ROTULO_DO_FATO: Readonly<Record<NaturezaDoFato, string>> = {
  PEDIDO_PROTOCOLADO: "Pedido protocolado",
  PEDIDO_DISTRIBUIDO: "Encaminhado ao setor",
  PEDIDO_RECEBIDO: "Recebido pelo setor",
  PRORROGACAO_CONCEDIDA: "Prazo prorrogado",
  RESPOSTA_PREVIA_REGISTRADA: "Prévia de resposta registrada",
  RESPOSTA_ENTREGUE: "Resposta entregue ao requerente",
  RECURSO_INTERPOSTO: "Recurso interposto",
  RECURSO_DECIDIDO: "Recurso decidido",
  PEDIDO_ENCERRADO: "Pedido encerrado",
};

export function visaoInternaDoPedido(
  pedido: PedidoDeAcesso,
  config: ConfiguracaoLida | null,
  fatos: readonly FatoDoPedido[],
  setorDeEntradaId: string,
  agora: Date,
  fuso?: string,
): VisaoInternaDoPedido {
  const prazo = prazoDoPedidoDeAcesso(config, pedido, fatos, agora, fuso);
  const situacao = situacaoDoPedido(fatos);
  return {
    protocolo: pedido.protocolo,
    situacao,
    rotulo: descreverSituacaoDoPedido(situacao),
    setorAtualId: setorDoPedido(setorDeEntradaId, fatos),
    prazo,
    prorrogacoesAplicadas: prorrogacoesAplicadas(fatos),
    instanciasUsadas: instanciasUsadas(fatos),
    limiteParaRecorrer: limiteParaRecorrer(config, fatos, fuso),
    podeProrrogar: respostaEntregue(fatos) !== null
      ? { pode: false, motivo: "O pedido já foi respondido; não há prazo de resposta a prorrogar." }
      : podeProrrogar(config, prorrogacoesAplicadas(fatos)),
    podeRecorrer: respostaEntregue(fatos) === null
      ? { pode: false, motivo: "Ainda não há resposta entregue, e o recurso ataca uma resposta." }
      : podeRecorrer(config, instanciasUsadas(fatos)),
    trilha: emOrdem(fatos).map((f) => ({
      natureza: f.natureza,
      rotulo: ROTULO_DO_FATO[f.natureza],
      em: f.em,
      dia: f.dia,
      ator: f.ator,
      configuracaoVersao: f.configuracaoVersao,
      mensagemAoRequerente: f.mensagemAoRequerente,
      fundamentoInterno: f.fundamentoInterno,
      setorDestinoId: f.setorDestinoId,
      documentoId: f.documentoId,
    })),
    pendencias: prazo.pendencias,
  };
}

export type SituacaoParaSolicitante =
  | "PROTOCOLADO"
  | "EM_ANALISE"
  | "RESPONDIDO"
  | "RECURSO_EM_JULGAMENTO"
  | "ENCERRADO";

export const ROTULO_PARA_SOLICITANTE: Readonly<Record<SituacaoParaSolicitante, string>> = {
  PROTOCOLADO: "Protocolado — aguardando o setor responsável",
  EM_ANALISE: "Em análise",
  RESPONDIDO: "Respondido",
  RECURSO_EM_JULGAMENTO: "Recurso em julgamento",
  ENCERRADO: "Encerrado",
};

/**
 * ⚠️ O ENCAMINHAMENTO INTERNO NÃO É NOTÍCIA DO REQUERENTE. Para ele, um pedido que andou entre
 * dois setores continua protocolado até alguém o receber: mostrar a rota interna transformaria o
 * acompanhamento num organograma, e não é isso que ele consulta.
 */
export function situacaoParaSolicitante(s: SituacaoDoPedido): SituacaoParaSolicitante {
  switch (s) {
    case "PROTOCOLADO":
    case "EM_DISTRIBUICAO":
      return "PROTOCOLADO";
    case "EM_ANALISE":
      return "EM_ANALISE";
    case "RESPONDIDO":
      return "RESPONDIDO";
    case "EM_RECURSO":
      return "RECURSO_EM_JULGAMENTO";
    case "ENCERRADO":
      return "ENCERRADO";
  }
}

export interface VisaoDoSolicitante {
  readonly protocolo: string;
  readonly situacao: SituacaoParaSolicitante;
  readonly rotulo: string;
  readonly protocoladoEm: string;
  readonly limite: string | null;
  readonly situacaoDoPrazo: PrazoDoPedido["situacao"];
  readonly normaFederal: string | null;
  readonly regulamentacaoLocal: string | null;
  readonly prorrogacoes: readonly { readonly em: string; readonly mensagem: string }[];
  readonly resposta: {
    readonly classificacao: ClassificacaoDaResposta;
    readonly mensagem: string;
    readonly em: string;
    readonly temDocumento: boolean;
  } | null;
  readonly recursos: readonly {
    readonly instancia: number;
    readonly interpostoEm: string;
    readonly razoes: string;
    readonly decisao: { readonly resultado: ResultadoDoRecurso; readonly mensagem: string; readonly em: string } | null;
  }[];
  readonly prazoParaRecorrer: string | null;
  /** O que o ente ainda não publicou, dito ao cidadão sem número de cláusula nem jargão interno. */
  readonly avisos: readonly string[];
}

/**
 * O QUE O REQUERENTE VÊ — montado campo a campo.
 *
 * ⚠️ FUNDAMENTO INTERNO, PRÉVIA, ATOR E SETOR NÃO ENTRAM AQUI, e não é por filtro: é porque esta
 * função não os lê. A prévia não existe para ele — ela não foi entregue —, e o fundamento interno
 * é o que instrui o processo, não o que responde ao pedido.
 */
export function visaoDoSolicitante(
  pedido: PedidoDeAcesso,
  config: ConfiguracaoLida | null,
  fatos: readonly FatoDoPedido[],
  agora: Date,
  fuso?: string,
): VisaoDoSolicitante {
  const prazo = prazoDoPedidoDeAcesso(config, pedido, fatos, agora, fuso);
  const situacao = situacaoParaSolicitante(situacaoDoPedido(fatos));
  const entregue = respostaEntregue(fatos);
  const decididos = daNatureza(fatos, "RECURSO_DECIDIDO");
  const limiteRecurso = limiteParaRecorrer(config, fatos, fuso);

  return {
    protocolo: pedido.protocolo,
    situacao,
    rotulo: ROTULO_PARA_SOLICITANTE[situacao],
    protocoladoEm: diaCivilBr(pedido.protocoladoEm, fuso),
    limite: prazo.limiteBr,
    situacaoDoPrazo: prazo.situacao,
    normaFederal: prazo.normaFederal,
    regulamentacaoLocal: prazo.regulamentacaoLocal,
    prorrogacoes: daNatureza(fatos, "PRORROGACAO_CONCEDIDA").map((f) => ({
      em: diaCivilBr(f.em, fuso),
      mensagem: f.mensagemAoRequerente ?? "",
    })),
    resposta:
      entregue === null || entregue.classificacao === null
        ? null
        : {
            classificacao: entregue.classificacao,
            mensagem: entregue.mensagemAoRequerente ?? "",
            em: diaCivilBr(entregue.em, fuso),
            temDocumento: entregue.documentoId !== null,
          },
    recursos: daNatureza(fatos, "RECURSO_INTERPOSTO").map((f) => {
      const d = decididos.find((x) => x.instancia === f.instancia);
      return {
        instancia: f.instancia ?? 0,
        interpostoEm: diaCivilBr(f.em, fuso),
        razoes: f.mensagemAoRequerente ?? "",
        decisao:
          d === undefined || d.resultadoDoRecurso === null
            ? null
            : { resultado: d.resultadoDoRecurso, mensagem: d.mensagemAoRequerente ?? "", em: diaCivilBr(d.em, fuso) },
      };
    }),
    prazoParaRecorrer: limiteRecurso === null ? null : diaCivilBr(limiteRecurso, fuso),
    // A pendência de configuração é do ente, e o cidadão tem direito de saber por que não há data
    // prometida — mas com a frase que a régua já escreveu, e não com um código de sistema.
    avisos: prazo.pendencias.filter((p) => p.bloqueia).map((p) => p.mensagem),
  };
}
