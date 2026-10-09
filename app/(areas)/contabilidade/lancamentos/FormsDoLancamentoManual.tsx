"use client";

import { useActionState, useId, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { CampoReferenciado } from "../../../../components/ui/CampoReferenciado";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { estornarLancamentoAction, registrarLancamentoAction, type EstadoDoLancamento } from "./actions";

function Mensagens({ estado }: { readonly estado: EstadoDoLancamento }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
    </>
  );
}

/**
 * REGISTRAR UM LANÇAMENTO MANUAL — data do fato, número de controle, histórico e as partidas (conta
 * PCASP, débito ou crédito, valor). O subsistema sai da classe da conta; o domínio confere que débitos e
 * créditos fecham no lançamento e em cada subsistema, que a conta existe e é analítica, e que o período
 * está aberto.
 */
export function FormLancamentoManual(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoLancamento, FormData>(registrarLancamentoAction, {});
  const id = useId();
  const [linhas, setLinhas] = useState(2);
  return (
    <form action={action} data-acao="registrar-lancamento-manual" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Registrar lançamento manual</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Para ajustes, reclassificações e aberturas. Busque cada conta pelo código ou pelo nome; só contas analíticas do
        plano entram. Os débitos têm de fechar com os créditos, e o lançamento só entra em período aberto.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={`${id}-dia`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do fato</span>
          <input id={`${id}-dia`} name="dia" type="date" required className={CAMPO} />
        </label>
        <label htmlFor={`${id}-numero`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número de controle</span>
          <input id={`${id}-numero`} name="numeroControle" required placeholder="AJ-001/2026" className={CAMPO} />
        </label>
        <label htmlFor={`${id}-historico`} className="text-xs text-[color:var(--color-ink-2)] sm:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <input id={`${id}-historico`} name="historico" required minLength={3} className={CAMPO} />
        </label>
      </div>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[color:var(--color-ink-2)]">
            <th className="py-1 pr-2">Conta</th>
            <th className="py-1 pr-2">Débito ou crédito</th>
            <th className="py-1">Valor (R$)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: linhas }, (_, i) => (
            <tr key={i}>
              <td className="py-1 pr-2">
                {/* V38 — a conta pela busca (código ou nome), não mais digitada inteira; o valor que viaja é o código. */}
                <CampoReferenciado name={`partidas.${i}.conta`} rotulo={`Conta da partida ${i + 1}`} catalogo="contas-analiticas" placeholder="Código ou nome da conta" largura={4} />
              </td>
              <td className="py-1 pr-2">
                <select aria-label={`Débito ou crédito da partida ${i + 1}`} name={`partidas.${i}.tipo`} defaultValue={i % 2 === 0 ? "DEBITO" : "CREDITO"} className={CAMPO}>
                  <option value="DEBITO">Débito</option>
                  <option value="CREDITO">Crédito</option>
                </select>
              </td>
              <td className="py-1">
                <CampoValor aria-label={`Valor da partida ${i + 1}`} name={`partidas.${i}.valor`} placeholder="0,00" className={CAMPO} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 20))} className="text-xs font-semibold text-[color:var(--color-primary)] underline">
          Adicionar partida
        </button>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Registrando…" : "Registrar lançamento"}
        </button>
      </div>
      <Mensagens estado={estado} />
    </form>
  );
}

export interface OpcaoDeEstorno {
  readonly id: string;
  readonly rotulo: string;
}

/** ESTORNAR um lançamento manual: um lançamento NOVO, com as partidas invertidas, ligado ao original. */
export function FormEstornoManual({ opcoes }: { readonly opcoes: readonly OpcaoDeEstorno[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoLancamento, FormData>(estornarLancamentoAction, {});
  const id = useId();
  return (
    <form action={action} data-acao="estornar-lancamento-manual" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Estornar lançamento manual</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        O original fica no razão; o estorno é um lançamento novo, com as partidas invertidas. Lançamento de empenho,
        pagamento ou arrecadação se desfaz pela anulação do próprio registro.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={`${id}-lancamento`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Lançamento</span>
          <select id={`${id}-lancamento`} name="lancamentoId" required className={CAMPO} defaultValue="">
            <option value="">Escolha…</option>
            {opcoes.map((o) => (
              <option key={o.id} value={o.id}>{o.rotulo}</option>
            ))}
          </select>
        </label>
        <label htmlFor={`${id}-numero`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número do estorno</span>
          <input id={`${id}-numero`} name="numeroControle" required placeholder="EST-001/2026" className={CAMPO} />
        </label>
        <label htmlFor={`${id}-dia`} className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do estorno</span>
          <input id={`${id}-dia`} name="dia" type="date" required className={CAMPO} />
        </label>
      </div>
      <div className="mt-4">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Estornando…" : "Estornar"}</button>
      </div>
      <Mensagens estado={estado} />
    </form>
  );
}
