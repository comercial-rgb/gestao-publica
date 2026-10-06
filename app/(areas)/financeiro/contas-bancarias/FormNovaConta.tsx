"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { cadastrarContaAction, type EstadoDoCadastroDeConta } from "./actions";

/**
 * A CONTA BANCÁRIA NOVA (V36).
 *
 * ⚠️ FICA SEMPRE MONTADO NO TOPO DA PÁGINA, antes da lista: depois do primeiro cadastro a lista passa
 * de vazia a preenchida, e um formulário que mudasse de lugar na árvore perderia a mensagem de
 * sucesso — o defeito que a importação do extrato já ensinou.
 *
 * ⚠️ A CONTA CONTÁBIL É ESCOLHIDA DA LISTA que o servidor monta (analíticas do grupo 1.1.1); a tela
 * não sugere nenhuma. As recusas são do servidor, com o motivo.
 */
export function FormNovaConta({
  contasContabeis,
  fontes,
}: {
  readonly contasContabeis: readonly { readonly codigo: string; readonly nome: string }[];
  readonly fontes: readonly { readonly codigo: string; readonly descricao: string }[];
}): React.ReactElement {
  const uid = useId();
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const [estado, action, pendente] = useActionState<EstadoDoCadastroDeConta, FormData>(cadastrarContaAction, {});

  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }

  const id = (n: string): string => `${uid}-${n}`;

  return (
    <section aria-labelledby={id("titulo")} className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <h2 className="text-sm font-semibold" id={id("titulo")}>Cadastrar conta bancária</h2>
      <form action={action} className="mt-3 space-y-3" data-acao="cadastrar-conta-bancaria">
        <ChaveDeComando />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ROTULO} htmlFor={id("codigo")}>Código da conta</label>
            <input className={CAMPO} id={id("codigo")} maxLength={30} name="codigo" required />
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("descricao")}>Descrição</label>
            <input className={CAMPO} id={id("descricao")} maxLength={120} name="descricao" required />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          <div>
            <label className={ROTULO} htmlFor={id("banco")}>Banco (3 dígitos)</label>
            <input className={CAMPO} id={id("banco")} inputMode="numeric" maxLength={3} name="banco" required />
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("agencia")}>Agência</label>
            <input className={CAMPO} id={id("agencia")} inputMode="numeric" maxLength={6} name="agencia" required />
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("digitoAgencia")}>Dígito da agência</label>
            <input className={CAMPO} id={id("digitoAgencia")} maxLength={2} name="digitoAgencia" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("conta")}>Conta</label>
            <input className={CAMPO} id={id("conta")} inputMode="numeric" maxLength={20} name="conta" required />
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("digitoConta")}>Dígito da conta</label>
            <input className={CAMPO} id={id("digitoConta")} maxLength={2} name="digitoConta" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={ROTULO} htmlFor={id("contaContabil")}>Conta contábil (caixa e equivalentes de caixa)</label>
            <select className={CAMPO} defaultValue="" id={id("contaContabil")} name="contaContabil" required>
              <option value="">Escolha a conta contábil…</option>
              {contasContabeis.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ROTULO} htmlFor={id("fonte")}>Fonte de recursos padrão</label>
            <select className={CAMPO} defaultValue="" id={id("fonte")} name="fonte" required>
              <option value="">Escolha a fonte…</option>
              {fontes.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.codigo} — {f.descricao}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
          {pendente ? "Gravando…" : "Cadastrar conta"}
        </button>
      </form>

      {texto === undefined ? null : (
        <p
          className={
            estado.erro !== undefined
              ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
              : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
          }
          data-resultado-da-acao="cadastrar-conta-bancaria"
          data-resultado-seq={seq}
          role={estado.erro !== undefined ? "alert" : "status"}
        >
          {texto}
        </p>
      )}
    </section>
  );
}
