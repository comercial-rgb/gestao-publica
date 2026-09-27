"use client";

import { useActionState, useState } from "react";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  anularCancelamentoAction,
  anularPagamentoAction,
  cancelarAction,
  liquidarAction,
  pagarAction,
  type EstadoDaOperacao,
} from "./actions";

/**
 * AS OPERAÇÕES DE UM RESTO A PAGAR, NA TELA (V15).
 *
 * ⚠️ ELEGIBILIDADE, NÃO OCULTAMENTO DE BOTÃO. O que não cabe não é oferecido — liquidar só existe
 * para resto NÃO processado, anular só existe onde há ato a anular —, mas a proteção de verdade
 * está no servidor: cada ação cobra a sua permissão e o domínio cobra o saldo dentro da
 * transação. Esconder um botão nunca foi proteção.
 *
 * ⚠️ A FONTE VEM DA CONTA BANCÁRIA ESCOLHIDA, e não de um campo livre: a fonte do pagamento tem
 * de casar com a da conta, e digitá-la à parte só criaria a chance de divergir.
 */

export interface ContaParaPagar {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
}
export interface LiquidacaoParaPagar {
  readonly id: string;
  readonly numero: string;
  readonly valor: string;
}
export interface AtoParaAnular {
  readonly id: string;
  readonly rotulo: string;
  readonly valor: string;
}

function Aviso({ estado }: { readonly estado: EstadoDaOperacao }): React.ReactElement | null {
  if (estado.sucesso !== undefined) {
    return (
      <p className="mt-2 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        {estado.sucesso}
      </p>
    );
  }
  if (estado.erro !== undefined) {
    return (
      <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
        {estado.erro}
      </p>
    );
  }
  return null;
}

function Bloco({
  titulo,
  descricao,
  children,
}: {
  readonly titulo: string;
  readonly descricao: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] p-4">
      <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">{titulo}</h3>
      <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">{descricao}</p>
      {children}
    </section>
  );
}

