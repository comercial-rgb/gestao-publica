"use client";

import { useActionState, useId, useRef, useState } from "react";
import { CampoValor } from "../../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../../components/ui/Formulario";
import { ChaveDeComando } from "../../../../../components/ui/ChaveDeComando";
import {
  AvisosDosAtos,
  ResultadosDosAtos,
  useResultadoDoAto,
} from "../../../../../components/ui/ResultadosDosAtos";
import { distribuirAction, type EstadoDaGuiaDistribuida } from "./actions";

/**
 * O FORMULÁRIO DA GUIA REPARTIDA (C30).
 *
 * ⚠️ A SOMA E A DIFERENÇA APARECEM ENQUANTO A PESSOA DIGITA, e não só na recusa. O servidor recusa
 * quando as parcelas não somam o total — é a garantia —, mas descobrir isso depois de enviar faz a
 * pessoa refazer a conta de cabeça. O número na tela é conferência, não validação: quem decide é o
 * servidor.
 *
 * ⚠️ A PRIMEIRA FONTE COM VALOR É A FONTE DA GUIA, e a tela DIZ isso. `ReceitaArrecadada.fonteId` é
 * `NOT NULL` — a guia tem de ficar arquivada sob alguma fonte —, e nenhum número por fonte sai
 * dessa coluna (todos saem das parcelas). Deixar a regra implícita faria a coluna parecer arbitrária
 * para quem olhasse o dado depois.
 *
 * ⚠️ A LINHA DA FONTE NÃO PREVISTA COBRA O MOTIVO, e o motivo não é enfeite: é o que a prestação de
 * contas lê, e o servidor exige a autorização própria para gravá-la.
 */

export interface FonteDaTela {
  readonly codigo: string;
  readonly descricao: string;
}
export interface FontePrevistaDaTela {
  readonly fonteCodigo: string;
  readonly fonteDescricao: string;
  readonly exercicioFonte: 1 | 2;
  readonly valorPrevisto: string;
}
export interface ContaDaTela {
  readonly codigo: string;
  readonly descricao: string;
  readonly fontes: readonly FonteDaTela[];
}

