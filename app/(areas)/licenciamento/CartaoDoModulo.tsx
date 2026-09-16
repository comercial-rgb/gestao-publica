"use client";

import { useActionState } from "react";
import { ChaveDeComando } from "../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../components/ui/Formulario";
import {
  habilitarModuloAction,
  reativarModuloAction,
  suspenderModuloAction,
  type EstadoDoLicenciamento,
} from "./actions";
import { Resultado } from "./FormContrato";

export interface ModuloNaCarta {
  readonly modulo: string;
  readonly nome: string;
  readonly descricao: string;
  readonly situacao: "HABILITADO" | "SUSPENSO" | "FORA_DE_VIGENCIA" | "NAO_CONTRATADO";
  readonly contratado: boolean;
  readonly inicio: string | null;
  readonly fim: string | null;
  readonly motivo: string | null;
  readonly dependenciasFaltantes: readonly string[];
  readonly dependentesAtivos: readonly string[];
}

const RÓTULO_DA_SITUACAO: Record<ModuloNaCarta["situacao"], string> = {
  HABILITADO: "Habilitado",
  SUSPENSO: "Suspenso",
  FORA_DE_VIGENCIA: "Fora de vigência",
  NAO_CONTRATADO: "Não contratado",
};

/**
 * O EFEITO PREVISTO de cada situação, dito ANTES de a pessoa clicar.
 *
 * ⚠️ O texto é o mesmo contrato que o gate cumpre (`modules/m35-licenciamento/dominio.ts`):
 * suspender bloqueia operação NOVA e preserva consulta; não contratar fecha os dois lados.
 * Escrever aqui um efeito diferente do que o servidor faz seria a mentira de interface que
 * este repositório já pagou para aprender a não repetir.
 */
const EFEITO: Record<ModuloNaCarta["situacao"], string> = {
  HABILITADO: "Operação e consulta liberadas.",
  SUSPENSO: "Operação nova bloqueada; a consulta ao que já foi registrado continua.",
  FORA_DE_VIGENCIA:
    "A vigência não alcança hoje: operação nova bloqueada; a consulta ao que já foi registrado continua.",
  NAO_CONTRATADO: "Operação e consulta fechadas — não há fato registrado neste módulo.",
};

