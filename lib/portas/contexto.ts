import { cliente } from "./cliente";
import { exigirSessao } from "./sessao";
import type { Identidade } from "../../modules/m16-travamento/autenticacao";

/**
 * PORTA — O CONTEXTO DE TRABALHO: quais EXERCÍCIOS existem e quais UNIDADES GESTORAS o usuário
 * PODE enxergar.
 *
 * ═══ ⚠️ ISTO SUBSTITUI UM MOCK, E O MOCK ERA PERIGOSO ═══
 * Até aqui `lib/ui-context.tsx` servia três UGs constantes (`uo-01001`, `uo-01004`, `uo-01003`) e
 * três exercícios fixos. Duas consequências, e a segunda é a grave:
 *
 *   · os ids não existiam no banco — a URL levava um código que a porta não achava, e a tela
 *     respondia lista vazia sem explicar por quê;
 *   · o seletor mostrava TODAS as unidades a TODO usuário. A segregação por UG (TR 6.5) existe no
 *     domínio (`autorizar` recusa a UG errada), mas a INTERFACE oferecia o recorte proibido. O
 *     usuário da Saúde via "Educação" na lista, escolhia, e só descobria o limite quando uma
 *     escrita estourava — se estourasse: uma tela de LEITURA não chama `autorizar`, então ele
 *     LERIA os dados da unidade que não é dele.
 *
 * ⚠️ FAIL-CLOSED: SEM PERMISSÃO, LISTA VAZIA — NUNCA "TODAS". O reflexo de tratar lista vazia como
 * "não filtrei nada, mostre tudo" é o que transforma um usuário sem crachá no usuário mais
 * poderoso do sistema. Aqui, quem não tem permissão não enxerga unidade nenhuma.
 */

export interface ExercicioDisponivel {
  readonly ano: number;
  readonly encerrado: boolean;
}

export interface UgDisponivel {
  readonly id: string;
  /** SAGRES-PB: 5 dígitos. É o identificador de DOMÍNIO — o que viaja na URL. */
  readonly codigo: string;
  readonly nome: string;
}

export interface ContextoDoUsuario {
  readonly exercicios: readonly ExercicioDisponivel[];
  readonly ugs: readonly UgDisponivel[];
  /**
   * O usuário tem permissão GLOBAL (em alguma ação)? É o que autoriza o recorte "CONSOLIDADO"
   * (o ente inteiro). Quem só tem permissão de UGs específicas não pode pedir o consolidado —
   * ele conteria unidades que o usuário não pode ler.
   */
  readonly podeConsolidado: boolean;
}

/**
 * AS UNIDADES QUE ESTE USUÁRIO PODE ENXERGAR.
 *
 * A regra vem do mesmo lugar que a escrita usa (`PermissaoDePerfil`), e por isso não há como as
 * duas discordarem:
 *   · alguma permissão com `unidadeOrcId` NULO  → GLOBAL → todas as unidades;
 *   · permissões de UGs específicas             → só essas;
 *   · nenhuma permissão                          → NENHUMA (lista vazia).
 *
 * ⚠️ A CONSULTA É POR USUÁRIO, NÃO POR AÇÃO. Aqui a pergunta é "onde ele trabalha?", não "ele pode
 * empenhar aqui?" — esta segunda continua sendo do `autorizar`, no momento do ato. Filtrar o
 * seletor por uma ação específica esconderia unidades onde ele tem outras ações, e a tela ficaria
 * mentindo por omissão na direção oposta.
 */
export async function listarUgsDoUsuario(
  sessao: Identidade
): Promise<{ readonly ugs: readonly UgDisponivel[]; readonly global: boolean }> {
  const prisma = cliente();

  const usuario = await prisma.usuario.findUnique({
    where: { identificador: sessao.identificador },
    select: { id: true, ativo: true },
  });

  // ⚠️ Usuário inexistente ou revogado NÃO enxerga nada. O `exigirUsuarioAtivo` do domínio diria o
  // mesmo com uma mensagem melhor, mas ele ESTOURA — e um seletor de cabeçalho que estoura derruba
  // a página inteira. Aqui a resposta é o vazio, e a tela o nomeia.
  if (usuario === null || !usuario.ativo) return { ugs: [], global: false };

  const vinculos = await prisma.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
  });

  const permissoes = vinculos.flatMap((v) => v.perfil.permissoes);
  const global = permissoes.some((p) => p.unidadeOrcId === null);

  if (global) {
    const todas = await prisma.unidadeOrcamentaria.findMany({
      select: { id: true, codigo: true, descricao: true },
      orderBy: { codigo: "asc" },
    });
    return {
      ugs: todas.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.descricao })),
      global: true,
    };
  }

  const ids = [...new Set(permissoes.map((p) => p.unidadeOrcId).filter((i): i is string => i !== null))];
  if (ids.length === 0) return { ugs: [], global: false };

  const escopadas = await prisma.unidadeOrcamentaria.findMany({
    where: { id: { in: ids } },
    select: { id: true, codigo: true, descricao: true },
    orderBy: { codigo: "asc" },
  });
  return {
    ugs: escopadas.map((u) => ({ id: u.id, codigo: u.codigo, nome: u.descricao })),
    global: false,
  };
}

/**
 * OS EXERCÍCIOS CADASTRADOS — do banco, nunca de constante.
 *
 * ⚠️ `encerrado` É DERIVADO da existência do `EncerramentoExercicio`, não de uma flag. Encerrar é
 * um FATO append-only (M08); uma coluna booleana seria a segunda verdade sobre ele, e o dia em que
 * as duas divergissem a tela diria "aberto" sobre um exercício que o razão já fechou.
 */
export async function listarExercicios(): Promise<readonly ExercicioDisponivel[]> {
  const prisma = cliente();
  const exercicios = await prisma.exercicio.findMany({
    select: { ano: true, encerramento: { select: { id: true } } },
    orderBy: { ano: "desc" },
  });
  return exercicios.map((e) => ({ ano: e.ano, encerrado: e.encerramento !== null }));
}

/**
 * O CONTEXTO COMPLETO, para o Server Component do layout injetar no provider client.
 *
 * ⚠️ QUEM LÊ É O SERVIDOR. O componente client recebe isto por PROPS e só guarda a SELEÇÃO — ele
 * nunca consulta o banco (o Prisma não bundla para o browser, e a fronteira do
 * `test/ui/fronteira-ui.test.ts` recusa a tentativa).
 */
export async function carregarContextoDoUsuario(): Promise<ContextoDoUsuario> {
  const sessao = await exigirSessao();
  const [{ ugs, global }, exercicios] = await Promise.all([
    listarUgsDoUsuario(sessao),
    listarExercicios(),
  ]);
  return { exercicios, ugs, podeConsolidado: global };
}
