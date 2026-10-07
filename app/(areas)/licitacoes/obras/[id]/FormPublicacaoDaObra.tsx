"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { publicarObraAction, type EstadoDaPublicacao } from "./publicacao-actions";

/**
 * V36 (TR 5.10.1.54) — PUBLICAR A OBRA NO PORTAL (ou retirá-la). Publicar expõe o cadastro, os valores e os ANEXOS a
 * qualquer pessoa, sem sessão: a tela diz isso antes do botão. Retirar pede o motivo.
 */
export function FormPublicacaoDaObra({ obraId, publicada }: { readonly obraId: string; readonly publicada: boolean }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaPublicacao, FormData>(publicarObraAction, {});
  return (
    <form action={action} data-acao="publicar-obra" className="space-y-2 text-xs">
      <ChaveDeComando />
      <input type="hidden" name="obraId" value={obraId} />
      <input type="hidden" name="publicar" value={publicada ? "nao" : "sim"} />
      {publicada ? (
        <label className="block">
          <span className={ROTULO}>Motivo da retirada do portal</span>
          <input name="motivo" required minLength={10} className={CAMPO} />
        </label>
      ) : (
        <p className="text-[color:var(--color-ink-2)]">
          Publicar põe no portal da transparência, sem senha, o cadastro desta obra, os valores e todos os documentos anexados a ela.
        </p>
      )}
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Gravando…" : publicada ? "Retirar do portal" : "Publicar no portal da transparência"}
      </button>
      {estado.erro !== undefined ? <p role="alert" data-resultado-da-acao="publicar-obra" className="text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="publicar-obra" className="text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </form>
  );
}
