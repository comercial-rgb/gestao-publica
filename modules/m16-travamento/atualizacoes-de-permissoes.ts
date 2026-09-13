import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { ACOES_DE_LEITURA, ehAcaoDeLeitura, type AcaoDeLeitura, type AcaoDoSistema } from "./acoes.js";
import { autorizar, type Tx } from "./autorizacao.js";

/**
 * M16 — AS ATUALIZAÇÕES VERSIONADAS DE PERMISSÕES (orquestração V3, 4.2).
 *
 * ═══ O PROBLEMA, E POR QUE O SCRIPT DE CONCESSÃO NÃO O RESOLVE ═══
 * Uma versão nova acrescenta ações ao censo. O `bootstrap` nasce correto (instalação
 * limpa recebe o censo inteiro) e recusa rodar em banco povoado — corretamente. Numa
 * instalação que JÁ EXISTE, as ações novas não chegam a perfil nenhum: a tela existe e
 * ninguém a alcança. `scripts/conceder-acoes-ao-perfil.ts` resolve UM perfil por vez,
 * pelo shell, com ações digitadas — e a leitura (4.1) entrou com 18 ações que precisam
 * chegar a TODOS os perfis existentes, cada um NO SEU ESCOPO. Digitar isso à mão para
 * cada perfil de cada instalação é exatamente o que apodrece.
 *
 * ═══ A FORMA: uma atualização É um número de versão, uma regra pura e um registro ═══
 *   - a REGRA deriva as concessões a partir do que cada perfil já tem (pura, testável);
 *   - o REGISTRO (`AtualizacaoDePermissoes`, versão única) garante que ela roda UMA vez
 *     por instalação — reaplicar é recusado nomeando, e é isso que preserva uma
 *     revogação deliberada feita depois: a atualização não "repõe" o que o
 *     administrador tirou;
 *   - o ATO é administrativo: exige `CONCEDER_ACAO_A_PERFIL` de quem aplica, grava o
 *     autor em cada permissão e passa pelo registro de operação da borda.
 *
 * ═══ A REGRA DA v1 — a transição EXPLÍCITA dos perfis existentes para a leitura ═══
 * Para cada perfil, para cada área, para cada escopo (global ou unidade) em que o perfil
 * já tem QUALQUER ação de mutação daquela área, ele recebe `CONSULTAR_<ÁREA>` NO MESMO
 * escopo. Nem mais, nem menos:
 *   - quem empenha na Saúde passa a consultar a despesa na Saúde — não na Educação;
 *   - quem cadastra bens (ato do ente, logo global) consulta o patrimônio no ente;
 *   - ações transversais (anexar, assinar, preencher campo) não derivam leitura nenhuma;
 *   - perfil sem ação numa área não ganha a leitura dela. Um perfil "somente leitura"
 *     continua sendo criado à mão, ação a ação, pela administração;
 *   - a área que NENHUMA mutação alcança (a transparência interna) vai, global, para os
 *     perfis que administram permissões (CONCEDER_ACAO_A_PERFIL global) — e só para eles.
 * Não é grant universal, e não é "algum perfil tem cada ação": é a preservação do
 * alcance que cada perfil já tinha, agora declarado.
 */

export interface PermissaoExistente {
  readonly acao: string;
  readonly unidadeOrcId: string | null;
}

export interface PerfilComPermissoes {
  readonly id: string;
  readonly nome: string;
  readonly permissoes: readonly PermissaoExistente[];
}

export interface ConcessaoDerivada {
  readonly perfilId: string;
  readonly perfilNome: string;
  readonly acao: AcaoDoSistema;
  readonly unidadeOrcId: string | null;
}

/** O mapa ação -> área (`AREA_DA_ACAO`), passado por parâmetro: o domínio não importa a UI. */
export type AreaDaAcao = Readonly<Record<string, string>>;

export interface AtualizacaoDePermissoes {
  readonly versao: number;
  readonly nome: string;
  readonly descricao: string;
  readonly derivar: (
    perfis: readonly PerfilComPermissoes[],
    areaDaAcao: AreaDaAcao
  ) => readonly ConcessaoDerivada[];
}

