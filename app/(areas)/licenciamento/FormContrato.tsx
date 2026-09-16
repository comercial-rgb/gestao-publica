"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../components/ui/Formulario";
import { registrarContratoAction, type EstadoDoLicenciamento } from "./actions";

/**
 * O FORMULÁRIO DO CONTRATO — ilha client. Todo campo tem rótulo.
 *
 * ⚠️ AS DATAS SÃO DIA CIVIL DO ENTE, e o `type="date"` do navegador entrega exatamente
 * "AAAA-MM-DD" — que é o formato que o domínio guarda. Nenhuma conversão de fuso no caminho,
 * porque não há instante envolvido: "31/12/2027" é o dia, não um momento em UTC.
 */
export function FormContrato({ hoje }: { readonly hoje: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoLicenciamento, FormData>(
    registrarContratoAction,
    {}
  );

  return (
    <form action={action} className={CLASSE_PAINEL_FORMULARIO} data-acao="registrar-contrato">
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Registrar o contrato desta implantação
      </h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        Um contrato ativo por implantação. Enquanto ele não existir, os módulos contratáveis ficam
        fechados — a administração de usuários, os cadastros e o suporte continuam abertos.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs">
          <span className={ROTULO}>Número do contrato</span>
          <input name="numero" required maxLength={60} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Cliente contratante</span>
          <input name="cliente" required maxLength={200} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Início da vigência</span>
          <input name="inicio" type="date" required defaultValue={hoje} className={CAMPO} />
        </label>
        <label className="text-xs">
          <span className={ROTULO}>Fim da vigência (em branco = sem termo)</span>
          <input name="fim" type="date" className={CAMPO} />
        </label>
        <label className="text-xs sm:col-span-2">
          <span className={ROTULO}>Observação (opcional)</span>
          <input name="observacao" maxLength={1000} className={CAMPO} />
        </label>
        <label className="flex items-center gap-2 text-xs sm:col-span-2">
          <input name="demonstracao" type="checkbox" className="h-4 w-4" />
          <span className="text-[color:var(--color-ink-2)]">
            Contrato de demonstração — ambiente de avaliação, não é contratação em produção
          </span>
        </label>
      </div>
      <Resultado estado={estado} />
      <button type="submit" disabled={pendente} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Registrando…" : "Registrar contrato"}
      </button>
    </form>
  );
}

/**
 * ⚠️ TRÊS ESTADOS, E NÃO DOIS. "Sem efeito" (a operação repetida) não é sucesso nem erro:
 * dizer "pronto!" a quem clicou duas vezes esconderia que a segunda não fez nada; dizer
 * "falhou" mandaria abrir chamado por um comportamento correto.
 */
export function Resultado({ estado }: { readonly estado: EstadoDoLicenciamento }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.semEfeito !== undefined) {
    return (
      <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-sm text-[color:var(--color-status-alerta-fg)]">
        {estado.semEfeito}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}
