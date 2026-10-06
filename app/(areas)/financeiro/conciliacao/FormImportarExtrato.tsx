"use client";

import { useActionState, useId } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { importarExtratoAction, type EstadoDoVinculo } from "./actions";

/**
 * V36 — IMPORTAR O EXTRATO OFX NA PRÓPRIA TELA DA CONCILIAÇÃO. O formulário fica montado depois do sucesso (a tela
 * recarrega com as linhas novas e a mensagem continua à vista), e importar o mesmo arquivo de novo é inofensivo:
 * a importação é idempotente pelo hash do arquivo, e a mensagem diz que nada mudou.
 */
export function FormImportarExtrato({ contas }: { readonly contas: readonly { readonly codigo: string; readonly descricao: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoVinculo, FormData>(importarExtratoAction, {});
  const id = useId();
  return (
    <form action={action} data-acao="importar-extrato" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Importar extrato bancário (OFX)</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        O arquivo OFX exportado pelo internet banking (alguns bancos o entregam com a extensão .ofc). Importar de novo o mesmo arquivo não duplica linhas, e o arquivo de outra conta é recusado.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label htmlFor={`${id}-conta`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária</span>
          <select id={`${id}-conta`} name="contaBancaria" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {contas.map((c) => (
              <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.descricao}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-arquivo`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Arquivo OFX</span>
          <input id={`${id}-arquivo`} name="arquivo" type="file" accept=".ofx,.OFX,.ofc,.OFC,application/x-ofx" required className="block w-full text-sm text-[color:var(--color-ink-2)]" />
        </label>
      </div>
      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="importar-extrato" className="mt-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="importar-extrato" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Importando…" : "Importar extrato"}
      </button>
    </form>
  );
}
