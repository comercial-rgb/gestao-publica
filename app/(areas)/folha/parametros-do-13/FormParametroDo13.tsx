"use client";

import { useActionState, useRef } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { criarParametroDo13Action, type EstadoDoParametroDo13 } from "./actions";

interface Opcao {
  readonly valor: string;
  readonly rotulo: string;
}

/**
 * FORM DO PARÂMETRO DO 13º — ilha client (M33, V11 V9.1).
 *
 * ⚠️ É ILHA PELO LIMITE 2 DO MOLDE: as rubricas da base são LINHAS (uma lista de marcações), e o
 * molde não monta múltiplas linhas. Declarado em `components/ui/MODULO-UI.md`.
 *
 * ⚠️ NENHUM CAMPO NASCE PREENCHIDO, e isso é decisão, não esquecimento. Sugerir "15", "12" e
 * "50" pouparia digitação e faria o ente CONFIRMAR números que ele deveria DECLARAR — e o
 * primeiro município cujo estatuto conta o avo por quinzena aceitaria o padrão sem ler. Os
 * valores vêm da norma que o operador tem na mão.
 *
 * ⚠️ O PERCENTUAL SE DIGITA EM PORCENTO (50), como a norma o escreve; a porta converte para
 * fração. Mesma escolha do `FormTabela`, pela mesma razão: quem preenche está lendo a lei.
 */
