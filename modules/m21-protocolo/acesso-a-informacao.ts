import { diaCivil, diaCivilBr, somarDiasCivis } from "../../packages/datas/index.js";

/**
 * ═══ O PRAZO DO PEDIDO DE ACESSO À INFORMAÇÃO (V11 V5.1) ═══
 *
 * ⚠️ NÃO HÁ UM ÚNICO NÚMERO DE NORMA NESTE ARQUIVO — e o `a12` roda o grep. Nem 20, nem 10, nem
 * "uma prorrogação". Todos vêm da configuração publicada pelo ente, com a citação da lei junto.
 *
 * ⚠️ O QUE O INVENTÁRIO ACHOU, E QUE MUDA O PEDIDO DO LOTE. O lote manda "não reutilizar
 * cegamente prazo da ouvidoria". O que existe é pior que um prazo mal reaproveitado: **a
 * ouvidoria não tem prazo nenhum**. Os três modelos dela têm só `criadoEm`. O prazo que a
 * ouvidoria aparenta ter vem de `EtapaDoRoteiro.prazoDias` — prazo de ETAPA, do setor, contado do
 * RECEBIMENTO, sem fundamento legal — e o prazo que se acha no repositório está num seed de
 * demonstração. Não havia o que reaproveitar; havia o que não confundir.
 *
 * ⚠️ TRÊS DIFERENÇAS QUE IMPEDEM O REAPROVEITAMENTO, e cada uma sozinha bastaria:
 *   · o prazo da etapa é do SETOR e reinicia a cada recebimento; o do pedido é do PEDIDO e corre
 *     do protocolo, atravessando quantos setores forem;
 *   · o prazo da etapa não tem fundamento legal registrado; este exige a norma citada;
 *   · o prazo da etapa não admite prorrogação nem recurso; este admite os dois, nos limites que
 *     a norma do ente declarar.
 *
 * ⚠️ E O `agora` É PARÂMETRO, como em `situacaoDePrazo` do mesmo módulo. Função de prazo que lê o
 * relógio por dentro passa hoje e falha amanhã, sem ninguém saber por quê.
 */

// ────────────────────────────────────────────────────────────────────────────
// A configuração lida
// ────────────────────────────────────────────────────────────────────────────

export interface ConfiguracaoLida {
  readonly versao: number;
  readonly vigenciaInicio: string;
  readonly prazoDeRespostaEmDias: number;
  readonly prazoDeProrrogacaoEmDias: number;
  readonly prorrogacoesPermitidas: number;
  readonly instanciasDeRecurso: number;
  readonly prazoDeRecursoEmDias: number;
  readonly normaFederal: string;
  readonly normaFederalPublicadaEm: Date;
  readonly regulamentacaoLocal: string | null;
  readonly regulamentacaoLocalPublicadaEm: Date | null;
  readonly observacao: string | null;
}

export const SEM_CONFIGURACAO =
  "Não há configuração do acesso à informação vigente nesta data. O prazo de resposta nasce de " +
  "lei, e este sistema não o inventa: publique a configuração com o prazo, a norma federal que o " +
  "fixa e, quando houver, a regulamentação local. O pedido continua podendo ser recebido e " +
  "instruído — o que fica impedido é prometer data e prorrogar.";

export const SEM_REGULAMENTACAO_LOCAL =
  "O ente ainda não declarou a regulamentação local do acesso à informação. O prazo da norma " +
  "federal continua valendo e o pedido corre normalmente — o que falta é o ato do município que " +
  "diz como ele cumpre a lei. Enquanto faltar, esta pendência aparece em cada pedido.";

/**
 * A CONFIGURAÇÃO VIGENTE NO DIA — a de MAIOR versão entre as que já começaram a valer.
 *
 * ⚠️ O DESEMPATE É A VERSÃO, NÃO A DATA, e é por isso que ela é `@unique`. Duas configurações
 * podem começar a valer no mesmo dia — uma retificação publicada no mesmo diário é o caso comum.
 * Sem um desempate declarado, "a vigente" passaria a depender da ordem em que o banco devolvesse
 * as linhas, e o prazo de um cidadão dependeria de um plano de execução.
 *
 * ⚠️ VIGÊNCIA FUTURA NÃO VALE HOJE. Uma configuração publicada hoje para valer no mês que vem não
 * pode encurtar nem esticar o prazo de um pedido protocolado agora.
 */
