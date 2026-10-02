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
  // V11 V9.5 — recortar quem entra no cálculo. Ver o docblock em `acoes.ts`: quem recebe apenas
  // `CALCULAR_FOLHA` continua podendo calcular TODOS, que é o padrão conservador.
  "SELECIONAR_VINCULOS_DA_FOLHA",
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

/**
 * V11 V9.1 — o parâmetro do 13º. Quem administra permissões no global a recebe, e ninguém mais:
 * ver o motivo do detector na descrição da v28.
 */
export const ACOES_DO_PARAMETRO_DO_DECIMO_TERCEIRO: readonly AcaoDoSistema[] = ["CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO"];

export function derivarParametroDoDecimoTerceiro(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    if (perfil.permissoes.some((p) => p.acao === "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO" && p.unidadeOrcId === null)) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO", unidadeOrcId: null });
  }
  return saida;
}

/**
 * V12 — RECORTAR QUEM ENTRA NO CÁLCULO DA FOLHA (`SELECIONAR_VINCULOS_DA_FOLHA`).
 *
 * ⚠️ ELA NÃO DERIVA DE `CALCULAR_FOLHA`, E DERIVAR SERIA DESFAZER A SEPARAÇÃO NO ATO DE INSTALÁ-LA.
 * O motor cobra as duas justamente porque são autoridades diferentes: calcular decide QUANDO o ente
 * paga; recortar decide QUEM fica de fora. Se todo perfil que calcula recebesse o recorte na
 * atualização, o ente acordaria com a segregação já anulada — e a atualização teria produzido
 * exatamente o estado que o desenho existe para evitar.
 *
 * ⚠️ E O QUE FECHA A QUESTÃO É O DETECTOR: um recorte errado NÃO TEM NENHUM. A folha parcial fecha,
 * o total bate, o empenho bate, a liquidação bate, e quem ficou de fora só descobre no dia do
 * pagamento. Concessão sem detector é concessão DELIBERADA: vai só a quem administra permissões no
 * global, que a distribui nomeando a pessoa.
 */
export function derivarSelecaoNoCalculoDaFolha(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    if (perfil.permissoes.some((p) => p.acao === "SELECIONAR_VINCULOS_DA_FOLHA" && p.unidadeOrcId === null)) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "SELECIONAR_VINCULOS_DA_FOLHA", unidadeOrcId: null });
  }
  return saida;
}

/**
 * V13 — O PARÂMETRO DO ADIANTAMENTO SALARIAL (`CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL`).
 *
 * ⚠️ ELA NÃO DERIVA DE `CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO`, e a tentação de fazê-la derivar
 * é maior aqui do que foi na v28: são dois parâmetros do MESMO módulo, no mesmo menu, com a mesma
 * forma de tela e o mesmo tipo de ato. Derivar pareceria só "dar o conjunto todo a quem já tem a
 * metade".
 *
 * A diferença é de ORIGEM DO ATO. O critério do avo é anual e sai do ESTATUTO DO SERVIDOR; o
 * percentual do vale é mensal e sai, na maioria dos entes, de DECRETO DO PREFEITO. Quem recebeu o
 * poder de transcrever o estatuto não recebeu o de transcrever o decreto do mês.
 *
 * ⚠️ E O DETECTOR CONTINUA NÃO EXISTINDO: percentual errado faz a folha de vale fechar, o empenho
 * fechar, a mensal abater exatamente aquele valor e o total bater dos dois lados. Nenhuma etapa
 * adiante acusa — quem percebe é o servidor, no contracheque. Concessão sem detector é concessão
 * DELIBERADA: vai só a quem administra permissões no global, que a distribui nomeando a pessoa.
 */
export const ACOES_DO_PARAMETRO_DO_ADIANTAMENTO_SALARIAL: readonly AcaoDoSistema[] = ["CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL"];

export function derivarParametroDoAdiantamentoSalarial(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some((p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null);
    if (!administra) continue;
    if (perfil.permissoes.some((p) => p.acao === "CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL" && p.unidadeOrcId === null)) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL", unidadeOrcId: null });
  }
  return saida;
}

/**
 * V15 — quem parametriza as CONTAS DAS OPERAÇÕES DE RESTOS A PAGAR.
 *
 * ⚠️ NÃO SE DERIVA DE `PARAMETRIZAR_ROTEIRO_ORCAMENTARIO`, e isso é coerência com o motivo pelo
 * qual a ação é PRÓPRIA: o roteiro orçamentário decide contas das classes 5 e 6, a execução do
 * crédito do exercício corrente; este decide contra que PASSIVO uma obrigação de exercício
 * ENCERRADO se baixa e que perna de disponibilidade por destinação ela move. Derivar uma da outra
 * daria a quem parametriza a dotação do ano corrente o poder sobre o tratamento do que sobrou do
 * ano que fechou — exatamente a junção que a ação separada existe para evitar.
 *
 * ⚠️ E O ERRO AQUI NÃO TEM DETECTOR ADIANTE: uma conta de passivo errada faz o pagamento do resto
 * fechar, o balanço fechar e o saldo do resto zerar. O que sobra é saldo eterno numa conta e
 * negativo em outra, e as duas equações continuam batendo. Por isso vai só a quem administra
 * permissões no global, que a distribui nomeando a pessoa — mesma escolha da v30.
 */
