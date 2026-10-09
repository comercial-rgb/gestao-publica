"use client";

import { useActionState, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { receberOrdemAction, type EstadoDaOrdem } from "../actions";

/** Uma opção como ESTA ilha a consome — declarada aqui porque uma ilha client não importa porta. */
export interface OpcaoDaIlha {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * FORM DE RECEBIMENTO DA ORDEM — ilha client no detalhe (TR 5.17.105): por item, com a quantidade; o pendente é derivado e quem recusa acima dele é o domínio.
 * ⚠️ LINHAS `itens.N.*`: a ilha oferece uma linha a mais; a vazia é ignorada no servidor. Quem valida
 * (material obrigatório, quantidade > 0, item repetido, saldo) é o domínio, e a recusa sobe como veio.
 */
export function FormRecebimento({
  ordemId,
  itensDaOrdem,
  documentos = [],
  fechado,
}: {
  readonly ordemId: string;
  readonly itensDaOrdem: readonly (OpcaoDaIlha & { readonly pendente: string })[];
  readonly documentos?: readonly OpcaoDaIlha[];
  /**
   * Nada a receber (ordem completa, estornada ou bloqueada): a ilha CONTINUA MONTADA e mostra o motivo no lugar dos
   * campos. Assim o recebimento que completa a ordem não leva junto a própria mensagem de sucesso.
   */
  readonly fechado?: { readonly apresentacao: string; readonly motivo: string } | undefined;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOrdem, FormData>(receberOrdemAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [linhas, setLinhas] = useState<number>(1);
  if (estado.sucesso !== undefined) ref.current?.reset();
  // `seq` conta os desfechos para o `data-resultado-seq`: sem o formulário, o percurso lê o resultado pelo marcador.
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<EstadoDaOrdem>(estado);
  if (estado !== ultimo) {
    setUltimo(estado);
    setSeq((n) => n + 1);
  }
  if (fechado !== undefined) {
    return (
      <div className="space-y-2">
        {estado.sucesso !== undefined ? (
          <p role="status" data-resultado-da-acao="receber-ordem" data-resultado-seq={String(seq)} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
        ) : null}
        <p data-acao="receber" data-acao-estado={fechado.apresentacao} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
          {fechado.motivo}
        </p>
      </div>
    );
  }
  return (
    <form ref={ref} action={action} data-acao="receber-ordem" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="ordemId" value={ordemId} />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Registrar recebimento</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do recebimento</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nota fiscal (opcional)</span>
          <input name="notaFiscal" placeholder="NF 1234" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Documento fiscal recebido (opcional)</span>
          <select name="documentoFiscalId" defaultValue="" className={CAMPO}>
            <option value="">— sem documento fiscal —</option>
            {documentos.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Responsável pelo recebimento</span>
          <input name="responsavelRecebimento" required className={CAMPO} />
        </label>
      </div>
      <fieldset data-secao="itens" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Itens</legend>
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-[color:var(--color-ink-2)] lg:col-span-3">
              <span className={ROTULO}>Item da ordem (pendente)</span>
              <select name={`itens.${i}.itemDeOrdemId`} defaultValue="" className={CAMPO}>
                <option value="">— escolha —</option>
                {itensDaOrdem.map((o) => (
                  <option key={o.id} value={o.id}>{o.rotulo} · pendente {o.pendente}</option>
                ))}
              </select>
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Quantidade recebida</span>
              <input name={`itens.${i}.quantidade`} inputMode="decimal" placeholder="10" className={CAMPO} />
            </label>
          </div>
        ))}
        <button type="button" data-acao="mais-um-item" className="text-xs underline underline-offset-2" onClick={() => setLinhas((n) => n + 1)}>
          Mais um item
        </button>
      </fieldset>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : "Registrar recebimento"}
      </button>
    </form>
  );
}