export function escolherConfiguracaoVigente(
  versoes: readonly ConfiguracaoLida[],
  dia: string,
): ConfiguracaoLida | null {
  let melhor: ConfiguracaoLida | null = null;
  for (const v of versoes) {
    if (v.vigenciaInicio > dia) continue;
    if (melhor === null || v.versao > melhor.versao) melhor = v;
  }
  return melhor;
}

// ────────────────────────────────────────────────────────────────────────────
// O prazo
// ────────────────────────────────────────────────────────────────────────────

export type SituacaoDoPrazoDoPedido = "SEM_PRAZO" | "NO_PRAZO" | "VENCE_HOJE" | "VENCIDO";

export interface PendenciaDaConfiguracao {
  readonly codigo: "SEM-CONFIGURACAO-DO-ACESSO" | "SEM-REGULAMENTACAO-LOCAL";
  readonly mensagem: string;
  /** Onde se resolve. Pendência sem rota é reclamação. */
  readonly rota: string;
  /** Ela impede o pedido de correr, ou só precisa ser resolvida? */
  readonly bloqueia: boolean;
}

export interface PrazoDoPedido {
  /** Nulo quando não há configuração: o sistema NÃO promete data que não tem norma. */
  readonly limite: Date | null;
  readonly limiteBr: string | null;
  readonly situacao: SituacaoDoPrazoDoPedido;
  /** Negativo quando vencido. Nulo sem configuração. */
  readonly diasRestantes: number | null;
  readonly prorrogacoesAplicadas: number;
  /** A norma obedecida — para a tela mostrar ao lado da data, nunca a data sozinha. */
  readonly normaFederal: string | null;
  readonly regulamentacaoLocal: string | null;
  readonly pendencias: readonly PendenciaDaConfiguracao[];
}

const ROTA_DA_CONFIGURACAO = "/protocolo/acesso-a-informacao";

function pendenciasDa(config: ConfiguracaoLida | null): readonly PendenciaDaConfiguracao[] {
  if (config === null) {
    return [
      { codigo: "SEM-CONFIGURACAO-DO-ACESSO", mensagem: SEM_CONFIGURACAO, rota: ROTA_DA_CONFIGURACAO, bloqueia: true },
    ];
  }
  if (config.regulamentacaoLocal === null) {
    return [
      { codigo: "SEM-REGULAMENTACAO-LOCAL", mensagem: SEM_REGULAMENTACAO_LOCAL, rota: ROTA_DA_CONFIGURACAO, bloqueia: false },
    ];
  }
  return [];
}

/**
 * O PRAZO DE UM PEDIDO — do protocolo, mais o que a norma dá, mais as prorrogações já concedidas.
 *
 * ⚠️ SOMA EM DIAS CIVIS, NUNCA EM MILISSEGUNDOS. `protocolo.getTime() + n * 86400000` erra um dia
 * inteiro nas duas viradas de horário de verão, e erra para MENOS na virada que encurta — o
 * cidadão perderia um dia de prazo por causa de aritmética. `somarDiasCivis` soma no calendário,
 * preservando a hora civil.
 *
 * ⚠️ E A COMPARAÇÃO É POR DIA CIVIL. Um prazo que vence "hoje" vence no fim do dia do ente, não
 * no instante exato em que o relógio completa N×24h a partir do protocolo.
 */