export function FormParametroDo13({
  proventos,
  base,
  abatimento,
  adiantamentosQuePermitemPago,
  opcoesDeEsferaDoAto,
  opcoesDeTipoDeAto,
}: {
  readonly proventos: readonly Opcao[];
  readonly base: readonly Opcao[];
  readonly abatimento: readonly Opcao[];
  readonly adiantamentosQuePermitemPago: readonly string[];
  /** Os róis do ato (esfera e tipo), lidos pelo Server Component: a ilha client não importa porta. */
  readonly opcoesDeEsferaDoAto: readonly Opcao[];
  readonly opcoesDeTipoDeAto: readonly Opcao[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoParametroDo13, FormData>(criarParametroDo13Action, {});
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  /**
   * ⚠️ O MARCADOR DE RESULTADO — `PARAMETRO-DO-13-SEM-MARCADOR-DE-RESULTADO`, achado pelo percurso
   * do 13º (V11 V9.2) e consertado por MÉRITO PRÓPRIO, não por conveniência do teste.
   *
   * Todo formulário do sistema anuncia o desfecho do ato em `data-resultado-da-acao`, com um
   * `data-resultado-seq` que MUDA a cada resposta (`components/molde/FormsDoRecurso.tsx`). Este,
   * escrito à mão, mostrava a mensagem em `role="alert"`/`role="status"` soltos: quem lê a tela
   * por programa ficava sem saber se o ato respondeu, e lia SILÊNCIO num cadastro que funcionou.
   *
   * A sequência é contada aqui porque o estado desta ação não a carrega, e ela só precisa MUDAR —
   * o valor em si não significa nada.
   */
  const seq = useRef(0);
  const anterior = useRef<EstadoDoParametroDo13 | null>(null);
  if (anterior.current !== estado) {
    anterior.current = estado;
    seq.current += 1;
  }

  const semRubricas = proventos.length === 0 || base.length === 0 || abatimento.length === 0;

  return (
    <form ref={ref} action={action} data-acao="criar-parametro-do-13" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Novo parâmetro do 13º</h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Informe os valores conforme o ato do ente. Sem parâmetro publicado para o exercício, o cálculo da folha de 13º não
        é realizado. Para corrigir, cadastre nova versão; as versões anteriores permanecem no histórico.
      </p>

      {semRubricas ? (
        <p className="mb-3 rounded border border-[color:var(--color-borda)] p-3 text-xs text-[color:var(--color-ink-2)]">
          Faltam rubricas para preencher este formulário. São necessárias: duas rubricas de provento (uma para o 13º e
          outra para o adiantamento), ao menos uma rubrica de provento de vencimento-base, gratificação ou percentual
          para compor a base, e uma rubrica de desconto de natureza &quot;Abatimento do adiantamento do 13º&quot;.
          Cadastre-as em <a href="/folha/rubricas" className="font-medium text-[color:var(--color-primary)] underline" data-atalho-de-cadastro>Folha &gt; Rubricas</a>, com versão aprovada.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Exercício (ano do 13º)</span>
          <input name="exercicio" type="number" required min={1900} max={2200} placeholder="2026" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Dias mínimos no mês para contar um avo</span>
          <input name="diasMinimosDoAvo" type="number" required min={1} max={30} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Avos no exercício</span>
          <input name="avosNoExercicio" type="number" required min={1} max={12} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Percentual da 1ª parcela (%)</span>
          <input name="percentualDaPrimeiraParcela" required inputMode="decimal" placeholder="50" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Os avos da 1ª parcela contam até</span>
          <select name="baseDosAvosDoAdiantamento" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            <option value="ATE_A_COMPETENCIA">A competência da folha de adiantamento (o já ganho)</option>
            <option value="EXERCICIO_INTEIRO">Os doze meses do exercício (o ano projetado)</option>
          </select>
          <span className="mt-1 block text-[11px]">
            Na primeira opção, a parcela considera os avos adquiridos até a competência; na segunda, o 13º projetado
            para o ano inteiro. Adote a prática prevista no ato do ente.
          </span>
        </label>

        {/*
          ⚠️ V11 V9.3 — O CRITÉRIO DO ABATIMENTO, E ELE NÃO TEM PADRÃO.

          `defaultValue=""` e SEM `required`: deixar em branco é uma resposta legítima — significa
          "o ente ainda não levantou a norma". O sistema então calcula o 13º como SIMULAÇÃO e
          bloqueia a apropriação, em vez de fingir que alguém declarou algo. Marcar "Fechado" por
          conveniência seria o sistema legislando pelo município, que é o erro que toda esta tela
          existe para não cometer.

          ⚠️ E NÃO HÁ CAIXA DE ACEITE em lugar nenhum deste formulário. "Confirmo sob minha
          responsabilidade" destravaria o bloqueio transferindo a culpa para quem clicou, e o
          desconto continuaria no contracheque do servidor do mesmo jeito.
        */}
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Para ser abatido na 2ª parcela, o adiantamento precisa estar</span>
          <select name="estadoMinimoDoAdiantamentoParaAbater" defaultValue="" className={CAMPO}>
            <option value="">Não definido (o 13º é calculado como simulação e não pode ser apropriado)</option>
            <option value="FECHADO">Fechado (o cálculo do adiantamento foi encerrado)</option>
            <option value="CERTIFICADO">Certificado (o cálculo foi atestado pelo servidor designado)</option>
            <option value="PAGO">Pago (o adiantamento deste servidor foi pago)</option>
          </select>
          <span className="mt-1 block text-[11px]">
            A definição cabe ao ente, conforme o ato informado abaixo. A Lei 4.749/1965, art. 1º, e o Decreto
            57.155/1965, art. 3º, § 3º, tratam da compensação do valor &ldquo;recebido&rdquo; no regime celetista; para
            o servidor estatutário, prevalece o estatuto do município.
          </span>
          <span className="mt-1 block text-[11px]">
            {adiantamentosQuePermitemPago.length === 0
              ? "A opção “pago” não está disponível: nenhuma rubrica de provento está em grupo de empenho por servidor. Cadastre um grupo de empenho por servidor para a rubrica do adiantamento, ou utilize “fechado” ou “certificado”."
              : `A opção “pago” exige rubrica de adiantamento empenhada por servidor. Rubricas disponíveis: ${adiantamentosQuePermitemPago.join("; ")}.`}
          </span>
        </label>

        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] sm:col-span-1">
          <input name="decimoTerceiroSofreContribuicao" type="checkbox" value="on" />
          <span>O 13º sofre contribuição previdenciária</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] sm:col-span-1">
          <input name="decimoTerceiroSofreIrrf" type="checkbox" value="on" />
          <span>O 13º sofre IRRF</span>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
        Neste sistema, não há retenção de contribuição nem de imposto sobre a 1ª parcela. A memória de cada contracheque
        do adiantamento registra essa condição.
      </p>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">As rubricas</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica do 13º (2ª parcela)</span>
          <select name="rubricaDoDecimoTerceiroId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            {proventos.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica do adiantamento (1ª parcela)</span>
          <select name="rubricaDoAdiantamentoId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            {proventos.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px]">
            Deve ser distinta da rubrica do 13º, pois define o grupo de empenho e a ficha orçamentária da parcela.
          </span>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica do abatimento da 1ª parcela</span>
          <select name="rubricaDoAbatimentoId" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            {abatimento.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="mt-4">
        <legend className={ROTULO}>Rubricas que compõem a base do 13º</legend>
        <p className="mb-2 text-[11px] text-[color:var(--color-ink-2)]">
          São listadas apenas rubricas de vencimento-base, gratificações do vínculo e percentual do vencimento. Rubricas
          variáveis não compõem a base do 13º neste cadastro.
        </p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {base.map((o) => (
            <label key={o.valor} className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)]">
              <input type="checkbox" name="rubricasDaBase" value={o.valor} />
              <span>{o.rotulo}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">O ato que fundamenta</h3>
      <p className="mb-2 text-[11px] text-[color:var(--color-ink-2)]">
        Informe o ato com número, ano e dispositivo em que a regra está prevista, para permitir a conferência pelo
        controle interno.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Esfera</span>
          <select name="atoEsfera" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            {opcoesDeEsferaDoAto.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo do ato</span>
          <select name="atoTipo" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            {opcoesDeTipoDeAto.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número do ato</span>
          <input name="atoNumero" required maxLength={40} placeholder="1.234" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Ano do ato</span>
          <input name="atoAno" type="number" required min={1800} max={2200} placeholder="2010" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Dispositivo</span>
          <input name="atoDispositivo" required maxLength={120} placeholder="art. 78, § 2º" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Ementa ou transcrição do dispositivo</span>
          <textarea name="atoEmenta" required rows={2} className={CAMPO} />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="criar-parametro-do-13" data-resultado-seq={seq.current} className="mt-3 text-xs text-[color:var(--color-perigo)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-da-acao="criar-parametro-do-13" data-resultado-seq={seq.current} className="mt-3 text-xs text-[color:var(--color-ink-2)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente || semRubricas} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Gravando…" : "Cadastrar o parâmetro"}
      </button>
    </form>
  );
}