export function FormLiquidar({
  inscricaoId,
  empenhoId,
}: {
  readonly inscricaoId: string;
  readonly empenhoId: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(liquidarAction, {});
  return (
    <Bloco
      titulo="Liquidar"
      descricao="O serviço empenhado no exercício anterior é atestado agora. Nenhum empenho novo é criado e nenhuma dotação do exercício corrente é consumida."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="liquidar-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <input type="hidden" name="empenhoId" value={empenhoId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor="liq-numero">Número da liquidação</label>
            <input className={CAMPO} id="liq-numero" name="numero" type="text" />
          </div>
          <div>
            <label className={ROTULO} htmlFor="liq-valor">Valor</label>
            <input className={CAMPO} id="liq-valor" name="valor" type="text" inputMode="decimal" placeholder="0,00" />
          </div>
          <div>
            <label className={ROTULO} htmlFor="liq-data">Data</label>
            <input className={CAMPO} id="liq-data" name="data" type="date" />
          </div>
        </div>
        <div>
          <label className={ROTULO} htmlFor="liq-atesto">Responsável pelo atesto</label>
          <input className={CAMPO} id="liq-atesto" name="responsavelAtesto" type="text" />
        </div>
        <div>
          <label className={ROTULO} htmlFor="liq-hist">Histórico</label>
          <input className={CAMPO} id="liq-hist" name="historico" type="text" />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Liquidando..." : "Liquidar"}
          </button>
        </div>
      </form>
      <Aviso estado={estado} />
    </Bloco>
  );
}

export function FormPagar({
  inscricaoId,
  liquidacoes,
  contas,
}: {
  readonly inscricaoId: string;
  readonly liquidacoes: readonly LiquidacaoParaPagar[];
  readonly contas: readonly ContaParaPagar[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(pagarAction, {});
  const [conta, setConta] = useState("");
  const escolhida = contas.find((c) => c.codigo === conta);
  return (
    <Bloco
      titulo="Pagar"
      descricao="O dinheiro sai e a obrigação se extingue. A baixa recai sobre a obrigação que a liquidação escolhida registrou."
    >
      {liquidacoes.length === 0 ? (
        <p className="mt-3 rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm">
          Não há liquidação disponível para pagar neste resto a pagar.
        </p>
      ) : (
        <form action={action} className="mt-3 grid gap-3" data-acao="pagar-resto">
          <ChaveDeComando />
          <input type="hidden" name="inscricaoId" value={inscricaoId} />
          <input type="hidden" name="fonteId" value={escolhida?.fonteId ?? ""} />
          <div>
            <label className={ROTULO} htmlFor="pag-liq">Liquidação de origem</label>
            <select className={CAMPO} id="pag-liq" name="liquidacaoId" defaultValue="">
              <option value="">Escolha</option>
              {liquidacoes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.numero} — {l.valor}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={ROTULO} htmlFor="pag-numero">Número do pagamento</label>
              <input className={CAMPO} id="pag-numero" name="numero" type="text" />
            </div>
            <div>
              <label className={ROTULO} htmlFor="pag-valor">Valor</label>
              <input className={CAMPO} id="pag-valor" name="valor" type="text" inputMode="decimal" placeholder="0,00" />
            </div>
            <div>
              <label className={ROTULO} htmlFor="pag-data">Data</label>
              <input className={CAMPO} id="pag-data" name="data" type="date" />
            </div>
          </div>
          <div>
            <label className={ROTULO} htmlFor="pag-conta">Conta bancária</label>
            <select
              className={CAMPO}
              id="pag-conta"
              name="contaBancaria"
              value={conta}
              onChange={(e) => setConta(e.target.value)}
            >
              <option value="">Escolha</option>
              {contas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.descricao} (fonte {c.fonteCodigo})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ROTULO} htmlFor="pag-hist">Histórico</label>
            <input className={CAMPO} id="pag-hist" name="historico" type="text" />
          </div>
          <div>
            <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
              {pendente ? "Pagando..." : "Pagar"}
            </button>
          </div>
        </form>
      )}
      <Aviso estado={estado} />
    </Bloco>
  );
}

export function FormCancelar({ inscricaoId }: { readonly inscricaoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(cancelarAction, {});
  return (
    <Bloco
      titulo="Cancelar"
      descricao="A obrigação deixa de existir sem saída de caixa. Cancelar extingue a dívida com o credor nesta parte, e o ato pode ser anulado depois."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="cancelar-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <div>
          <label className={ROTULO} htmlFor="canc-valor">Valor a cancelar</label>
          <input className={CAMPO} id="canc-valor" name="valor" type="text" inputMode="decimal" placeholder="0,00" />
        </div>
        <div>
          <label className={ROTULO} htmlFor="canc-motivo">Motivo</label>
          <textarea className={AREA} id="canc-motivo" name="motivo" rows={2} />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Cancelando..." : "Cancelar resto a pagar"}
          </button>
        </div>
      </form>
      <Aviso estado={estado} />
    </Bloco>
  );
}

export function FormAnularPagamento({
  inscricaoId,
  atos,
}: {
  readonly inscricaoId: string;
  readonly atos: readonly AtoParaAnular[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(anularPagamentoAction, {});
  return (
    <Bloco
      titulo="Anular pagamento"
      descricao="O registro original permanece e o valor volta ao saldo. A anulação é um fato novo que aponta para o pagamento desfeito."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="anular-pagamento-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <div>
          <label className={ROTULO} htmlFor="anp-alvo">Pagamento</label>
          <select className={CAMPO} id="anp-alvo" name="pagamentoId" defaultValue="">
            <option value="">Escolha</option>
            {atos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo} — {a.valor}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ROTULO} htmlFor="anp-motivo">Motivo</label>
          <textarea className={AREA} id="anp-motivo" name="motivo" rows={2} />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Anulando..." : "Anular pagamento"}
          </button>
        </div>
      </form>
      <Aviso estado={estado} />
    </Bloco>
  );
}

export function FormAnularCancelamento({
  inscricaoId,
  atos,
}: {
  readonly inscricaoId: string;
  readonly atos: readonly AtoParaAnular[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaOperacao, FormData>(
    anularCancelamentoAction,
    {}
  );
  return (
    <Bloco
      titulo="Anular cancelamento"
      descricao="A obrigação com o credor volta a existir e o valor retorna ao saldo. Sem isto, um cancelamento feito por engano seria irreversível."
    >
      <form action={action} className="mt-3 grid gap-3" data-acao="anular-cancelamento-resto">
        <ChaveDeComando />
        <input type="hidden" name="inscricaoId" value={inscricaoId} />
        <div>
          <label className={ROTULO} htmlFor="anc-alvo">Cancelamento</label>
          <select className={CAMPO} id="anc-alvo" name="movimentoId" defaultValue="">
            <option value="">Escolha</option>
            {atos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.rotulo} — {a.valor}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={ROTULO} htmlFor="anc-motivo">Motivo</label>
          <textarea className={AREA} id="anc-motivo" name="motivo" rows={2} />
        </div>
        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Anulando..." : "Anular cancelamento"}
          </button>
        </div>
      </form>
      <Aviso estado={estado} />
    </Bloco>
  );
}
