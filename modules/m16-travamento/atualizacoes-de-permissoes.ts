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