/** A ação de leitura de uma área: `CONSULTAR_` + slug em maiúsculas, hífen vira sublinhado. */
export function acaoDeLeituraDaArea(area: string): AcaoDeLeitura | null {
  const nome = `CONSULTAR_${area.toUpperCase().replace(/-/g, "_")}`;
  return ehAcaoDeLeitura(nome) ? nome : null;
}

/**
 * A REGRA DA v1, pura: leitura por área, no escopo em que o perfil já age.
 *
 * IDEMPOTENTE POR CONSTRUÇÃO: só deriva o que o perfil NÃO tem. A prova está em
 * `m16-atualizacoes.test.ts` — inclusive a de que uma revogação posterior é preservada,
 * que é a razão de existir o registro de versão.
 */
export function derivarLeituraPorArea(
  perfis: readonly PerfilComPermissoes[],
  areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  // ⚠️ AS ÁREAS QUE NENHUMA MUTAÇÃO ALCANÇA (hoje: a transparência interna — datasets e
  // exports do portal). A regra "leitura onde já age" não as alcança para perfil nenhum, e
  // uma área que ninguém consegue abrir depois da atualização seria a deriva que o
  // detector acusa. Elas vão, em escopo global, para os perfis que administram permissões
  // (CONCEDER_ACAO_A_PERFIL global): quem distribui poder continua alcançando tudo, e os
  // demais perfis as recebem por concessão explícita — nunca por aproximação.
  // ⚠️ SÓ AS MUTAÇÕES CONTAM COMO "AÇÃO NA ÁREA": as próprias ações de leitura também estão
  // no mapa (é ele que põe CONSULTAR_<ÁREA> no menu), e contá-las faria toda área parecer
  // alcançada — foi o que a primeira execução do teste pegou (17 leituras em vez de 18).
  const areasComMutacao = new Set(
    Object.entries(areaDaAcao)
      .filter(([acao]) => !ehAcaoDeLeitura(acao))
      .map(([, area]) => area)
  );
  const leiturasOrfas = ACOES_DE_LEITURA.filter((leitura) => {
    const area = leitura.replace(/^CONSULTAR_/, "").toLowerCase().replace(/_/g, "-");
    return !areasComMutacao.has(area);
  });
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const jaTem = new Set(perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? ""}`));
    const alvos = new Map<string, { acao: AcaoDeLeitura; unidadeOrcId: string | null }>();
    for (const p of perfil.permissoes) {
      if (ehAcaoDeLeitura(p.acao)) continue;
      const area = areaDaAcao[p.acao];
      if (area === undefined || area === "transversal") continue;
      const leitura = acaoDeLeituraDaArea(area);
      if (leitura === null) continue;
      const chave = `${leitura} ${p.unidadeOrcId ?? ""}`;
      if (jaTem.has(chave)) continue;
      alvos.set(chave, { acao: leitura, unidadeOrcId: p.unidadeOrcId });
    }
    const administraPermissoes = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (administraPermissoes) {
      for (const leitura of leiturasOrfas) {
        const chave = `${leitura} `;
        if (jaTem.has(chave)) continue;
        alvos.set(chave, { acao: leitura, unidadeOrcId: null });
      }
    }
    for (const a of [...alvos.values()].sort((x, y) => x.acao.localeCompare(y.acao))) {
      saida.push({
        perfilId: perfil.id,
        perfilNome: perfil.nome,
        acao: a.acao,
        unidadeOrcId: a.unidadeOrcId,
      });
    }
  }
  return saida;
}

/**
 * A REGRA DA v2 (V3 4.5): PUBLICAR_ROTEIRO_PATRIMONIAL nasceu como ação SEPARADA de
 * PARAMETRIZAR_ROTEIRO_PATRIMONIAL. Quem já parametrizava — e portanto já punha roteiro
 * em vigor com um ato só — recebe a publicação NO MESMO ESCOPO, para não perder alcance na
 * atualização. A segregação real (propor ≠ publicar) é decisão do administrador, que pode
 * revogar uma das duas depois: a atualização preserva o que havia, não decide por ele.
 */
export function derivarPublicarRoteiro(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const jaTem = new Set(perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? ""}`));
    const escopos = new Map<string, string | null>();
    for (const p of perfil.permissoes) {
      if (p.acao !== "PARAMETRIZAR_ROTEIRO_PATRIMONIAL") continue;
      if (jaTem.has(`PUBLICAR_ROTEIRO_PATRIMONIAL ${p.unidadeOrcId ?? ""}`)) continue;
      escopos.set(p.unidadeOrcId ?? "", p.unidadeOrcId);
    }
    for (const unidadeOrcId of escopos.values()) {
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "PUBLICAR_ROTEIRO_PATRIMONIAL", unidadeOrcId });
    }
  }
  return saida;
}

