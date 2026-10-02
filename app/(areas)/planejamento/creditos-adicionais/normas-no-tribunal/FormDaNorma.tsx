"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CampoValor } from "../../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO as PAINEL, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { registrarNormaAction, type EstadoDaNorma } from "./actions";

export function FormDaNorma({ leis }: { readonly leis: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaNorma, FormData>(registrarNormaAction, {});
  return (
    <form action={action} className={PAINEL} data-acao="registrar-norma-no-tribunal" aria-label="Registrar uma lei com o protocolo do Tribunal">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Registrar uma lei com o protocolo do Tribunal</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        O protocolo é o do banco de legislação do Tribunal de Contas do Estado, no formato 000000/00, como consta no
        comprovante do envio da lei.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Tipo da lei</span>
          <select name="tipo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            <option value="LOA">Lei orçamentária anual</option>
            <option value="CREDITO_SUPLEMENTAR">Crédito suplementar</option>
            <option value="CREDITO_ESPECIAL">Crédito especial</option>
            <option value="TRANSPOSICAO">Transposição, remanejamento ou transferência</option>
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Número da lei</span><input name="numero" required inputMode="numeric" maxLength={5} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Ano da lei</span><input name="ano" required inputMode="numeric" maxLength={4} className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Publicada em</span><input name="dataPublicacao" type="date" required className={CAMPO} /></label>
        <label className="text-xs"><span className={ROTULO}>Protocolo no Tribunal</span><input name="protocoloTce" required placeholder="000000/00" pattern="\d{6}/\d{2}" maxLength={9} className={CAMPO} /></label>
        <label className="text-xs">
          <span className={ROTULO}>Lei de crédito do cadastro (se houver)</span>
          <select name="leiCreditoId" defaultValue="" className={CAMPO}>
            <option value="">Nenhuma</option>
            {leis.map((l) => <option key={l.id} value={l.id}>{l.rotulo}</option>)}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>A autorização é</span>
          <select name="autorizacao" required defaultValue="VALOR" className={CAMPO}>
            <option value="VALOR">Um valor em reais</option>
            <option value="PERCENTUAL">Um percentual da despesa fixada</option>
          </select>
        </label>
        <label className="text-xs"><span className={ROTULO}>Valor ou percentual autorizado</span><CampoValor name="valor" required placeholder="0,00" className={CAMPO} aria-label="Valor ou percentual autorizado" /></label>
        <label className="text-xs sm:col-span-3"><span className={ROTULO}>Fundamento (comprovante do Tribunal, artigo da lei)</span><input name="fundamento" required minLength={10} className={CAMPO} /></label>
      </div>
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-3`}>{pendente ? "Gravando…" : "Registrar"}</button>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 text-xs text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao="registrar-norma-no-tribunal" className="mt-2 text-xs text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </form>
  );
}
