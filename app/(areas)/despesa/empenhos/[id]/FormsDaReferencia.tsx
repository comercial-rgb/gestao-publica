"use client";

import { useActionState, useId } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { conferirReferenciaAction, registrarReferenciaAction, type EstadoDaReferencia } from "./actions-referencia";

/** V39-R3 (R3-017) — os formulários da referência externa, com a resposta do servidor abaixo de cada um. */

function Resultado({ estado, nome }: { readonly estado: EstadoDaReferencia; readonly nome: string }): React.ReactElement | null {
  const texto = estado.erro ?? estado.sucesso;
  if (texto === undefined) return null;
  return (
    <p className={estado.erro !== undefined ? "mt-1 text-xs text-[color:var(--color-status-erro-fg)]" : "mt-1 text-xs text-[color:var(--color-status-ok-fg)]"} data-resultado-da-acao={nome} role={estado.erro !== undefined ? "alert" : "status"}>
      {texto}
    </p>
  );
}

export function FormRegistrarReferencia({ empenhoId }: { readonly empenhoId: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaReferencia, FormData>(registrarReferenciaAction, {});
  return (
    <form action={action} className="mt-2 grid gap-2 sm:grid-cols-2" data-acao="registrar-referencia-externa">
      <ChaveDeComando />
      <input name="empenhoId" type="hidden" value={empenhoId} />
      <div><label className={ROTULO} htmlFor={`${uid}-s`}>Sistema ou órgão de origem</label><input className={CAMPO} id={`${uid}-s`} name="sistemaDeOrigem" required /></div>
      <div><label className={ROTULO} htmlFor={`${uid}-i`}>Identificador lá (processo, requisição, protocolo)</label><input className={CAMPO} id={`${uid}-i`} name="identificador" required /></div>
      <div className="sm:col-span-2"><label className={ROTULO} htmlFor={`${uid}-d`}>Documento que traz a referência</label><input className={CAMPO} id={`${uid}-d`} name="documento" required /></div>
      <div className="sm:col-span-2"><label className={ROTULO} htmlFor={`${uid}-o`}>Observação (opcional)</label><input className={CAMPO} id={`${uid}-o`} name="observacao" /></div>
      <div className="sm:col-span-2">
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando..." : "Registrar a referência"}</button>
        <Resultado estado={estado} nome="registrar-referencia-externa" />
      </div>
    </form>
  );
}

export function FormConferirReferencia({ empenhoId, referenciaId, identificador, conferida }: { readonly empenhoId: string; readonly referenciaId: string; readonly identificador: string; readonly conferida: boolean }): React.ReactElement | null {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaReferencia, FormData>(conferirReferenciaAction, {});
  // Conferida, o formulário sai e a resposta fica (o componente segue montado, para a confirmação não sumir na recarga).
  if (conferida) return <Resultado estado={estado} nome={`conferir-referencia-${identificador}`} />;
  return (
    <form action={action} className="mt-1 grid gap-2 sm:grid-cols-3" data-acao="conferir-referencia-externa" data-referencia={identificador}>
      <ChaveDeComando />
      <input name="empenhoId" type="hidden" value={empenhoId} />
      <input name="referenciaId" type="hidden" value={referenciaId} />
      <div>
        <label className={ROTULO} htmlFor={`${uid}-r`}>Resultado da conferência</label>
        <select className={CAMPO} defaultValue="CONFIRMADA" id={`${uid}-r`} name="resultado">
          <option value="CONFIRMADA">Confere com o sistema de origem</option>
          <option value="DIVERGENTE">Diverge do sistema de origem</option>
        </select>
      </div>
      <div><label className={ROTULO} htmlFor={`${uid}-m`}>Como conferiu</label><input className={CAMPO} id={`${uid}-m`} name="meio" required /></div>
      <div><label className={ROTULO} htmlFor={`${uid}-o`}>O que não confere (na divergência)</label><input className={CAMPO} id={`${uid}-o`} name="observacao" /></div>
      <div className="sm:col-span-3">
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando..." : "Registrar a conferência"}</button>
        <Resultado estado={estado} nome={`conferir-referencia-${identificador}`} />
      </div>
    </form>
  );
}