export function derivarRoteiroDeRestosAPagar(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    if (
      perfil.permissoes.some(
        (p) => p.acao === "PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR" && p.unidadeOrcId === null
      )
    ) {
      continue;
    }
    saida.push({
      perfilId: perfil.id,
      perfilNome: perfil.nome,
      acao: "PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR",
      unidadeOrcId: null,
    });
  }
  return saida;
}

/**
 * V16/C30 — a ALTERAÇÃO AUTORIZADA da distribuição da receita entre fontes.
 *
 * ⚠️ VAI SÓ A QUEM ADMINISTRA PERMISSÕES NO GLOBAL, que a distribui nomeando a pessoa — a mesma
 * escolha da v30 e da v31, e pelo mesmo motivo: **o erro não tem detector adiante**.
 *
 * Mandar receita para uma fonte que a LOA não prevê para aquela natureza é mudar a destinação
 * decidida no orçamento. O lançamento fecha, o balanço fecha, o total do ente fecha — e o que
 * sobra é dinheiro carimbado para educação disponível para outra coisa na DDR, que é justamente o
 * número que autoriza empenhar. Sai no RGF Anexo 5 e na remessa, meses depois.
 *
 * ⚠️ E ELA NÃO ACOMPANHA `REGISTRAR_ARRECADACAO`. Quem opera a arrecadação registra a guia e a
 * reparte entre as fontes que a LOA prevê — isso não pede crachá novo. O crachá é para SAIR da
 * previsão. Juntar as duas daria a todo operador de guichê a chave da destinação de recursos.
 */
export function derivarDistribuicaoForaDaPrevisao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    if (
      perfil.permissoes.some(
        (p) => p.acao === "DISTRIBUIR_RECEITA_FORA_DA_PREVISAO" && p.unidadeOrcId === null
      )
    ) {
      continue;
    }
    saida.push({
      perfilId: perfil.id,
      perfilNome: perfil.nome,
      acao: "DISTRIBUIR_RECEITA_FORA_DA_PREVISAO",
      unidadeOrcId: null,
    });
  }
  return saida;
}

/**
 * V16 (TR 5.10.2.6) — o ROL DE FONTES da conta bancária, agora com cadastro.
 *
 * ⚠️ VAI SÓ A QUEM ADMINISTRA PERMISSÕES NO GLOBAL — a escolha das v30, v31 e v32, e aqui pela
 * razão mais direta de todas: o rol é o que o guard do movimento consulta. Quem o edita decide se
 * recurso vinculado pode entrar numa conta, e um rol largo faz o guard aplaudir dinheiro carimbado
 * no lugar errado. O erro não aparece no ato: aparece no controle de destinação, meses depois.
 */
export function derivarRolDeFontesDaConta(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    if (
      perfil.permissoes.some(
        (p) => p.acao === "GERIR_ROL_DE_FONTES_DA_CONTA" && p.unidadeOrcId === null
      )
    ) {
      continue;
    }
    saida.push({
      perfilId: perfil.id,
      perfilNome: perfil.nome,
      acao: "GERIR_ROL_DE_FONTES_DA_CONTA",
      unidadeOrcId: null,
    });
  }
  return saida;
}

/**
 * V18 (C13 · TR 5.9.1.30 · 5.9.2.18) — o ATO que ALTERA o PPA ou a LDO já aprovados.
 *
 * ⚠️ VAI SÓ A QUEM ADMINISTRA PERMISSÕES NO GLOBAL, e não a quem já tem CADASTRAR_PPA ou
 * CADASTRAR_LDO — que era a derivação "óbvia" e está errada: digitar a peça que o Executivo
 * monta é trabalho do setor de planejamento; registrar a lei que altera a peça APROVADA
 * pressupõe ato publicado, e é a mesma distinção que separa `criarFicha` de
 * `CRIAR_DECRETO_DE_CREDITO` no M03. Derivar daquela daria a alteração da peça a quem
 * apenas a transcreveu.
 *
 * ⚠️ E O ERRO NÃO TEM DETECTOR ADIANTE: o comparativo fecha, o total da peça fecha e o Anexo
 * de Metas Fiscais fecha — porque o valor vigente é derivado e soma o que houver. O que sobra
 * é uma meta fiscal alterada sem lei, e quem confronta o resultado apurado contra ela é o
 * RREO Anexo 6, assinado pelo Prefeito.
 */
export function derivarAlteracaoDoPlanejamento(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    if (
      perfil.permissoes.some(
        (p) => p.acao === "ALTERAR_PLANEJAMENTO" && p.unidadeOrcId === null
      )
    ) {
      continue;
    }
    saida.push({
      perfilId: perfil.id,
      perfilNome: perfil.nome,
      acao: "ALTERAR_PLANEJAMENTO",
      unidadeOrcId: null,
    });
  }
  return saida;
}

