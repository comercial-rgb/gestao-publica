"use client";

import { useActionState, useId, useState } from "react";
import { CampoValor } from "../../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { revisarAction, transcreverAction, type EstadoDaTranscricao } from "./actions";

/** V39-R3 (R3-015) — os formulários da transcrição de extrato, com a resposta do servidor abaixo de cada um. */

function Resultado({ estado, nome }: { readonly estado: EstadoDaTranscricao; readonly nome: string }): React.ReactElement | null {
  const texto = estado.erro ?? estado.sucesso;
  if (texto === undefined) return null;
  return (
    <p
      className={estado.erro !== undefined ? "mt-2 text-sm text-[color:var(--color-status-erro-fg)]" : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"}
      data-resultado-da-acao={nome}
      role={estado.erro !== undefined ? "alert" : "status"}
    >
      {texto}
    </p>
  );
}

export function FormTranscrever({ contaId, contaCodigo }: { readonly contaId: string; readonly contaCodigo: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaTranscricao, FormData>(transcreverAction, {});
  const [linhas, setLinhas] = useState<number[]>([0]);
  return (
    <form action={action} data-acao="transcrever-extrato" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="contaBancariaId" value={contaId} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Transcrever linhas do extrato da conta {contaCodigo}</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Use quando não há arquivo do banco. Copie as linhas como estão no documento. Elas só entram na conciliação depois que outra pessoa as
        conferir contra o mesmo documento, e o extrato do banco, quando chegar, substitui a transcrição dos dias que cobrir.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${uid}-doc`}>Documento de onde as linhas foram copiadas</label>
          <input id={`${uid}-doc`} name="documentoDeSuporte" required placeholder="extrato impresso entregue pela agência em 10/03/2026" className={CAMPO} />
        </div>
      </div>
      <div className="mt-3 grid gap-3">
        {linhas.map((k, i) => (
          <fieldset key={k} className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2 sm:grid-cols-5" data-linha-da-transcricao={i + 1}>
            <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Linha {i + 1}</legend>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-d-${k}`}>Data</label>
              <input id={`${uid}-d-${k}`} name="linhaData" type="date" className={CAMPO} />
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-n-${k}`}>Entrada ou saída</label>
              <select id={`${uid}-n-${k}`} name="linhaNatureza" defaultValue="" className={CAMPO}>
                <option value="">Escolha…</option>
                <option value="CREDITO">Entrada (crédito)</option>
                <option value="DEBITO">Saída (débito)</option>
              </select>
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-v-${k}`}>Valor (R$)</label>
              <CampoValor id={`${uid}-v-${k}`} name="linhaValor" placeholder="0,00" className={CAMPO} />
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-h-${k}`}>Histórico</label>
              <input id={`${uid}-h-${k}`} name="linhaHistorico" className={CAMPO} />
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-o-${k}`}>Documento da linha (opcional)</label>
              <input id={`${uid}-o-${k}`} name="linhaDocumento" className={CAMPO} />
            </div>
          </fieldset>
        ))}
      </div>
      <button type="button" className="mt-2 text-xs font-medium text-[color:var(--color-primary)] hover:underline" data-acao="mais-uma-linha" onClick={() => setLinhas((l) => [...l, (l[l.length - 1] ?? 0) + 1])}>
        Mais uma linha
      </button>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-obs`}>Observação (opcional)</label>
          <input id={`${uid}-obs`} name="observacao" className={CAMPO} />
        </div>
        <label className="flex items-end gap-2 pb-2 text-xs text-[color:var(--color-ink-2)]" htmlFor={`${uid}-rep`}>
          <input id={`${uid}-rep`} type="checkbox" name="confirmoLinhasRepetidas" />
          <span>Há linhas iguais (mesmo dia, valor e natureza) e são transações diferentes</span>
        </label>
      </div>
      <Resultado estado={estado} nome="transcrever-extrato" />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Transcrever"}</button>
    </form>
  );
}

/**
 * Fica montado depois da revisão (a linha recarrega revisada): aí mostra só a resposta do servidor, sem campos — a linha
 * não aceita segunda revisão, e um formulário à vista sugeriria que aceita.
 */
export function FormRevisar({ transcricaoId, revisada }: { readonly transcricaoId: string; readonly revisada: boolean }): React.ReactElement | null {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaTranscricao, FormData>(revisarAction, {});
  if (revisada) return estado.sucesso === undefined ? null : <Resultado estado={estado} nome={`revisar-transcricao-${transcricaoId}`} />;
  return (
    <form action={action} data-acao="revisar-transcricao" data-transcricao={transcricaoId} className="mt-2 grid gap-2 sm:grid-cols-3">
      <ChaveDeComando />
      <input type="hidden" name="transcricaoId" value={transcricaoId} />
      <div>
        <label className={ROTULO} htmlFor={`${uid}-r`}>Resultado</label>
        <select id={`${uid}-r`} name="resultado" defaultValue="" required className={CAMPO}>
          <option value="">Escolha…</option>
          <option value="CONFIRMADA">Confere com o documento</option>
          <option value="DIVERGENTE">Não confere</option>
        </select>
      </div>
      <div>
        <label className={ROTULO} htmlFor={`${uid}-m`}>Como conferiu</label>
        <input id={`${uid}-m`} name="meio" required placeholder="extrato impresso na mão" className={CAMPO} />
      </div>
      <div>
        <label className={ROTULO} htmlFor={`${uid}-o`}>Observação (opcional)</label>
        <input id={`${uid}-o`} name="observacao" className={CAMPO} />
      </div>
      <div className="sm:col-span-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Registrar a revisão"}</button>
        <Resultado estado={estado} nome={`revisar-transcricao-${transcricaoId}`} />
      </div>
    </form>
  );
}
