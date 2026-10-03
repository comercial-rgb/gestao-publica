"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO as BOTAO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO as PAINEL,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import {
  abrirExercicioAction,
  ajustarLinhaAction,
  efetivarPropostaAction,
  elaborarPropostaAction,
  type EstadoDaProposta,
} from "./actions";

const BOTAO_SECUNDARIO =
  "inline-flex h-9 items-center rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-sm font-semibold text-[color:var(--color-ink)] hover:bg-[color:var(--color-surface-2)] disabled:opacity-40";

function Resultado({ estado, acao }: { readonly estado: EstadoDaProposta; readonly acao: string }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-da-acao={acao} className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-da-acao={acao} className="rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
        {estado.propostaOrcamentariaId !== undefined ? (
          <>
            {" "}
            <Link className="font-semibold underline" href={`/planejamento/proposta-orcamentaria/${estado.propostaOrcamentariaId}`}>
              Abrir a proposta
            </Link>
          </>
        ) : null}
      </p>
    );
  }
  return null;
}

/** IMPORTAR um exercício numa proposta nova. */
export function FormElaborarProposta({
  exercicios,
  sugestaoDeDestino,
}: {
  readonly exercicios: readonly number[];
  readonly sugestaoDeDestino: number;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(elaborarPropostaAction, {});
  const origemPadrao = exercicios[0];
  return (
    <form action={action} className={PAINEL} data-acao="elaborar-proposta" aria-label="Importar um exercício numa proposta nova">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Nova proposta a partir de um exercício</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Importa as receitas previstas e as fichas do exercício escolhido, aplica o percentual sobre a base e abre a proposta
        para alteração. Nada é lançado na contabilidade até a proposta ser efetivada.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs">
          <span className={ROTULO}>Orçamento do exercício</span>
          <input className={CAMPO} name="exercicio" type="number" min={2000} max={2100} required defaultValue={sugestaoDeDestino} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Importar de</span>
          <select className={CAMPO} name="exercicioDeOrigem" required defaultValue={origemPadrao ?? ""}>
            {exercicios.length === 0 ? <option value="">Nenhum exercício cadastrado</option> : null}
            {exercicios.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Nome da proposta</span>
          <input className={CAMPO} name="descricao" required minLength={3} defaultValue={`Proposta ${String(sugestaoDeDestino)}`} />
        </label>
        <fieldset className="text-xs sm:col-span-3">
          <legend className={ROTULO}>O que aproveitar</legend>
          <div className="flex flex-wrap gap-4">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="aproveitaReceitas" defaultChecked /> Receitas previstas
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" name="aproveitaFichas" defaultChecked /> Fichas de despesa
            </label>
          </div>
        </fieldset>
        <label className="text-xs">
          <span className={ROTULO}>Receita: valor de partida</span>
          <select className={CAMPO} name="baseDaReceita" required defaultValue="PREVISAO_ATUALIZADA">
            <option value="PREVISAO_ATUALIZADA">Previsão atualizada (com as reestimativas)</option>
            <option value="PREVISAO_INICIAL">Previsão inicial da lei</option>
            <option value="SEM_VALOR">Só a estrutura, sem valores</option>
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Receita: reajuste (%)</span>
          <input className={CAMPO} name="percentualDaReceita" inputMode="decimal" defaultValue="0" />
        </label>
        <span className="hidden sm:block" />
        <label className="text-xs">
          <span className={ROTULO}>Despesa: valor de partida</span>
          <select className={CAMPO} name="baseDaDespesa" required defaultValue="DOTACAO_INICIAL">
            <option value="DOTACAO_INICIAL">Dotação inicial da lei</option>
            <option value="DOTACAO_AUTORIZADA">Dotação autorizada (com créditos e realocações)</option>
            <option value="EMPENHADO">Empenhado até hoje</option>
            <option value="SEM_VALOR">Só a estrutura, sem valores</option>
          </select>
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Despesa: reajuste (%)</span>
          <input className={CAMPO} name="percentualDaDespesa" inputMode="decimal" defaultValue="0" />
        </label>
        <fieldset className="space-y-1 text-xs sm:col-span-3">
          <legend className={ROTULO}>Fichas</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="reajustaProjetos" defaultChecked /> Aplicar o reajuste também a projetos e operações especiais
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="incluiFichasAbertasPorCredito" /> Incluir fichas abertas no exercício por crédito especial ou extraordinário, e as de recurso de exercício anterior
          </label>
        </fieldset>
      </div>
      <div className="mt-3 space-y-2">
        <Resultado estado={estado} acao="elaborar-proposta" />
        <button className={BOTAO} disabled={pendente || exercicios.length === 0} type="submit">
          {pendente ? "Importando…" : "Importar e criar a proposta"}
        </button>
      </div>
    </form>
  );
}

/** ALTERAR o valor de uma linha. Fica recolhido na linha; abre só quando a pessoa pede. */
export function FormAjusteDaLinha({
  propostaOrcamentariaId,
  lado,
  linhaId,
  rotulo,
  valorAtual,
}: {
  readonly propostaOrcamentariaId: string;
  readonly lado: "RECEITA" | "DESPESA";
  readonly linhaId: string;
  readonly rotulo: string;
  readonly valorAtual: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(ajustarLinhaAction, {});
  return (
    <details data-forma="ajustar-linha" data-linha={linhaId}>
      <summary className="cursor-pointer text-xs font-semibold text-[color:var(--color-primary)]">Alterar</summary>
      <form action={action} className="mt-2 space-y-2" data-acao="ajustar-linha" aria-label={`Alterar o valor de ${rotulo}`}>
        <ChaveDeComando />
        <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
        <input type="hidden" name="lado" value={lado} />
        <input type="hidden" name="linhaId" value={linhaId} />
        <label className="block text-xs">
          <span className={ROTULO}>Novo valor (R$)</span>
          <input className={CAMPO} name="valor" inputMode="decimal" required defaultValue={valorAtual.replace(".", ",")} />
        </label>
        <label className="block text-xs">
          <span className={ROTULO}>Motivo</span>
          <input className={CAMPO} name="motivo" required minLength={5} />
        </label>
        <Resultado estado={estado} acao="ajustar-linha" />
        <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
          {pendente ? "Gravando…" : "Gravar"}
        </button>
      </form>
    </details>
  );
}

/** ABRIR o exercício de destino, quando ele ainda não existe. */
export function FormAbrirExercicio({ ano, propostaOrcamentariaId }: { readonly ano: number; readonly propostaOrcamentariaId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(abrirExercicioAction, {});
  return (
    <form action={action} className="space-y-2" data-acao="abrir-exercicio" aria-label={`Abrir o exercício ${String(ano)}`}>
      <ChaveDeComando />
      <input type="hidden" name="ano" value={ano} />
      <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
      <Resultado estado={estado} acao="abrir-exercicio" />
      <button className={BOTAO_SECUNDARIO} disabled={pendente} type="submit">
        {pendente ? "Abrindo…" : `Abrir o exercício ${String(ano)}`}
      </button>
    </form>
  );
}

/** EFETIVAR: gera as fichas e a receita prevista do exercício. */
export function FormEfetivarProposta({
  propostaOrcamentariaId,
  exercicio,
  pronta,
}: {
  readonly propostaOrcamentariaId: string;
  readonly exercicio: number;
  readonly pronta: boolean;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaProposta, FormData>(efetivarPropostaAction, {});
  return (
    <form action={action} className="space-y-2" data-acao="efetivar-proposta" aria-label={`Gerar o orçamento de ${String(exercicio)}`}>
      <ChaveDeComando />
      <input type="hidden" name="propostaOrcamentariaId" value={propostaOrcamentariaId} />
      <Resultado estado={estado} acao="efetivar-proposta" />
      <button className={BOTAO} disabled={pendente || !pronta} type="submit">
        {pendente ? "Gerando o orçamento…" : `Gerar o orçamento de ${String(exercicio)}`}
      </button>
    </form>
  );
}