/**
 * V21 — os DADOS DA UNIDADE para a prestação de contas (SAGRES §4.1). Só a quem administra
 * permissões no global, o mesmo caminho das ações novas da V19, V20 e da realocação.
 */
export function derivarDadosDaUnidade(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    const jaTem = perfil.permissoes.some(
      (p) => p.unidadeOrcId === null && p.acao === "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA"
    );
    if (jaTem) continue;
    saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA", unidadeOrcId: null });
  }
  return saida;
}

/**
 * V21 — a REALOCAÇÃO de dotação por lei específica (CF art. 167, VI): registrar e anular.
 *
 * ⚠️ NÃO DERIVA DE EXECUTAR_CREDITO. Quem abre crédito adicional não passa, por isso, a poder mover
 * dotação entre órgãos: são atos de natureza e fundamento diferentes. Vai só a quem administra
 * permissões no global — o mesmo caminho das ações novas da V19 e da V20 —, que as distribui
 * nomeando a pessoa.
 */
export const ACOES_DA_REALOCACAO: readonly AcaoDoSistema[] = [
  "REGISTRAR_REALOCACAO_DE_DOTACAO",
  "ANULAR_REALOCACAO_DE_DOTACAO",
];

export function derivarRealocacaoDeDotacao(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    const jaTem = new Set(
      perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao)
    );
    for (const acao of ACOES_DA_REALOCACAO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/**
 * V20 — a RÉGUA da virada dos controles orçamentários.
 *
 * ⚠️ UMA AÇÃO SÓ, e ela é a que faltava. `ENCERRAR_CONTROLES_ORCAMENTARIOS` e
 * `ESTORNAR_ENCERRAMENTO_CONTROLES` existem desde a V15 e já chegaram ao ente pelo bootstrap; o que
 * nunca existiu foi quem pudesse ESCREVER a tabela-parâmetro de que as duas dependem. Sem esta ação,
 * a virada continua recusando com razão — "conta de controle sem destino" — e sem caminho para
 * resolver.
 */
export const ACOES_DA_VIRADA_DOS_CONTROLES: readonly AcaoDoSistema[] = [
  "PARAMETRIZAR_VIRADA_DOS_CONTROLES",
];

export function derivarViradaDosControles(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    const jaTem = new Set(
      perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao)
    );
    for (const acao of ACOES_DA_VIRADA_DOS_CONTROLES) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
  }
  return saida;
}

/**
 * V19/C05 — o CUSTO POR CENTRO: a régua do rateio e a apropriação.
 *
 * ⚠️ AS DUAS AÇÕES VÃO JUNTAS NESTA ATUALIZAÇÃO, mas elas NÃO são a mesma ação: publicar o critério
 * é ato normativo (a portaria que diz que 60 % do aluguel é da Educação) e apropriar é ato de
 * execução, mensal. Ir juntas aqui significa apenas que quem administra permissões no global
 * recebe as duas para distribuir — e é ele que decide se a mesma pessoa fica com as duas.
 */
export const ACOES_DO_CUSTO_POR_CENTRO: readonly AcaoDoSistema[] = [
  "PARAMETRIZAR_RATEIO_DE_CUSTO",
  "APROPRIAR_CUSTO",
];

export function derivarCustoPorCentro(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    const administra = perfil.permissoes.some(
      (p) => p.acao === "CONCEDER_ACAO_A_PERFIL" && p.unidadeOrcId === null
    );
    if (!administra) continue;
    const jaTem = new Set(
      perfil.permissoes.filter((p) => p.unidadeOrcId === null).map((p) => p.acao)
    );
    for (const acao of ACOES_DO_CUSTO_POR_CENTRO) {
      if (jaTem.has(acao)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: null });
    }
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

/**
 * V22 — AS DUAS AÇÕES DA SOLICITAÇÃO DE EMPENHO.
 *
 * ⚠️ A DERIVAÇÃO É DESIGUAL DE PROPÓSITO, e cada lado segue o critério do detector:
 *
 *   · SOLICITAR_EMPENHO vai a quem já EMPENHA, no MESMO escopo. Pedir a despesa não compromete
 *     nada: uma solicitação indevida só vira empenho se alguém a autorizar E alguém com EMPENHAR a
 *     emitir. O erro tem detector adiante — a própria autorização.
 *   · AUTORIZAR_SOLICITACAO_DE_EMPENHO vai a quem já AUTORIZA ORDEM DE PAGAMENTO, no MESMO escopo.
 *     É a mesma autoridade (o ordenador de despesa consente com o gasto), um passo antes na cadeia.
 *     Derivá-la de EMPENHAR entregaria o consentimento a quem executa — exatamente a mistura que a
 *     solicitação existe para separar.
 *
 * ⚠️ O ESCOPO É O DA AÇÃO DE ORIGEM: quem empenha só na Saúde passa a solicitar só na Saúde. E a
 * segregação (quem solicita não decide a própria solicitação) é cobrada no caso de uso, mesmo que
 * um perfil acabe com as duas.
 */
