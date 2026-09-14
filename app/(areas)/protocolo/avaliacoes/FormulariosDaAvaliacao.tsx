"use client";

import { useActionState, useId } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../components/ui/Formulario";
import { metodologiaAction, removerAction, type EstadoDaAvaliacao } from "./actions";

function Mensagens({ estado, acao }: { readonly estado: EstadoDaAvaliacao; readonly acao: string }): React.ReactElement {
  return (
    <>
      {estado.erro !== undefined ? <p role="alert" className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" data-resultado-da-acao={acao} data-resultado-seq="1" className="mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
    </>
  );
}

export function FormMetodologia(): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDaAvaliacao, FormData>(metodologiaAction, {});
  const id = useId();
  return (
    <form action={disparar} data-acao="cadastrar-metodologia" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <div className="grid gap-4 sm:grid-cols-3">
        <label htmlFor={`${id}-min`} className="text-xs"><span className={CLASSE_ROTULO}>Nota mínima</span><input id={`${id}-min`} name="escalaMinima" type="number" min={0} max={9} defaultValue={1} required className={CLASSE_CAMPO} /></label>
        <label htmlFor={`${id}-max`} className="text-xs"><span className={CLASSE_ROTULO}>Nota máxima</span><input id={`${id}-max`} name="escalaMaxima" type="number" min={1} max={10} defaultValue={5} required className={CLASSE_CAMPO} /></label>
        <label htmlFor={`${id}-periodo`} className="text-xs"><span className={CLASSE_ROTULO}>Período do resultado (meses)</span><input id={`${id}-periodo`} name="periodoMeses" type="number" min={1} max={60} defaultValue={12} required className={CLASSE_CAMPO} /></label>
      </div>
      <label htmlFor={`${id}-rotulos`} className="mt-4 block text-xs">
        <span className={CLASSE_ROTULO}>Rótulos da escala (um por linha, da nota mínima à máxima)</span>
        <textarea id={`${id}-rotulos`} name="rotulos" required className={CLASSE_AREA_TEXTO} defaultValue={"Muito ruim\nRuim\nRegular\nBom\nMuito bom"} />
      </label>
      <label htmlFor={`${id}-metodo`} className="mt-4 block text-xs">
        <span className={CLASSE_ROTULO}>Como o resultado é calculado e publicado</span>
        <textarea id={`${id}-metodo`} name="descricaoDoMetodo" required minLength={20} className={CLASSE_AREA_TEXTO} defaultValue="Média simples por dimensão, considerando a avaliação mais recente de cada avaliador no período, separada por origem." />
      </label>
      <Mensagens estado={estado} acao="cadastrar-metodologia" />
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Gravar nova versão"}</button>
    </form>
  );
}

/**
 * ⚠️ A ILHA FICA MONTADA DEPOIS DA REMOÇÃO: removida, a página recarrega e o formulário não tem mais o que
 * fazer — mas o aviso de sucesso precisa sobreviver (silêncio não é resultado). Quem decide é a ilha.
 */
export function FormRemoverAvaliacao({ avaliacaoId, removida }: { readonly avaliacaoId: string; readonly removida: boolean }): React.ReactElement | null {
  const [estado, disparar, pendente] = useActionState<EstadoDaAvaliacao, FormData>(removerAction, {});
  const id = useId();
  if (removida) return estado.sucesso !== undefined ? <Mensagens estado={estado} acao="remover-avaliacao" /> : null;
  return (
    <form action={disparar} data-acao="remover-avaliacao" data-avaliacao-alvo={avaliacaoId} className="mt-2 grid gap-2 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
      <ChaveDeComando />
      <input type="hidden" name="__id" value={avaliacaoId} />
      <label htmlFor={`${id}-motivo`} className="text-xs"><span className={CLASSE_ROTULO}>Motivo</span>
        <select id={`${id}-motivo`} name="motivo" className={CLASSE_CAMPO}><option value="ABUSO">Abuso</option><option value="DADOS_PESSOAIS">Dado pessoal</option></select>
      </label>
      <label htmlFor={`${id}-just`} className="text-xs"><span className={CLASSE_ROTULO}>Justificativa</span>
        <input id={`${id}-just`} name="justificativa" required minLength={10} className={CLASSE_CAMPO} />
      </label>
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Removendo…" : "Remover"}</button>
      <div className="sm:col-span-3"><Mensagens estado={estado} acao="remover-avaliacao" /></div>
    </form>
  );
}
