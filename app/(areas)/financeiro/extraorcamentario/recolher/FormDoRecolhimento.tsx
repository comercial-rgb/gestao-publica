"use client";

import { useActionState, useId, useRef, useState } from "react";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import { CampoCpfCnpj } from "../../../../../components/ui/Campos";
import {
  AvisosDosAtos,
  ResultadosDosAtos,
  useResultadoDoAto,
} from "../../../../../components/ui/ResultadosDosAtos";
import { recolherAction, type EstadoDoRecolhimento } from "./actions";

/**
 * O FORMULÁRIO DA GUIA (C34).
 *
 * ⚠️ NÃO HÁ CAMPO DE VALOR TOTAL, e a ausência é deliberada: o total é a SOMA das parcelas. Um
 * total digitado ao lado da composição criaria duas verdades sobre o mesmo dinheiro, e a recusa do
 * domínio ("a composição não fecha com o recolhimento") chegaria como erro de digitação em vez de
 * como o que é. A soma aparece na tela, calculada, para a pessoa conferir antes de enviar.
 *
 * ⚠️ E O RESULTADO SAI PELO CONTRATO DA OBRA (`data-resultado-da-acao` + `data-resultado-seq`), com
 * as duas metades: dentro do formulário, que fica; e na barra, para quando ele sai. A lição é da
 * unidade anterior, onde eu errei essa peça duas vezes.
 */

export interface RetencaoParaCompor {
  readonly movimentoId: string;
  readonly rotulo: string;
  readonly aRecolher: string;
  readonly estornada: boolean;
}
export interface ContaParaRecolher {
  readonly codigo: string;
  readonly descricao: string;
  readonly fonteCodigo: string;
}

function reais(valor: string): string {
  return Number(valor).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FormDoRecolhimento({
  tipo,
  credor,
  retencoes,
  contas,
}: {
  readonly tipo: string;
  readonly credor: string;
  readonly retencoes: readonly RetencaoParaCompor[];
  readonly contas: readonly ContaParaRecolher[];
}): React.ReactElement {
  return (
    <ResultadosDosAtos>
      <AvisosDosAtos />
      <Corpo contas={contas} credor={credor} retencoes={retencoes} tipo={tipo} />
    </ResultadosDosAtos>
  );
}

function Corpo({
  tipo,
  credor,
  retencoes,
  contas,
}: {
  readonly tipo: string;
  readonly credor: string;
  readonly retencoes: readonly RetencaoParaCompor[];
  readonly contas: readonly ContaParaRecolher[];
}): React.ReactElement {
  const acao = "recolher-com-composicao";
  // ⚠️ OS `id` VÊM DO `useId` (censo de UI): um id literal repete no segundo render da mesma tela,
  // e o `<label for>` passa a apontar para o campo do PRIMEIRO formulário.
  const uid = useId();
  const publicar = useResultadoDoAto(acao);
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const [parcelas, setParcelas] = useState<Readonly<Record<string, string>>>({});
  const [estado, action, pendente] = useActionState<EstadoDoRecolhimento, FormData>(async (ant, dados) => {
    const r = await recolherAction(ant, dados);
    if (r.erro !== undefined) publicar("erro", r.erro);
    else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
    return r;
  }, {});

  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }

  // A soma das parcelas, para conferir antes de enviar. Formato brasileiro na entrada.
  let soma = 0;
  for (const v of Object.values(parcelas)) {
    const n = Number(v.trim().includes(",") ? v.replace(/\./g, "").replace(",", ".") : v);
    if (Number.isFinite(n)) soma += n;
  }

  const disponiveis = retencoes.filter((r) => !r.estornada && Number(r.aRecolher) > 0);

  return (
    <>
      <form action={action} className="grid gap-4" data-acao={acao}>
        <ChaveDeComando />
        <input type="hidden" name="tipo" value={tipo} />
        <input type="hidden" name="credor" value={credor} />

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-rec-conta`}>Conta bancária</label>
            <select className={CAMPO} id={`${uid}-rec-conta`} name="contaBancaria" defaultValue="">
              <option value="">Escolha</option>
              {contas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.descricao} (fonte {c.fonteCodigo})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-rec-data`}>Data do recolhimento</label>
            <input className={CAMPO} id={`${uid}-rec-data`} name="data" type="date" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-rec-hist`}>Histórico</label>
            <input className={CAMPO} id={`${uid}-rec-hist`} name="historico" type="text" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-rec-doc`}>CPF ou CNPJ de quem recebe</label>
            <CampoCpfCnpj id={`${uid}-rec-doc`} name="documentoDoFavorecido" placeholder="00.000.000/0000-00" className={CAMPO} />
          </div>
        </div>

        <fieldset className="grid gap-2 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] p-4">
          <legend className="px-1 text-sm font-semibold text-[color:var(--color-ink)]">
            Retenções que compõem este recolhimento
          </legend>
          {disponiveis.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">
              Não há retenção com valor a recolher nesta obrigação.
            </p>
          ) : (
            disponiveis.map((r) => (
              <div className="grid items-end gap-2 sm:grid-cols-[1fr_10rem]" key={r.movimentoId}>
                <input name="ingressoId" type="hidden" value={r.movimentoId} />
                <label className="text-sm" htmlFor={`${uid}-p-${r.movimentoId}`}>
                  {r.rotulo}
                  <span className="text-[color:var(--color-ink-2)]"> · a recolher {reais(r.aRecolher)}</span>
                </label>
                <input
                  className={CAMPO}
                  id={`${uid}-p-${r.movimentoId}`}
                  inputMode="decimal"
                  name="parcela"
                  onChange={(e) =>
                    setParcelas((p) => ({ ...p, [r.movimentoId]: e.target.value }))
                  }
                  placeholder="0,00"
                  type="text"
                  value={parcelas[r.movimentoId] ?? ""}
                />
              </div>
            ))
          )}
          <p className="mt-1 text-sm font-medium">
            Soma das parcelas: {soma.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </fieldset>

        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente || disponiveis.length === 0} type="submit">
            {pendente ? "Registrando..." : "Registrar recolhimento"}
          </button>
        </div>
      </form>
      {texto === undefined ? null : (
        <p
          className={
            estado.erro !== undefined
              ? "mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
              : "mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
          }
          data-resultado-da-acao={acao}
          data-resultado-seq={seq}
          role={estado.erro !== undefined ? "alert" : "status"}
        >
          {texto}
        </p>
      )}
    </>
  );
}
