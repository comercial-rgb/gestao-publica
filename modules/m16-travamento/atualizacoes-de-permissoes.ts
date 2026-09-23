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
/**
 * A REGRA DA v13 (V6.1): o atesto da folha e a sua liquidação.
 *
 * ⚠️ ELA CONCEDE **UMA** DAS TRÊS AÇÕES, e a omissão é a regra, não o esquecimento.
 * `DESIGNAR_NA_FOLHA` é ato de ADMINISTRAÇÃO — quem já administra permissões no global passa a
 * poder cadastrar quem o ente designou para atestar, com o ato e a vigência. Já `CERTIFICAR_FOLHA`
 * e `LIQUIDAR_FOLHA` são justamente os atos que a segregação separa: espalhá-los pelo perfil
 * administrador faria a instalação nascer com quem prepara podendo certificar, e com quem
 * certifica podendo liquidar — o oposto do que esta entrega existe para representar. Quem
 * administra as concede, aos perfis que o ente definir, com o ato administrativo na mão.
 *
 * ⚠️ E O CRACHÁ SOZINHO NÃO CERTIFICA: o serviço exige, além da ação, uma DESIGNAÇÃO vigente no
 * dia do ato para aquele usuário. Conceder `CERTIFICAR_FOLHA` a alguém sem designação não lhe dá
 * poder nenhum — ele continua sendo recusado, nomeando o que falta.
 */
export const ACOES_DO_ATESTO_DA_FOLHA: readonly AcaoDoSistema[] = ["DESIGNAR_NA_FOLHA"];
/** As DUAS que a v13 deliberadamente NÃO concede — a segregação por padrão. */
export const ACOES_SEGREGADAS_DA_FOLHA: readonly AcaoDoSistema[] = ["CERTIFICAR_FOLHA", "LIQUIDAR_FOLHA"];
export function derivarAtestoDaFolha(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DO_ATESTO_DA_FOLHA) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}
/**
 * A REGRA DA v14 (V6.2): os encargos do empregador sobre a folha.
 *
 * ⚠️ DUAS DAS QUATRO, pela mesma razão da v13. `CADASTRAR_ENCARGO_DA_FOLHA` (componente e versão do
 * parâmetro) e `APURAR_ENCARGOS_DA_FOLHA` (a apuração sobre o cálculo fechado) vão a quem administra
 * no global — sem elas a instalação não teria como começar. `APROVAR_ENCARGO_DA_FOLHA` e
 * `CERTIFICAR_ENCARGOS_DA_FOLHA` são os atos que a segregação separa: quem cadastra a alíquota não a
 * aprova, e quem apura não atesta. O serviço recusa as duas autoconcentrações de qualquer forma; não
 * concedê-las aqui é para a instalação não NASCER concentrada.
 */
export const ACOES_DOS_ENCARGOS_DA_FOLHA: readonly AcaoDoSistema[] = ["CADASTRAR_ENCARGO_DA_FOLHA", "APURAR_ENCARGOS_DA_FOLHA"];
export const ACOES_SEGREGADAS_DOS_ENCARGOS: readonly AcaoDoSistema[] = ["APROVAR_ENCARGO_DA_FOLHA", "CERTIFICAR_ENCARGOS_DA_FOLHA"];
export function derivarEncargosDaFolha(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DOS_ENCARGOS_DA_FOLHA) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}
/**
 * V6.2 P3 — a carta de serviços. Quem administra recebe CONFIGURAR a carta, REGISTRAR representação e a
 * leitura CONSULTAR_MEUS_SERVICOS. PEDIR (SOLICITAR_SERVICO) e DECIDIR (DECIDIR_SOLICITACAO_DE_SERVICO)
 * ficam fora: são os lados que a mesa separa, e quem os recebe (o perfil do requerente, o perfil da mesa
 * de um setor) é decisão do administrador — a instalação não nasce com a mesma conta pedindo e decidindo.
 */
export const ACOES_DA_CARTA_DE_SERVICOS: readonly AcaoDoSistema[] = ["CONFIGURAR_CARTA_DE_SERVICOS", "REGISTRAR_REPRESENTACAO", "CONSULTAR_MEUS_SERVICOS"];

