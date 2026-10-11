"use client";

import { useActionState, useId } from "react";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { useState } from "react";
import { ajustarAction, corrigirAction, dispensarAction, trocarDepositoAction, vincularDepositoAction, type EstadoDaOperacao } from "./actions";

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

/**
 * V39-R3 (R3-009) — CORRIGIR UMA DISPENSAÇÃO. O cancelamento devolve todos os itens ao estoque (só outra pessoa cancela
 * o registro de quem dispensou); a devolução pede a conferência de cada item devolvido: apto ao reuso volta ao estoque,
 * inapto não volta e leva o destino. O formulário fica montado depois do ato (só a resposta, quando não há mais item a
 * corrigir), para a confirmação não sumir com a recarga da página.
 */
export function FormCorrigirDispensacao({ farmaciaId, dispensacaoId, numero, itens, hoje }: {
  readonly farmaciaId: string;
  readonly dispensacaoId: string;
  readonly numero: number;
  readonly itens: readonly { readonly id: string; readonly rotulo: string }[];
  readonly hoje: string;
}): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(corrigirAction, {});
  const [tipo, setTipo] = useState<"CANCELAMENTO_DO_REGISTRO" | "DEVOLUCAO">("CANCELAMENTO_DO_REGISTRO");
  if (itens.length === 0) return <Resultado estado={estado} nome={`corrigir-${String(numero)}`} />;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-primary)]">Corrigir a dispensação nº {numero}</summary>
      <form action={action} className={`${QUADRO} mt-1 space-y-2`} data-acao="corrigir-dispensacao" data-dispensacao={numero}>
        <ChaveDeComando />
        <input name="farmaciaId" type="hidden" value={farmaciaId} />
        <input name="dispensacaoId" type="hidden" value={dispensacaoId} />
        <fieldset className="flex flex-wrap gap-4 text-xs">
          <legend className={ROTULO}>O que aconteceu</legend>
          <label className="flex items-center gap-1"><input checked={tipo === "CANCELAMENTO_DO_REGISTRO"} name="tipo" onChange={() => setTipo("CANCELAMENTO_DO_REGISTRO")} type="radio" value="CANCELAMENTO_DO_REGISTRO" /> O registro foi feito por engano (a entrega não aconteceu)</label>
          <label className="flex items-center gap-1"><input checked={tipo === "DEVOLUCAO"} name="tipo" onChange={() => setTipo("DEVOLUCAO")} type="radio" value="DEVOLUCAO" /> O usuário devolveu o medicamento</label>
        </fieldset>
        {tipo === "DEVOLUCAO" ? (
          <fieldset className="space-y-1">
            <legend className={ROTULO}>Conferência de cada item devolvido</legend>
            {itens.map((i) => (
              <div className="grid gap-2 sm:grid-cols-[1fr_14rem]" key={i.id}>
                <label className="text-xs" htmlFor={`${uid}-c-${i.id}`}>{i.rotulo}</label>
                <select className={CAMPO} id={`${uid}-c-${i.id}`} name={`condicao_${i.id}`}>
                  <option value="">Não devolvido</option>
                  <option value="APTO_AO_REUSO">Apto ao reuso (volta ao estoque)</option>
                  <option value="INAPTO">Inapto (não volta ao estoque)</option>
                </select>
              </div>
            ))}
          </fieldset>
        ) : <p className="text-xs">Todos os itens voltam ao estoque e o consumo é estornado. Quem dispensou não cancela o próprio registro.</p>}
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-d`}>Data</label>
            <input className={CAMPO} defaultValue={hoje} id={`${uid}-d`} name="data" required type="date" />
          </div>
          <div className="sm:col-span-2">
            <label className={ROTULO} htmlFor={`${uid}-m`}>Motivo</label>
            <input className={CAMPO} id={`${uid}-m`} name="motivo" required />
          </div>
        </div>
        {tipo === "DEVOLUCAO" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={ROTULO} htmlFor={`${uid}-cp`}>Quem conferiu o produto devolvido</label>
              <input className={CAMPO} id={`${uid}-cp`} name="conferidoPor" />
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-de`}>Destino do item inapto (descarte, recolhimento)</label>
              <input className={CAMPO} id={`${uid}-de`} name="destino" />
            </div>
          </div>
        ) : null}
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando..." : "Registrar a correção"}</button>
        <Resultado estado={estado} nome={`corrigir-${String(numero)}`} />
      </form>
    </details>
  );
}

/** V39-R3 (R3-010) — TROCAR O DEPÓSITO DA FARMÁCIA a partir de um dia. O estoque não se transfere pela troca. */
export function FormTrocarDeposito({ farmaciaId, depositos, hoje }: { readonly farmaciaId: string; readonly depositos: readonly { readonly id: string; readonly rotulo: string }[]; readonly hoje: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(trocarDepositoAction, {});
  return (
    <form action={action} className={`${QUADRO} space-y-2`} data-acao="trocar-deposito">
      <ChaveDeComando />
      <input name="farmaciaId" type="hidden" value={farmaciaId} />
      <p className="text-xs">A farmácia passa a usar o depósito novo a partir do dia escolhido. O estoque não muda de depósito com a troca: o que ficar no anterior sai por transferência do almoxarifado.</p>
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${uid}-n`}>Depósito novo</label>
          <select className={CAMPO} id={`${uid}-n`} name="depositoNovoId" required>
            <option value="">Escolha</option>
            {depositos.map((d) => <option key={d.id} value={d.id}>{d.rotulo}</option>)}
          </select>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-v`}>A partir de</label>
          <input className={CAMPO} defaultValue={hoje} id={`${uid}-v`} name="vigenteDesde" required type="date" />
        </div>
      </div>
      <div>
        <label className={ROTULO} htmlFor={`${uid}-f`}>Fundamento (ato, reorganização)</label>
        <input className={CAMPO} id={`${uid}-f`} name="fundamento" required />
      </div>
      <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">{pendente ? "Gravando..." : "Trocar o depósito"}</button>
      <Resultado estado={estado} nome="trocar-deposito" />
    </form>
  );
}
