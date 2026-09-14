"use client";

import { useActionState, useRef, useState } from "react";
import type { EstadoDoMolde } from "../../../../../components/molde/FormularioDeRecurso";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CLASSE_AREA_TEXTO, CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO } from "../../../../../components/ui/Formulario";

/**
 * A VERSÃO DO SERVIÇO — ilha (limite 2 do molde: o formulário é uma LISTA de campos).
 *
 * ⚠️ VOCABULÁRIO FECHADO: nome, rótulo, um dos cinco tipos e obrigatório. Nada de expressão, condição
 * ou URL. Numa atualização cadastral, o nome do campo tem de ser um campo do cadastro de pessoa — a
 * lista aparece aqui, e o caso de uso recusa o que não estiver nela.
 * ⚠️ PRAZO SÓ COM FUNDAMENTO: os dois vão juntos ou nenhum. Sem prazo declarado, a carta diz "não declarado".
 */
export function FormVersaoDoServico({ servicoId, tipoDoServico, tipos, setores, camposDoCadastro, action }: {
  readonly servicoId: string;
  readonly tipoDoServico: string;
  readonly tipos: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly setores: readonly { readonly valor: string; readonly rotulo: string }[];
  readonly camposDoCadastro: readonly string[];
  readonly action: (e: EstadoDoMolde, f: FormData) => Promise<EstadoDoMolde>;
}): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoMolde, FormData>(action, {});
  const [linhas, setLinhas] = useState(3);
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();
  const rotulo = (texto: string, filho: React.ReactNode, largura = ""): React.ReactElement => (
    <label className={`text-xs text-[color:var(--color-ink-2)] ${largura}`}>
      <span className={CLASSE_ROTULO}>{texto}</span>
      {filho}
    </label>
  );
  return (
    <form ref={ref} action={disparar} data-acao="nova-versao-do-servico" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <input type="hidden" name="__id" value={servicoId} />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Nova versão (rascunho)</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">A versão só aparece na carta depois de publicada. Publicada, não muda: corrigir é cadastrar outra.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {rotulo("O que é o serviço", <textarea name="descricao" required minLength={10} className={CLASSE_AREA_TEXTO} />, "sm:col-span-2")}
        {rotulo("Quem pode pedir e requisitos", <textarea name="requisitos" required minLength={5} className={CLASSE_AREA_TEXTO} />, "sm:col-span-2")}
        {rotulo("Documentos exigidos (um por linha)", <textarea name="documentos" className={CLASSE_AREA_TEXTO} />, "sm:col-span-2")}
        {rotulo("Onde e como é atendido", <input name="canais" required minLength={5} className={CLASSE_CAMPO} />, "sm:col-span-2")}
        {rotulo("Custo (vazio = não declarado)", <input name="custo" className={CLASSE_CAMPO} />)}
        {rotulo("Setor de entrada", <select name="setorDeEntradaId" required className={CLASSE_CAMPO} defaultValue=""><option value="" disabled>Escolha</option>{setores.map((s) => <option key={s.valor} value={s.valor}>{s.rotulo}</option>)}</select>)}
        {rotulo("Prazo em dias corridos (vazio = não declarado)", <input name="prazoDias" type="number" min={1} className={CLASSE_CAMPO} />)}
        {rotulo("Fundamento do prazo (obrigatório com prazo)", <input name="fundamentoDoPrazo" className={CLASSE_CAMPO} />)}
      </div>
      <fieldset data-secao="formulario" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Campos do formulário</legend>
        {tipoDoServico === "ATUALIZACAO_CADASTRAL" ? <p className="mb-2 text-xs text-[color:var(--color-ink-2)]">Atualização cadastral: o nome de cada campo tem de ser um destes — {camposDoCadastro.join(", ")}.</p> : null}
        {Array.from({ length: linhas }, (_, i) => (
          <div key={i} className="mb-2 grid gap-2 sm:grid-cols-4" data-linha-do-campo={i}>
            {rotulo(`Campo ${i + 1} — nome`, <input name={`campos.${i}.nome`} pattern="[a-z][a-zA-Z0-9]{1,40}" className={CLASSE_CAMPO} />)}
            {rotulo("Rótulo", <input name={`campos.${i}.rotulo`} className={CLASSE_CAMPO} />)}
            {rotulo("Tipo", <select name={`campos.${i}.tipo`} defaultValue="texto" className={CLASSE_CAMPO}>{tipos.map((t) => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}</select>)}
            <label className="flex items-center gap-2 pt-6 text-xs text-[color:var(--color-ink-2)]"><input type="checkbox" name={`campos.${i}.obrigatorio`} value="sim" className="h-4 w-4" /><span>Obrigatório</span></label>
          </div>
        ))}
        <button type="button" onClick={() => setLinhas((n) => Math.min(n + 1, 30))} className="text-xs text-[color:var(--color-primary)] underline">Mais um campo</button>
      </fieldset>
      {estado.erro !== undefined ? <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p> : null}
      {estado.sucesso !== undefined ? <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p> : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Cadastrar versão"}</button>
    </form>
  );
}
