"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { rolDeFontesAction, type EstadoDoRol } from "./actions";

/**
 * O ROL DE FONTES DE UMA CONTA (TR 5.10.2.6) — o cadastro que faltava.
 *
 * ⚠️ UM FORMULÁRIO POR CONTA, e o `data-acao` leva o CÓDIGO da conta. A tela lista várias contas;
 * um `data-acao` igual em todas faria o percurso (e a barra de resultados) confundir qual respondeu
 * — foi o defeito que a página do processo, com catorze formulários, ensinou.
 *
 * ⚠️ AS RECUSAS SÃO DO SERVIDOR, e a tela não as antecipa escondendo botão: remover a última fonte
 * ou a fonte padrão é recusado com o motivo escrito. Esconder o botão ensinaria que não existe;
 * recusar com o motivo ensina por quê.
 */
export function FormRolDeFontes({
  contaCodigo,
  fontesDoRol,
  rolDeclarado,
  fontesDisponiveis,
}: {
  readonly contaCodigo: string;
  readonly fontesDoRol: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly rolDeclarado: boolean;
  readonly fontesDisponiveis: readonly { readonly codigo: string; readonly descricao: string }[];
}): React.ReactElement {
  const acao = `rol-de-fontes-${contaCodigo}`;
  const uid = useId();
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  // ⚠️ SEM A BARRA DE RESULTADOS, e a ausência é deliberada: `AvisosDosAtos` existe para o aviso
  // de um formulário que SAI da tela (a linha que se anula, o resto que se paga). Este não sai —
  // a conta continua na lista depois do ato —, então o marcador local basta, e ele é a metade que
  // o percurso lê.
  const [estado, action, pendente] = useActionState<EstadoDoRol, FormData>(
    rolDeFontesAction,
    {}
  );

  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }

  const noRol = new Set(fontesDoRol.map((f) => f.codigo));
  const aAcrescentar = fontesDisponiveis.filter((f) => !noRol.has(f.codigo));

  return (
    <form action={action} className="mt-2" data-acao={acao}>
      <ChaveDeComando />
      <input name="conta" type="hidden" value={contaCodigo} />
      <p className="text-xs text-[color:var(--color-ink-2)]">
        Comporta as fontes{" "}
        {fontesDoRol.map((f) => f.codigo).join(", ")}
        {rolDeclarado ? "" : " — rol não declarado; vale a fonte padrão da conta"}
      </p>

      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-fonte`}>
            Fonte a acrescentar ao rol
          </label>
          <select className={CAMPO} defaultValue="" id={`${uid}-fonte`} name="fonte">
            <option value="">Escolha a fonte…</option>
            {aAcrescentar.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.codigo} — {f.descricao}
              </option>
            ))}
          </select>
        </div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} name="operacao" type="submit" value="acrescentar">
          {pendente ? "Gravando…" : "Acrescentar"}
        </button>
      </div>

      {fontesDoRol.length > 1 ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-remover`}>
              Fonte a remover do rol
            </label>
            <select className={CAMPO} defaultValue="" id={`${uid}-remover`} name="fonteRemover">
              <option value="">Escolha a fonte…</option>
              {fontesDoRol.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.codigo} — {f.descricao}
                </option>
              ))}
            </select>
          </div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} name="operacao" type="submit" value="remover">
            {pendente ? "Gravando…" : "Remover"}
          </button>
        </div>
      ) : null}

      {texto === undefined ? null : (
        <p
          className={
            estado.erro !== undefined
              ? "mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-xs text-[color:var(--color-status-erro-fg)]"
              : "mt-2 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-xs text-[color:var(--color-status-ok-fg)]"
          }
          data-resultado-da-acao={acao}
          data-resultado-seq={seq}
          role={estado.erro !== undefined ? "alert" : "status"}
        >
          {texto}
        </p>
      )}
    </form>
  );
}
