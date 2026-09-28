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
  configurarLimitacaoAction,
  liberarCotaAction,
  proporDaLoaAction,
  type EstadoDaProgramacao,
} from "./actions";

/**
 * OS ATOS DA PROGRAMAÇÃO FINANCEIRA — ilhas client, Server Actions autenticadas.
 *
 * ⚠️ OS TRÊS PEDEM O ATO, e o campo é obrigatório: cronograma sem decreto seria teto de caixa sem
 * lastro legal, e o guard do empenho passaria a recusar despesa contra um número que ninguém
 * autorizou. A minuta do decreto sai do botão de impressão desta mesma tela.
 */

const MESES: readonly string[] = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function Mensagem({
  estado,
  acao,
}: {
  readonly estado: EstadoDaProgramacao;
  readonly acao: string;
}): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        data-resultado-da-acao={acao}
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
        data-resultado-da-acao={acao}
      >
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

/** PROPOR o cronograma ou as metas a partir da previsão da lei orçamentária. */
export function FormProporDaLoa({
  exercicio,
  peca,
}: {
  readonly exercicio: number;
  readonly peca: "CMD" | "MBA";
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProgramacao, FormData>(
    proporDaLoaAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  const nome = peca === "CMD" ? "propor-cronograma" : "propor-metas";

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao={nome} ref={ref}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        {peca === "CMD"
          ? "Propor o cronograma mensal a partir da lei orçamentária"
          : "Propor as metas bimestrais a partir da lei orçamentária"}
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        {peca === "CMD"
          ? "A previsão de receita de cada fonte é distribuída em doze cotas mensais."
          : "A previsão de receita de cada fonte é distribuída em seis metas bimestrais."}
      </p>
      <input name="exercicio" type="hidden" value={exercicio} />
      <input name="peca" type="hidden" value={peca} />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ato que autoriza</span>
          <input className={CAMPO} name="atoRef" placeholder="Decreto 12/2026" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Passa a viger em</span>
          <input className={CAMPO} name="vigenteDesde" required type="date" />
        </label>
      </div>
      <Mensagem acao={nome} estado={estado} />
      <button className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`} disabled={pendente} type="submit">
        {pendente ? "Registrando…" : "Propor e publicar a versão"}
      </button>
    </form>
  );
}

/** LIGAR ou DESLIGAR a limitação de empenho. */
export function FormLimitacao({
  exercicio,
  ativa,
}: {
  readonly exercicio: number;
  readonly ativa: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProgramacao, FormData>(
    configurarLimitacaoAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="configurar-limitacao" ref={ref}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Limitação de empenho
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]" data-situacao-da-limitacao={ativa ? "ligada" : "desligada"}>
        Situação atual: <strong>{ativa ? "ativa" : "inativa"}</strong>.{" "}
        {ativa
          ? "O empenho observa também a cota mensal da fonte."
          : "O empenho observa apenas a dotação; o cronograma tem caráter de planejamento."}
      </p>
      <input name="exercicio" type="hidden" value={exercicio} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Medida</span>
          <select className={CAMPO} defaultValue={ativa ? "desligar" : "ligar"} name="ativo">
            <option value="ligar">Ativar (contingenciamento)</option>
            <option value="desligar">Desativar (restabelecimento do desembolso)</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ato que determina</span>
          <input className={CAMPO} name="atoRef" placeholder="Decreto 30/2026" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Motivo</span>
          <input
            className={CAMPO}
            minLength={10}
            name="motivo"
            placeholder="frustração da meta de arrecadação do bimestre"
            required
          />
        </label>
      </div>
      <Mensagem acao="configurar-limitacao" estado={estado} />
      <button className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`} disabled={pendente} type="submit">
        {pendente ? "Registrando…" : "Registrar a medida"}
      </button>
    </form>
  );
}

/** LIBERAR saldo de um mês contingenciado. */
export function FormLiberacao({
  exercicio,
  fontes,
}: {
  readonly exercicio: number;
  readonly fontes: readonly { readonly id: string; readonly codigo: string }[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProgramacao, FormData>(
    liberarCotaAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="liberar-cota" ref={ref}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Liberar saldo de um mês
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        A liberação amplia o limite do mês selecionado e depende de ato. Para reduzir o limite,
        publique nova versão do cronograma.
      </p>
      <input name="exercicio" type="hidden" value={exercicio} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Fonte de recurso</span>
          <select className={CAMPO} name="fonteId" required>
            <option value="">Escolha a fonte…</option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.codigo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Mês</span>
          <select className={CAMPO} name="mes" required>
            <option value="">Escolha o mês…</option>
            {MESES.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor liberado (R$)</span>
          <CampoValor className={CAMPO} name="valor" placeholder="10.000,00" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ato que autoriza</span>
          <input className={CAMPO} name="atoRef" placeholder="Decreto 41/2026" required />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Motivo</span>
          <input
            className={CAMPO}
            minLength={10}
            name="motivo"
            placeholder="recomposição após o ingresso do repasse do convênio"
            required
          />
        </label>
      </div>
      <Mensagem acao="liberar-cota" estado={estado} />
      <button className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`} disabled={pendente} type="submit">
        {pendente ? "Registrando…" : "Registrar a liberação"}
      </button>
    </form>
  );
}
