"use client";

import { useActionState, useId } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { CLASSE_BOTAO_PRIMARIO, CLASSE_CAMPO as CAMPO, CLASSE_PAINEL_FORMULARIO, CLASSE_ROTULO as ROTULO } from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { anularAction, cadastrarCategoriaAction, decidirContaAction, movimentarAction, type EstadoDoRealizavel } from "./actions";

/** V39-R3 (R3-016) — os formulários dos realizáveis, com a resposta do servidor abaixo de cada um. */

function Resultado({ estado, nome }: { readonly estado: EstadoDoRealizavel; readonly nome: string }): React.ReactElement | null {
  const texto = estado.erro ?? estado.sucesso;
  if (texto === undefined) return null;
  return (
    <p
      className={estado.erro !== undefined ? "mt-2 text-sm text-[color:var(--color-status-erro-fg)]" : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"}
      data-resultado-da-acao={nome}
      role={estado.erro !== undefined ? "alert" : "status"}
    >
      {texto}
    </p>
  );
}

type Categoria = { readonly id: string; readonly codigo: string; readonly descricao: string };

export function FormCategoria(): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDoRealizavel, FormData>(cadastrarCategoriaAction, {});
  return (
    <form action={action} data-acao="cadastrar-categoria-de-realizavel" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-2 text-sm font-semibold">Nova categoria</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div><label className={ROTULO} htmlFor={`${uid}-c`}>Código</label><input id={`${uid}-c`} name="codigo" required placeholder="DEP-JUD" className={CAMPO} /></div>
        <div className="sm:col-span-2"><label className={ROTULO} htmlFor={`${uid}-d`}>Descrição</label><input id={`${uid}-d`} name="descricao" required placeholder="Depósito judicial restituível" className={CAMPO} /></div>
      </div>
      <Resultado estado={estado} nome="cadastrar-categoria-de-realizavel" />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Cadastrar a categoria"}</button>
    </form>
  );
}

