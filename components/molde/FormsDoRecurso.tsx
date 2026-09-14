"use client";

import {
  FormularioDeRecurso,
  type EstadoDoMolde,
} from "./FormularioDeRecurso";
import { useCallback, useId, useState } from "react";
import type {
  AcaoDoMolde,
  CampoDoMolde,
  DefinicaoDeRecurso,
  DisponibilidadeDaAcao,
  DisponibilidadeDoRegistro,
  OpcaoDoMolde,
} from "../../lib/molde/tipos";

/**
 * OS FORMULÁRIOS DE UM RECURSO — criação e barra de ações, montados do descritor.
 *
 * ⚠️ O QUE O USUÁRIO NÃO PODE, ELE NÃO VÊ — E VÊ O MOTIVO. As ações que a sessão não tem
 * chegam em `permitidas` como ausentes, e no lugar do botão aparece a explicação. Oferecer e
 * recusar depois ensina que o sistema é instável; esconder sem dizer nada ensina que a
 * funcionalidade sumiu.
 *
 * ⚠️ QUEM DECIDE CONTINUA SENDO O DOMÍNIO. Esta tela não autoriza nada: ela para de oferecer
 * o que seria recusado. O `autorizar` roda dentro da transação, e recusaria de qualquer forma.
 *
 * ⚠️ AS OPÇÕES CHEGAM POR PROP. O descritor declara `opcoes: []` nos campos de seleção que
 * vêm do banco (fonte, conta contábil, órgão) — quem as lê é o Server Component, porque uma
 * ilha client não importa porta.
 */

export interface FormsDoRecursoProps {
  readonly definicao: DefinicaoDeRecurso;
  /** Ações do censo que a sessão REALMENTE tem. */
  readonly permitidas: readonly string[];
  /** Opções por nome de campo, lidas no servidor. */
  readonly opcoes: Readonly<Record<string, readonly OpcaoDoMolde[]>>;
  /** O id do registro — presente no detalhe, ausente na listagem. */
  readonly registroId?: string;
  readonly action: (
    estado: EstadoDoMolde,
    dados: FormData
  ) => EstadoDoMolde | Promise<EstadoDoMolde>;
  /** `true` na listagem (só o formulário de criar); `false` no detalhe (só as ações). */
  readonly modo: "criar" | "acoes";
  /**
   * V6.2 — a disponibilidade projetada pela porta. Obrigatória em recurso `acoesPorEstado`;
   * `null` = a consulta falhou, e nada é oferecido (fail-closed).
   */
  readonly disponibilidade?: DisponibilidadeDoRegistro | null;
}

/** O que a barra mostra quando não sabe: travar, nunca liberar. */
const SEM_CONFERENCIA: DisponibilidadeDaAcao = {
  apresentacao: "bloqueada",
  motivo: "Não foi possível conferir se este ato cabe agora neste registro.",
  providencia: "Recarregue a página. Enquanto a conferência não voltar, o ato não é oferecido.",
};

function disponibilidadeDe(
  d: DefinicaoDeRecurso,
  a: AcaoDoMolde,
  disp: DisponibilidadeDoRegistro | null | undefined
): DisponibilidadeDaAcao {
  if (d.acoesPorEstado !== true) return { apresentacao: "disponivel" };
  if (disp === undefined || disp === null) return SEM_CONFERENCIA;
  return disp.porAcao[a.nome] ?? SEM_CONFERENCIA;
}

/**
 * A AÇÃO TRAVADA. Não é `<form>`: não há o que enviar, e um formulário com o botão desabilitado
 * ainda submete pelo Enter de um campo.
 *
 * ⚠️ `aria-disabled`, E NÃO `disabled`, com o handler neutralizado. O botão `disabled` sai da ordem
 * de tabulação e quem navega por teclado nunca chega ao motivo; `aria-disabled` sozinho não impede
 * o clique — por isso não há action nenhuma para ele disparar. O motivo é TEXTO VISÍVEL associado
 * por `aria-describedby`, não um tooltip que o leitor de tela e o toque não alcançam.
 */
function AcaoIndisponivel({
  acao,
  disp,
}: {
  readonly acao: AcaoDoMolde;
  readonly disp: DisponibilidadeDaAcao;
}): React.ReactElement {
  const idMotivo = `motivo-${useId()}`;
  const emCurso = disp.apresentacao === "em-processamento";
  return (
    <section
      data-acao={acao.nome}
      data-acao-estado={disp.apresentacao}
      aria-labelledby={`${idMotivo}-t`}
      className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-4 py-3"
    >
      <h2 id={`${idMotivo}-t`} className="text-sm font-semibold text-[color:var(--color-ink-2)]">{acao.rotulo}</h2>
      <p id={idMotivo} role={emCurso ? "status" : undefined} className="mt-1 text-xs text-[color:var(--color-ink-2)]">
        {disp.motivo ?? (emCurso ? "Há uma execução em curso sobre este registro." : "Este ato não está disponível agora.")}
        {disp.providencia !== undefined ? <span className="block">{disp.providencia}</span> : null}
      </p>
      {disp.providenciaHref !== undefined ? (
        <a href={disp.providenciaHref} className="mt-1 inline-block text-xs underline underline-offset-2">Ir para onde se resolve</a>
      ) : null}
      <button
        type="button"
        aria-disabled="true"
        aria-describedby={idMotivo}
        onClick={(ev) => ev.preventDefault()}
        className="mt-3 cursor-not-allowed rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-1.5 text-sm text-[color:var(--color-ink-3)]"
      >
        {emCurso ? "Em processamento…" : acao.rotulo}
      </button>
    </section>
  );
}

