import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { z } from "zod";
import { ACAO_DO_SERVICO, TODAS_AS_ACOES, type AcaoDoSistema } from "./acoes.js";
import { autorizar } from "./autorizacao.js";

/**
 * M16 — OS PERFIS: criar o crachá, e mudar o que ele abre (TR 4.56 · 6.4/6.5).
 *
 * ═══ ⚠️ O DEFEITO QUE ISTO EXISTE PARA CORRIGIR, E ELE FOI MEDIDO ═══
 * O ENT06 mediu, no banco de desenvolvimento: o censo tinha 223 ações e o perfil de
 * administrador concedia 185. As 38 de diferença eram TODAS do ENT05 — um lote inteiro de
 * funcionalidade entregue e **inalcançável**, porque o molde esconde o formulário de quem
 * não tem a ação (e faz certo: oferecer e recusar depois ensina que o sistema é instável).
 *
 * O `bootstrap-usuario` deriva as permissões do censo, então nasce correto — mas é ato de
 * INSTALAÇÃO e recusa rodar em banco povoado, de propósito. O que faltava era o outro lado:
 * **não existia caso de uso que concedesse uma AÇÃO a um PERFIL.** `concederPerfil` concede
 * o PERFIL a um USUÁRIO, que é outra coisa. Os únicos escritores de `PermissaoDePerfil`
 * eram o bootstrap e um teste — e uma instalação que já existisse não tinha caminho nenhum.
 *
 * ═══ ⚠️ POR QUE NÃO É UM SCRIPT, E POR QUE NÃO TEM "CONCEDER TODAS" ═══
 * `scripts/conceder-acoes-ao-perfil.ts` resolve o caso do operador com acesso ao shell, e
 * continua valendo para a atualização de versão. O que ele NÃO faz é o que o TR 4.56 pede:
 * ato administrativo com autor responsável, registro de operação e tela. Um administrador
 * municipal não tem terminal.
 *
 * E aqui, como lá, **cada ação é escolhida uma a uma**. Um "conceder todas" transformaria
 * esta tela na chave-mestra com cara de rotina: apontá-la para um perfil limitado o tornaria
 * onipotente em um clique, e a segregação do 6.4 morreria por conveniência de interface.
 *
 * ═══ SEM UNIDADE GESTORA NO ATO, COM UNIDADE GESTORA NA CONCESSÃO ═══
 * Administrar perfis é ato do ENTE — como o travamento, só a permissão GLOBAL autoriza (ver
 * `autorizacao.ts`). Mas a permissão CONCEDIDA pode ter recorte: `unidadeOrcId` nulo vale em
 * qualquer unidade; com unidade, vale só naquela (TR 6.5).
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

const zAtor = z.string().min(1);
const zNomeDePerfil = z
  .string()
  .trim()
  .min(1, "O nome do perfil é obrigatório")
  .max(60, "O nome do perfil tem no máximo 60 caracteres");

/**
 * ⚠️ A AÇÃO QUE REABRE TODAS AS OUTRAS. Ela é citada aqui como constante, e não pelo
 * `ACAO_DO_SERVICO` — o grep-teste do censo (t6b) trata a ação de OUTRO serviço dentro deste
 * corpo como cópia mal-feita, e ele está certo em tratar. O que este serviço COBRA é a sua
 * própria; o que a constante nomeia é o que ele PROTEGE.
 */
const A_CHAVE_QUE_REABRE: AcaoDoSistema = "CONCEDER_ACAO_A_PERFIL";

/**
 * A ação existe no censo? — a pergunta que impede conceder poder sobre o que não existe.
 *
 * ⚠️ ESTOURA COM O NOME, e não devolve `false`. Uma ação inventada gravada em
 * `PermissaoDePerfil` é exatamente a "permissão concedida fora do censo" que o detector de
 * deriva acusa do outro lado: ela não aparece em tela nenhuma, não tem serviço, e fica no
 * banco parecendo poder.
 */
function exigirAcaoDoCenso(nome: string): AcaoDoSistema {
  const achada = TODAS_AS_ACOES.find((a) => a === nome);
  if (achada === undefined) {
    throw new Error(
      `AÇÃO INEXISTENTE: "${nome}" não está no censo do sistema. Conceder permissão para ` +
        `algo que o sistema não faz é uma promessa vazia — e some do rol na próxima ` +
        `limpeza, deixando no banco uma concessão que ninguém consegue auditar. Nada foi gravado.`
    );
  }
  return achada;
}

