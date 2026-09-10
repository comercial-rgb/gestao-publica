import type { Tx } from "../m16-travamento/autorizacao.js";
import {
  descreverSituacao,
  inicioDaContagem,
  movimentosVigentes,
  principalDoApenso,
  setorAtual,
  situacaoDaTaxa,
  situacaoDePrazo,
  situacaoDoProcesso,
  type MovimentoParaDerivar,
  type SituacaoDePrazo,
  type SituacaoDoProcesso,
} from "./dominio.js";

/**
 * M21 — AS CONSULTAS. Leitura pura: nada aqui grava.
 *
 * ═══ ⚠️ A VISIBILIDADE MORA AQUI, E É UMA SÓ ═══
 * Três perguntas diferentes têm a MESMA resposta: quem vê o processo na caixa, quem o
 * acha na busca, e quem pode baixar um anexo dele. Escrevê-las em três lugares seria
 * garantir que um dia divergissem — e a divergência interessante é sempre a mesma: o
 * processo some da listagem e o anexo continua baixável por link direto.
 *
 * Por isso `podeVerProcesso` é a única fonte, e o adaptador de anexo (M22) a chama em
 * vez de reimplementar a regra.
 */

const MOVIMENTO_PARA_DERIVAR = {
  select: {
    id: true,
    tipo: true,
    setorOrigemId: true,
    setorDestinoId: true,
    respondeAId: true,
    tornaSemEfeitoId: true,
    criadoEm: true,
  },
} as const;

/**
 * OS SETORES POR ONDE O PROCESSO PASSOU — o de abertura e todos os que aparecem nos
 * movimentos VIGENTES.
 *
 * ⚠️ O SETOR DE ORIGEM CONTINUA ENXERGANDO DEPOIS DE TRAMITAR. É requisito explícito do
 * lote ("o anexo permanece acessível ao setor de origem depois da tramitação"), e é o
 * comportamento certo: quem instruiu o processo tem de poder consultar o que instruiu.
 * Uma regra baseada só no setor ATUAL cegaria quem fez o trabalho.
 *
 * ⚠️ E OS MOVIMENTOS ANULADOS NÃO DÃO ACESSO. Um trâmite tornado sem efeito não põe o
 * destino no rol: ele nunca esteve com o documento.
 */
export function setoresEnvolvidos(
  setorAberturaId: string,
  movimentos: readonly MovimentoParaDerivar[]
): readonly string[] {
  const setores = new Set<string>([setorAberturaId]);
  for (const m of movimentosVigentes(movimentos)) {
    if (m.setorOrigemId != null) setores.add(m.setorOrigemId);
    if (m.setorDestinoId != null) setores.add(m.setorDestinoId);
  }
  return [...setores];
}

export interface VisibilidadeDoProcesso {
  readonly pode: boolean;
  /** Por que sim ou por que não — vai para a mensagem e para o log. */
  readonly motivo: string;
}

/**
 * ESTE USUÁRIO PODE VER ESTE PROCESSO?
 *
 * A regra, em ordem:
 *   1. GESTOR (permissão global) vê tudo — é o 5.42.54/55, reusando o mecanismo do M16;
 *   2. ENVOLVIDO vê: quem abriu, quem movimentou, quem está lotado num setor por onde
 *      o processo passou, e o requerente quando ele é usuário do sistema;
 *   3. SIGILOSO para quem não é envolvido: NÃO. Fim da linha, sem exceção;
 *   4. não sigiloso: quem trabalha na MESMA unidade gestora pode consultar.
 *
 * ⚠️ FAIL-CLOSED: qualquer coisa que não caia nos casos acima devolve `false`. Um
 * processo que não existe também devolve `false` — e a mensagem NÃO diz "não existe":
 * distinguir "não existe" de "você não pode ver" entrega, a quem tenta ids ao acaso, a
 * informação de quais existem.
 */