function reais(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** O que a pessoa digitou, em número — aceita 1.234,56 e 1234.56. */
function numero(bruto: string): number {
  const t = bruto.trim();
  if (t === "") return 0;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : 0;
}

export function FormGuiaDistribuida(props: {
  readonly exercicio: number;
  readonly naturezaCodigo: string;
  readonly fontesPrevistas: readonly FontePrevistaDaTela[];
  readonly contas: readonly ContaDaTela[];
  readonly todasAsFontes: readonly FonteDaTela[];
}): React.ReactElement {
  return (
    <ResultadosDosAtos>
      <AvisosDosAtos />
      <Corpo {...props} />
    </ResultadosDosAtos>
  );
}

function Corpo({
  exercicio,
  naturezaCodigo,
  fontesPrevistas,
  contas,
  todasAsFontes,
}: {
  readonly exercicio: number;
  readonly naturezaCodigo: string;
  readonly fontesPrevistas: readonly FontePrevistaDaTela[];
  readonly contas: readonly ContaDaTela[];
  readonly todasAsFontes: readonly FonteDaTela[];
}): React.ReactElement {
  const acao = "registrar-guia-distribuida";
  // ⚠️ OS `id` VÊM DO `useId`, NÃO DE LITERAIS. Um id literal repete no segundo render da mesma
  // tela, e aí o `<label for>` passa a apontar para o campo do PRIMEIRO formulário: o leitor de
  // tela anuncia o rótulo errado e o foco vai para o lugar errado. O censo de UI cobra isso.
  const uid = useId();
  const publicar = useResultadoDoAto(acao);
  const [seq, setSeq] = useState(0);
  const ultimo = useRef<string | undefined>(undefined);
  const [parcelas, setParcelas] = useState<Readonly<Record<string, string>>>({});
  const [total, setTotal] = useState("");
  const [outraFonte, setOutraFonte] = useState("");
  const [outroValor, setOutroValor] = useState("");

  const [estado, action, pendente] = useActionState<EstadoDaGuiaDistribuida, FormData>(
    async (ant, dados) => {
      const r = await distribuirAction(ant, dados);
      if (r.erro !== undefined) publicar("erro", r.erro);
      else if (r.sucesso !== undefined) publicar("ok", r.sucesso);
      return r;
    },
    {}
  );

  const texto = estado.erro ?? estado.sucesso;
  if (texto !== undefined && texto !== ultimo.current) {
    ultimo.current = texto;
    setSeq((n) => n + 1);
  }

  const somaDasPrevistas = Object.values(parcelas).reduce((t, v) => t + numero(v), 0);
  const soma = somaDasPrevistas + numero(outroValor);
  const diferenca = numero(total) - soma;

  return (
    <>
      <form action={action} className="grid gap-4" data-acao={acao}>
        <ChaveDeComando />
        <input name="exercicio" type="hidden" value={exercicio} />
        <input name="natureza" type="hidden" value={naturezaCodigo} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={ROTULO} htmlFor={`${uid}-gd-conta`}>Conta bancária que recebeu</label>
            <select className={CAMPO} defaultValue="" id={`${uid}-gd-conta`} name="contaBancaria">
              <option value="">Escolha a conta…</option>
              {contas.map((c) => (
                <option key={c.codigo} value={c.codigo}>
                  {c.codigo} — {c.descricao} · fontes {c.fontes.map((f) => f.codigo).join(", ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-gd-valor`}>Total do depósito (R$)</label>
            {/* ⚠️ `aoMudarValorCru` — o ESPELHO do valor cru, não um segundo dono do texto. É o
                mesmo caso do cadastro de decreto do M03: o form precisa do total a cada tecla para
                mostrar a diferença contra a soma das parcelas. A máscara continua sendo a única
                do sistema. */}
            <CampoValor
              aoMudarValorCru={setTotal}
              className={CAMPO}
              id={`${uid}-gd-valor`}
              name="valor"
              placeholder="100.000,00"
              required
            />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-gd-data`}>Data de arrecadação</label>
            <input className={CAMPO} id={`${uid}-gd-data`} name="data" required type="date" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-gd-numero`}>Nº da guia</label>
            <input className={CAMPO} id={`${uid}-gd-numero`} name="numeroReceita" placeholder="2026RC000001" required type="text" />
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-gd-co`}>CO (4 dígitos, opcional)</label>
            <input className={CAMPO} id={`${uid}-gd-co`} name="co" pattern="\d{4}" placeholder="0001" type="text" />
          </div>
        </div>

        <fieldset className="grid gap-2 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] p-4">
          <legend className="px-1 text-sm font-semibold text-[color:var(--color-ink)]">
            Quanto do depósito entrou em cada fonte
          </legend>
          <p className="text-sm text-[color:var(--color-ink-2)]">
            Deixe em branco as fontes sem valor. A guia é registrada na primeira fonte com valor
            informado.
          </p>

          {fontesPrevistas.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-2)]">
              A LOA deste exercício não prevê esta natureza em nenhuma fonte. Utilize o campo de
              outra fonte, abaixo, informando o motivo.
            </p>
          ) : (
            fontesPrevistas.map((f) => {
              const chave = `${f.fonteCodigo}|${String(f.exercicioFonte)}`;
              return (
                <div className="grid items-end gap-2 sm:grid-cols-[1fr_12rem]" key={chave}>
                  <input name="fonte" type="hidden" value={f.fonteCodigo} />
                  <input name="exercicioFonte" type="hidden" value={f.exercicioFonte} />
                  <label className="text-sm" htmlFor={`${uid}-gd-p-${chave}`}>
                    Fonte {f.fonteCodigo} — {f.fonteDescricao}
                    {f.exercicioFonte === 2 ? " (exercício anterior)" : ""}
                    <span className="text-[color:var(--color-ink-2)]">
                      {" "}· previsto na LOA {reais(f.valorPrevisto)}
                    </span>
                  </label>
                  {/* ⚠️ A MÁSCARA DO SISTEMA, E NÃO UM `input` CRU — foi o percurso que apontou.
                      Com campo cru, "60.000,00" chegava ao domínio como texto pt-BR e o erro que
                      subia era "[DecimalError] Invalid argument: 60.000,00": verdadeiro, ilegível,
                      e vazando o nome da biblioteca para o operador. `CampoValor` submete o valor
                      CRU num hidden e é o único normalizador de dinheiro da interface. */}
                  <CampoValor
                    aoMudarValorCru={(cru) => setParcelas((p) => ({ ...p, [chave]: cru }))}
                    className={CAMPO}
                    id={`${uid}-gd-p-${chave}`}
                    name="parcela"
                    placeholder="0,00"
                  />
                </div>
              );
            })
          )}
        </fieldset>

        <fieldset className="grid gap-2 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] p-4">
          <legend className="px-1 text-sm font-semibold text-[color:var(--color-ink)]">
            Fonte não prevista na LOA (opcional)
          </legend>
          <p className="text-sm text-[color:var(--color-ink-2)]">
            Informe a fonte, o valor e o motivo, que constará da prestação de contas. Este registro
            exige permissão específica.
          </p>
          <div className="grid items-end gap-2 sm:grid-cols-[1fr_12rem]">
            <div>
              <label className={ROTULO} htmlFor={`${uid}-gd-outra`}>Fonte</label>
              <select
                className={CAMPO}
                id={`${uid}-gd-outra`}
                name="outraFonte"
                onChange={(e) => setOutraFonte(e.target.value)}
                value={outraFonte}
              >
                <option value="">Nenhuma</option>
                {todasAsFontes.map((f) => (
                  <option key={f.codigo} value={f.codigo}>
                    {f.codigo} — {f.descricao}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={ROTULO} htmlFor={`${uid}-gd-outro-valor`}>Valor (R$)</label>
              <CampoValor
                aoMudarValorCru={setOutroValor}
                className={CAMPO}
                id={`${uid}-gd-outro-valor`}
                name="outroValor"
                placeholder="0,00"
              />
            </div>
          </div>
          <div>
            <label className={ROTULO} htmlFor={`${uid}-gd-fundamento`}>Motivo</label>
            <input
              className={CAMPO}
              id={`${uid}-gd-fundamento`}
              name="outroFundamento"
              placeholder="Convênio federal assinado em março, ainda sem crédito na LOA."
              type="text"
            />
          </div>
        </fieldset>

        <p className="text-sm font-medium">
          Soma das parcelas: {reais(soma)}
          {" · "}
          {numero(total) === 0
            ? "informe o total do depósito"
            : diferenca === 0
              ? "igual ao total"
              : diferenca > 0
                ? `faltam ${reais(diferenca)} para atingir o total`
                : `excede o total em ${reais(-diferenca)}`}
        </p>

        <div>
          <button className={CLASSE_BOTAO_PRIMARIO} disabled={pendente} type="submit">
            {pendente ? "Registrando…" : "Registrar guia repartida"}
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
