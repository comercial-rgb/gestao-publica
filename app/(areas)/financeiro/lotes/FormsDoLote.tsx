"use client";

import { useActionState, useId } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  criarLoteAction,
  fecharAction,
  gerarBorderoAction,
  incluirAction,
  retornoAction,
  type EstadoLote,
} from "./actions";

export interface ContaParaLote {
  readonly id: string;
  readonly codigo: string;
  readonly descricao: string;
}

export interface OrdemParaIncluir {
  readonly id: string;
  readonly numero: string;
  readonly valor: string;
  readonly credor: string;
}

export interface ItemParaRetorno {
  readonly id: string;
  readonly descricao: string;
  readonly valor: string;
  readonly baixado: boolean;
}

function Mensagens({ estado }: { readonly estado: EstadoLote }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}
    </>
  );
}

export function FormCriarLote({
  contas,
  exercicio,
}: {
  readonly contas: readonly ContaParaLote[];
  readonly exercicio: number;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLote, FormData>(
    criarLoteAction,
    {}
  );
  return (
    <form action={action} data-acao="criar-lote" className={CLASSE_PAINEL_FORMULARIO}>
      <input type="hidden" name="exercicio" value={exercicio} />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Criar lote de pagamento
      </h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta bancária</span>
          {/* ⚠️ UMA CONTA POR LOTE: um lote com duas contas viraria dois borderôs. */}
          <select name="conta" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} — {c.descricao}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Vencimento</span>
          <input name="vencimento" type="date" required className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Descrição</span>
          <input name="descricao" required minLength={3} placeholder="folha de 30/04" className={CAMPO} />
        </label>
      </div>
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Criando…" : "Criar lote"}
      </button>
    </form>
  );
}

/**
 * ⚠️ A INCLUSÃO É ONDE A ORDEM CRONOLÓGICA É COBRADA (art. 141). O domínio recusa incluir
 * quem não é a cabeça da fila, NOMEANDO a liquidação preterida — e essa mensagem chega
 * aqui como veio. A tela não repete a regra; ela mostra a recusa.
 */
export function FormIncluir({
  loteId,
  ordens,
}: {
  readonly loteId: string;
  readonly ordens: readonly OrdemParaIncluir[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLote, FormData>(incluirAction, {});
  const idSel = `ordem-${useId()}`;

  if (ordens.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
        Nenhuma ordem autorizada fora de lote.
      </p>
    );
  }

  return (
    <form action={action} data-acao="incluir-no-lote" className="mt-2">
      <input type="hidden" name="loteId" value={loteId} />
      <label htmlFor={idSel} className={ROTULO}>
        Ordem a incluir
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select id={idSel} name="ordemId" required defaultValue="" className={`${CAMPO} max-w-md`}>
          <option value="" disabled>
            Escolha…
          </option>
          {ordens.map((o) => (
            <option key={o.id} value={o.id}>
              {o.numero} — {o.credor} · {o.valor}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Incluindo…" : "Incluir"}
        </button>
      </div>
      <Mensagens estado={estado} />
    </form>
  );
}

export function FormFechar({ loteId }: { readonly loteId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLote, FormData>(fecharAction, {});
  return (
    <form action={action} data-acao="fechar-lote" className="mt-2">
      <input type="hidden" name="loteId" value={loteId} />
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Fechando…" : "Fechar lote"}
      </button>
    </form>
  );
}

export function FormGerarBordero({
  loteId,
  signatarios,
}: {
  readonly loteId: string;
  readonly signatarios: readonly string[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLote, FormData>(
    gerarBorderoAction,
    {}
  );
  const idSel = `signatarios-bordero-${useId()}`;
  return (
    <form action={action} data-acao="gerar-bordero" className="mt-2">
      <input type="hidden" name="loteId" value={loteId} />
      <label htmlFor={idSel} className={ROTULO}>
        Signatários do borderô, na ordem em que assinam
      </label>
      <select
        id={idSel}
        name="signatarios"
        multiple
        required
        size={Math.min(4, Math.max(2, signatarios.length))}
        className={CAMPO}
      >
        {signatarios.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-2 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gerando…" : "Gerar borderô"}
      </button>
    </form>
  );
}

/**
 * ⚠️ O RETORNO BAIXA SÓ O QUE O BANCO DISSE. Marcar item por item é deliberado: um
 * "baixar tudo" carimbaria como pago o que o banco não liquidou, e o extrato só
 * denunciaria depois. A idempotência é do banco de dados (`@@unique([itemId])`), não de
 * um `if` nesta tela.
 */
export function FormRetorno({
  borderoId,
  itens,
}: {
  readonly borderoId: string;
  readonly itens: readonly ItemParaRetorno[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLote, FormData>(retornoAction, {});
  const idData = `pago-em-${useId()}`;

  const abertos = itens.filter((i) => !i.baixado);
  if (abertos.length === 0) {
    return (
      <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
        Todos os itens já foram baixados pelo retorno.
      </p>
    );
  }

  return (
    <form action={action} data-acao="processar-retorno" className="mt-2">
      <input type="hidden" name="borderoId" value={borderoId} />
      <label htmlFor={idData} className={ROTULO}>
        Data de liquidação no banco
      </label>
      <input id={idData} name="pagoEm" type="date" required className={`${CAMPO} max-w-xs`} />

      <ul className="mt-2 space-y-2 text-xs">
        {abertos.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="itens" value={i.id} />
              <span>
                {i.descricao} · {i.valor}
              </span>
            </label>
            <input
              name={`identificador-${i.id}`}
              placeholder="identificador do banco"
              className={`${CAMPO} max-w-[14rem]`}
            />
          </li>
        ))}
      </ul>

      <Mensagens estado={estado} />
      <button type="submit" disabled={pendente} className={`mt-2 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Processando…" : "Processar retorno"}
      </button>
    </form>
  );
}