/** A REGRA DA v3 (pacote 2): quem cria usuário passa a poder vincular a pessoa, no mesmo escopo. */
export function derivarVincularPessoa(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const jaTem = new Set(perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? ""}`));
    const escopos = new Map<string, string | null>();
    for (const p of perfil.permissoes) {
      if (p.acao !== "CRIAR_USUARIO") continue;
      if (jaTem.has(`VINCULAR_PESSOA_AO_USUARIO ${p.unidadeOrcId ?? ""}`)) continue;
      escopos.set(p.unidadeOrcId ?? "", p.unidadeOrcId);
    }
    for (const unidadeOrcId of escopos.values()) {
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "VINCULAR_PESSOA_AO_USUARIO", unidadeOrcId });
    }
  }
  return saida;
}

/** A REGRA DA v4 (pacote 2): quem parametriza roteiro do patrimônio passa a definir o parâmetro de atualização, no mesmo escopo. */
export function derivarParametroDeAtualizacao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const jaTem = new Set(perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? ""}`));
    const escopos = new Map<string, string | null>();
    for (const p of perfil.permissoes) {
      if (p.acao !== "PARAMETRIZAR_ROTEIRO_PATRIMONIAL") continue;
      if (jaTem.has(`DEFINIR_PARAMETRO_DE_ATUALIZACAO ${p.unidadeOrcId ?? ""}`)) continue;
      escopos.set(p.unidadeOrcId ?? "", p.unidadeOrcId);
    }
    for (const unidadeOrcId of escopos.values()) {
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "DEFINIR_PARAMETRO_DE_ATUALIZACAO", unidadeOrcId });
    }
  }
  return saida;
}

/**
 * A REGRA DA v5 (V4 §8, Fila A): o planejamento PLURIANUAL (M02b) chegou com dez ações novas.
 * Quem já cria FICHA orçamentária no escopo GLOBAL — o crachá de quem monta a LOA do ente —
 * recebe as dez, no escopo global (o PPA é ato do ente; não há escopo de unidade). Um perfil
 * que só cria ficha numa UG não recebe nada: planejar o quadriênio não é atribuição de unidade.
 * A segregação fina (metas fiscais ≠ riscos ≠ estrutura) fica a cargo do administrador.
 */
export const ACOES_DO_PLURIANUAL: readonly AcaoDoSistema[] = [
  "CADASTRAR_PPA",
  "CADASTRAR_ESTRUTURA_PPA",
  "CADASTRAR_PROGRAMA_PPA",
  "CADASTRAR_RECEITA_PPA",
  "CADASTRAR_LDO",
  "CADASTRAR_PRIORIDADE_LDO",
  "CADASTRAR_METAS_FISCAIS_LDO",
  "CADASTRAR_RISCOS_FISCAIS_LDO",
  "CADASTRAR_RENUNCIA_RECEITA_LDO",
  "CADASTRAR_ALIENACAO_LDO",
];

