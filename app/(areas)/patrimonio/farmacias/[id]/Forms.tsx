"use client";

import { useActionState, useId } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { ajustarAction, dispensarAction, vincularDepositoAction, type EstadoDaOperacao } from "./actions";

/** V39-R2 (R2-030, R2-031) — os formulários da operação da farmácia, com a resposta do servidor abaixo de cada um. */

function Resultado({ estado, nome }: { readonly estado: EstadoDaOperacao; readonly nome: string }): React.ReactElement | null {
  const texto = estado.erro ?? estado.sucesso;
  if (texto === undefined) return null;
  return (
    <p
      className={
        estado.erro !== undefined
          ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
          : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
      }
      data-resultado-da-acao={nome}
      role={estado.erro !== undefined ? "alert" : "status"}
    >
      {texto}
    </p>
  );
}

const QUADRO = "rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3";
export interface OpcaoDeLote {
  readonly loteId: string;
  readonly rotulo: string;
}

export function FormVincularDeposito({ farmaciaId, depositos }: { readonly farmaciaId: string; readonly depositos: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(vincularDepositoAction, {});
  return (
    <form action={action} className={`${QUADRO} space-y-2`} data-acao="vincular-deposito">
      <ChaveDeComando />
      <input name="farmaciaId" type="hidden" value={farmaciaId} />
      <div>
        <label className={ROTULO} htmlFor={`${uid}-d`}>Depósito do almoxarifado que guarda o estoque da farmácia</label>
        <select className={CAMPO} id={`${uid}-d`} name="depositoId" required>
          <option value="">Escolha</option>
          {depositos.map((d) => <option key={d.id} value={d.id}>{d.rotulo}</option>)}
        </select>
      </div>
      <div>
        <label className={ROTULO} htmlFor={`${uid}-f`}>Fundamento (ato ou organização da unidade)</label>
        <input className={CAMPO} id={`${uid}-f`} name="fundamento" required />
      </div>
      <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">Vincular o depósito</button>
      <Resultado estado={estado} nome="vincular-deposito" />
    </form>
  );
}

export function FormDispensar({ farmaciaId, lotes, hoje }: { readonly farmaciaId: string; readonly lotes: readonly OpcaoDeLote[]; readonly hoje: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(dispensarAction, {});
  return (
    <form action={action} className={`${QUADRO} space-y-2`} data-acao="dispensar">
      <ChaveDeComando />
      <input name="farmaciaId" type="hidden" value={farmaciaId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-data`}>Data</label>
          <input className={CAMPO} defaultValue={hoje} id={`${uid}-data`} name="data" required type="date" />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-u`}>Identificador do usuário na unidade (cartão ou prontuário, sem nome)</label>
          <input autoComplete="off" className={CAMPO} id={`${uid}-u`} maxLength={40} name="identificacaoDoUsuario" required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-r`}>Receita (número e data)</label>
          <input className={CAMPO} id={`${uid}-r`} maxLength={120} name="receita" required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-p`}>Prescritor, com o registro no conselho</label>
          <input className={CAMPO} id={`${uid}-p`} maxLength={120} name="prescritor" required />
        </div>
      </div>
      <fieldset className="space-y-1">
        <legend className={ROTULO}>Medicamentos (até cinco; linha vazia é ignorada)</legend>
        {[1, 2, 3, 4, 5].map((k) => (
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem]" key={k}>
            <div>
              <label className="sr-only" htmlFor={`${uid}-l${String(k)}`}>Lote do item {k}</label>
              <select className={CAMPO} id={`${uid}-l${String(k)}`} name={`lote_${String(k)}`}>
                <option value="">Item {k}: escolha o lote</option>
                {lotes.map((l) => <option key={l.loteId} value={l.loteId}>{l.rotulo}</option>)}
              </select>
            </div>
            <div>
              <label className="sr-only" htmlFor={`${uid}-q${String(k)}`}>Quantidade do item {k}</label>
              <input className={CAMPO} id={`${uid}-q${String(k)}`} inputMode="decimal" name={`quantidade_${String(k)}`} placeholder="Quantidade" />
            </div>
          </div>
        ))}
      </fieldset>
      <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Registrando..." : "Registrar a dispensação"}</button>
      <Resultado estado={estado} nome="dispensar" />
    </form>
  );
}

export function FormAjuste({ farmaciaId, lotes, inventarios, hoje }: { readonly farmaciaId: string; readonly lotes: readonly OpcaoDeLote[]; readonly inventarios: readonly { readonly id: string; readonly rotulo: string }[]; readonly hoje: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(ajustarAction, {});
  return (
    <form action={action} className={`${QUADRO} space-y-2`} data-acao="ajustar">
      <ChaveDeComando />
      <input name="farmaciaId" type="hidden" value={farmaciaId} />
      <fieldset className="flex gap-4 text-xs">
        <legend className={ROTULO}>O que foi apurado</legend>
        <label className="flex items-center gap-1"><input defaultChecked name="sentido" type="radio" value="PERDA" /> Perda (vencimento, avaria, extravio)</label>
        <label className="flex items-center gap-1"><input name="sentido" type="radio" value="SOBRA" /> Sobra</label>
      </fieldset>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-l`}>Lote</label>
          <select className={CAMPO} id={`${uid}-l`} name="loteId" required>
            <option value="">Escolha</option>
            {lotes.map((l) => <option key={l.loteId} value={l.loteId}>{l.rotulo}</option>)}
          </select>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-q`}>Quantidade</label>
          <input className={CAMPO} id={`${uid}-q`} inputMode="decimal" name="quantidade" required />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-d`}>Data</label>
          <input className={CAMPO} defaultValue={hoje} id={`${uid}-d`} name="data" required type="date" />
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-i`}>Inventário em que foi apurado (opcional)</label>
          <select className={CAMPO} id={`${uid}-i`} name="inventarioId">
            <option value="">Nenhum</option>
            {inventarios.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className={ROTULO} htmlFor={`${uid}-m`}>Motivo</label>
        <input className={CAMPO} id={`${uid}-m`} name="motivo" required />
      </div>
      <div>
        <label className={ROTULO} htmlFor={`${uid}-de`}>Destino do produto (na perda: descarte, devolução ao fornecedor, ocorrência)</label>
        <input className={CAMPO} id={`${uid}-de`} name="destino" />
      </div>
      <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">Registrar no estoque e no razão</button>
      <Resultado estado={estado} nome="ajustar" />
    </form>
  );
}