export function derivarSolicitacaoDeEmpenho(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const derivacoes = [
    { de: "EMPENHAR", para: "SOLICITAR_EMPENHO" },
    { de: "AUTORIZAR_ORDEM_PAGAMENTO", para: "AUTORIZAR_SOLICITACAO_DE_EMPENHO" },
  ] as const;
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    for (const { de, para } of derivacoes) {
      for (const origem of perfil.permissoes.filter((p) => p.acao === de)) {
        // IDEMPOTENTE POR CONSTRUÇÃO: só deriva o que o perfil NÃO tem naquele escopo.
        if (perfil.permissoes.some((p) => p.acao === para && p.unidadeOrcId === origem.unidadeOrcId)) continue;
        if (saida.some((c) => c.perfilId === perfil.id && c.acao === para && c.unidadeOrcId === origem.unidadeOrcId)) continue;
        saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: para, unidadeOrcId: origem.unidadeOrcId });
      }
    }
  }
  return saida;
}

/**
 * V22 — A LEI ORÇAMENTÁRIA ANUAL (projeto, aprovação e anexos) chegou com CADASTRAR_LOA.
 *
 * Vai a quem já CADASTRA A LDO, no MESMO escopo: é o setor que digita as peças do planejamento que
 * o Executivo envia ao Legislativo. A LDO orienta a LOA; quem registra uma registra a outra.
 * Idempotente por construção: só deriva o que o perfil ainda não tem naquele escopo.
 */
export function derivarLeiOrcamentariaAnual(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    for (const origem of perfil.permissoes.filter((p) => p.acao === "CADASTRAR_LDO")) {
      if (perfil.permissoes.some((p) => p.acao === "CADASTRAR_LOA" && p.unidadeOrcId === origem.unidadeOrcId)) continue;
      if (saida.some((c) => c.perfilId === perfil.id && c.unidadeOrcId === origem.unidadeOrcId)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "CADASTRAR_LOA", unidadeOrcId: origem.unidadeOrcId });
    }
  }
  return saida;
}

/**
 * V23 — O PLANO DE CONTAS DO TRIBUNAL chegou com IMPORTAR_PLANO_DO_TRIBUNAL.
 *
 * Vai a quem já SUBMETE a prestação de contas ao Tribunal (SUBMETER_CAPTURA), no mesmo escopo: é quem
 * responde pelo que o pacote diz, e a planilha decide o que ele diz sobre a receita e a despesa extra.
 * Idempotente por construção.
 */
export function derivarPlanoDoTribunal(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    for (const origem of perfil.permissoes.filter((p) => p.acao === "SUBMETER_CAPTURA")) {
      if (perfil.permissoes.some((p) => p.acao === "IMPORTAR_PLANO_DO_TRIBUNAL" && p.unidadeOrcId === origem.unidadeOrcId)) continue;
      if (saida.some((c) => c.perfilId === perfil.id && c.unidadeOrcId === origem.unidadeOrcId)) continue;
      saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao: "IMPORTAR_PLANO_DO_TRIBUNAL", unidadeOrcId: origem.unidadeOrcId });
    }
  }
  return saida;
}

/**
 * V27 — FROTA E FARMÁCIA PÚBLICA (SAGRES §4.50 a §4.57) chegaram com quatro ações.
 *
 * CADASTRAR_FROTA e REGISTRAR_ABASTECIMENTO vão a quem já CADASTRA BEM (o setor do patrimônio guarda o veículo e a
 * máquina); CADASTRAR_FARMACIA e INFORMAR_ESTOQUE_DA_FARMACIA vão a quem já registra entrada no ALMOXARIFADO (o
 * setor que responde por estoque). Só a partir da permissão GLOBAL: os atos da frota e da farmácia são do ente (o
 * serviço cobra a permissão global), e uma concessão por unidade daria um crachá que nunca abre nada. Idempotente.
 */
