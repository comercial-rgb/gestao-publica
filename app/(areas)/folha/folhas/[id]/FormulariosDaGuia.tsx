"use client";

import { useActionState, useId, useRef, useState } from "react";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../components/ui/Formulario";

/**
 * AS ILHAS DA GUIA DE RECOLHIMENTO (V7 M1 U3.2) — registrar o documento do emissor (arquivo e componentes
 * são lista e arquivo: fora do molde), baixar por um pagamento existente e cancelar.
 *
 * ⚠️ NENHUM VALOR SUGERIDO: principal, componentes, total e vencimento vêm da guia que o emissor entregou.
 * Vencimento sem o fundamento é recusado; sem regra, deixe os dois em branco e o sistema diz "não informado".
 */
type Acao = (e: EstadoDoMolde, f: FormData) => Promise<EstadoDoMolde>;

function Resultado({ estado }: { readonly estado: EstadoDoMolde }): React.ReactElement | null {
  if (estado.erro !== undefined) return <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  if (estado.sucesso !== undefined) return <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  return null;
}

export function FormGuiaDeRecolhimento({ folhaId, grupos, action }: { readonly folhaId: string; readonly grupos: readonly { readonly valor: string; readonly rotulo: string }[]; readonly action: Acao }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoMolde, FormData>(action, {});
  const [linhas, setLinhas] = useState(2);
  const id = useId();
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  const campo = (nome: string, rotulo: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}, largura = ""): React.ReactElement => (
    <label htmlFor={`${id}-${nome}`} className={`text-xs text-[color:var(--color-ink-2)] ${largura}`}>
      <span className={CLASSE_ROTULO}>{rotulo}</span>
      <input id={`${id}-${nome}`} name={nome} className={CLASSE_CAMPO} {...extra} />
    </label>
  );
  return (
    <form ref={ref} action={disparar} data-acao="registrar-guia" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={folhaId} />
      <h3 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Registrar guia recebida do emissor</h3>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">Cadastra o documento REAL (com o arquivo) que o arrecadador emitiu. O sistema não gera guia, código de barras nem PIX, e registrar não paga nada.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label htmlFor={`${id}-grupo`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={CLASSE_ROTULO}>Obrigação (grupo de encargos)</span>
          <select id={`${id}-grupo`} name="grupoId" required defaultValue="" className={CLASSE_CAMPO}>
            <option value="" disabled>Escolha</option>
            {grupos.map((g) => <option key={g.valor} value={g.valor}>{g.rotulo}</option>)}
          </select>
        </label>
        {campo("identificador", "Número/identificador da guia", { required: true, minLength: 3 }, "sm:col-span-2")}
        {campo("natureza", "Natureza como consta na guia", { required: true, minLength: 5 }, "sm:col-span-2 lg:col-span-4")}
        {campo("vencimento", "Vencimento (vazio = não informado)", { type: "date" })}
        {campo("fundamentoDoVencimento", "Fundamento do vencimento", {}, "sm:col-span-1 lg:col-span-3")}
        {campo("principal", "Principal", { required: true, inputMode: "decimal", pattern: "[0-9.]+(,[0-9]{1,2})?|[0-9]+(\\.[0-9]{1,2})?" })}
        {campo("total", "Total da guia", { required: true, inputMode: "decimal" })}
        <label htmlFor={`${id}-arquivo`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={CLASSE_ROTULO}>Arquivo da guia (PDF ou imagem)</span>
          <input id={`${id}-arquivo`} type="file" name="arquivo" required accept="application/pdf,image/png,image/jpeg" className={CLASSE_CAMPO} />
        </label>
      </div>
      <fieldset className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Componentes discriminados na guia (atualização, juros, multa)</legend>
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-3">
            {campo(`componentes.${i}.rotulo`, `Componente ${i + 1}`, {}, "sm:col-span-2")}
            {campo(`componentes.${i}.valor`, "Valor", { inputMode: "decimal" })}
          </div>
        ))}
        <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 10))} className="text-xs text-[color:var(--color-primary)] underline">Mais um componente</button>
      </fieldset>
      <Resultado estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Registrando…" : "Registrar guia"}</button>
    </form>
  );
}

export function FormBaixaDaGuia({ folhaId, guiaId, identificador, pagamentos, action }: { readonly folhaId: string; readonly guiaId: string; readonly identificador: string; readonly pagamentos: readonly { readonly valor: string; readonly rotulo: string }[]; readonly action: Acao }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoMolde, FormData>(action, {});
  const id = useId();
  return (
    <form action={disparar} data-acao="baixar-guia" data-guia={identificador} className="flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={folhaId} />
      <input type="hidden" name="guiaId" value={guiaId} />
      <label htmlFor={`${id}-pg`} className="text-xs">
        <span className={CLASSE_ROTULO}>Pagamento que quitou</span>
        <select id={`${id}-pg`} name="pagamentoId" required defaultValue="" className={CLASSE_CAMPO} disabled={pagamentos.length === 0}>
          <option value="" disabled>{pagamentos.length === 0 ? "nenhum pagamento dos encargos deste grupo" : "Escolha"}</option>
          {pagamentos.map((p) => <option key={p.valor} value={p.valor}>{p.rotulo}</option>)}
        </select>
      </label>
      <label htmlFor={`${id}-obs`} className="text-xs">
        <span className={CLASSE_ROTULO}>Observação</span>
        <input id={`${id}-obs`} name="observacao" required minLength={5} className={CLASSE_CAMPO} />
      </label>
      <button type="submit" disabled={pendente || pagamentos.length === 0} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Baixando…" : "Baixar guia"}</button>
      <Resultado estado={estado} />
    </form>
  );
}

export function FormCancelarGuia({ folhaId, guiaId, identificador, action }: { readonly folhaId: string; readonly guiaId: string; readonly identificador: string; readonly action: Acao }): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoMolde, FormData>(action, {});
  const id = useId();
  return (
    <form action={disparar} data-acao="cancelar-guia" data-guia={identificador} className="flex flex-wrap items-end gap-2">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={folhaId} />
      <input type="hidden" name="guiaId" value={guiaId} />
      <label htmlFor={`${id}-motivo`} className="text-xs">
        <span className={CLASSE_ROTULO}>Motivo do cancelamento</span>
        <input id={`${id}-motivo`} name="motivo" required minLength={10} className={CLASSE_CAMPO} />
      </label>
      <button type="submit" disabled={pendente} className="h-11 rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-4 text-sm">{pendente ? "Cancelando…" : "Cancelar guia"}</button>
      <Resultado estado={estado} />
    </form>
  );
}
