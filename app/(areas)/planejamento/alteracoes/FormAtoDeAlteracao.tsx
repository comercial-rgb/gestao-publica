"use client";

import { useActionState, useRef } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  acrescentarItemAction,
  registrarAtoAction,
  type EstadoDaAlteracao,
} from "./actions";

/**
 * OS DOIS FORMULÁRIOS DA ALTERAÇÃO — ilhas client, Server Actions autenticadas.
 *
 * ⚠️ AS OPÇÕES VÊM PRONTAS DO SERVIDOR (`opcoes`), uma por par linha × grandeza que EXISTE na peça.
 * Um select de linhas e outro de grandezas deixariam montar o par impossível; e um select com
 * todas as linhas do sistema seria o "formulário bonito e inútil" que a regra da casa proíbe —
 * o recorte é a peça.
 *
 * ⚠️ NENHUM DOS DOIS IMPORTA PORTA. Ilha client que importa porta é acusação do censo de fronteira;
 * os tipos que estas ilhas usam são os das próprias Server Actions.
 */

export interface OpcaoDeAlvo {
  readonly valor: string;
  readonly rotulo: string;
}

export interface OpcaoDeAto {
  readonly valor: string;
  readonly rotulo: string;
}

function Mensagem({ estado }: { readonly estado: EstadoDaAlteracao }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        data-resultado-da-acao="erro"
        role="alert"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        data-resultado-da-acao="ok"
      >
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export function FormAtoDeAlteracao({
  peca,
  pecaId,
  opcoes,
}: {
  readonly peca: "PPA" | "LDO";
  readonly pecaId: string;
  readonly opcoes: readonly OpcaoDeAlvo[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaAlteracao, FormData>(
    registrarAtoAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-form="ato" ref={ref}>
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar ato de alteração
      </h2>
      <input name="peca" type="hidden" value={peca} />
      <input name="pecaId" type="hidden" value={pecaId} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número do ato</span>
          <input className={CAMPO} name="numero" placeholder="1.234" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ano da numeração</span>
          <input className={CAMPO} max={2200} min={1900} name="ano" required type="number" />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do ato</span>
          <input className={CAMPO} name="data" required type="date" />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data de publicação</span>
          <input className={CAMPO} name="dataPublicacao" required type="date" />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Linha e grandeza alteradas</span>
          <select className={CAMPO} name="alvo" required>
            <option value="">Escolha a linha…</option>
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ajuste (+/−, R$)</span>
          {/*
            ⚠️ O AJUSTE TEM SINAL: "+" acresce e "−" reduz, como na reprevisão da receita da LOA.
            Ajuste zero é recusado pelo domínio e pelo banco — item que não altera nada apareceria
            no comparativo e faria quem lê procurar a diferença que não existe.
          */}
          <CampoValor className={CAMPO} name="ajuste" placeholder="250.000,00 ou -100.000,00" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Fundamento do ato</span>
          <input
            className={CAMPO}
            minLength={3}
            name="fundamento"
            placeholder="Lei Municipal que revisa o plano no exercício"
            required
          />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Justificativa desta linha (opcional)</span>
          <input
            className={CAMPO}
            name="justificativa"
            placeholder="reestimativa após atualização da planta de valores"
          />
        </label>
      </div>

      <Mensagem estado={estado} />

      <button className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`} disabled={pendente} type="submit">
        {pendente ? "Registrando…" : "Registrar ato"}
      </button>
    </form>
  );
}

export function FormItemDoAto({
  atos,
  opcoes,
}: {
  readonly atos: readonly OpcaoDeAto[];
  readonly opcoes: readonly OpcaoDeAlvo[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaAlteracao, FormData>(
    acrescentarItemAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-form="item" ref={ref}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Acrescentar valor a um ato já registrado
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A mesma lei costuma alterar várias linhas. Cada valor entra como uma linha do ato, com o
        sinal que ela teve.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ato</span>
          <select className={CAMPO} name="atoId" required>
            <option value="">Escolha o ato…</option>
            {atos.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Linha e grandeza alteradas</span>
          <select className={CAMPO} name="alvo" required>
            <option value="">Escolha a linha…</option>
            {opcoes.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ajuste (+/−, R$)</span>
          <CampoValor className={CAMPO} name="ajuste" placeholder="-50.000,00" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Justificativa desta linha (opcional)</span>
          <input className={CAMPO} name="justificativa" placeholder="remanejamento entre programas" />
        </label>
      </div>

      <Mensagem estado={estado} />

      <button className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`} disabled={pendente} type="submit">
        {pendente ? "Acrescentando…" : "Acrescentar valor"}
      </button>
    </form>
  );
}