export function derivarFrotaEFarmacia(
  perfis: readonly PerfilComPermissoes[],
  _areaDaAcao: AreaDaAcao
): readonly ConcessaoDerivada[] {
  const regras: readonly { readonly origem: AcaoDoSistema; readonly novas: readonly AcaoDoSistema[] }[] = [
    { origem: "CADASTRAR_BEM", novas: ["CADASTRAR_FROTA", "REGISTRAR_ABASTECIMENTO"] },
    { origem: "REGISTRAR_ENTRADA_ALMOXARIFADO", novas: ["CADASTRAR_FARMACIA", "INFORMAR_ESTOQUE_DA_FARMACIA"] },
  ];
  const saida: ConcessaoDerivada[] = [];
  for (const perfil of perfis) {
    for (const regra of regras) {
      for (const origem of perfil.permissoes.filter((p) => p.acao === regra.origem && p.unidadeOrcId === null)) {
        for (const acao of regra.novas) {
          if (perfil.permissoes.some((p) => p.acao === acao && p.unidadeOrcId === origem.unidadeOrcId)) continue;
          if (saida.some((c) => c.perfilId === perfil.id && c.acao === acao && c.unidadeOrcId === origem.unidadeOrcId)) continue;
          saida.push({ perfilId: perfil.id, perfilNome: perfil.nome, acao, unidadeOrcId: origem.unidadeOrcId });
        }
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
      "O atendimento presencial ganhou agenda. Quem ja CONFIGURA a carta de servicos " +
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
  {
    versao: 28,
    nome: "parametro-do-decimo-terceiro",
    descricao:
      "O 13o em duas parcelas (V11 V9.1) chegou com CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO: por exercicio, " +
      "quantos dias fazem um mes contar um avo, quantos avos tem o ano, o percentual da 1a parcela, se o 13o " +
      "sofre contribuicao e imposto, quais rubricas compoem a base, e o ato que fundamenta tudo isso. " +
      "⚠️ ELA NAO ACOMPANHA CONFIGURAR_TABELAS_DA_FOLHA, e a tentacao de faze-la acompanhar e grande: sao as " +
      "duas telas de 'numero que a folha usa', no mesmo menu, operadas pela mesma pessoa na maioria dos entes. " +
      "A diferenca e de AUTORIDADE. Quem digita a tabela do IRRF transcreve uma portaria federal; quem escreve " +
      "este parametro decide o criterio do MUNICIPIO. " +
      "⚠️ E O QUE FECHA A QUESTAO E O DETECTOR: um erro aqui nao tem nenhum. Se a pessoa errada mudar o criterio " +
      "do avo ou o percentual da 1a parcela, a folha de 13o FECHA, o total bate, o empenho bate, a liquidacao " +
      "bate — e a diferenca so aparece no contracheque de quem foi admitido perto da borda do mes. Nao ha etapa " +
      "adiante que acuse. Concessao sem detector e concessao DELIBERADA: vai so a quem administra permissoes no " +
      "global, que a distribui nomeando a pessoa.",
    derivar: derivarParametroDoDecimoTerceiro,
  },
  {
    versao: 29,
    nome: "selecao-no-calculo-da-folha",
    descricao:
      "Recortar quem entra no calculo da folha virou alcancavel pela tela (V12): o formulario de calcular passou a " +
      "declarar o modo (a folha inteira, ou so as matriculas escritas) e a abrangencia efetiva de cada calculo ficou " +
      "consultavel. O motor ja cobrava SELECIONAR_VINCULOS_DA_FOLHA desde a V11 V9.5, mas NENHUM perfil a tinha — a " +
      "capacidade existia e ninguem alcancava. " +
      "⚠️ ELA NAO DERIVA DE CALCULAR_FOLHA, e derivar seria desfazer a separacao no ato de instala-la: calcular decide " +
      "QUANDO o ente paga, recortar decide QUEM fica de fora. Se todo perfil que calcula recebesse o recorte aqui, o " +
      "ente acordaria com a segregacao ja anulada. " +
      "⚠️ E UM RECORTE ERRADO NAO TEM DETECTOR: a folha parcial fecha, o total bate, o empenho bate, a liquidacao bate, " +
      "e quem ficou de fora so descobre no dia do pagamento. Vai so a quem administra permissoes no global, que a " +
      "distribui nomeando a pessoa.",
    derivar: derivarSelecaoNoCalculoDaFolha,
  },
  {
    versao: 30,
    nome: "parametro-do-adiantamento-salarial",
    descricao:
      "O adiantamento salarial — o vale do mes — chegou como tipo de folha proprio (V13), e com ele a " +
      "acao CONFIGURAR_PARAMETRO_DO_ADIANTAMENTO_SALARIAL: por competencia, o percentual, a base (a remuneracao do " +
      "mes anterior ou a projetada do proprio mes), as duas rubricas, QUAL ESTADO o vale precisa ter alcancado para " +
      "ser abatido na folha mensal, e o ato do ente que fundamenta tudo isso. " +
      "⚠️ ELA NAO ACOMPANHA CONFIGURAR_PARAMETRO_DO_DECIMO_TERCEIRO, e aqui a tentacao e maior que na v28: sao dois " +
      "parametros do mesmo modulo, no mesmo menu, com a mesma forma de tela. A diferenca e de ORIGEM DO ATO — o " +
      "criterio do avo e anual e sai do estatuto do servidor; o percentual do vale e mensal e sai, na maioria dos " +
      "entes, de decreto do prefeito. " +
      "⚠️ E O DETECTOR CONTINUA NAO EXISTINDO: percentual errado faz a folha de vale fechar, o empenho fechar, a " +
      "mensal abater exatamente aquele valor e o total bater dos dois lados. Quem percebe e o servidor. Vai so a " +
      "quem administra permissoes no global, que a distribui nomeando a pessoa.",
    derivar: derivarParametroDoAdiantamentoSalarial,
  },
  {
    versao: 31,
    nome: "roteiro-dos-restos-a-pagar",
    descricao:
      "As operacoes de restos a pagar ficaram OPERAVEIS (V15, C38) e com elas a acao " +
      "PARAMETRIZAR_ROTEIRO_RESTOS_A_PAGAR: em que contas a liquidacao do resto nao processado, o " +
      "pagamento e os dois cancelamentos lancam. O dominio de RP era dos mais maduros do repositorio " +
      "e nenhuma operacao era alcancavel, porque as contas vem por parametro e nao havia de onde " +
      "tirar o parametro. " +
      "⚠️ ELA NAO ACOMPANHA PARAMETRIZAR_ROTEIRO_ORCAMENTARIO: aquela decide as classes 5 e 6, a " +
      "execucao do credito do exercicio corrente; esta decide contra que PASSIVO uma obrigacao de " +
      "exercicio ENCERRADO se baixa. Juntar as duas daria a quem parametriza a dotacao do ano " +
      "corrente o poder sobre o tratamento do que sobrou do ano que fechou. " +
      "⚠️ E O ERRO NAO TEM DETECTOR ADIANTE: conta de passivo errada faz o pagamento fechar, o " +
      "balanco fechar e o saldo do resto zerar — o que sobra e saldo eterno numa conta e negativo " +
      "em outra, com as duas equacoes batendo. Vai so a quem administra permissoes no global, que a " +
      "distribui nomeando a pessoa.",
    derivar: derivarRoteiroDeRestosAPagar,
  },
  {
    versao: 32,
    nome: "distribuicao-da-receita-entre-fontes",
    descricao:
      "A arrecadacao passou a poder ser REPARTIDA entre fontes de recurso (V16, C30): um deposito " +
      "unico — FPM, ICMS partilhado, convenio com contrapartida — entra como UMA guia com uma " +
      "parcela por fonte, e a classe 7 da DDR sai repartida por natureza de fonte. " +
      "Com ela vem a acao DISTRIBUIR_RECEITA_FORA_DA_PREVISAO, exigida SO quando alguma parcela " +
      "cai em fonte que a LOA nao preve para aquela natureza — a 'alteracao autorizada no ato'. " +
      "⚠️ ELA NAO ACOMPANHA REGISTRAR_ARRECADACAO: repartir entre as fontes PREVISTAS e o ato " +
      "normal de quem arrecada; sair da previsao e mudar a destinacao decidida no orcamento. " +
      "⚠️ E O ERRO NAO TEM DETECTOR ADIANTE: o lancamento fecha, o balanco fecha e o total do ente " +
      "fecha — o que sobra e recurso vinculado aparecendo como disponivel na DDR, que e o numero " +
      "que autoriza empenhar. Vai so a quem administra permissoes no global, que a distribui " +
      "nomeando a pessoa.",
    derivar: derivarDistribuicaoForaDaPrevisao,
  },
  {
    versao: 33,
    nome: "rol-de-fontes-da-conta-bancaria",
    descricao:
      "O ROL DE FONTES de cada conta bancaria ganhou cadastro, e com ele a acao " +
      "GERIR_ROL_DE_FONTES_DA_CONTA. O vinculo existia desde 2026-09-10 (a ADR da conta " +
      "multifonte) e nunca teve tela: a pendencia ROL-DE-FONTES-UI estava no catalogo. Enquanto " +
      "cada conta tinha uma fonte so, a ausencia nao impedia nada; a guia REPARTIDA entre fontes " +
      "(C30) a tornou bloqueante, porque um deposito de duas fontes so entra numa conta que " +
      "comporte as duas. " +
      "⚠️ ELA NAO ACOMPANHA DECLARAR_TITULAR_DA_CONTA_BANCARIA: o titular diz de QUEM e a conta; " +
      "o rol diz que RECURSO ela abriga, que e controle de destinacao. " +
      "⚠️ E o rol e o que o GUARD do movimento consulta — um rol largo faz o guard aplaudir " +
      "dinheiro carimbado no lugar errado, e o erro so aparece no controle de destinacao, meses " +
      "depois. Vai so a quem administra permissoes no global.",
    derivar: derivarRolDeFontesDaConta,
  },
  {
    versao: 34,
    nome: "alteracao-do-planejamento",
    descricao:
      "O PPA e a LDO passaram a ter ALTERACAO VERSIONADA (V18, C13): a lei ou o decreto que " +
      "muda a peca aprovada e uma linha, o valor que ela mexeu e um item COM SINAL, a linha " +
      "original nunca muda e o valor vigente e derivado. Com isso vem a acao " +
      "ALTERAR_PLANEJAMENTO, para os dois servicos (registrar o ato, acrescentar item). " +
      "⚠️ ELA NAO ACOMPANHA CADASTRAR_PPA NEM CADASTRAR_LDO, e essa foi a decisao: digitar a " +
      "peca que o Executivo monta e trabalho do setor de planejamento; registrar a lei que " +
      "altera a peca APROVADA pressupoe ato publicado — a mesma distincao que separa criarFicha " +
      "de CRIAR_DECRETO_DE_CREDITO no M03. " +
      "⚠️ E O ERRO NAO TEM DETECTOR ADIANTE: o comparativo fecha, o total da peca fecha e o " +
      "Anexo de Metas Fiscais fecha, porque o vigente e derivado e soma o que houver. O que " +
      "sobra e meta fiscal alterada sem lei — e quem confronta o apurado contra ela e o RREO " +
      "Anexo 6. Vai so a quem administra permissoes no global, que a distribui nomeando a pessoa.",
    derivar: derivarAlteracaoDoPlanejamento,
  },
  {
    versao: 35,
    nome: "custo-por-centro",
    descricao:
      "A despesa liquidada passou a poder ser APROPRIADA a centros de custo (V19, C05): o ente " +
      "publica uma versao do criterio de rateio (com ato de referencia, percentuais que somam 100 " +
      "e um centro declarado para o residuo em centavos) e apropria o custo de uma liquidacao " +
      "aos centros, por competencia propria. Com isso vem DUAS acoes: " +
      "PARAMETRIZAR_RATEIO_DE_CUSTO e APROPRIAR_CUSTO. " +
      "⚠️ ELAS NAO SE FUNDEM NUMA, e essa foi a decisao: publicar a regua e ato NORMATIVO do ente " +
      "(a portaria que diz que 60 % do aluguel e da Educacao) e apropriar e ato de EXECUCAO, " +
      "repetido todo mes pelo contador. Fundir daria a quem lanca o poder de reescrever a regua " +
      "pela qual ele proprio e medido — a mesma segregacao que separa " +
      "PARAMETRIZAR_ROTEIRO_ORCAMENTARIO de EMPENHAR. " +
      "⚠️ E O CENTRO DE CUSTO E O SETOR que ja existe: nenhum cadastro novo, nenhuma acao de " +
      "cadastro nesta atualizacao. " +
      "⚠️ O ERRO NAO TEM DETECTOR ADIANTE: a apropriacao NAO lanca no razao (a despesa foi " +
      "reconhecida na liquidacao), entao um rateio publicado com a regua errada nao desbalanceia " +
      "nada — ele produz um relatorio de custos plausivel e errado, e o unico confronto possivel " +
      "e o total apropriado contra a despesa liquidada. Vai so a quem administra permissoes no " +
      "global, que a distribui nomeando a pessoa.",
    derivar: derivarCustoPorCentro,
  },
  {
    versao: 36,
    nome: "virada-dos-controles",
    descricao:
      "As contas de controle orcamentario (classes 5 e 6) passaram a poder ser CLASSIFICADAS para a " +
      "virada pela tela (V20): cada conta com saldo em 31 de dezembro declara se ENCERRA (o " +
      "orcamento e anual — o credito nao empenhado caduca, art. 167, II da CF) ou se TRANSFERE (o " +
      "controle dos restos a pagar atravessa a virada), com justificativa obrigatoria e autor. Com " +
      "isso vem a acao PARAMETRIZAR_VIRADA_DOS_CONTROLES. " +
      "⚠️ ELA E A QUE FALTAVA, E SO ELA: encerrar e estornar o encerramento dos controles ja eram " +
      "acoes do censo desde a V15, e ja chegavam ao ente pelo bootstrap. O que nunca existiu foi " +
      "quem pudesse ESCREVER a tabela-parametro de que as duas dependem — medido antes de " +
      "construir, `contaNaVirada.create` aparecia em quatro lugares do repositorio e todos eram " +
      "arquivos de TESTE. Em instalacao real a tabela ficava vazia para sempre. " +
      "⚠️ E ELA NAO SE FUNDE COM ENCERRAR_CONTROLES_ORCAMENTARIOS: dizer que a dotacao caduca e ato " +
      "NORMATIVO do ente; enterrar o orcamento e ato de EXECUCAO, feito uma vez por ano. Fundir " +
      "daria a quem executa o poder de reescrever a regua pela qual o proprio encerramento dele e " +
      "medido — a mesma segregacao que separa PARAMETRIZAR_ROTEIRO_ORCAMENTARIO de EMPENHAR. " +
      "⚠️ O ERRO NAO TEM DETECTOR ADIANTE, e o preco dele e alto: sem a classificacao, a dotacao " +
      "inicial e o credito disponivel de um exercicio ATRAVESSAM para o seguinte. O " +
      "beginning_balance da MSC de janeiro de E+1 traz a dotacao de E, e o segundo ano do sistema " +
      "publica a Uniao um orcamento que e a soma de dois. Vai so a quem administra permissoes no " +
      "global, que a distribui nomeando a pessoa.",
    derivar: derivarViradaDosControles,
  },
  {
    versao: 37,
    nome: "realocacao-de-dotacao",
    descricao:
      "O remanejamento, a transposicao e a transferencia de dotacao por lei especifica (Constituicao, " +
      "art. 167, VI) passaram a ser registrados pela tela (V21): um ato com a lei que o autorizou, a " +
      "especie, a justificativa e as pernas — as fichas que cedem e as que recebem, fechando no total " +
      "e em cada fonte. Com isso vem REGISTRAR_REALOCACAO_DE_DOTACAO e ANULAR_REALOCACAO_DE_DOTACAO. " +
      "⚠️ NAO SAO CREDITO ADICIONAL: a realocacao nao traz recurso novo nem consome o limite da LOA, e " +
      "no plano de contas mora em 5.2.2.1.9.02 ALTERACAO DA LEI ORCAMENTARIA. Por isso as acoes nao " +
      "derivam de EXECUTAR_CREDITO — quem abre credito nao passa, por isso, a mover dotacao entre " +
      "orgaos. Vai so a quem administra permissoes no global, que as distribui nomeando a pessoa.",
    derivar: derivarRealocacaoDeDotacao,
  },
  {
    versao: 38,
    nome: "dados-da-unidade-orcamentaria",
    descricao:
      "A natureza juridica da unidade orcamentaria, o secretario responsavel (nome e CPF) e o ato que " +
      "o nomeou passaram a ser declarados pela tela (V21), numa declaracao VERSIONADA — o arquivo de um " +
      "mes passado sai com quem estava no cargo naquele mes. E o que o Tribunal de Contas pede da " +
      "unidade no SAGRES e o modelo nao tinha. Vem com a acao DECLARAR_DADOS_DA_UNIDADE_ORCAMENTARIA, so " +
      "para quem administra permissoes no global, que a distribui nomeando a pessoa.",
    derivar: derivarDadosDaUnidade,
  },
  {
    versao: 39,
    nome: "solicitacao-de-empenho",
    descricao:
      "O empenho passou a poder nascer de uma SOLICITACAO AUTORIZADA (V22): o setor solicita (ficha, " +
      "credor, valor, historico e vinculos propostos), a autoridade autoriza ou rejeita com motivo, e " +
      "o empenho emitido dela confere, na transacao, que a solicitacao esta autorizada, nao foi " +
      "empenhada e casa com o que foi autorizado. Com isso vem DUAS acoes: SOLICITAR_EMPENHO (pedir e " +
      "retirar o pedido) e AUTORIZAR_SOLICITACAO_DE_EMPENHO (autorizar ou rejeitar). " +
      "⚠️ A DERIVACAO E DESIGUAL: quem EMPENHA passa a SOLICITAR no mesmo escopo (pedir nao compromete " +
      "nada — o erro tem detector adiante, a propria autorizacao); quem AUTORIZA ORDEM DE PAGAMENTO " +
      "passa a AUTORIZAR A SOLICITACAO no mesmo escopo (e a mesma autoridade, o ordenador de despesa, " +
      "um passo antes na cadeia). Derivar a autorizacao de EMPENHAR entregaria o consentimento a quem " +
      "executa. E quem solicita nao decide a propria solicitacao — regra do caso de uso.",
    derivar: derivarSolicitacaoDeEmpenho,
  },
  {
    versao: 40,
    nome: "lei-orcamentaria-anual",
    descricao:
      "A Lei Orcamentaria Anual passou a ser cadastrada (V22): o projeto de lei enviado ao Legislativo, " +
      "a lei que o aprovou (numero, sancao, publicacao) e os anexos. Vem com a acao CADASTRAR_LOA, " +
      "concedida a quem ja cadastra a LDO, no mesmo escopo: e o setor que digita as pecas do " +
      "planejamento.",
    derivar: derivarLeiOrcamentariaAnual,
  },
  {
    versao: 41,
    nome: "plano-de-contas-do-tribunal",
    descricao:
      "O plano de contas do Tribunal passou a ser importado (V23): a planilha que diz, conta a conta, quando " +
      "a receita extra aponta a retencao e o recolhimento aponta a receita extra. Vem com a acao " +
      "IMPORTAR_PLANO_DO_TRIBUNAL, concedida a quem ja submete a prestacao de contas ao Tribunal, no mesmo escopo.",
    derivar: derivarPlanoDoTribunal,
  },
  {
    versao: 42,
    nome: "frota-e-farmacia",
    descricao:
      "A frota e a farmacia publica passaram a ser cadastradas (V27) para a prestacao de contas ao Tribunal: veiculos, " +
      "maquinas, situacao e abastecimento; farmacias e o estoque do mes. CADASTRAR_FROTA e REGISTRAR_ABASTECIMENTO vao a " +
      "quem ja cadastra bem; CADASTRAR_FARMACIA e INFORMAR_ESTOQUE_DA_FARMACIA, a quem ja registra entrada no " +
      "almoxarifado. So a partir da permissao global (os atos sao do ente).",
    derivar: derivarFrotaEFarmacia,
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
