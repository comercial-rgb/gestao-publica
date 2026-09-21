"use client";

import { createContext, useActionState, useContext, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { publicarRoteiroAction, type EstadoDoRoteiro } from "./actions";

/**
 * O FORMULÁRIO DO ROTEIRO (V11 V8.4).
 *
 * ⚠️ UM PROVEDOR PARA A TABELA INTEIRA, e o aviso mora nele: publicar muda a LINHA do par, e a
 * confirmação guardada dentro dela morreria junto. Mesma cura do guichê (V8), pela mesma razão
 * medida.
 *
 * ⚠️ SEM DEFAULT NAS CONTAS. Estas são exatamente as escolhas que duas pendências existiam para
 * não tomar no lugar do ente; um default as tomaria de novo, em silêncio.
 */

export interface ContaDoPlano {
  readonly codigo: string;
  readonly nome: string;
}

interface Ctx {
  readonly action: (f: FormData) => void;
  readonly pendente: boolean;
  readonly contas: readonly ContaDoPlano[];
}
const C = createContext<Ctx | null>(null);

export function RoteirosDoEnte({
  contas,
  children,
}: {
  readonly contas: readonly ContaDoPlano[];
  readonly children: React.ReactNode;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoRoteiro, FormData>(publicarRoteiroAction, {});
  const [seq, setSeq] = useState(0);
  const [ultimo, setUltimo] = useState<string | undefined>(undefined);

  if (estado.sucesso !== undefined && estado.sucesso !== ultimo) {
    setUltimo(estado.sucesso);
    setSeq((n) => n + 1);
  }

  return (
    <C.Provider value={{ action, pendente, contas }}>
      {estado.sucesso !== undefined ? (
        <p
          role="status"
          data-resultado-da-acao="publicar-roteiro"
          data-resultado-seq={String(seq)}
          className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        >
          {estado.sucesso}
        </p>
      ) : null}
      {estado.erro !== undefined ? (
        <p role="alert" className="mb-3 whitespace-pre-line text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {children}
    </C.Provider>
  );
}

export function FormDoPar({
  tipo,
  tipoCredito,
  debito,
  credito,
}: {
  readonly tipo: string;
  readonly tipoCredito: string | null;
  readonly debito: string | null;
  readonly credito: string | null;
}): React.ReactElement {
  const ctx = useContext(C);
  const [aberto, setAberto] = useState(false);

  if (ctx === null) {
    return <span className="text-xs text-[color:var(--color-status-erro-fg)]">Configuração indisponível nesta tela.</span>;
  }

  if (!aberto) {
    return (
      <button type="button" onClick={() => setAberto(true)} className="mt-1 text-xs underline">
        {debito === null ? "Configurar este roteiro" : "Trocar as contas"}
      </button>
    );
  }

  return (
    <form
      action={ctx.action}
      data-acao="publicar-roteiro"
      className="mt-2 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"
      aria-label={`Publicar o roteiro de ${tipo}`}
    >
      <ChaveDeComando />
      <input type="hidden" name="tipo" value={tipo} />
      <input type="hidden" name="tipoCredito" value={tipoCredito ?? ""} />

      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Conta de DÉBITO</span>
        <select name="contaDebitoCodigo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {ctx.contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-xs sm:col-span-2">
        <span className={ROTULO}>Conta de CRÉDITO</span>
        <select name="contaCreditoCodigo" required defaultValue="" className={CAMPO}>
          <option value="">Escolha a conta…</option>
          {ctx.contas.map((c) => (
            <option key={c.codigo} value={c.codigo}>{c.codigo} — {c.nome}</option>
          ))}
        </select>
      </label>
      <label className="text-xs sm:col-span-4">
        <span className={ROTULO}>Por que estas contas</span>
        <input
          name="fundamento"
          required
          minLength={20}
          maxLength={500}
          placeholder="Plano de contas do ente, quadro X; ou a orientação do tribunal que a fixa"
          className={CAMPO}
        />
      </label>
      <div className="flex items-center gap-3 sm:col-span-4">
        <button type="submit" disabled={ctx.pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {ctx.pendente ? "Publicando…" : "Publicar roteiro"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs underline">Cancelar</button>
        {credito !== null ? (
          <span className="text-xs text-[color:var(--color-ink-3)]">
            Hoje: {debito} / {credito}. Publicar cria uma versão — a anterior continua no histórico.
          </span>
        ) : null}
      </div>
    </form>
  );
}