export function FormDecisao({ categorias, contas }: { readonly categorias: readonly Categoria[]; readonly contas: readonly { readonly codigo: string; readonly nome: string }[] }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDoRealizavel, FormData>(decidirContaAction, {});
  return (
    <form action={action} data-acao="decidir-conta-do-realizavel" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold">Conta do ativo da categoria</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
        Decisão do ente, com o fundamento: a conta de crédito do ativo onde o valor fica até voltar. A decisão nova vale para os movimentos seguintes; o saldo já constituído continua na conta em que entrou.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-cat`}>Categoria</label>
          <select id={`${uid}-cat`} name="categoriaId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>)}
          </select>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-sit`}>Situação</label>
          <select id={`${uid}-sit`} name="situacao" required defaultValue="ATIVA" className={CAMPO}>
            <option value="ATIVA">Ativa: movimenta a conta abaixo</option>
            <option value="SUSPENSA">Suspensa: não movimenta</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${uid}-conta`}>Conta do ativo (digite o código ou parte do nome)</label>
          <input id={`${uid}-conta`} name="contaAtivo" list={`${uid}-contas`} className={CAMPO} />
          <datalist id={`${uid}-contas`}>
            {contas.map((c) => <option key={c.codigo} value={`${c.codigo} — ${c.nome}`} />)}
          </datalist>
        </div>
        <div className="sm:col-span-2">
          <label className={ROTULO} htmlFor={`${uid}-fund`}>Fundamento da decisão</label>
          <input id={`${uid}-fund`} name="fundamento" required placeholder="orientação contábil, ato, parecer" className={CAMPO} />
        </div>
      </div>
      <Resultado estado={estado} nome="decidir-conta-do-realizavel" />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Registrar a decisão"}</button>
    </form>
  );
}

export function FormMovimento({ categorias, contas, hoje }: { readonly categorias: readonly Categoria[]; readonly contas: readonly { readonly valor: string; readonly rotulo: string }[]; readonly hoje: string }): React.ReactElement {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDoRealizavel, FormData>(movimentarAction, {});
  return (
    <form action={action} data-acao="movimentar-realizavel" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-2 text-sm font-semibold">Registrar movimento</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-t`}>Movimento</label>
          <select id={`${uid}-t`} name="tipo" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            <option value="CONSTITUICAO">O dinheiro sai (constituição)</option>
            <option value="BAIXA">O dinheiro volta (baixa)</option>
          </select>
        </div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-cat`}>Categoria</label>
          <select id={`${uid}-cat`} name="categoriaId" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {categorias.map((c) => <option key={c.id} value={c.id}>{c.codigo} — {c.descricao}</option>)}
          </select>
        </div>
        <div><label className={ROTULO} htmlFor={`${uid}-dev`}>Com quem está o valor (CPF ou CNPJ)</label><input id={`${uid}-dev`} name="devedor" required className={CAMPO} /></div>
        <div><label className={ROTULO} htmlFor={`${uid}-v`}>Valor (R$)</label><CampoValor id={`${uid}-v`} name="valor" required placeholder="0,00" className={CAMPO} /></div>
        <div><label className={ROTULO} htmlFor={`${uid}-d`}>Data</label><input id={`${uid}-d`} name="data" type="date" required defaultValue={hoje} max={hoje} className={CAMPO} /></div>
        <div>
          <label className={ROTULO} htmlFor={`${uid}-cb`}>Conta bancária e fonte</label>
          <select id={`${uid}-cb`} name="contaEFonte" required defaultValue="" className={CAMPO}>
            <option value="">Escolha…</option>
            {contas.map((c) => <option key={c.valor} value={c.valor}>{c.rotulo}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2"><label className={ROTULO} htmlFor={`${uid}-h`}>Histórico</label><input id={`${uid}-h`} name="historico" required className={CAMPO} /></div>
        <div><label className={ROTULO} htmlFor={`${uid}-doc`}>Documento (recibo, guia, termo)</label><input id={`${uid}-doc`} name="documento" required className={CAMPO} /></div>
      </div>
      <Resultado estado={estado} nome="movimentar-realizavel" />
      <button type="submit" disabled={pendente} className={`mt-3 ${CLASSE_BOTAO_PRIMARIO}`}>{pendente ? "Gravando…" : "Registrar"}</button>
    </form>
  );
}

/** Fica montado depois de anular (a linha recarrega anulada): mostra só a resposta, sem campos. */
export function FormAnular({ movimentoId, anulado, hoje }: { readonly movimentoId: string; readonly anulado: boolean; readonly hoje: string }): React.ReactElement | null {
  const uid = useId();
  const [estado, action, pendente] = useActionState<EstadoDoRealizavel, FormData>(anularAction, {});
  if (anulado) return estado.sucesso === undefined ? null : <Resultado estado={estado} nome={`anular-realizavel-${movimentoId}`} />;
  return (
    <details className="mt-1 text-xs">
      <summary className="cursor-pointer text-[color:var(--color-primary)]">Anular</summary>
      <form action={action} data-acao="anular-realizavel" data-movimento={movimentoId} className="mt-2 grid gap-2 sm:grid-cols-3">
        <ChaveDeComando />
        <input type="hidden" name="movimentoId" value={movimentoId} />
        <div className="sm:col-span-2"><label className={ROTULO} htmlFor={`${uid}-m`}>Motivo</label><input id={`${uid}-m`} name="motivo" required className={CAMPO} /></div>
        <div><label className={ROTULO} htmlFor={`${uid}-d`}>Data</label><input id={`${uid}-d`} name="data" type="date" required defaultValue={hoje} max={hoje} className={CAMPO} /></div>
        <div className="sm:col-span-3">
          <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>{pendente ? "Gravando…" : "Anular o movimento"}</button>
          <Resultado estado={estado} nome={`anular-realizavel-${movimentoId}`} />
        </div>
      </form>
    </details>
  );
}