export function derivarCartaDeServicos(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DA_CARTA_DE_SERVICOS) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/** V7 M1 U3.2 — a guia de recolhimento: quem administra no global a recebe (registrar documento não paga nada). */
export const ACOES_DA_GUIA_DE_RECOLHIMENTO: readonly AcaoDoSistema[] = ["GERIR_GUIA_DE_RECOLHIMENTO"];

export function derivarGuiaDeRecolhimento(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    if (perfil.permissoes.some((p) => p.acao === "GERIR_GUIA_DE_RECOLHIMENTO" && p.unidadeOrcId === null)) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "GERIR_GUIA_DE_RECOLHIMENTO", unidadeOrcId: null });
  }
  return saida;
}

/** V7 M1 U4 — a ouvidoria (triagem e resposta, com lotação) e a moderação das avaliações. */
export const ACOES_DA_OUVIDORIA_E_AVALIACAO: readonly AcaoDoSistema[] = ["TRIAR_MANIFESTACAO_DE_OUVIDORIA", "MODERAR_AVALIACAO_DE_SERVICO"];

export function derivarOuvidoriaEAvaliacao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DA_OUVIDORIA_E_AVALIACAO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/**
 * V7 M2.1 — o contrato acompanhado. Quem administra no global recebe DESIGNAR e CADASTRAR ITEM (configuração
 * do contrato). Programar, registrar ocorrência e resolver NÃO saem da derivação: sem designação no contrato
 * elas não praticam nada, e concedê-las ao administrador só faria a barra oferecer atos que o servidor recusa.
 */
export const ACOES_DO_CONTRATO_ACOMPANHADO: readonly AcaoDoSistema[] = ["DESIGNAR_NO_CONTRATO", "CADASTRAR_ITEM_DO_CONTRATO"];

/** V7 M2 (ponte contratual) — o poder de DEFINIR administrador da fiscalização vai a quem administra permissões. */
export const ACOES_DA_ADMINISTRACAO_DA_FISCALIZACAO: readonly AcaoDoSistema[] = ["DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO", "CONFIGURAR_EXECUCAO_DO_CONTRATO"];

export function derivarAdministracaoDaFiscalizacao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DA_ADMINISTRACAO_DA_FISCALIZACAO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

export const ACOES_DO_TRIBUTARIO: readonly AcaoDoSistema[] = ["GERIR_CADASTRO_IMOBILIARIO", "GERIR_PARAMETROS_TRIBUTARIOS"];