function comOpcoes(
  campos: readonly CampoDoMolde[],
  opcoes: Readonly<Record<string, readonly OpcaoDoMolde[]>>
): readonly CampoDoMolde[] {
  return campos.map((c) => {
    if (c.tipo !== "selecao" || (c.opcoes ?? []).length > 0) return c;
    const doBanco = opcoes[c.nome];
    return doBanco === undefined ? c : { ...c, opcoes: doBanco };
  });
}

function SemPermissao({ o_que }: { readonly o_que: string }): React.ReactElement {
  return (
    <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
      Você não tem a permissão necessária para {o_que}. Peça ao administrador do sistema —
      a concessão é por ação, e é registrada.
    </p>
  );
}

export function FormsDoRecurso({
  definicao: d,
  permitidas,
  opcoes,
  registroId,
  action,
  modo,
  disponibilidade,
}: FormsDoRecursoProps): React.ReactElement {
  const pode = new Set(permitidas);
  // ⚠️ O RESULTADO DO ÚLTIMO ATO FICA NA BARRA, e não só no formulário. Fechar a folha tira "Fechar"
  // da barra (vira "já fechada"); sem isto, a mensagem autoritativa — o que foi feito, sobre qual
  // cálculo — desapareceria junto com o formulário que a mostrava, e a tela só mudaria de estado
  // sem dizer por quê. O estado mora aqui porque este componente sobrevive à renderização nova.
  const [ultimo, setUltimo] = useState<{ readonly acao: string; readonly erro?: string; readonly sucesso?: string } | null>(null);
  const aoResultadoDe = useCallback((acao: string) => (e: EstadoDoMolde) => setUltimo({ acao, ...e }), []);

  if (modo === "criar") {
    if (d.permissoes.criar === undefined) {
      return <SemPermissao o_que={`cadastrar ${d.rotuloSingular.toLowerCase()}`} />;
    }
    if (!pode.has(d.permissoes.criar)) {
      return <SemPermissao o_que={`cadastrar ${d.rotuloSingular.toLowerCase()}`} />;
    }
    return (
      <FormularioDeRecurso
        acao={`criar-${d.nome}`}
        titulo={`Novo ${d.rotuloSingular.toLowerCase()}`}
        campos={comOpcoes(d.campos, opcoes)}
        action={action}
        rotuloEnviar={`Cadastrar ${d.rotuloSingular.toLowerCase()}`}
        rotuloEnviando="Cadastrando…"
        ocultos={{ __acao: "criar" }}
      />
    );
  }

  // ⚠️ SEM PERMISSÃO, NENHUM MOTIVO DE ESTADO: quem não pode praticar o ato não precisa saber por
  // que ele não caberia — e o motivo pode carregar dado do registro.
  const naoAplicaveis: { readonly acao: AcaoDoMolde; readonly disp: DisponibilidadeDaAcao }[] = [];
  const renderizadas = new Set<string>();
  const barra = d.acoes.map((a) => {
    if (!pode.has(a.acaoDoCenso)) return <SemPermissao key={a.nome} o_que={a.rotulo.toLowerCase()} />;
    const disp = disponibilidadeDe(d, a, disponibilidade);
    if (disp.apresentacao === "nao-aplicavel") {
      naoAplicaveis.push({ acao: a, disp });
      return null;
    }
    if (disp.apresentacao !== "disponivel") return <AcaoIndisponivel key={a.nome} acao={a} disp={disp} />;
    renderizadas.add(a.nome);
    return (
      <FormularioDeRecurso
        key={a.nome}
        acao={a.nome}
        titulo={a.rotulo}
        campos={comOpcoes(a.campos ?? [], opcoes)}
        action={action}
        rotuloEnviar={a.rotulo}
        ocultos={{
          __acao: a.nome,
          ...(registroId !== undefined ? { __id: registroId } : {}),
          ...(d.acoesPorEstado === true && disponibilidade !== undefined && disponibilidade !== null ? { __versao: disponibilidade.versao } : {}),
        }}
        {...(a.aviso !== undefined ? { aviso: a.aviso } : {})}
        {...(a.irreversivel === true ? { irreversivel: true } : {})}
        aoResultado={aoResultadoDe(a.nome)}
      />
    );
  });
  const rotuloDoUltimo = ultimo === null ? "" : (d.acoes.find((a) => a.nome === ultimo.acao)?.rotulo ?? ultimo.acao);

  return (
    <div className="space-y-4">
      {ultimo !== null && !renderizadas.has(ultimo.acao) ? (
        ultimo.erro !== undefined ? (
          <p role="alert" data-resultado-da-acao={ultimo.acao} className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
            {rotuloDoUltimo}: {ultimo.erro}
          </p>
        ) : (
          <p role="status" data-resultado-da-acao={ultimo.acao} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
            {rotuloDoUltimo}: {ultimo.sucesso}
          </p>
        )
      ) : null}
      {barra}
      {naoAplicaveis.length > 0 ? (
        <div data-acoes-nao-aplicaveis className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Atos que não cabem mais neste registro</h2>
          <ul className="mt-2 space-y-1">
            {naoAplicaveis.map(({ acao, disp }) => (
              <li key={acao.nome} data-acao-estado="nao-aplicavel" data-acao-nome={acao.nome} className="text-xs text-[color:var(--color-ink-2)]">
                <span className="font-medium text-[color:var(--color-ink)]">{acao.rotulo}:</span> {disp.motivo ?? "já praticado ou fora do estado do registro."}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
