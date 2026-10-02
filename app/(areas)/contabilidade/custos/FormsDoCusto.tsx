"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  apropriarCustoAction,
  apropriarCustoDaFolhaAction,
  publicarCriterioAction,
  type EstadoDoCusto,
} from "./actions";

/**
 * OS DOIS FORMULÁRIOS DO CUSTO POR CENTRO.
 *
 * ⚠️ RÓTULO EM TODO CAMPO, incluindo os das seis linhas do rateio: campo sem rótulo é caixa muda
 * para leitor de tela. As linhas repetidas usam rótulo visualmente oculto no `select` e no
 * percentual, porque o cabeçalho da coluna não é rótulo de campo — ele não é anunciado com o
 * controle.
 */

const LINHAS = [0, 1, 2, 3, 4, 5] as const;
const OCULTO = "absolute h-px w-px overflow-hidden whitespace-nowrap [clip:rect(0,0,0,0)]";

function Resultado({
  estado,
  acao,
}: {
  readonly estado: EstadoDoCusto;
  readonly acao: string;
}): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        className="rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
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
        className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
        data-resultado-da-acao={acao}
      >
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

export interface OpcaoDeCentro {
  readonly id: string;
  readonly codigo: string;
  readonly nome: string;
}

/**
 * PUBLICAR uma versão do critério de rateio.
 *
 * ⚠️ A SOMA APARECE EXIGIDA NA TELA e é CONFERIDA NO SERVIDOR. Escrever "os percentuais somam 100"
 * ao lado do campo evita a recusa mais comum; a recusa continua existindo, porque um aviso em tela
 * não é uma regra.
 */