export async function podeVerProcesso(
  tx: Tx,
  processoId: string,
  usuarioIdent: string
): Promise<VisibilidadeDoProcesso> {
  const p = await tx.processo.findUnique({
    where: { id: processoId },
    select: {
      sigiloso: true,
      criadoPor: true,
      setorAberturaId: true,
      setorAbertura: { select: { unidadeOrcId: true } },
      requerente: { select: { documento: true } },
      movimentos: MOVIMENTO_PARA_DERIVAR,
    },
  });
  const negado = {
    pode: false,
    motivo:
      "Processo inexistente ou fora do seu alcance. A mensagem é a mesma nos dois " +
      "casos de propósito: distingui-los entregaria, a quem tenta identificadores ao " +
      "acaso, a lista de quais existem.",
  };
  if (p === null) return negado;

  const usuario = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  if (usuario === null) return negado;

  const gestor = usuario.vinculos.some((v) =>
    v.perfil.permissoes.some((perm) => perm.unidadeOrcId === null)
  );
  if (gestor) return { pode: true, motivo: "Gestor: permissão global." };

  if (p.criadoPor === usuarioIdent) {
    return { pode: true, motivo: "Abriu o processo." };
  }
  const movimentou = await tx.movimentoDoProcesso.findFirst({
    where: { processoId, criadoPor: usuarioIdent },
    select: { id: true },
  });
  if (movimentou !== null) {
    return { pode: true, motivo: "Movimentou o processo." };
  }

  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true, setor: { select: { unidadeOrcId: true } } },
  });
  const envolvidos = new Set(setoresEnvolvidos(p.setorAberturaId, p.movimentos));
  if (lotacoes.some((l) => envolvidos.has(l.setorId))) {
    return {
      pode: true,
      motivo: "Lotado em setor por onde o processo passou.",
    };
  }

  if (p.sigiloso) {
    return {
      pode: false,
      motivo:
        "Processo SIGILOSO: visível apenas a quem está envolvido nele. Estar na mesma " +
        "unidade gestora não basta — é essa exatamente a diferença que o sigilo faz.",
    };
  }

  const mesmaUg = lotacoes.some(
    (l) => l.setor.unidadeOrcId === p.setorAbertura.unidadeOrcId
  );
  return mesmaUg
    ? { pode: true, motivo: "Lotado na mesma unidade gestora." }
    : negado;
}

// ═══════════════════════════════════════════════════════════════════════════
// A CAIXA DE PROCESSOS
// ═══════════════════════════════════════════════════════════════════════════

export interface FiltrosDaCaixa {
  readonly exercicio?: number | undefined;
  readonly assuntoId?: string | undefined;
  readonly situacao?: SituacaoDoProcesso | undefined;
  readonly setorId?: string | undefined;
  readonly numero?: number | undefined;
  readonly requerenteDocumento?: string | undefined;
  /** Só os que estão comigo (na minha lotação), e não os da unidade inteira. */
  readonly somenteMeusSetores?: boolean | undefined;
}

export interface LinhaDaCaixa {
  readonly id: string;
  readonly numero: number;
  readonly ano: number;
  readonly assunto: string;
  readonly subassunto: string | null;
  readonly requerente: string;
  readonly situacao: SituacaoDoProcesso;
  readonly situacaoRotulo: string;
  readonly prazo: SituacaoDePrazo;
  readonly prioridade: "NORMAL" | "ALTA" | "URGENTE";
  readonly sigiloso: boolean;
  readonly setorAtual: string;
  readonly setorAtualNome: string;
  readonly abertaEm: Date;
  readonly ultimoMovimentoEm: Date;
  readonly apensadoA: string | null;
  readonly temTaxaEmAberto: boolean;
}

/**
 * A CAIXA — e o recorte de visibilidade é aplicado ANTES de qualquer coisa.
 *
 * ⚠️ A ORDENAÇÃO PADRÃO É PELA ÚLTIMA MOVIMENTAÇÃO (5.42.51), não pela abertura: quem
 * abre a caixa quer ver o que se mexeu, não o que está parado desde janeiro.
 *
 * ⚠️ O FILTRO DE SIGILO NÃO PODE SER FEITO DEPOIS DA PAGINAÇÃO. Filtrar a página já
 * lida devolveria páginas de tamanhos diferentes e — pior — deixaria o total contar
 * processos que quem pergunta não pode ver. Aqui o recorte entra no `where`.
 */
