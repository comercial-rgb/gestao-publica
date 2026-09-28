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
 * ⚠️ DOIS FORMULÁRIOS, E NÃO UM COM DOIS BOTÕES — e foi o percurso que mostrou por quê. Com um
 * formulário só, o primeiro `button[type=submit]` é o que vale para quem envia pelo teclado (e para
 * qualquer automação): pedir a REMOÇÃO acabava em "Escolha a fonte a acrescentar ao rol", porque o
 * envio saía com a operação do outro botão. Um formulário por ato, cada um com o seu `data-acao`.
 *
 * ⚠️ O `data-acao` LEVA O CÓDIGO DA CONTA. A tela lista várias contas; um `data-acao` igual em todas
 * faria a barra de resultados (e o percurso) confundir qual delas respondeu — é o defeito que a
 * página do processo, com catorze formulários, ensinou.
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
  const noRol = new Set(fontesDoRol.map((f) => f.codigo));
  const aAcrescentar = fontesDisponiveis.filter((f) => !noRol.has(f.codigo));

  return (
    <div className="mt-2">
      <p className="text-xs text-[color:var(--color-ink-2)]" data-papel={`rol-${contaCodigo}`}>
        Fontes aceitas: {fontesDoRol.map((f) => f.codigo).join(", ")}
        {rolDeclarado ? "" : " (rol não declarado; vale a fonte padrão da conta)"}
      </p>

      <Operacao
        acao={`rol-acrescentar-${contaCodigo}`}
        botao="Acrescentar"
        campo="fonte"
        contaCodigo={contaCodigo}
        opcoes={aAcrescentar}
        operacao="acrescentar"
        rotulo="Fonte a acrescentar ao rol"
      />

      {/* A remoção só aparece quando há mais de uma fonte: com uma só, o domínio a recusaria — e
          oferecer um formulário cujo único desfecho é a recusa é oferecer trabalho perdido. */}
      {fontesDoRol.length > 1 ? (
        <Operacao
          acao={`rol-remover-${contaCodigo}`}
          botao="Remover"
          campo="fonteRemover"
          contaCodigo={contaCodigo}
          opcoes={fontesDoRol}
          operacao="remover"
          rotulo="Fonte a remover do rol"
        />
      ) : null}
    </div>
  );
}

function Operacao({
  acao,
  botao,
  campo,
  contaCodigo,
  opcoes,
  operacao,
  rotulo,
}: {
  readonly acao: string;
  readonly botao: string;
  readonly campo: string;
  readonly contaCodigo: string;
  readonly opcoes: readonly { readonly codigo: string; readonly descricao: string }[];
  readonly operacao: string;
  readonly rotulo: string;
}): React.ReactElement {
  const uid = useId();
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const [estado, action, pendente] = useActionState<EstadoDoRol, FormData>(rolDeFontesAction, {});

  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }

  return (
    <form action={action} className="mt-2" data-acao={acao}>
      <ChaveDeComando />
      <input name="conta" type="hidden" value={contaCodigo} />
      <input name="operacao" type="hidden" value={operacao} />
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={ROTULO} htmlFor={`${uid}-${campo}`}>
            {rotulo}
          </label>
          <select className={CAMPO} defaultValue="" id={`${uid}-${campo}`} name={campo}>
            <option value="">Escolha a fonte…</option>
            {opcoes.map((f) => (
              <option key={f.codigo} value={f.codigo}>
                {f.codigo} — {f.descricao}
              </option>
            ))}
          </select>
        </div>
        <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
          {pendente ? "Gravando…" : botao}
        </button>
      </div>

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
