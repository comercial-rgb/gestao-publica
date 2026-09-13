import type { Tx } from "./autorizacao.js";
import type { AcaoDeLeitura } from "./acoes.js";

/**
 * M16 — O ESCOPO DE UMA AÇÃO DE LEITURA (orquestração V3, 4.1).
 *
 * ═══ ⚠️ POR AÇÃO, E NÃO POR USUÁRIO ═══
 * `listarUgsDoUsuario` (`lib/portas/contexto.ts`) responde "onde ele trabalha?" — a
 * UNIÃO das unidades de todas as ações do usuário. Serve ao seletor do cabeçalho e a
 * nada mais: a ENT10 mediu que a leitura usava essa união como se fosse autorização, e
 * um crachá de EMPENHAR na Saúde passava a ler a Educação se qualquer outra ação do
 * mesmo perfil alcançasse a Educação.
 *
 * Aqui a pergunta é a mesma que `autorizar` faz para a escrita: "ele tem ESTA ação, e
 * ONDE?". A resposta são as linhas de `PermissaoDePerfil` daquela ação, pelos vínculos
 * do usuário — a MESMA tabela, sem segunda fonte.
 *
 * ⚠️ FAIL-CLOSED: usuário inexistente, inativo ou sem vínculo devolve `unidades: []` e
 * `global: false`. Quem traduz isso em recusa nomeada é a decisão pura de
 * `lib/recorte.ts`; quem a lança é a porta. O domínio só resolve o fato.
 */
export interface EscopoDaAcaoDeLeitura {
  /** A identidade existe e está ativa. `false` = revogada ou inexistente. */
  readonly ativo: boolean;
  /** Há concessão com `unidadeOrcId` nulo — vale no ente inteiro. */
  readonly global: boolean;
  /**
   * As unidades onde a ação vale. Quando `global`, TODAS as unidades cadastradas —
   * assim a conferência de pertinência do recorte vale para o usuário global sem um
   * ramo "se for global, aceite qualquer coisa", que é onde este tipo de guarda vaza.
   */
  readonly unidades: readonly { readonly id: string; readonly codigo: string }[];
}

export async function escopoDaAcaoDeLeitura(
  tx: Tx,
  identificador: string,
  acao: AcaoDeLeitura
): Promise<EscopoDaAcaoDeLeitura> {
  const usuario = await tx.usuario.findUnique({
    where: { identificador },
    select: { id: true, ativo: true },
  });
  if (usuario === null || !usuario.ativo) return { ativo: false, global: false, unidades: [] };

  const vinculos = await tx.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: {
      perfil: {
        select: {
          permissoes: {
            where: { acao },
            select: { unidadeOrcId: true, unidadeOrc: { select: { id: true, codigo: true } } },
          },
        },
      },
    },
  });
  const permissoes = vinculos.flatMap((v) => v.perfil.permissoes);
  const global = permissoes.some((p) => p.unidadeOrcId === null);

  if (global) {
    const todas = await tx.unidadeOrcamentaria.findMany({
      select: { id: true, codigo: true },
      orderBy: { codigo: "asc" },
    });
    return { ativo: true, global: true, unidades: todas };
  }

  const porId = new Map<string, { id: string; codigo: string }>();
  for (const p of permissoes) {
    if (p.unidadeOrc !== null) porId.set(p.unidadeOrc.id, p.unidadeOrc);
  }
  return {
    ativo: true,
    global: false,
    unidades: [...porId.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)),
  };
}

/**
 * As ações de LEITURA que o usuário tem em ALGUM escopo — o insumo do painel inicial,
 * que só conta pendências das áreas que o usuário pode consultar.
 */
export async function acoesDeLeituraDoUsuario(
  tx: Tx,
  identificador: string,
  rol: readonly AcaoDeLeitura[]
): Promise<ReadonlySet<AcaoDeLeitura>> {
  const usuario = await tx.usuario.findUnique({
    where: { identificador },
    select: { id: true, ativo: true },
  });
  if (usuario === null || !usuario.ativo) return new Set();
  const vinculos = await tx.vinculoUsuarioPerfil.findMany({
    where: { usuarioId: usuario.id },
    select: {
      perfil: { select: { permissoes: { where: { acao: { in: [...rol] } }, select: { acao: true } } } },
    },
  });
  return new Set(
    vinculos.flatMap((v) => v.perfil.permissoes.map((p) => p.acao as AcaoDeLeitura))
  );
}