export function derivarTributario(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DO_TRIBUTARIO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

export const ACOES_DO_ESTORNO_DE_RECEBIMENTO: readonly AcaoDoSistema[] = ["ESTORNAR_RECEBIMENTO_DEFINITIVO"];

/**
 * V9 N4 — o estorno do recebimento definitivo.
 *
 * ⚠️ QUEM ADMINISTRA PERMISSOES RECEBE A ACAO; NINGUEM MAIS. Ela NAO e derivada para quem ja tem
 * REGISTRAR_RECEBIMENTO_DEFINITIVO, e a distincao e o ponto: receber e o ato ordinario do recebedor
 * designado; desfazer um termo assinado e excepcional, reabre quantidade ja fechada e deixa rastro
 * publico. Concede-la por tabela daria o poder de desfazer a todo mundo que pode receber, em
 * silencio, no dia da atualizacao — e ninguem teria decidido isso.
 *
 * O administrador a concede aos perfis que respondem pelo recebimento definitivo, e o ato continua
 * exigindo a designacao vigente de RECEBEDOR_DEFINITIVO no contrato.
 */
export function derivarEstornoDeRecebimento(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DO_ESTORNO_DE_RECEBIMENTO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

export const ACOES_DOS_TIPOS_DE_OCORRENCIA: readonly AcaoDoSistema[] = ["GERIR_TIPOS_DE_OCORRENCIA"];

export function derivarTiposDeOcorrencia(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DOS_TIPOS_DE_OCORRENCIA) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

export const ACOES_DA_PLANILHA_DA_OBRA: readonly AcaoDoSistema[] = ["GERIR_PLANILHA_DA_OBRA"];

export function derivarPlanilhaDaObra(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DA_PLANILHA_DA_OBRA) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

export function derivarContratoAcompanhado(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DO_CONTRATO_ACOMPANHADO) {
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

export const ACOES_DO_RITO_DO_ACESSO: readonly AcaoDoSistema[] = [
  "PROTOCOLAR_PEDIDO_DE_ACESSO_A_INFORMACAO",
  "DISTRIBUIR_PEDIDO_DE_ACESSO_A_INFORMACAO",
  "PRORROGAR_PEDIDO_DE_ACESSO_A_INFORMACAO",
  "RESPONDER_PEDIDO_DE_ACESSO_A_INFORMACAO",
  "DECIDIR_RECURSO_DE_ACESSO_A_INFORMACAO",
];

/**
 * V11 V5.3 — AS CINCO ACOES DO RITO DO ACESSO A INFORMACAO.
 *
 * ⚠️ SO PARA QUEM ADMINISTRA PERMISSOES NO GLOBAL, e nao derivada de
 * `PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO` nem de `CONSULTAR_PROTOCOLO`. Configurar o
 * prazo e OPERAR o pedido sao coisas diferentes — quem publica a norma nao e necessariamente
 * quem responde ao cidadao —, e quem LE o protocolo nao passa a poder prorrogar a data prometida
 * a quem tem direito subjetivo.
 *
 * O administrador recebe as cinco e as distribui: a de protocolar ao balcao, a de distribuir a
 * triagem, a de responder ao setor que detem a informacao, e a de decidir o recurso a quem NAO
 * respondeu — quem responde nao julga o proprio ato.
 */
export function derivarRitoDoAcessoAInformacao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = new Set(perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao));
    for (const acao of ACOES_DO_RITO_DO_ACESSO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/**
 * ⚠️ A DECLARAÇÃO DA DISPONIBILIDADE NÃO DERIVA DE QUEM ESCREVE O DECRETO (V11 V7.3).
 *
 * `DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO` é o número que AUTORIZA a despesa por superávit,
 * excesso de arrecadação ou operação de crédito. Derivá-la de `CRIAR_DECRETO_DE_CREDITO` daria a
 * quem escreve o decreto o poder de declarar o próprio lastro — e o guard que confere o crédito
 * contra a disponibilidade viraria uma checagem que a mesma pessoa alimenta dos dois lados. Quem
 * apura o superávit do balanço é a contabilidade; quem escreve o decreto é o planejamento.
 *
 * Por isso ela vai só a quem ADMINISTRA permissões no global, que é quem pode distribuí-la a
 * quem de direito nesta instalação.
 */
export function derivarDeclaracaoDeDisponibilidade(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    const jaTem = perfil.permissoes.some(
      (p) => p.acao === "DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO" && p.unidadeOrcId === null
    );
    if (jaTem) continue;
    saida.push({
      perfilId: perfil.id,
      perfilNome: perfil.nome,
      acao: "DECLARAR_DISPONIBILIDADE_DE_RECURSO_NOVO",
      unidadeOrcId: null,
    });
  }
  return saida;
}

/**
 * V11 V9 — AS TRÊS AÇÕES DA ENTIDADE CONTÁBIL.
 *
 * ⚠️ NÃO HÁ DERIVAÇÃO POR APROXIMAÇÃO AQUI, e a recusa é o conteúdo desta regra. A tentação é
 * derivar `ATRIBUIR_ENTIDADE_A_ARRECADACAO` de quem já tem `ATRIBUIR_CONTA_A_ARRECADACAO`: é a
 * mesma tela, o mesmo operador e a mesma disciplina de conferir contra um fato antes de gravar.
 *
 * Só que os dois atos respondem perguntas diferentes. Um diz **em que conta** o dinheiro entrou
 * — e se erra, a conciliação não fecha e alguém percebe. O outro diz **de quem** o dinheiro é —
 * e se erra, o caixa da autarquia vira caixa da prefeitura numa consulta que ninguém confere
 * contra extrato nenhum. Herdar o segundo do primeiro entregaria a titularidade da receita a
 * quem o ente autorizou a arrumar um vínculo bancário.
 *
 * ═══ ⚠️ E ESSE É O CRITÉRIO GERAL, NÃO UMA PARTICULARIDADE DESTE PAR ═══
 * A pergunta que decide se uma ação pode ser DERIVADA de outra é: **o erro tem detector?**
 * Um poder cujo mau uso bate num instrumento que acusa sozinho (a conciliação que não fecha, o
 * balanceamento que recusa, a amarração que estoura) pode seguir o poder vizinho — o sistema
 * pega. Um poder cujo mau uso produz um número plausível, que ninguém confere contra nada, exige
 * concessão DELIBERADA, com alguém nomeando a pessoa. Derivar o segundo é transformar uma
 * ausência de detector em ausência de decisão.
 *
 * Então as três vão para quem administra permissões no global, exatamente como a v25 fez com a
 * declaração de disponibilidade, e pelo mesmo motivo: **quem distribui poder continua
 * alcançando tudo, e os demais recebem por concessão explícita — nunca por aproximação.**
 */
export function derivarEntidadeContabil(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const NOVAS: readonly AcaoDoSistema[] = [
    "CADASTRAR_ENTIDADE_CONTABIL",
    "DECLARAR_TITULAR_DA_CONTA_BANCARIA",
    "ATRIBUIR_ENTIDADE_A_ARRECADACAO",
  ];
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    for (const acao of NOVAS) {
      // IDEMPOTENTE POR CONSTRUÇÃO, como toda regra daqui: só deriva o que o perfil NÃO tem.
      // É o que faz reaplicar a v27 não duplicar concessão, e o que preserva uma revogação
      // posterior feita de propósito pelo ente.
      if (perfil.permissoes.some((p) => p.acao === acao && p.unidadeOrcId === null)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/**
 * V11 V8 — AS TRÊS AÇÕES DA AGENDA DO GUICHÊ.
 *
 * ⚠️ A DERIVAÇÃO É PELO QUE O PERFIL JÁ FAZ NO PROTOCOLO, e ela é DESIGUAL de propósito:
 *
 *   · quem já CONFIGURA a carta de serviços (`CONFIGURAR_CARTA_DE_SERVICOS`) passa a poder
 *     ORGANIZAR o atendimento presencial dos mesmos serviços — é a mesma chefia, e a agenda do
 *     guichê é a face presencial da carta;
 *   · quem já ATENDE o balcão (`SOLICITAR_SERVICO` — protocola em nome de quem chega) passa a
 *     poder MARCAR e remarcar;
 *   · CONFIRMAR e REGISTRAR o atendimento **não são derivadas para ninguém**. Dizer "esta pessoa
 *     está aqui" e "foi atendida" é ato de quem está no guichê naquele dia, e não há hoje uma
 *     permissão que signifique isso — derivá-la de quem marca deixaria a agenda fechar o próprio
 *     dia sem ninguém ter aparecido. Quem organiza concede, nomeando a pessoa.
 *
 * ⚠️ O ESCOPO É O MESMO que o perfil já tinha na ação de origem. Um perfil que só configura a
 * carta numa unidade gestora não passa a organizar guichê no ente inteiro.
 */
export function derivarAgendaDoGuiche(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  const derivacoes = [
    { de: "CONFIGURAR_CARTA_DE_SERVICOS", para: "CONFIGURAR_AGENDA_DO_GUICHE" },
    { de: "SOLICITAR_SERVICO", para: "RESERVAR_ATENDIMENTO_NO_GUICHE" },
  ] as const;

  for (const perfil of perfis) {
    for (const { de, para } of derivacoes) {
      for (const origem of perfil.permissoes.filter((p) => p.acao === de)) {
        const jaTem = perfil.permissoes.some(
          (p) => p.acao === para && p.unidadeOrcId === origem.unidadeOrcId
        );
        if (jaTem) continue;
        // Duas origens no MESMO escopo não podem virar duas concessões iguais.
        const jaDerivada = saida.some(
          (c) => c.perfilId === perfil.id && c.acao === para && c.unidadeOrcId === origem.unidadeOrcId
        );
        if (jaDerivada) continue;
        saida.push({
          perfilId: perfil.id,
          perfilNome: perfil.nome,
          acao: para,
          unidadeOrcId: origem.unidadeOrcId,
        });
      }
    }
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
  {
    versao: 13,
    nome: "atesto-da-folha",
    descricao:
      "O atesto da folha e a sua liquidacao (V6.1) chegaram com DESIGNAR_NA_FOLHA, CERTIFICAR_FOLHA e LIQUIDAR_FOLHA. " +
      "Esta atualizacao concede SO a primeira, a quem ja administra permissoes no global: designar e ato de " +
      "administracao. CERTIFICAR_FOLHA e LIQUIDAR_FOLHA sao os atos que a segregacao separa — conceder os tres ao mesmo " +
      "perfil faria a instalacao nascer com quem prepara podendo certificar. E o cracha sozinho nao certifica: o servico " +
      "exige tambem uma designacao vigente no dia do ato, com o ato administrativo do ente.",
    derivar: derivarAtestoDaFolha,
  },
  {
    versao: 14,
    nome: "encargos-da-folha",
    descricao:
      "Os encargos do empregador sobre a folha (V6.2) chegaram com CADASTRAR_ENCARGO_DA_FOLHA, APROVAR_ENCARGO_DA_FOLHA, " +
      "APURAR_ENCARGOS_DA_FOLHA e CERTIFICAR_ENCARGOS_DA_FOLHA. Esta atualizacao concede SO cadastrar e apurar, a quem ja " +
      "administra permissoes no global. Aprovar o parametro e certificar a apuracao sao os atos que a segregacao separa — " +
      "quem cadastra a aliquota nao a aprova, e quem apura nao atesta. O atesto dos encargos exige tambem designacao " +
      "vigente com a atribuicao propria; a designacao para certificar a folha salarial nao a supre.",
    derivar: derivarEncargosDaFolha,
  },
  {
    versao: 15,
    nome: "carta-de-servicos",
    descricao:
      "A carta de servicos e as solicitacoes do requerente (V6.2 P3) chegaram com CONFIGURAR_CARTA_DE_SERVICOS, " +
      "SOLICITAR_SERVICO, DECIDIR_SOLICITACAO_DE_SERVICO, REGISTRAR_REPRESENTACAO e a leitura CONSULTAR_MEUS_SERVICOS. " +
      "Esta atualizacao concede configurar a carta, registrar representacao e a leitura a quem ja administra permissoes " +
      "no global. Pedir e decidir sao os lados que a mesa separa: o administrador cria o perfil do requerente e o da " +
      "mesa. Ainda assim o servico recusa a decisao por quem e titular ou representa o titular.",
    derivar: derivarCartaDeServicos,
  },
  {
    versao: 16,
    nome: "guia-de-recolhimento",
    descricao:
      "A guia de recolhimento dos encargos (V7 M1) chegou com GERIR_GUIA_DE_RECOLHIMENTO: registrar a guia real fornecida " +
      "pelo emissor (com o arquivo), baixa-la por um pagamento que ja existe e cancela-la. Quem administra permissoes no " +
      "global a recebe. Registrar guia nao paga nada e o sistema nao gera codigo de pagamento.",
    derivar: derivarGuiaDeRecolhimento,
  },
  {
    versao: 17,
    nome: "ouvidoria-e-avaliacao",
    descricao:
      "A ouvidoria sem conta e a avaliacao dos servicos (V7 M1) chegaram com TRIAR_MANIFESTACAO_DE_OUVIDORIA e " +
      "MODERAR_AVALIACAO_DE_SERVICO. Quem administra permissoes no global recebe as duas, como na instalacao limpa. " +
      "Triar e responder continuam exigindo lotacao no setor em que a manifestacao sigilosa esta.",
    derivar: derivarOuvidoriaEAvaliacao,
  },
  {
    versao: 18,
    nome: "contrato-acompanhado",
    descricao:
      "O contrato acompanhado (V7 M2.1) chegou com DESIGNAR_NO_CONTRATO, CADASTRAR_ITEM_DO_CONTRATO, " +
      "PROGRAMAR_FISCALIZACAO_DO_CONTRATO, REGISTRAR_OCORRENCIA_DE_FISCALIZACAO e RESOLVER_OCORRENCIA_DE_FISCALIZACAO. " +
      "Quem administra permissoes no global recebe designar e cadastrar item. Os atos de gestor e fiscal exigem, alem " +
      "da acao, a designacao vigente no contrato — o administrador cria os perfis de gestor e de fiscal.",
    derivar: derivarContratoAcompanhado,
  },
  {
    versao: 19,
    nome: "ponte-contratual",
    descricao:
      "A ponte contratual-financeira (V7 M2) chegou com DEFINIR_ADMINISTRADOR_DA_FISCALIZACAO e CONFIGURAR_EXECUCAO_DO_CONTRATO. " +
      "Quem administra permissoes no global recebe as duas. Ter a acao de definir nao da o alcance: a visao de fiscalizacao " +
      "de um contrato continua exigindo designacao vigente nele ou uma definicao vigente de administrador, com ato. " +
      "EMITIR_ORDEM_DE_SERVICO_DO_CONTRATO, REGISTRAR_RECEBIMENTO_PROVISORIO e REGISTRAR_RECEBIMENTO_DEFINITIVO nao sao " +
      "derivadas: sao atos de gestor, fiscal e recebedor designados, e o administrador as concede aos perfis desses papeis.",
    derivar: derivarAdministracaoDaFiscalizacao,
  },
  {
    versao: 20,
    nome: "planilha-da-obra",
    descricao:
      "A planilha orcamentaria da obra (V7 M2) chegou com GERIR_PLANILHA_DA_OBRA: importar com previa, confirmar a versao e " +
      "vincular servicos da planilha a itens do contrato. Quem administra permissoes no global recebe a acao, e a concede " +
      "aos perfis da engenharia e da fiscalizacao de obras.",
    derivar: derivarPlanilhaDaObra,
  },
  {
    versao: 21,
    nome: "tipos-de-ocorrencia",
    descricao:
      "A agenda da fiscalizacao e os formularios versionados (V7 M2 U8) chegaram com GERIR_TIPOS_DE_OCORRENCIA: cadastrar " +
      "tipos de ocorrencia do ente, publicar versoes do formulario e ativar ou desativar tipos. Quem administra permissoes " +
      "no global recebe a acao e a concede aos perfis da fiscalizacao. Reagendar, cancelar e registrar a realizacao NAO sao " +
      "acoes novas: sao os mesmos atos de programar (gestor designado) e de registrar ocorrencia (fiscal designado).",
    derivar: derivarTiposDeOcorrencia,
  },
  {
    versao: 22,
    nome: "cadastro-imobiliario",
    descricao:
      "A primeira unidade tributaria (V7 B1) chegou com GERIR_CADASTRO_IMOBILIARIO (cadastrar imoveis, publicar versoes do " +
      "cadastro e vincular pessoas) e GERIR_PARAMETROS_TRIBUTARIOS (publicar a tabela do tributo: formula do ente, " +
      "fundamento e valores por vigencia). Quem administra permissoes no global recebe as duas e as concede aos perfis do " +
      "cadastro imobiliario e da administracao tributaria. SIMULAR nao e acao: e leitura, e nao cria fato nem divida.",
    derivar: derivarTributario,
  },
  {
    versao: 23,
    nome: "estorno-de-recebimento",
    descricao:
      "O estorno do recebimento definitivo (V9 N4) chegou com ESTORNAR_RECEBIMENTO_DEFINITIVO. Quem administra " +
      "permissoes no global recebe a acao e a concede aos perfis que respondem pelo recebimento definitivo. ⚠️ Ela NAO " +
      "e derivada para quem ja tem REGISTRAR_RECEBIMENTO_DEFINITIVO: receber e ordinario, desfazer um termo assinado e " +
      "excepcional. O ato continua exigindo designacao vigente de RECEBEDOR_DEFINITIVO no contrato, e e recusado " +
      "enquanto houver liquidacao viva lastreada pelo recebimento.",
    derivar: derivarEstornoDeRecebimento,
  },
  {
    versao: 24,
    nome: "rito-do-acesso-a-informacao",
    descricao:
      "O rito do acesso a informacao (V11 V5.3) chegou com cinco acoes: protocolar, distribuir, prorrogar, responder " +
      "e decidir o recurso. Quem administra permissoes no global as recebe e as distribui pelos setores. ⚠️ Elas NAO " +
      "sao derivadas de PUBLICAR_CONFIGURACAO_DO_ACESSO_A_INFORMACAO nem de CONSULTAR_PROTOCOLO: configurar o prazo e " +
      "operar o pedido sao atos de pessoas diferentes, e quem LE o protocolo nao passa a poder prorrogar a data " +
      "prometida a quem tem direito subjetivo. Receber o pedido no setor continua sendo RECEBER_PROCESSO, que ja " +
      "existe.",
    derivar: derivarRitoDoAcessoAInformacao,
  },
  {
    versao: 25,
    nome: "declaracao-de-disponibilidade-de-recurso-novo",
    descricao:
      "A disponibilidade de recurso novo (superavit financeiro, excesso de arrecadacao, operacao de credito) passou " +
      "a ter tela e servico (V11 V7.3) — antes ela so entrava por seed. A acao e PROPRIA e vai a quem administra " +
      "permissoes no global, que a distribui. ⚠️ Ela NAO deriva de CRIAR_DECRETO_DE_CREDITO: este numero e o que " +
      "AUTORIZA a despesa, e dar os dois a mesma pessoa faria o guard do credito conferir um lastro que ela mesma " +
      "declara.",
    derivar: derivarDeclaracaoDeDisponibilidade,
  },
  {
    versao: 26,
    nome: "agenda-do-guiche",
    descricao:
      "O atendimento presencial ganhou agenda (TR 5.39.92). Quem ja CONFIGURA a carta de servicos " +
      "passa a poder ORGANIZAR o guiche (unidade, guiche, oferta de horarios, feriado) no mesmo " +
      "escopo; quem ja protocola em nome de quem chega (SOLICITAR_SERVICO) passa a poder MARCAR e " +
      "remarcar. CONFIRMAR e REGISTRAR o atendimento NAO sao derivadas: sao atos de quem esta no " +
      "guiche no dia, e quem organiza concede nomeando a pessoa.",
    derivar: derivarAgendaDoGuiche,
  },
  {
    versao: 27,
    nome: "entidade-contabil-e-titularidade-da-receita",
    descricao:
      "A entidade contabil ganhou cadastro, e a arrecadacao passou a carimbar de QUEM e a receita que entrou " +
      "(V11 V9). Tres acoes: CADASTRAR_ENTIDADE_CONTABIL, DECLARAR_TITULAR_DA_CONTA_BANCARIA e " +
      "ATRIBUIR_ENTIDADE_A_ARRECADACAO. ⚠️ NENHUMA DELAS DERIVA DE PODER EXISTENTE, e a que mais tentou foi " +
      "recusada: ATRIBUIR_ENTIDADE_A_ARRECADACAO parece o espelho de ATRIBUIR_CONTA_A_ARRECADACAO — mesma tela, " +
      "mesmo operador, mesma disciplina de conferir contra um fato. Mas os dois atos decidem coisas diferentes: " +
      "dizer em QUE CONTA o dinheiro entrou e dizer de QUEM ele e. Quem recebeu o primeiro nao recebeu, por isso, " +
      "o poder de declarar titularidade de receita — e titularidade e o que separa o caixa de uma autarquia do " +
      "caixa da prefeitura. As tres vao a quem administra permissoes no global, que as distribui nomeando a pessoa.",
    derivar: derivarEntidadeContabil,
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