export function CartaoDoModulo({
  contratoId,
  m,
  hoje,
  podeHabilitar,
  podeSuspender,
}: {
  readonly contratoId: string;
  readonly m: ModuloNaCarta;
  readonly hoje: string;
  readonly podeHabilitar: boolean;
  readonly podeSuspender: boolean;
}): React.ReactElement {
  const [estHab, acaoHab, pendHab] = useActionState<EstadoDoLicenciamento, FormData>(habilitarModuloAction, {});
  const [estSus, acaoSus, pendSus] = useActionState<EstadoDoLicenciamento, FormData>(suspenderModuloAction, {});
  const [estRea, acaoRea, pendRea] = useActionState<EstadoDoLicenciamento, FormData>(reativarModuloAction, {});

  const travadoPorDependencia = m.dependenciasFaltantes.length > 0;

  return (
    <section
      data-modulo={m.modulo}
      data-situacao={m.situacao}
      className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-4"
    >
      <header className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[color:var(--color-ink)]">{m.nome}</h3>
        <span data-papel="situacao" className="text-xs font-medium text-[color:var(--color-ink-2)]">
          {RÓTULO_DA_SITUACAO[m.situacao]}
        </span>
      </header>
      <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">{m.descricao}</p>
      <p data-papel="efeito" className="mb-2 text-xs text-[color:var(--color-ink-2)]">{EFEITO[m.situacao]}</p>
      <dl className="mb-3 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <div>
          <dt className="text-[color:var(--color-ink-3)]">Vigência</dt>
          <dd className="tabular text-[color:var(--color-ink)]">
            {m.inicio === null ? "—" : `${m.inicio} a ${m.fim ?? "sem termo"}`}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-[color:var(--color-ink-3)]">Último motivo</dt>
          <dd className="text-[color:var(--color-ink)]">{m.motivo ?? "—"}</dd>
        </div>
      </dl>

      {travadoPorDependencia ? (
        <p role="note" data-papel="dependencia" className="mb-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-alerta-bg)] px-3 py-2 text-xs text-[color:var(--color-status-alerta-fg)]">
          Depende de {m.dependenciasFaltantes.join(", ")}, que não está no contrato. O sistema não
          habilita a dependência sozinho: contrate-a primeiro.
        </p>
      ) : null}

      {m.dependentesAtivos.length > 0 ? (
        <p role="note" data-papel="dependentes" className="mb-3 text-xs text-[color:var(--color-ink-3)]">
          Sustenta {m.dependentesAtivos.join(", ")} — suspender este agora é recusado enquanto eles
          estiverem vigentes.
        </p>
      ) : null}

      {podeHabilitar && !travadoPorDependencia ? (
        <form action={acaoHab} className="mb-3 grid gap-3 sm:grid-cols-4" data-acao="habilitar-modulo">
          <ChaveDeComando />
          <input type="hidden" name="__contrato" value={contratoId} />
          <input type="hidden" name="__modulo" value={m.modulo} />
          <input type="hidden" name="__contratado" value={m.contratado ? "sim" : "nao"} />
          <label className="text-xs">
            <span className={ROTULO}>Início</span>
            <input name="inicio" type="date" required defaultValue={m.inicio ?? hoje} className={CAMPO} />
          </label>
          <label className="text-xs">
            <span className={ROTULO}>Fim (opcional)</span>
            <input name="fim" type="date" defaultValue={m.fim ?? ""} className={CAMPO} />
          </label>
          <label className="text-xs sm:col-span-2">
            <span className={ROTULO}>Motivo</span>
            <input name="motivo" required minLength={5} maxLength={500} className={CAMPO} />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" disabled={pendHab} className={CLASSE_BOTAO_PRIMARIO}>
              {pendHab
                ? "Gravando…"
                : m.contratado
                  ? `Programar vigência de ${m.nome}`
                  : `Habilitar ${m.nome}`}
            </button>
            <Resultado estado={estHab} />
          </div>
        </form>
      ) : null}

      {podeSuspender && m.contratado && m.situacao !== "SUSPENSO" ? (
        <form action={acaoSus} className="grid gap-3 sm:grid-cols-4" data-acao="suspender-modulo">
          <ChaveDeComando />
          <input type="hidden" name="__contrato" value={contratoId} />
          <input type="hidden" name="__modulo" value={m.modulo} />
          <label className="text-xs sm:col-span-3">
            <span className={ROTULO}>Motivo da suspensão</span>
            <input name="motivo" required minLength={5} maxLength={500} className={CAMPO} />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" disabled={pendSus} className={CLASSE_BOTAO_PRIMARIO}>
              {pendSus ? "Suspendendo…" : `Suspender ${m.nome}`}
            </button>
            <Resultado estado={estSus} />
          </div>
        </form>
      ) : null}

      {podeSuspender && m.situacao === "SUSPENSO" ? (
        <form action={acaoRea} className="grid gap-3 sm:grid-cols-4" data-acao="reativar-modulo">
          <ChaveDeComando />
          <input type="hidden" name="__contrato" value={contratoId} />
          <input type="hidden" name="__modulo" value={m.modulo} />
          <label className="text-xs sm:col-span-3">
            <span className={ROTULO}>Motivo da reativação</span>
            <input name="motivo" required minLength={5} maxLength={500} className={CAMPO} />
          </label>
          <div className="sm:col-span-4">
            <button type="submit" disabled={pendRea} className={CLASSE_BOTAO_PRIMARIO}>
              {pendRea ? "Reativando…" : `Reativar ${m.nome}`}
            </button>
            <Resultado estado={estRea} />
          </div>
        </form>
      ) : null}
    </section>
  );
}
