"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { capturarVersaoAction, type EstadoDoProjeto } from "./projeto-actions";

export function FormVersaoDoProjeto({ leiId, exercicio }: { readonly leiId: string; readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoProjeto, FormData>(capturarVersaoAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="guardar-versao-do-projeto" aria-label="Guardar uma versão do projeto encaminhado">
      <ChaveDeComando />
      <input type="hidden" name="leiId" value={leiId} />
      <h3 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Guardar uma versão do projeto</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Guarda uma cópia do planejamento de {exercicio} como está hoje: dotações, receita prevista, programas, ações e
        unidades. Faça no dia do encaminhamento, antes de qualquer alteração e antes da lei aprovada.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Versão</span>
          <select name="tipo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            <option value="ENCAMINHADO">Projeto encaminhado</option>
            <option value="MENSAGEM_MODIFICATIVA">Mensagem modificativa</option>
            <option value="EMENDADO_NA_CAMARA">Emendado na Câmara</option>
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Chegou à Câmara em</span><input name="dataDoEncaminhamento" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Vai na prestação de contas de</span><input name="competenciaDaRemessa" type="month" required defaultValue={`${String(exercicio - 1)}-09`} className={CAMPO} /></label>
        <label className="text-xs sm:col-span-3"><span className={ROTULO}>Documento (mensagem, ofício, protocolo na Câmara)</span><input name="documento" required minLength={5} className={CAMPO} /></label>
        <label className="text-xs sm:col-span-3"><span className={ROTULO}>Fundamento</span><input name="fundamento" required minLength={10} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Guardando…" : "Guardar a versão"}</button>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="guardar-versao-do-projeto" className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </form>
  );
}
