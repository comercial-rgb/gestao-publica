"use client";

import { useActionState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  ativarUsuarioAction,
  concederPerfilAction,
  desvincularPessoaAction,
  inativarUsuarioAction,
  resetarSenhaAction,
  revogarPerfilAction,
  vincularPessoaAction,
  type EstadoUsuario,
} from "./actions";
import type { PerfilOpcaoUI } from "./FormCriarUsuario";

/** O usuário como esta ilha o consome — declarado aqui (o grep barra lib/portas no client). */
export interface UsuarioLinhaUI {
  readonly id: string;
  readonly identificador: string;
  readonly ativo: boolean;
  readonly vinculos: readonly { readonly perfilId: string; readonly nome: string }[];
  /** V3 (pacote 2): a pessoa que este usuário é — `null` = vínculo pendente. */
  readonly pessoa: { readonly documento: string; readonly nome: string } | null;
}

function Mensagem({ estado }: { readonly estado: EstadoUsuario }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined)
    return (
      <p className="text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
        {estado.senhaParaEntregar !== undefined ? (
          <> · senha: <strong className="tabular select-all">{estado.senhaParaEntregar}</strong></>
        ) : null}
      </p>
    );
  return null;
}

/**
 * AÇÕES POR USUÁRIO (TR 4.55/4.56) — conceder/revogar perfil, ativar/inativar, resetar senha. Cada
 * uma cobra a sua ação do censo (a separação da administração). Num `<details>`: expandir é o passo
 * deliberado que serve de confirmação para os atos destrutivos (inativar, resetar).
 */
export function AcoesUsuario({ usuario, perfis }: { readonly usuario: UsuarioLinhaUI; readonly perfis: readonly PerfilOpcaoUI[] }): React.ReactElement {
  const [estConceder, actConceder, pendConceder] = useActionState<EstadoUsuario, FormData>(concederPerfilAction, {});
  const [estRevogar, actRevogar, pendRevogar] = useActionState<EstadoUsuario, FormData>(revogarPerfilAction, {});
  const [estAtivo, actAtivo, pendAtivo] = useActionState<EstadoUsuario, FormData>(usuario.ativo ? inativarUsuarioAction : ativarUsuarioAction, {});
  const [estReset, actReset, pendReset] = useActionState<EstadoUsuario, FormData>(resetarSenhaAction, {});
  const [estVinc, actVinc, pendVinc] = useActionState<EstadoUsuario, FormData>(usuario.pessoa === null ? vincularPessoaAction : desvincularPessoaAction, {});

  const vinculadosIds = new Set(usuario.vinculos.map((v) => v.perfilId));
  const naoVinculados = perfis.filter((p) => !vinculadosIds.has(p.id));

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-[color:var(--color-primary)] hover:underline">Gerenciar</summary>
      <div className="mt-2 space-y-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3">
        {/* A PESSOA DO CADASTRO (V3, pacote 2) — pelo documento, nunca pelo nome; não concede permissão */}
        <form action={actVinc} className="flex flex-wrap items-end gap-2" data-acao={usuario.pessoa === null ? "vincular-pessoa" : "desvincular-pessoa"} data-usuario={usuario.identificador}>
          <input type="hidden" name="usuarioId" value={usuario.id} />
          {usuario.pessoa === null ? (
            <>
              <label>
                <span className={ROTULO}>Vincular à pessoa do cadastro (CPF/CNPJ)</span>
                <input name="documento" required placeholder="000.000.000-00" className={CAMPO} />
              </label>
              <label>
                <span className={ROTULO}>Motivo</span>
                <input name="motivo" required minLength={5} placeholder="É o servidor da matrícula…" className={CAMPO} />
              </label>
              <button type="submit" disabled={pendVinc} className={BOTAO}>Vincular</button>
            </>
          ) : (
            <>
              <span className="text-[color:var(--color-ink-2)]">
                Pessoa vinculada: <strong>{usuario.pessoa.nome}</strong> ({usuario.pessoa.documento})
              </span>
              <label>
                <span className={ROTULO}>Motivo do desvínculo</span>
                <input name="motivo" required minLength={5} className={CAMPO} />
              </label>
              <button type="submit" disabled={pendVinc} className="h-7 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2 text-xs hover:bg-[color:var(--color-surface)]">Desvincular</button>
            </>
          )}
          <Mensagem estado={estVinc} />
        </form>

        {/* CONCEDER PERFIL */}
        <form action={actConceder} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <label>
            <span className={ROTULO}>Conceder perfil</span>
            <select name="perfilId" defaultValue="" className={CAMPO} disabled={naoVinculados.length === 0}>
              <option value="" disabled>{naoVinculados.length === 0 ? "já tem todos" : "escolha…"}</option>
              {naoVinculados.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </label>
          <button type="submit" disabled={pendConceder || naoVinculados.length === 0} className={BOTAO}>Conceder</button>
          <Mensagem estado={estConceder} />
        </form>

        {/* REVOGAR PERFIL — um botão por vínculo */}
        {usuario.vinculos.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="uppercase tracking-wide text-[color:var(--color-ink-2)]">Revogar perfil:</span>
            {usuario.vinculos.map((v) => (
              <form key={v.perfilId} action={actRevogar} className="inline">
                <input type="hidden" name="usuarioId" value={usuario.id} />
                <input type="hidden" name="perfilId" value={v.perfilId} />
                <button type="submit" disabled={pendRevogar} className="h-7 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-2 text-xs hover:bg-[color:var(--color-surface)]">{v.nome} ✕</button>
              </form>
            ))}
            <Mensagem estado={estRevogar} />
          </div>
        ) : null}

        {/* ATIVAR / INATIVAR */}
        <form action={actAtivo} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <button type="submit" disabled={pendAtivo} className={BOTAO}>
            {usuario.ativo ? "Inativar (derruba as sessões dele)" : "Reativar"}
          </button>
          <Mensagem estado={estAtivo} />
        </form>

        {/* RESETAR SENHA */}
        <form action={actReset} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="usuarioId" value={usuario.id} />
          <label>
            <span className={ROTULO}>Nova senha temporária (mín. 12)</span>
            <input name="senhaTemporaria" required minLength={12} placeholder="frase longa" className={CAMPO} />
          </label>
          <button type="submit" disabled={pendReset} className={BOTAO}>Resetar senha</button>
          <Mensagem estado={estReset} />
        </form>
      </div>
    </details>
  );
}