async function exigirPerfil(prisma: Tx, perfilId: string): Promise<{ readonly nome: string }> {
  const p = await prisma.perfil.findUnique({ where: { id: perfilId }, select: { nome: true } });
  if (p === null) {
    throw new Error(`PERFIL INEXISTENTE: não há perfil com id "${perfilId}". Nada foi gravado.`);
  }
  return p;
}

/** A UG existe? Só se foi informada — nulo é a concessão GLOBAL, e é legítima. */
async function exigirUnidadeSeInformada(prisma: Tx, unidadeOrcId: string | null): Promise<void> {
  if (unidadeOrcId === null) return;
  const ug = await prisma.unidadeOrcamentaria.findUnique({
    where: { id: unidadeOrcId },
    select: { id: true },
  });
  if (ug === null) {
    throw new Error(
      `UNIDADE GESTORA INEXISTENTE: não há unidade com id "${unidadeOrcId}". Uma permissão ` +
        `presa a uma unidade que não existe não vale em lugar nenhum, e pareceria concedida. ` +
        `Nada foi gravado.`
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CRIAR PERFIL — o crachá nasce VAZIO, e isso é a regra
// ═══════════════════════════════════════════════════════════════════════════

const zCriarPerfilInput = z.object({
  nome: zNomeDePerfil,
  descricao: z.string().trim().min(1, "A descrição do perfil é obrigatória"),
  criadoPor: zAtor,
});
export type CriarPerfilInput = z.input<typeof zCriarPerfilInput>;

/**
 * Cria um perfil SEM permissão nenhuma.
 *
 * ⚠️ E ELE NASCE VAZIO DE PROPÓSITO. A tentação era um parâmetro "copiar de", que pouparia
 * cliques — e entregaria, em um passo, todo o poder de um perfil existente a um perfil novo
 * cujo nome ainda não significa nada para ninguém. Quem cria decide cada ação depois, uma a
 * uma, e cada concessão fica com o nome de quem a fez.
 *
 * Um perfil vazio não é um perfil quebrado: é o padrão do sistema, que nega por omissão.
 */
export async function criarPerfil(
  prisma: PrismaClient,
  input: CriarPerfilInput
): Promise<{ readonly perfilId: string }> {
  const d = zCriarPerfilInput.parse(input);

  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.criarPerfil);

  const ja = await prisma.perfil.findUnique({ where: { nome: d.nome }, select: { id: true } });
  if (ja !== null) {
    throw new Error(
      `PERFIL JÁ EXISTE: já há um perfil chamado "${d.nome}". O nome é como o administrador ` +
        `o encontra na hora de vincular um servidor — dois perfis homônimos com poderes ` +
        `diferentes fariam a escolha virar sorteio. Nada foi gravado.`
    );
  }

  const perfil = await prisma.perfil.create({
    data: { nome: d.nome, descricao: d.descricao, criadoPor: d.criadoPor },
    select: { id: true },
  });
  return { perfilId: perfil.id };
}

// ═══════════════════════════════════════════════════════════════════════════
// CONCEDER / REVOGAR AÇÃO — a concessão é o FATO; a ausência dela é a revogação
// ═══════════════════════════════════════════════════════════════════════════

const zPermissaoInput = z.object({
  perfilId: z.string().min(1),
  acao: z.string().min(1),
  /** Nulo = TODAS as unidades. É concessão explícita, não ausência de recorte. */
  unidadeOrcId: z.string().min(1).nullable().default(null),
  criadoPor: zAtor,
});
export type PermissaoDePerfilInput = z.input<typeof zPermissaoInput>;

/**
 * Concede UMA ação a UM perfil, global ou numa unidade gestora.
 *
 * Conceder o que já está concedido é erro NOMEADO, não silêncio: um "nada" silencioso faria
 * o administrador crer que ampliou um perfil quando escolheu o errado na lista.
 */
export async function concederAcaoAoPerfil(
  prisma: PrismaClient,
  input: PermissaoDePerfilInput
): Promise<{ readonly permissaoId: string }> {
  const d = zPermissaoInput.parse(input);

  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.concederAcaoAoPerfil);

  const acao = exigirAcaoDoCenso(d.acao);
  const perfil = await exigirPerfil(prisma, d.perfilId);
  await exigirUnidadeSeInformada(prisma, d.unidadeOrcId);

  // ⚠️ `findFirst`, E NÃO `findUnique` PELA CHAVE COMPOSTA. A unicidade é
  // (perfil, ação, unidade) com a unidade NULÁVEL, e o Prisma recusa `null` dentro do
  // seletor composto — "Argument `unidadeOrcId` must not be null". Igualdade com nulo se
  // escreve no `where` comum.
  //
  // A garantia continua sendo do BANCO, não desta leitura: o índice único existe, e duas
  // concessões idênticas em corrida estouram nele. Esta consulta serve à MENSAGEM — dizer
  // "já concedida" em vez de deixar subir uma violação de constraint que ninguém entende.
  const ja = await prisma.permissaoDePerfil.findFirst({
    where: { perfilId: d.perfilId, acao, unidadeOrcId: d.unidadeOrcId },
    select: { id: true },
  });
  if (ja !== null) {
    throw new Error(
      `AÇÃO JÁ CONCEDIDA: o perfil "${perfil.nome}" já pode ${acao}` +
        `${d.unidadeOrcId === null ? " em todas as unidades" : " nesta unidade"}. Conceder de ` +
        `novo não faria nada — e um "nada" com aviso de sucesso esconderia o engano de quem ` +
        `escolheu o perfil errado na lista. Nada foi gravado.`
    );
  }

  const criada = await prisma.permissaoDePerfil.create({
    data: {
      perfilId: d.perfilId,
      acao,
      unidadeOrcId: d.unidadeOrcId,
      criadoPor: d.criadoPor,
    },
    select: { id: true },
  });
  return { permissaoId: criada.id };
}

/**
 * Revoga UMA ação de UM perfil.
 *
 * ⚠️ DELETE, não coluna de revogação — a mesma doutrina de `revogarPerfil`: a concessão é o
 * fato, e a ausência dela é a revogação. O `criadoPor` da linha apagada já foi auditado no
 * `RegistroDeOperacao` quando ela nasceu, e a revogação também é registrada como operação.
 *
 * ⚠️ E ELE RECUSA A ÚLTIMA CHAVE. Revogar a última concessão de `CONCEDER_ACAO_A_PERFIL` do
 * sistema trancaria a porta por dentro com a chave do lado de fora: ninguém mais poderia
 * conceder nada a ninguém, e a única saída seria o `bootstrap`, que recusa rodar em banco
 * povoado — corretamente. É a mesma recusa da auto-inativação, pela mesma razão.
 */
export async function revogarAcaoDoPerfil(
  prisma: PrismaClient,
  input: PermissaoDePerfilInput
): Promise<void> {
  const d = zPermissaoInput.parse(input);

  await autorizar(prisma, d.criadoPor, ACAO_DO_SERVICO.revogarAcaoDoPerfil);

  const acao = exigirAcaoDoCenso(d.acao);
  const perfil = await exigirPerfil(prisma, d.perfilId);

  // `findFirst` pela mesma razão da concessão: a unidade é nulável, e nulo não entra no
  // seletor composto. A linha continua única no banco.
  const permissao = await prisma.permissaoDePerfil.findFirst({
    where: { perfilId: d.perfilId, acao, unidadeOrcId: d.unidadeOrcId },
    select: { id: true },
  });
  if (permissao === null) {
    throw new Error(
      `AÇÃO NÃO CONCEDIDA: o perfil "${perfil.nome}" não tem ${acao}` +
        `${d.unidadeOrcId === null ? " em todas as unidades" : " nesta unidade"} — não há o ` +
        `que revogar. Revogar "com sucesso" o que não existe faria o administrador crer que ` +
        `tirou um poder que o perfil nunca teve. Nada foi gravado.`
    );
  }

  if (acao === A_CHAVE_QUE_REABRE) {
    const outras = await prisma.permissaoDePerfil.count({
      where: { acao: A_CHAVE_QUE_REABRE, NOT: { id: permissao.id } },
    });
    if (outras === 0) {
      throw new Error(
        `REVOGAÇÃO RECUSADA — ESTA É A ÚLTIMA CHAVE: "${acao}" está concedida em um único ` +
          `lugar do sistema, e é ela que permite conceder qualquer outra ação a qualquer ` +
          `perfil. Revogá-la deixaria o ente sem ninguém capaz de distribuir poder, e o ` +
          `bootstrap de instalação recusa rodar em banco já povoado — a porta trancada por ` +
          `dentro, com a chave do lado de fora. Conceda-a a outro perfil ANTES de revogar ` +
          `esta. Nada foi gravado.`
      );
    }
  }

  await prisma.permissaoDePerfil.delete({ where: { id: permissao.id } });
}