export async function listarProcessos(
  tx: Tx,
  usuarioIdent: string,
  filtros: FiltrosDaCaixa = {},
  limite = 200
): Promise<readonly LinhaDaCaixa[]> {
  const usuario = await tx.usuario.findUnique({
    where: { identificador: usuarioIdent },
    select: {
      vinculos: {
        select: { perfil: { select: { permissoes: { select: { unidadeOrcId: true } } } } },
      },
    },
  });
  if (usuario === null) return [];

  const gestor = usuario.vinculos.some((v) =>
    v.perfil.permissoes.some((perm) => perm.unidadeOrcId === null)
  );

  const lotacoes = await tx.usuarioDoSetor.findMany({
    where: { usuarioIdent },
    select: { setorId: true, setor: { select: { unidadeOrcId: true } } },
  });
  const meusSetores = lotacoes.map((l) => l.setorId);
  const minhasUgs = [...new Set(lotacoes.map((l) => l.setor.unidadeOrcId))];

  // ⚠️ SEM LOTAÇÃO E SEM PERMISSÃO GLOBAL: LISTA VAZIA. Nunca "todas". É o mesmo
  // fail-closed do seletor de unidades (lib/portas/contexto.ts) — o reflexo de tratar
  // vazio como "não filtrei nada, mostre tudo" é o que transforma quem não tem crachá
  // no usuário mais poderoso do sistema.
  if (!gestor && meusSetores.length === 0) return [];

  const recorte = gestor
    ? {}
    : {
        OR: [
          { criadoPor: usuarioIdent },
          { setorAberturaId: { in: meusSetores } },
          { movimentos: { some: { setorOrigemId: { in: meusSetores } } } },
          { movimentos: { some: { setorDestinoId: { in: meusSetores } } } },
          { movimentos: { some: { criadoPor: usuarioIdent } } },
          // Os não sigilosos da minha unidade gestora — e SÓ os não sigilosos.
          ...(filtros.somenteMeusSetores === true
            ? []
            : [
                {
                  sigiloso: false,
                  setorAbertura: { unidadeOrcId: { in: minhasUgs } },
                },
              ]),
        ],
      };

  const processos = await tx.processo.findMany({
    where: {
      ...recorte,
      ...(filtros.exercicio !== undefined
        ? { exercicio: { ano: filtros.exercicio } }
        : {}),
      ...(filtros.assuntoId !== undefined ? { assuntoId: filtros.assuntoId } : {}),
      ...(filtros.numero !== undefined ? { numero: filtros.numero } : {}),
      ...(filtros.requerenteDocumento !== undefined
        ? { requerente: { documento: filtros.requerenteDocumento } }
        : {}),
    },
    select: {
      id: true,
      numero: true,
      prioridade: true,
      sigiloso: true,
      criadoEm: true,
      setorAberturaId: true,
      exercicio: { select: { ano: true } },
      assunto: { select: { nome: true } },
      subassunto: { select: { nome: true } },
      requerente: { select: { versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } } },
      contatoAnonimo: true,
      etapas: { select: { ordem: true, setorId: true, prazoDias: true } },
      movimentos: MOVIMENTO_PARA_DERIVAR,
      taxas: { select: { movimentos: { select: { tipo: true, criadoEm: true } } } },
    },
    take: limite,
  });

  const idsDeSetor = [
    ...new Set(processos.map((p) => setorAtual(p.setorAberturaId, p.movimentos))),
  ];
  const setores = await tx.setor.findMany({
    where: { id: { in: idsDeSetor } },
    select: { id: true, codigo: true, nome: true },
  });
  const nomeDoSetor = new Map(setores.map((s) => [s.id, `${s.codigo} — ${s.nome}`]));

  const apensamentos = await tx.movimentoDeApensamento.findMany({
    where: { processoApensoId: { in: processos.map((p) => p.id) } },
    select: {
      processoPrincipalId: true,
      processoApensoId: true,
      tipo: true,
      criadoEm: true,
    },
  });

  const agora = new Date();

  const linhas = processos.map((p): LinhaDaCaixa => {
    const situacao = situacaoDoProcesso(p.movimentos);
    const atual = setorAtual(p.setorAberturaId, p.movimentos);
    const inicio = inicioDaContagem(p.movimentos);
    const etapa = p.etapas.find((e) => e.setorId === atual);
    const vigentes = movimentosVigentes(p.movimentos);
    const ultimo = [...vigentes].sort(
      (a, b) => b.criadoEm.getTime() - a.criadoEm.getTime()
    )[0];

    return {
      id: p.id,
      numero: p.numero,
      ano: p.exercicio.ano,
      assunto: p.assunto.nome,
      subassunto: p.subassunto?.nome ?? null,
      requerente: p.requerente?.versoes[0]?.nome ?? p.contatoAnonimo ?? "Anônimo",
      situacao,
      situacaoRotulo: descreverSituacao(situacao),
      prazo: situacaoDePrazo(inicio, etapa?.prazoDias ?? null, agora),
      prioridade: p.prioridade,
      sigiloso: p.sigiloso,
      setorAtual: atual,
      setorAtualNome: nomeDoSetor.get(atual) ?? atual,
      abertaEm: p.criadoEm,
      ultimoMovimentoEm: ultimo?.criadoEm ?? p.criadoEm,
      apensadoA: principalDoApenso(p.id, apensamentos),
      temTaxaEmAberto: p.taxas.some(
        (t) => situacaoDaTaxa(t.movimentos) === "EM_ABERTO"
      ),
    };
  });

  const filtradas =
    filtros.situacao !== undefined
      ? linhas.filter((l) => l.situacao === filtros.situacao)
      : linhas;
  const porSetor =
    filtros.setorId !== undefined
      ? filtradas.filter((l) => l.setorAtual === filtros.setorId)
      : filtradas;

  return [...porSetor].sort(
    (a, b) => b.ultimoMovimentoEm.getTime() - a.ultimoMovimentoEm.getTime()
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O DOSSIÊ — a linha do tempo do 5.42.27
// ═══════════════════════════════════════════════════════════════════════════

export interface MovimentoDaLinhaDoTempo {
  readonly id: string;
  readonly tipo: string;
  readonly rotulo: string;
  readonly texto: string;
  readonly setorOrigem: string | null;
  readonly setorDestino: string | null;
  readonly usuarioDestino: string | null;
  readonly autor: string;
  readonly em: Date;
  readonly assinado: boolean;
  readonly modoDaAssinatura: string | null;
  readonly semEfeito: boolean;
  readonly anulaMovimentoId: string | null;
  /**
   * O movimento que ESTE responde (parecer, readequação).
   *
   * ⚠️ ELE É PUBLICADO PORQUE A TELA PRECISA DELE. Sem este campo, o seletor de "responder
   * ao pedido" ofereceria pedidos já respondidos, e a recusa viria do servidor depois de
   * a pessoa ter digitado o parecer inteiro.
   */
  readonly respondeAId: string | null;
  readonly anexos: readonly { readonly id: string; readonly nome: string }[];
}

export interface DossieDoProcesso {
  readonly id: string;
  readonly numero: number;
  readonly ano: number;
  readonly codigoVerificador: string;
  readonly assunto: string;
  readonly subassunto: string | null;
  readonly requerente: string;
  readonly requerentesAdicionais: readonly string[];
  readonly finalidade: string;
  readonly prioridade: string;
  readonly sigiloso: boolean;
  readonly documentacaoFisica: boolean;
  readonly textoAbertura: string;
  readonly situacao: SituacaoDoProcesso;
  readonly situacaoRotulo: string;
  readonly prazo: SituacaoDePrazo;
  readonly setorAtual: string;
  readonly abertoPor: string;
  readonly abertoEm: Date;
  readonly apensadoA: { readonly id: string; readonly rotulo: string } | null;
  readonly apensos: readonly { readonly id: string; readonly rotulo: string }[];
  readonly etapas: readonly {
    readonly ordem: number;
    readonly setor: string;
    readonly prazoDias: number;
    readonly descricao: string;
  }[];
  readonly taxas: readonly {
    readonly id: string;
    readonly descricao: string;
    readonly valor: string;
    readonly vencimento: Date;
    readonly situacao: string;
  }[];
  readonly anexos: readonly { readonly id: string; readonly nome: string }[];
  readonly linhaDoTempo: readonly MovimentoDaLinhaDoTempo[];
}

const ROTULO_DO_MOVIMENTO: Record<string, string> = {
  TRAMITE: "Tramitado",
  RECEBIMENTO: "Recebido",
  COMPLEMENTO: "Complementado",
  PARECER_SOLICITADO: "Parecer solicitado",
  PARECER_RESPONDIDO: "Parecer respondido",
  READEQUACAO_SOLICITADA: "Readequação solicitada",
  READEQUACAO_ATENDIDA: "Readequação atendida",
  PARALISACAO: "Paralisado",
  ENCERRAMENTO: "Encerrado",
  ARQUIVAMENTO: "Arquivado",
  REABERTURA: "Reaberto",
  CANCELAMENTO: "Cancelado",
  ALTERACAO: "Alterado",
  TORNADO_SEM_EFEITO: "Movimento tornado sem efeito",
};

/**
 * O DOSSIÊ COMPLETO — e ele RESPEITA A VISIBILIDADE.
 *
 * ⚠️ DEVOLVE `null` PARA QUEM NÃO PODE VER, e não estoura. Uma exceção com mensagem
 * distinta para "sigiloso" e para "inexistente" seria um oráculo: quem tentasse ids ao
 * acaso descobriria quais processos existem pela diferença entre os dois erros.
 *
 * ⚠️ A LINHA DO TEMPO MOSTRA OS MOVIMENTOS ANULADOS, marcados. Escondê-los faria o
 * "tornar sem efeito" virar um DELETE com outro nome — e é exatamente isso que a
 * decisão do módulo recusa.
 */
export async function dossieDoProcesso(
  tx: Tx,
  processoId: string,
  usuarioIdent: string
): Promise<DossieDoProcesso | null> {
  const visao = await podeVerProcesso(tx, processoId, usuarioIdent);
  if (!visao.pode) return null;

  const p = await tx.processo.findUnique({
    where: { id: processoId },
    select: {
      id: true,
      numero: true,
      codigoVerificador: true,
      finalidade: true,
      prioridade: true,
      sigiloso: true,
      documentacaoFisica: true,
      textoAbertura: true,
      criadoEm: true,
      criadoPor: true,
      setorAberturaId: true,
      contatoAnonimo: true,
      exercicio: { select: { ano: true } },
      assunto: { select: { nome: true } },
      subassunto: { select: { nome: true } },
      requerente: {
        select: { versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
      },
      requerentesAdicionais: {
        select: {
          pessoa: {
            select: { versoes: { select: { nome: true }, orderBy: { criadoEm: "desc" }, take: 1 } },
          },
        },
      },
      etapas: {
        select: { ordem: true, setorId: true, prazoDias: true, descricao: true },
        orderBy: { ordem: "asc" },
      },
      taxas: {
        select: {
          id: true,
          descricao: true,
          valor: true,
          vencimento: true,
          movimentos: { select: { tipo: true, criadoEm: true } },
        },
      },
      anexos: { select: { id: true, nomeOriginal: true } },
      movimentos: {
        select: {
          id: true,
          tipo: true,
          texto: true,
          usuarioDestino: true,
          criadoPor: true,
          criadoEm: true,
          setorOrigemId: true,
          setorDestinoId: true,
          respondeAId: true,
          tornaSemEfeitoId: true,
          assinatura: { select: { modo: true } },
          anexos: { select: { id: true, nomeOriginal: true } },
        },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (p === null) return null;

  const situacao = situacaoDoProcesso(p.movimentos);
  const atual = setorAtual(p.setorAberturaId, p.movimentos);
  const vigentes = new Set(movimentosVigentes(p.movimentos).map((m) => m.id));

  const idsDeSetor = [
    ...new Set([
      ...p.etapas.map((e) => e.setorId),
      ...p.movimentos.flatMap((m) => [m.setorOrigemId, m.setorDestinoId]),
      atual,
    ]),
  ].filter((s): s is string => s !== null);
  const setores = await tx.setor.findMany({
    where: { id: { in: idsDeSetor } },
    select: { id: true, codigo: true, nome: true },
  });
  const nome = new Map(setores.map((s) => [s.id, `${s.codigo} — ${s.nome}`]));

  const apensamentos = await tx.movimentoDeApensamento.findMany({
    where: { OR: [{ processoPrincipalId: p.id }, { processoApensoId: p.id }] },
    select: {
      processoPrincipalId: true,
      processoApensoId: true,
      tipo: true,
      criadoEm: true,
    },
  });
  const principalId = principalDoApenso(p.id, apensamentos);
  const idsRelacionados = [
    ...new Set([
      ...(principalId !== null ? [principalId] : []),
      ...apensamentos.filter((a) => a.processoPrincipalId === p.id).map((a) => a.processoApensoId),
    ]),
  ];
  const relacionados = await tx.processo.findMany({
    where: { id: { in: idsRelacionados } },
    select: { id: true, numero: true, exercicio: { select: { ano: true } } },
  });
  const rotuloDe = new Map(
    relacionados.map((r) => [r.id, `${r.numero}/${r.exercicio.ano}`])
  );

  const etapaCorrente = p.etapas.find((e) => e.setorId === atual);

  return {
    id: p.id,
    numero: p.numero,
    ano: p.exercicio.ano,
    codigoVerificador: p.codigoVerificador,
    assunto: p.assunto.nome,
    subassunto: p.subassunto?.nome ?? null,
    requerente: p.requerente?.versoes[0]?.nome ?? p.contatoAnonimo ?? "Anônimo",
    requerentesAdicionais: p.requerentesAdicionais.map(
      (r) => r.pessoa.versoes[0]?.nome ?? "?"
    ),
    finalidade: p.finalidade,
    prioridade: p.prioridade,
    sigiloso: p.sigiloso,
    documentacaoFisica: p.documentacaoFisica,
    textoAbertura: p.textoAbertura,
    situacao,
    situacaoRotulo: descreverSituacao(situacao),
    prazo: situacaoDePrazo(
      inicioDaContagem(p.movimentos),
      etapaCorrente?.prazoDias ?? null,
      new Date()
    ),
    setorAtual: nome.get(atual) ?? atual,
    abertoPor: p.criadoPor,
    abertoEm: p.criadoEm,
    apensadoA:
      principalId !== null
        ? { id: principalId, rotulo: rotuloDe.get(principalId) ?? principalId }
        : null,
    apensos: idsRelacionados
      .filter((id) => id !== principalId)
      .map((id) => ({ id, rotulo: rotuloDe.get(id) ?? id })),
    etapas: p.etapas.map((e) => ({
      ordem: e.ordem,
      setor: nome.get(e.setorId) ?? e.setorId,
      prazoDias: e.prazoDias,
      descricao: e.descricao,
    })),
    taxas: p.taxas.map((t) => ({
      id: t.id,
      descricao: t.descricao,
      // ⚠️ DINHEIRO ATRAVESSA A FRONTEIRA COMO STRING. Ver a fronteira da UI: um
      // `Decimal` serializado para o cliente vira `number`, e aí já perdeu.
      valor: t.valor.toFixed(2),
      vencimento: t.vencimento,
      situacao: situacaoDaTaxa(t.movimentos),
    })),
    anexos: p.anexos.map((a) => ({ id: a.id, nome: a.nomeOriginal })),
    linhaDoTempo: p.movimentos.map((m) => ({
      id: m.id,
      tipo: m.tipo,
      rotulo: ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo,
      texto: m.texto,
      setorOrigem: m.setorOrigemId !== null ? nome.get(m.setorOrigemId) ?? m.setorOrigemId : null,
      setorDestino:
        m.setorDestinoId !== null ? nome.get(m.setorDestinoId) ?? m.setorDestinoId : null,
      usuarioDestino: m.usuarioDestino,
      autor: m.criadoPor,
      em: m.criadoEm,
      assinado: m.assinatura !== null,
      modoDaAssinatura: m.assinatura?.modo ?? null,
      semEfeito: !vigentes.has(m.id),
      anulaMovimentoId: m.tornaSemEfeitoId,
      respondeAId: m.respondeAId,
      anexos: m.anexos.map((a) => ({ id: a.id, nome: a.nomeOriginal })),
    })),
  };
}

/**
 * A CONSULTA EXTERNA — pelo número e pelo CÓDIGO VERIFICADOR, sem sessão.
 *
 * ⚠️ ELA NÃO DEVOLVE O DOSSIÊ INTEIRO. O requerente vê a situação, as datas e os
 * movimentos — não vê pareceres internos nem os anexos que a administração juntou. A
 * cláusula 5.42.58 pede acompanhamento, não acesso ao instrutório.
 *
 * ⚠️ E A COMPARAÇÃO DO CÓDIGO É EXATA, sobre o registro achado pelo número. Buscar
 * PELO código permitiria enumerar o espaço de códigos; buscando pelo número e
 * conferindo o código, quem erra o código não descobre nada.
 */
export async function acompanhamentoExterno(
  tx: Tx,
  exercicio: number,
  numero: number,
  verificador: string
): Promise<{
  readonly numero: number;
  readonly ano: number;
  readonly assunto: string;
  readonly situacao: string;
  readonly abertoEm: Date;
  readonly movimentos: readonly {
    readonly rotulo: string;
    readonly em: Date;
    readonly setor: string | null;
  }[];
} | null> {
  const p = await tx.processo.findFirst({
    where: { numero, exercicio: { ano: exercicio } },
    select: {
      numero: true,
      codigoVerificador: true,
      criadoEm: true,
      setorAberturaId: true,
      exercicio: { select: { ano: true } },
      assunto: { select: { nome: true } },
      movimentos: {
        select: {
          id: true,
          tipo: true,
          setorOrigemId: true,
          setorDestinoId: true,
          respondeAId: true,
          tornaSemEfeitoId: true,
          criadoEm: true,
        },
        orderBy: { criadoEm: "asc" },
      },
    },
  });
  if (p === null) return null;
  if (p.codigoVerificador !== verificador.trim().toUpperCase()) return null;

  const idsDeSetor = [
    ...new Set(p.movimentos.map((m) => m.setorDestinoId).filter((s): s is string => s !== null)),
  ];
  const setores = await tx.setor.findMany({
    where: { id: { in: idsDeSetor } },
    select: { id: true, codigo: true, nome: true },
  });
  const nome = new Map(setores.map((s) => [s.id, `${s.codigo} — ${s.nome}`]));

  return {
    numero: p.numero,
    ano: p.exercicio.ano,
    assunto: p.assunto.nome,
    situacao: descreverSituacao(situacaoDoProcesso(p.movimentos)),
    abertoEm: p.criadoEm,
    movimentos: movimentosVigentes(p.movimentos).map((m) => ({
      rotulo: ROTULO_DO_MOVIMENTO[m.tipo] ?? m.tipo,
      em: m.criadoEm,
      setor: m.setorDestinoId != null ? nome.get(m.setorDestinoId) ?? null : null,
    })),
  };
}
