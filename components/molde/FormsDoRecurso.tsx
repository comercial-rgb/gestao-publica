"use client";

import {
  FormularioDeRecurso,
  type EstadoDoMolde,
} from "./FormularioDeRecurso";
import type { CampoDoMolde, DefinicaoDeRecurso, OpcaoDoMolde } from "../../lib/molde/tipos";

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
}: FormsDoRecursoProps): React.ReactElement {
  const pode = new Set(permitidas);

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

  return (
    <div className="space-y-4">
      {d.acoes.map((a) =>
        pode.has(a.acaoDoCenso) ? (
          <FormularioDeRecurso
            key={a.nome}
            acao={a.nome}
            titulo={a.rotulo}
            campos={comOpcoes(a.campos ?? [], opcoes)}
            action={action}
            rotuloEnviar={a.rotulo}
            ocultos={{ __acao: a.nome, ...(registroId !== undefined ? { __id: registroId } : {}) }}
            {...(a.aviso !== undefined ? { aviso: a.aviso } : {})}
            {...(a.irreversivel === true ? { irreversivel: true } : {})}
          />
        ) : (
          <SemPermissao key={a.nome} o_que={a.rotulo.toLowerCase()} />
        )
      )}
    </div>
  );
}
