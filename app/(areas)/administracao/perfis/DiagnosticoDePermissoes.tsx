"use client";

import { useActionState } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_PAINEL_FORMULARIO } from "../../../../components/ui/Formulario";
import { aplicarAtualizacaoAction, type EstadoPerfil } from "./actions";

/**
 * DIAGNÓSTICO E ATUALIZAÇÃO DE PERMISSÕES (orquestração V3, 4.2) — ilha client.
 *
 * O que a deriva acusa (ação do censo sem perfil; concessão fora do censo) e as
 * atualizações da versão instalada, cada uma com a prévia do que faria. Aplicar é um ato
 * autorizado (CONCEDER_ACAO_A_PERFIL), registrado, e roda uma vez por instalação.
 */
export interface LinhaDeAtualizacao {
  readonly versao: number;
  readonly nome: string;
  readonly descricao: string;
  readonly aplicadaEm: string | null;
  readonly aplicadaPor: string | null;
  readonly concessoes: number | null;
  readonly previa: number;
}

export function DiagnosticoDePermissoes(p: {
  readonly semPerfil: readonly string[];
  readonly foraDoCenso: readonly string[];
  readonly totalDoCenso: number;
  readonly atualizacoes: readonly LinhaDeAtualizacao[];
  readonly podeAplicar: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoPerfil, FormData>(aplicarAtualizacaoAction, {});
  const derivaLimpa = p.semPerfil.length === 0 && p.foraDoCenso.length === 0;

  return (
    <section className={CLASSE_PAINEL_FORMULARIO} data-acao="diagnostico-de-permissoes">
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Diagnóstico de permissões</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        O censo desta versão tem {p.totalDoCenso} ações. Uma ação que nenhum perfil concede é uma tela que ninguém alcança.
      </p>

      {derivaLimpa ? (
        <p className="text-xs text-[color:var(--color-ink-2)]" data-deriva="limpa">
          Censo e perfis batem: toda ação está concedida a algum perfil, e não há concessão fora do censo.
        </p>
      ) : (
        <div className="space-y-2 text-xs" data-deriva="com-deriva">
          {p.semPerfil.length > 0 ? (
            <p>
              <span className="font-semibold">{p.semPerfil.length} ação(ões) que nenhum perfil concede:</span>{" "}
              {p.semPerfil.join(", ")}
            </p>
          ) : null}
          {p.foraDoCenso.length > 0 ? (
            <p>
              <span className="font-semibold">{p.foraDoCenso.length} concessão(ões) fora do censo:</span>{" "}
              {p.foraDoCenso.join(", ")}
            </p>
          ) : null}
        </div>
      )}

      <h3 className="mb-1 mt-4 text-xs font-semibold text-[color:var(--color-ink)]">Atualizações de permissões desta versão</h3>
      <ul className="space-y-2 text-xs">
        {p.atualizacoes.map((a) => (
          <li key={a.versao} data-atualizacao={a.versao} className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-3 py-2">
            <p className="font-semibold">
              Atualização {a.versao} — {a.nome}
            </p>
            <p className="text-[color:var(--color-ink-2)]">{a.descricao}</p>
            {a.aplicadaEm !== null ? (
              <p className="mt-1" data-situacao="aplicada">
                Aplicada por {a.aplicadaPor} em {a.aplicadaEm}, com {a.concessoes} concessão(ões).
              </p>
            ) : (
              <form action={action} className="mt-2 flex flex-wrap items-center gap-3" data-acao="aplicar-atualizacao">
                <input type="hidden" name="versao" value={a.versao} />
                <span data-situacao="pendente">
                  Pendente — a prévia concederia {a.previa} permissão(ões) aos perfis existentes, cada uma no escopo em que o perfil já age.
                </span>
                {p.podeAplicar ? (
                  <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
                    {pendente ? "Aplicando…" : `Aplicar atualização ${a.versao}`}
                  </button>
                ) : (
                  <span className="text-[color:var(--color-ink-3)]">Aplicar exige conceder ação a perfil, que o seu perfil não tem.</span>
                )}
              </form>
            )}
          </li>
        ))}
      </ul>

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
    </section>
  );
}
