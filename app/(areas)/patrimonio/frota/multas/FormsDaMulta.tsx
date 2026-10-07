"use client";

import { useActionState } from "react";
import { CampoCpfCnpj, CampoValor } from "../../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { baixarMultaAction, registrarMultaAction, type EstadoDaMulta } from "./actions";

function Resultado({ estado, acao }: { readonly estado: EstadoDaMulta; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return <p role="alert" data-resultado-da-acao={acao} className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>;
  }
  if (estado.sucesso !== undefined) {
    return <p role="status" data-resultado-da-acao={acao} className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>;
  }
  return null;
}

const rotulo = "text-xs text-[color:var(--color-ink-2)]";

/** V36 — registrar a multa de trânsito: o auto, a infração, o valor e o infrator (pessoa física do cadastro). */
export function FormRegistrarMulta({ veiculos }: { readonly veiculos: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaMulta, FormData>(registrarMultaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Registrar multa de trânsito" data-acao="registrar-multa">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold">Registrar multa de trânsito</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        O registro lança o controle da multa pelas contas que a contabilidade declarou. O infrator é o condutor identificado no auto, do cadastro de pessoas.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={rotulo}>
          <span className={ROTULO}>Veículo</span>
          <select name="veiculoId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>Escolha o veículo</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>{v.rotulo}</option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Órgão autuador</span>
          <input name="orgaoAutuador" required placeholder="DETRAN-PB" className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Número do auto de infração</span>
          <input name="numeroDoAuto" required className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Data da infração</span>
          <input name="diaDaInfracao" type="date" required className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Data da notificação</span>
          <input name="diaDaNotificacao" type="date" required className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Vencimento (opcional)</span>
          <input name="diaDoVencimento" type="date" className={CAMPO} />
        </label>
        <label className={`${rotulo} sm:col-span-2`}>
          <span className={ROTULO}>Infração (como consta do auto)</span>
          <input name="infracao" required minLength={5} className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Local</span>
          <input name="local" required className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor name="valor" required className={CAMPO} />
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>CPF do infrator</span>
          <CampoCpfCnpj name="infratorDocumento" required className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} acao="registrar-multa" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Registrando..." : "Registrar a multa"}</button>
    </form>
  );
}

/** V36 — baixar a multa: como ela terminou, quando, e o documento que o comprova. */
export function FormBaixarMulta({
  multas,
  tipos,
}: {
  readonly multas: readonly { readonly id: string; readonly rotulo: string }[];
  readonly tipos: readonly { readonly valor: string; readonly rotulo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaMulta, FormData>(baixarMultaAction, {});
  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} aria-label="Baixar multa de trânsito" data-acao="baixar-multa">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold">Baixar multa</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">A baixa encerra o controle da multa. O pagamento pelo ente segue pelo empenho; a cobrança do infrator, pelo fluxo próprio.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className={`${rotulo} sm:col-span-2`}>
          <span className={ROTULO}>Multa em aberto</span>
          <select name="multaId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>Escolha a multa</option>
            {multas.map((m) => (
              <option key={m.id} value={m.id}>{m.rotulo}</option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Como terminou</span>
          <select name="tipo" required defaultValue="" className={CAMPO}>
            <option value="" disabled>Escolha</option>
            {tipos.map((t) => (
              <option key={t.valor} value={t.valor}>{t.rotulo}</option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          <span className={ROTULO}>Data</span>
          <input name="dia" type="date" required className={CAMPO} />
        </label>
        <label className={`${rotulo} sm:col-span-2`}>
          <span className={ROTULO}>Observação (guia, decisão do recurso, motivo)</span>
          <input name="observacao" required minLength={5} className={CAMPO} />
        </label>
      </div>
      <Resultado estado={estado} acao="baixar-multa" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Baixando..." : "Baixar a multa"}</button>
    </form>
  );
}