export function derivarPlanejamentoPlurianual(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const jaTem = new Set(perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? ""}`));
    const montaALoa = perfil.permissoes.some((p) => p.acao === "CRIAR_FICHA" && p.unidadeOrcId === null);
    if (!montaALoa) continue;
    for (const acao of ACOES_DO_PLURIANUAL) {
      if (jaTem.has(`${acao} `)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/**
 * A REGRA DA v6 (V5 Fila A): o documento fiscal recebido chegou com três ações.
 * Quem já registra recebimento de ordem (o atesto físico) recebe registrar e conferir
 * o documento, no mesmo escopo. Quem já estorna ordem recebe cancelar. A segregação
 * quem emite a ordem × quem atesta o recebimento continua: emitir ordem não deriva
 * estas ações.
 */
export function derivarDocumentoFiscalRecebido(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const jaTem = new Set(perfil.permissoes.map((p) => `${p.acao} ${p.unidadeOrcId ?? ""}`));
    const escoposRecebimento = new Map<string, string | null>();
    const escoposEstorno = new Map<string, string | null>();
    for (const p of perfil.permissoes) {
      if (p.acao === "REGISTRAR_RECEBIMENTO_DE_ORDEM") {
        escoposRecebimento.set(p.unidadeOrcId ?? "", p.unidadeOrcId);
      }
      if (p.acao === "ESTORNAR_ORDEM_DE_COMPRA") {
        escoposEstorno.set(p.unidadeOrcId ?? "", p.unidadeOrcId);
      }
    }
    for (const unidadeOrcId of escoposRecebimento.values()) {
      for (const acao of ["REGISTRAR_DOCUMENTO_FISCAL", "CONFERIR_DOCUMENTO_FISCAL"] as const) {
        if (jaTem.has(`${acao} ${unidadeOrcId ?? ""}`)) continue;
        saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId });
      }
    }
    for (const unidadeOrcId of escoposEstorno.values()) {
      if (jaTem.has(`CANCELAR_DOCUMENTO_FISCAL ${unidadeOrcId ?? ""}`)) continue;
      saida.push({
        perfilId: perfil.id,
        perfilNome: perfil.nome,
        acao: "CANCELAR_DOCUMENTO_FISCAL",
        unidadeOrcId,
      });
    }
  }
  return saida;
}

/**
 * A REGRA DA v7 (V6 P0.1): configurar a apresentação do ente é uma ação nova da família
 * ADMINISTRACAO. Quem já concede ação a perfil NO ESCOPO GLOBAL (o administrador de
 * permissões) recebe-a no global. A apresentação é ato do ente — não há escopo por unidade.
 */
export function derivarApresentacaoDoEnte(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administraPermissoes = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administraPermissoes) continue;
    const jaTem = perfil.permissoes.some(
      (p) => p.acao === "CONFIGURAR_APRESENTACAO_DO_ENTE" && p.unidadeOrcId === null
    );
    if (jaTem) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "CONFIGURAR_APRESENTACAO_DO_ENTE", unidadeOrcId: null });
  }
  return saida;
}

/**
 * A REGRA DA v8 (V6 P1.2): atribuir conta bancária a uma arrecadação do legado é ato de quem
 * concilia. Quem já VINCULA conciliação no escopo global recebe a atribuição no global; a
 * arrecadação é do ente, então não há escopo por unidade.
 */
export function derivarAtribuirContaAArrecadacao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const concilia = perfil.permissoes.some((p) => p.acao === "VINCULAR_CONCILIACAO" && p.unidadeOrcId === null);
    if (!concilia) continue;
    const jaTem = perfil.permissoes.some((p) => p.acao === "ATRIBUIR_CONTA_A_ARRECADACAO" && p.unidadeOrcId === null);
    if (jaTem) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "ATRIBUIR_CONTA_A_ARRECADACAO", unidadeOrcId: null });
  }
  return saida;
}

/**
 * A REGRA DA v9 (V6 P2): o M32 pessoal chegou com catorze ações e a leitura da área. Nenhum perfil
 * existente age em pessoal, então "leitura onde já age" não alcança ninguém. Quem administra
 * permissões no global (CONCEDER_ACAO_A_PERFIL) recebe as catorze e a leitura no global — para a
 * instalação não nascer com uma área que ninguém consegue abrir; a segregação fina (cadastrar ×
 * admitir × desligar) fica a cargo do administrador ao montar os perfis do RH.
 */
export const ACOES_DO_PESSOAL: readonly AcaoDoSistema[] = [
  "CADASTRAR_SERVIDOR", "ADMITIR_SERVIDOR", "MOVIMENTAR_SERVIDOR", "ALTERAR_REMUNERACAO", "DESLIGAR_SERVIDOR",
  "CADASTRAR_CARGO", "CADASTRAR_LOTACAO", "GERIR_DEPENDENTE", "BAIXAR_DEPENDENTE", "REGISTRAR_PORTARIA",
  "REGISTRAR_ANOTACAO", "REGISTRAR_TREINAMENTO", "CONFIGURAR_CALENDARIO_RH", "REGISTRAR_CONTRATO_TRABALHO",
  "REGISTRAR_AVALIACAO_EXPERIENCIA", "CONSULTAR_PESSOAL",
];
export const ACOES_DA_FOLHA: readonly AcaoDoSistema[] = [
  "CONFIGURAR_TABELAS_DA_FOLHA", "CADASTRAR_RUBRICA", "LANCAR_NA_FOLHA", "ABRIR_FOLHA", "CALCULAR_FOLHA",
  "CANCELAR_CALCULO_DA_FOLHA", "FECHAR_FOLHA", "CONSULTAR_FOLHA",
];
/** V6 P2.3b — a apropriação contábil, que chegou depois da v10. */
export const ACOES_DA_APROPRIACAO: readonly AcaoDoSistema[] = ["CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA", "APROPRIAR_FOLHA"];
export function derivarApropriacaoDaFolha(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DA_APROPRIACAO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}
export function derivarFolha(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DA_FOLHA) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}
export function derivarPessoal(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DO_PESSOAL) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

export function derivarPortalDoServidor(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    if (perfil.permissoes.some((p) => p.acao === "CONSULTAR_PORTAL_DO_SERVIDOR" && p.unidadeOrcId === null)) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "CONSULTAR_PORTAL_DO_SERVIDOR", unidadeOrcId: null });
  }
  return saida;
}

export const ATUALIZACOES: readonly AtualizacaoDePermissoes[] = [
  {
    versao: 1,
    nome: "leitura-por-area",
    descricao:
      "A leitura virou permissão (CONSULTAR_<AREA>). Cada perfil recebe a leitura de cada " +
      "area em que ja tem alguma acao, no mesmo escopo (global ou unidade). Acoes " +
      "transversais nao derivam leitura; perfis sem acao numa area nao a ganham.",
    derivar: derivarLeituraPorArea,
  },
  {
    versao: 2,
    nome: "publicar-roteiro",
    descricao:
      "Publicar uma versao de roteiro contabil virou acao propria (PUBLICAR_ROTEIRO_PATRIMONIAL). " +
      "Quem ja parametrizava roteiro recebe a publicacao no mesmo escopo; a segregacao entre " +
      "propor e publicar fica a cargo do administrador.",
    derivar: derivarPublicarRoteiro,
  },
  {
    versao: 3,
    nome: "vincular-pessoa-ao-usuario",
    descricao:
      "Vincular o usuario a uma pessoa do cadastro virou acao propria (VINCULAR_PESSOA_AO_USUARIO), " +
      "da familia de administracao. Quem ja cria usuario recebe o vinculo no mesmo escopo.",
    derivar: derivarVincularPessoa,
  },
  {
    versao: 4,
    nome: "parametro-de-atualizacao",
    descricao:
      "Definir o parametro de depreciacao/amortizacao/exaustao da classe virou acao propria e " +
      "versionada (DEFINIR_PARAMETRO_DE_ATUALIZACAO). Quem ja parametriza roteiro contabil do " +
      "patrimonio recebe a definicao no mesmo escopo.",
    derivar: derivarParametroDeAtualizacao,
  },
  {
    versao: 5,
    nome: "planejamento-plurianual",
    descricao:
      "O planejamento plurianual (PPA e LDO, M02b) chegou com dez acoes novas. Quem ja cria ficha " +
      "orcamentaria no escopo global recebe as dez, no escopo global; a segregacao fina fica a " +
      "cargo do administrador.",
    derivar: derivarPlanejamentoPlurianual,
  },
  {
    versao: 6,
    nome: "documento-fiscal-recebido",
    descricao:
      "O documento fiscal recebido (V5 Fila A) chegou com tres acoes. Quem ja registra " +
      "recebimento de ordem recebe registrar e conferir o documento no mesmo escopo; quem ja " +
      "estorna ordem recebe cancelar o documento no mesmo escopo.",
    derivar: derivarDocumentoFiscalRecebido,
  },
  {
    versao: 7,
    nome: "apresentacao-do-ente",
    descricao:
      "Configurar a apresentacao do ente (V6 P0.1) virou acao propria (CONFIGURAR_APRESENTACAO_DO_ENTE). " +
      "Quem ja concede acao a perfil no escopo global recebe-a no global; e ato do ente, sem escopo por unidade.",
    derivar: derivarApresentacaoDoEnte,
  },
  {
    versao: 8,
    nome: "conta-bancaria-da-arrecadacao",
    descricao:
      "Atribuir conta bancaria a uma arrecadacao do legado (V6 P1.2) virou acao propria (ATRIBUIR_CONTA_A_ARRECADACAO). " +
      "Quem ja vincula conciliacao no escopo global recebe-a no global; a arrecadacao e do ente.",
    derivar: derivarAtribuirContaAArrecadacao,
  },
  {
    versao: 9,
    nome: "pessoal-m32",
    descricao:
      "O M32 pessoal (RH bloco 1, V6 P2) chegou com catorze acoes e a leitura CONSULTAR_PESSOAL. Quem concede acao a " +
      "perfil no escopo global recebe as quinze no global; a segregacao fina fica a cargo do administrador.",
    derivar: derivarPessoal,
  },
  {
    versao: 10,
    nome: "folha-m33",
    descricao:
      "O M33 folha de pagamento (RH bloco 2, V6 P2.3) chegou com sete acoes e a leitura CONSULTAR_FOLHA. Quem concede " +
      "acao a perfil no escopo global recebe as oito no global; a segregacao (quem calcula, quem fecha) fica a cargo do administrador.",
    derivar: derivarFolha,
  },
  {
    versao: 11,
    nome: "portal-do-servidor",
    descricao:
      "O portal do servidor (V6 P2.4) chegou com a leitura CONSULTAR_PORTAL_DO_SERVIDOR, que abre SO o que e do proprio " +
      "usuario (a porta recorta pela pessoa da sessao). Quem concede acao a perfil no escopo global a recebe; quem " +
      "administra cria o perfil dos servidores e a concede a eles.",
    derivar: derivarPortalDoServidor,
  },
  {
    versao: 12,
    nome: "apropriacao-da-folha",
    descricao:
      "A apropriacao contabil da folha (V6 P2.3b) chegou com CADASTRAR_GRUPO_DE_EMPENHO_DA_FOLHA e APROPRIAR_FOLHA. Quem " +
      "concede acao a perfil no escopo global as recebe; quem APROPRIA precisa tambem de EMPENHAR, e essa concessao " +
      "continua sendo decisao do administrador — o M05 exige a sua acao em cada empenho.",
    derivar: derivarApropriacaoDaFolha,
  },
];

export interface SituacaoDaAtualizacao {
  readonly versao: number;
  readonly nome: string;
  readonly descricao: string;
  readonly aplicadaEm: Date | null;
  readonly aplicadaPor: string | null;
  readonly concessoes: number | null;
  /** Quantas concessões a regra derivaria HOJE — a prévia, para a tela e o script. */
  readonly previa: number;
}

async function perfisComPermissoes(tx: Tx): Promise<readonly PerfilComPermissoes[]> {
  const ps = await tx.perfil.findMany({
    orderBy: { nome: "asc" },
    select: { id: true, nome: true, permissoes: { select: { acao: true, unidadeOrcId: true } } },
  });
  return ps.map((p) => ({
    id: p.id,
    nome: p.nome,
    permissoes: p.permissoes.map((x) => ({ acao: String(x.acao), unidadeOrcId: x.unidadeOrcId })),
  }));
}

/** A situação de cada atualização conhecida nesta instalação, com a prévia do que faria. */
export async function situacaoDasAtualizacoes(
  tx: Tx,
  areaDaAcao: AreaDaAcao
): Promise<readonly SituacaoDaAtualizacao[]> {
  const aplicadas = await tx.atualizacaoDePermissoes.findMany({
    select: { versao: true, aplicadaEm: true, aplicadaPor: true, concessoes: true },
  });
  const porVersao = new Map(aplicadas.map((a) => [a.versao, a]));
  const perfis = await perfisComPermissoes(tx);
  return ATUALIZACOES.map((a) => {
    const r = porVersao.get(a.versao);
    return {
      versao: a.versao,
      nome: a.nome,
      descricao: a.descricao,
      aplicadaEm: r?.aplicadaEm ?? null,
      aplicadaPor: r?.aplicadaPor ?? null,
      concessoes: r?.concessoes ?? null,
      previa: r === undefined ? a.derivar(perfis, areaDaAcao).length : 0,
    };
  });
}

export interface AplicarAtualizacaoInput {
  readonly versao: number;
  readonly criadoPor: string;
  readonly areaDaAcao: AreaDaAcao;
}

/**
 * APLICA uma atualização — uma vez por instalação, com autor e ação administrativa.
 *
 * O REGISTRO DA VERSÃO NASCE NA MESMA TRANSAÇÃO DAS CONCESSÕES, e é criado ANTES delas:
 * a unicidade de `versao` é a trava contra duas aplicações concorrentes — a segunda
 * estoura no índice e nada dela sobrevive ao rollback. Reaplicar depois é recusado
 * nomeando quem aplicou e quando.
 */
export async function aplicarAtualizacaoDePermissoes(
  prisma: PrismaClient,
  input: AplicarAtualizacaoInput
): Promise<{ readonly concessoes: number; readonly perfisAlcancados: number }> {
  const atualizacao = ATUALIZACOES.find((a) => a.versao === input.versao);
  if (atualizacao === undefined) {
    throw new Error(
      `ATUALIZAÇÃO DESCONHECIDA: não há atualização de permissões de versão ${input.versao}. ` +
        `As conhecidas são: ${ATUALIZACOES.map((a) => `${a.versao} (${a.nome})`).join(", ")}. ` +
        `Nada foi gravado.`
    );
  }

  // Ato do ENTE: quem aplica precisa poder conceder ação a perfil, globalmente.
  await autorizar(prisma, input.criadoPor, "CONCEDER_ACAO_A_PERFIL");

  const ja = await prisma.atualizacaoDePermissoes.findUnique({ where: { versao: input.versao } });
  if (ja !== null) {
    throw new Error(
      `ATUALIZAÇÃO JÁ APLICADA: a versão ${input.versao} (${atualizacao.nome}) foi aplicada por ` +
        `"${ja.aplicadaPor}" em ${ja.aplicadaEm.toISOString()}, com ${ja.concessoes} ` +
        `concessão(ões). Ela roda UMA vez por instalação — reaplicá-la reporia o que o ` +
        `administrador tiver revogado de propósito depois. Nada foi gravado.`
    );
  }

  return prisma.$transaction(async (tx) => {
    const perfis = await perfisComPermissoes(tx);
    const concessoes = atualizacao.derivar(perfis, input.areaDaAcao);
    await tx.atualizacaoDePermissoes.create({
      data: {
        versao: atualizacao.versao,
        nome: atualizacao.nome,
        aplicadaPor: input.criadoPor,
        concessoes: concessoes.length,
        detalhe: concessoes
          .map((c) => {
            const escopo = c.unidadeOrcId === null ? "(global)" : `@ ${c.unidadeOrcId}`;
            return `${c.perfilNome}: ${c.acao} ${escopo}`;
          })
          .join("\n"),
      },
    });
    if (concessoes.length > 0) {
      await tx.permissaoDePerfil.createMany({
        data: concessoes.map((c) => ({
          perfilId: c.perfilId,
          acao: c.acao,
          unidadeOrcId: c.unidadeOrcId,
          criadoPor: input.criadoPor,
        })),
      });
    }
    return {
      concessoes: concessoes.length,
      perfisAlcancados: new Set(concessoes.map((c) => c.perfilId)).size,
    };
  });
}