export function FormCriterioDeRateio({
  centros,
}: {
  readonly centros: readonly OpcaoDeCentro[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoCusto, FormData>(
    publicarCriterioAction,
    {}
  );

  return (
    <details className={PAINEL} data-forma="criterio-de-rateio">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Publicar uma versão do critério de rateio
      </summary>
      <form action={action} className="mt-4 space-y-4" data-acao="publicar-criterio-de-rateio">
        <ChaveDeComando />

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          O critério define a proporção do custo destinada a cada centro. Publicar com a mesma
          identificação cria uma <strong>nova versão</strong> e mantém as anteriores. Os percentuais
          devem somar exatamente 100, e o centro indicado para o resíduo em centavos deve constar do
          rateio.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={ROTULO}>Identificação do critério</span>
            <input
              className={CAMPO}
              name="chave"
              placeholder="Rateio do aluguel do prédio central"
              required
            />
          </label>
          <label className="block">
            <span className={ROTULO}>Ato que aprovou o critério</span>
            <input
              className={CAMPO}
              name="atoRef"
              placeholder="Portaria 12/2026 da Secretaria de Finanças"
              required
            />
          </label>
          <label className="block">
            <span className={ROTULO}>Vigente a partir de</span>
            <input className={CAMPO} name="vigenteDesde" required type="date" />
          </label>
          <label className="block">
            <span className={ROTULO}>Centro que recebe o resíduo em centavos</span>
            <select className={CAMPO} defaultValue="" name="centroDoResiduoId" required>
              <option disabled value="">
                Escolha o centro de custo
              </option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} — {c.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className={ROTULO}>Linhas do rateio (deixe em branco as que não usar)</legend>
          {LINHAS.map((i) => (
            <div className="grid gap-2 sm:grid-cols-[1fr_10rem]" key={i}>
              <label className="block">
                <span className={OCULTO}>Centro de custo da linha {i + 1}</span>
                <select className={CAMPO} defaultValue="" name={`centro-${String(i)}`}>
                  <option value="">Sem centro nesta linha</option>
                  {centros.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.codigo} — {c.nome}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={OCULTO}>Percentual da linha {i + 1}</span>
                <input
                  className={CAMPO}
                  inputMode="decimal"
                  name={`percentual-${String(i)}`}
                  placeholder="Percentual"
                />
              </label>
            </div>
          ))}
        </fieldset>

        <Resultado acao="publicar-criterio-de-rateio" estado={estado} />

        <button className={BOTAO} disabled={pendente} type="submit">
          {pendente ? "Publicando…" : "Publicar versão do critério"}
        </button>
      </form>
    </details>
  );
}

export interface OpcaoDeLiquidacao {
  readonly id: string;
  readonly rotulo: string;
}

/**
 * APROPRIAR o custo de uma liquidação aos centros.
 *
 * ⚠️ A COMPETÊNCIA É UM CAMPO PRÓPRIO, e o texto diz por quê: o aluguel liquidado em janeiro pode
 * ser custo de dezembro. Amarrar a competência à data da liquidação faria o custo de um mês mudar
 * quando uma nota atrasada fosse liquidada.
 */
export function FormApropriacaoDeCusto({
  liquidacoes,
  criterios,
}: {
  readonly liquidacoes: readonly OpcaoDeLiquidacao[];
  readonly criterios: readonly string[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoCusto, FormData>(
    apropriarCustoAction,
    {}
  );

  return (
    <details className={PAINEL} data-forma="apropriacao-de-custo">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">
        Apropriar o custo de uma liquidação aos centros
      </summary>
      <form action={action} className="mt-4 space-y-4" data-acao="apropriar-custo">
        <ChaveDeComando />

        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          Distribui o custo de uma despesa já liquidada entre os centros, conforme o critério vigente
          na competência informada, <strong>sem novo lançamento contábil</strong>. O limite é o valor
          líquido da liquidação, descontado o que já foi apropriado.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={ROTULO}>Liquidação</span>
            <select className={CAMPO} defaultValue="" name="liquidacaoId" required>
              <option disabled value="">
                Escolha a liquidação
              </option>
              {liquidacoes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.rotulo}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ROTULO}>Critério de rateio</span>
            <select className={CAMPO} defaultValue="" name="criterioChave" required>
              <option disabled value="">
                Escolha o critério
              </option>
              {criterios.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={ROTULO}>Competência do custo</span>
            <input className={CAMPO} name="competencia" required type="month" />
          </label>
          <label className="block">
            <span className={ROTULO}>Valor a apropriar (em branco: tudo o que resta)</span>
            <input className={CAMPO} inputMode="decimal" name="valor" placeholder="1000,00" />
          </label>
          <label className="block sm:col-span-2">
            <span className={ROTULO}>Motivo da apropriação</span>
            <textarea
              className={AREA}
              minLength={10}
              name="motivo"
              placeholder="Apropriação do aluguel do prédio central à competência do mês"
              required
            />
          </label>
        </div>

        <Resultado acao="apropriar-custo" estado={estado} />

        <button className={BOTAO} disabled={pendente} type="submit">
          {pendente ? "Apropriando…" : "Apropriar o custo"}
        </button>
      </form>
    </details>
  );
}

/**
 * V28 — O CUSTO DA FOLHA PELO CENTRO DE CADA VÍNCULO. Sem critério percentual: a repartição sai do
 * contracheque do fechamento e do centro de custo de cada servidor na competência.
 */
export function FormCustoDaFolha({ liquidacoes }: { readonly liquidacoes: readonly { readonly id: string; readonly rotulo: string }[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoCusto, FormData>(apropriarCustoDaFolhaAction, {});
  return (
    <details className={PAINEL} data-forma="custo-da-folha">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">Apropriar o custo da folha pelo centro de cada servidor</summary>
      <form action={action} className="mt-4 space-y-4" data-acao="apropriar-custo-da-folha">
        <ChaveDeComando />
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
          O valor da liquidação é repartido pelos servidores que ela paga, conforme o contracheque da folha fechada, e cada
          parte vai ao centro de custo do servidor no último dia da competência. <strong>Sem novo lançamento contábil.</strong>{" "}
          Servidor sem centro de custo na competência impede a apropriação, que diz qual matrícula falta.
        </div>
        <label className="block">
          <span className={ROTULO}>Liquidação da folha</span>
          <select name="liquidacaoId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha a liquidação…</option>
            {liquidacoes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.rotulo}
              </option>
            ))}
          </select>
        </label>
        <Resultado estado={estado} acao="apropriar-custo-da-folha" />
        <button type="submit" disabled={pendente} className={BOTAO}>
          {pendente ? "Apropriando…" : "Apropriar o custo da folha"}
        </button>
      </form>
    </details>
  );
}