export function prazoDoPedido(
  config: ConfiguracaoLida | null,
  protocoladoEm: Date,
  prorrogacoesAplicadas: number,
  agora: Date,
  fuso?: string,
): PrazoDoPedido {
  const pendencias = pendenciasDa(config);

  if (config === null) {
    return {
      limite: null,
      limiteBr: null,
      situacao: "SEM_PRAZO",
      diasRestantes: null,
      prorrogacoesAplicadas,
      normaFederal: null,
      regulamentacaoLocal: null,
      pendencias,
    };
  }

  const dias = config.prazoDeRespostaEmDias + prorrogacoesAplicadas * config.prazoDeProrrogacaoEmDias;
  const limite = somarDiasCivis(protocoladoEm, dias, fuso);

  const diaLimite = diaCivil(limite, fuso);
  const diaDeHoje = diaCivil(agora, fuso);

  const situacao: SituacaoDoPrazoDoPedido =
    diaDeHoje > diaLimite ? "VENCIDO" : diaDeHoje === diaLimite ? "VENCE_HOJE" : "NO_PRAZO";

  // Dias inteiros de calendário entre hoje e o limite. Zero no dia do vencimento.
  const restantes = Math.round(
    (Date.parse(`${diaLimite}T12:00:00Z`) - Date.parse(`${diaDeHoje}T12:00:00Z`)) / 86_400_000,
  );

  return {
    limite,
    limiteBr: diaCivilBr(limite, fuso),
    situacao,
    diasRestantes: restantes,
    prorrogacoesAplicadas,
    normaFederal: config.normaFederal,
    regulamentacaoLocal: config.regulamentacaoLocal,
    pendencias,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// A prorrogação e o recurso — decididos pela norma declarada, nunca por default
// ────────────────────────────────────────────────────────────────────────────

export interface Decisao {
  readonly pode: boolean;
  /** Obrigatório quando `pode` é falso. Negação sem motivo é negação inexplicável. */
  readonly motivo: string | null;
}

/**
 * PODE PRORROGAR?
 *
 * ⚠️ `prorrogacoesPermitidas === 0` É RESPOSTA VÁLIDA, não configuração pela metade. Há norma que
 * não admite prorrogação nenhuma, e tratar zero como "ainda não configurado" faria o sistema
 * conceder o que a norma nega.
 */
export function podeProrrogar(config: ConfiguracaoLida | null, prorrogacoesAplicadas: number): Decisao {
  if (config === null) return { pode: false, motivo: SEM_CONFIGURACAO };
  if (config.prorrogacoesPermitidas === 0) {
    return {
      pode: false,
      motivo:
        `A configuração vigente (versão ${config.versao}) não admite prorrogação, com fundamento em ` +
        `${config.normaFederal}. Se a norma do ente admite, publique uma configuração nova — não se ` +
        `prorroga por exceção.`,
    };
  }
  if (prorrogacoesAplicadas >= config.prorrogacoesPermitidas) {
    return {
      pode: false,
      motivo:
        `Este pedido já usou ${prorrogacoesAplicadas} de ${config.prorrogacoesPermitidas} prorrogação(ões) ` +
        `admitidas pela configuração vigente (versão ${config.versao}, ${config.normaFederal}).`,
    };
  }
  return { pode: true, motivo: null };
}

/**
 * PODE RECORRER, e para qual instância?
 *
 * ⚠️ `instanciasDeRecurso === 0` também é resposta válida e declarada — e a negação DIZ isso, em
 * vez de responder como se o pedido estivesse fora de prazo.
 */
export function podeRecorrer(config: ConfiguracaoLida | null, instanciasJaUsadas: number): Decisao {
  if (config === null) return { pode: false, motivo: SEM_CONFIGURACAO };
  if (config.instanciasDeRecurso === 0) {
    return {
      pode: false,
      motivo:
        `A configuração vigente (versão ${config.versao}) declara zero instância de recurso, com ` +
        `fundamento em ${config.normaFederal}.`,
    };
  }
  if (instanciasJaUsadas >= config.instanciasDeRecurso) {
    return {
      pode: false,
      motivo:
        `Este pedido já percorreu as ${config.instanciasDeRecurso} instância(s) de recurso que a ` +
        `configuração vigente (versão ${config.versao}) prevê.`,
    };
  }
  return { pode: true, motivo: null };
}

/** O prazo para recorrer, contado da resposta. Nulo sem configuração — não se promete data sem norma. */
export function limiteDoRecurso(config: ConfiguracaoLida | null, respondidoEm: Date, fuso?: string): Date | null {
  if (config === null) return null;
  return somarDiasCivis(respondidoEm, config.prazoDeRecursoEmDias, fuso);
}
