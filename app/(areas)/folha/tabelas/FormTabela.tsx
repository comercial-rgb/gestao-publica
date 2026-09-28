"use client";

import { useActionState, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarTabelaAction, type EstadoDaTabela } from "./actions";

/**
 * FORM DA TABELA DO ENTE — ilha client (M33, V6 P2.3): o cabeçalho e as FAIXAS no mesmo ato.
 *
 * ⚠️ DUAS RAZÕES PARA SER ILHA, e as duas são o limite 2 do molde: as faixas são linhas
 * (`faixas.N.*`) e os campos do cabeçalho MUDAM com o tipo — uma tabela de salário-família não
 * tem faixa nenhuma, e uma de contribuição não tem dedução por dependente. Oferecer todos os
 * campos sempre seria um formulário que mente sobre o que vai gravar.
 *
 * ⚠️ A ALÍQUOTA SE DIGITA EM PORCENTO (7,5) e a porta converte para decimal. Quem preenche lê a
 * portaria, e a portaria diz 7,5% — não 0,075.
 */
export function FormTabela(): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaTabela, FormData>(criarTabelaAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [tipo, setTipo] = useState<string>("CONTRIBUICAO_RGPS");
  const [linhas, setLinhas] = useState<number>(3);
  if (estado.sucesso !== undefined) ref.current?.reset();

  const comFaixas = tipo === "CONTRIBUICAO_RGPS" || tipo === "CONTRIBUICAO_RPPS" || tipo === "IRRF";
  const contribuicao = tipo === "CONTRIBUICAO_RGPS" || tipo === "CONTRIBUICAO_RPPS";

  return (
    <form ref={ref} action={action} data-acao="criar-tabela" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Nova tabela do ente</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Informe os valores conforme a norma vigente (portaria, lei ou decreto); a fundamentação é obrigatória. Sem tabela
        vigente na competência, o cálculo da folha não é realizado.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Tipo</span>
          <select name="tipo" required value={tipo} onChange={(e) => setTipo(e.target.value)} className={CAMPO}>
            <option value="CONTRIBUICAO_RGPS">Contribuição previdenciária — RGPS</option>
            <option value="CONTRIBUICAO_RPPS">Contribuição previdenciária — RPPS</option>
            <option value="IRRF">IRRF</option>
            <option value="SALARIO_FAMILIA">Salário-família</option>
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Vigente desde (AAAA-MM)</span>
          <input name="competenciaInicio" required placeholder="2026-01" pattern="\d{4}-(0[1-9]|1[0-2])" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Vigente até (opcional)</span>
          <input name="competenciaFim" placeholder="2026-12" pattern="\d{4}-(0[1-9]|1[0-2])" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Fundamentação legal</span>
          <input name="fundamentacaoLegal" required placeholder="Portaria Interministerial MPS/MF, Lei Municipal, Decreto..." className={CAMPO} />
        </label>

        {contribuicao ? (
          <>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Teto do salário de contribuição (opcional)</span>
              <input name="teto" inputMode="decimal" placeholder="8.000,00" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Alíquota patronal em % (informativa)</span>
              <input name="aliquotaPatronal" inputMode="decimal" placeholder="22" className={CAMPO} />
            </label>
          </>
        ) : null}

        {tipo === "IRRF" ? (
          <>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Dedução por dependente (R$)</span>
              <input name="deducaoPorDependente" required inputMode="decimal" placeholder="189,59" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Desconto simplificado (opcional)</span>
              <input name="descontoSimplificado" inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Parcela isenta de 65 anos ou mais</span>
              <input name="isencaoMaior65" inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Redutor — base</span>
              <input name="redutorBase" inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Redutor — fator (por real de renda)</span>
              <input name="redutorFator" inputMode="decimal" placeholder="0,133145" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Redutor — renda máxima</span>
              <input name="redutorRendaMaxima" inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Redutor — renda até a qual o imposto zera</span>
              <input name="redutorRendaDaFaixaIsenta" inputMode="decimal" placeholder="5000,00" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Redutor — redução máxima nessa faixa</span>
              <input name="redutorMaximoNaFaixaIsenta" inputMode="decimal" placeholder="312,89" className={CAMPO} />
            </label>
          </>
        ) : null}

        {tipo === "SALARIO_FAMILIA" ? (
          <>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Renda máxima do servidor (R$)</span>
              <input name="rendaMaxima" required inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Valor por dependente (R$)</span>
              <input name="valorPorDependente" required inputMode="decimal" className={CAMPO} />
            </label>
            <label className="text-xs text-[color:var(--color-ink-2)]">
              <span className={ROTULO}>Idade limite (anos)</span>
              <input name="idadeLimite" required inputMode="numeric" placeholder="14" className={CAMPO} />
            </label>
          </>
        ) : null}
      </div>

      {comFaixas ? (
        <fieldset data-secao="faixas" className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink)]">Faixas (da menor para a maior)</legend>
          <p className="mb-2 text-[11px] text-[color:var(--color-ink-3)]">
            O limite de cada faixa é inclusivo, e apenas a última faixa fica sem limite. Informe a alíquota em percentual.
            Cada alíquota incide somente sobre a parcela da base compreendida na respectiva faixa.
          </p>
          {Array.from({ length: linhas }, (_, i) => (
            <div key={i} data-linha={i} className="mb-3 grid gap-3 rounded border border-dashed border-[color:var(--color-border)] p-2 sm:grid-cols-3">
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Até (R$), em branco na última faixa</span>
                <input name={`faixas.${i}.ate`} inputMode="decimal" placeholder="1.621,00" className={CAMPO} />
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Alíquota (%)</span>
                <input name={`faixas.${i}.aliquota`} inputMode="decimal" placeholder="7,5" className={CAMPO} />
              </label>
              {tipo === "IRRF" ? (
                <label className="text-xs text-[color:var(--color-ink-2)]">
                  <span className={ROTULO}>Parcela a deduzir (R$), para conferência</span>
                  <input name={`faixas.${i}.parcelaADeduzir`} inputMode="decimal" className={CAMPO} />
                </label>
              ) : null}
            </div>
          ))}
          <button type="button" data-acao="mais-uma-faixa" className="text-xs underline underline-offset-2" onClick={() => setLinhas((n) => n + 1)}>
            Mais uma faixa
          </button>
        </fieldset>
      ) : null}

      {estado.erro !== undefined ? (
        <p role="alert" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">{estado.erro}</p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">{estado.sucesso}</p>
      ) : null}
      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Gravando…" : "Cadastrar tabela"}
      </button>
    </form>
  );
}
