"use client";

import { useActionState, useRef } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { OPCOES_DE_ESFERA_DO_ATO, OPCOES_DE_TIPO_DE_ATO } from "../../../../lib/portas/recursos/folha";
import {
  criarParametroDoAdiantamentoSalarialAction,
  type EstadoDoParametroDoAdiantamentoSalarial,
} from "./actions";

interface Opcao {
  readonly valor: string;
  readonly rotulo: string;
}

/**
 * FORM DO PARÂMETRO DO ADIANTAMENTO SALARIAL — ilha client (M33, V13).
 *
 * ⚠️ É ILHA, E NÃO FORMULÁRIO DO MOLDE, PELO MESMO MOTIVO DO PARÂMETRO DO 13º: os dois seletores
 * de rubrica têm opções que vêm do BANCO e já recortadas pelo papel, e cada escolha desta tela
 * precisa da explicação ao lado. O molde monta campo, não instrução.
 *
 * ⚠️ NENHUM CAMPO NASCE PREENCHIDO, e isso é decisão, não esquecimento. Sugerir "40" pouparia
 * digitação e faria o ente CONFIRMAR um número que ele deveria DECLARAR — e o primeiro município
 * cujo decreto fixa outro percentual aceitaria o padrão sem ler. O valor vem da norma que o
 * operador tem na mão.
 *
 * ⚠️ O PERCENTUAL SE DIGITA EM PORCENTO (40), como o decreto o escreve; a porta converte para
 * fração. Mesma escolha do `FormTabela` e do parâmetro do 13º, pela mesma razão: quem preenche
 * está lendo a norma.
 */
export function FormParametroDoAdiantamentoSalarial({
  proventos,
  abatimento,
  adiantamentosQuePermitemPago,
}: {
  readonly proventos: readonly Opcao[];
  readonly abatimento: readonly Opcao[];
  readonly adiantamentosQuePermitemPago: readonly string[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoParametroDoAdiantamentoSalarial, FormData>(
    criarParametroDoAdiantamentoSalarialAction,
    {}
  );
  const ref = useRef<HTMLFormElement>(null);
  if (estado.sucesso !== undefined) ref.current?.reset();

  /**
   * ⚠️ O MARCADOR DE RESULTADO, desde o primeiro dia — a lição de
   * `PARAMETRO-DO-13-SEM-MARCADOR-DE-RESULTADO`, que custou um percurso inteiro para ser achada.
   * Todo formulário do sistema anuncia o desfecho em `data-resultado-da-acao`, com um
   * `data-resultado-seq` que MUDA a cada resposta. Sem ele, quem lê a tela por programa fica sem
   * saber se o ato respondeu, e lê SILÊNCIO num cadastro que funcionou.
   */
  const seq = useRef(0);
  const anterior = useRef<EstadoDoParametroDoAdiantamentoSalarial | null>(null);
  if (anterior.current !== estado) {
    anterior.current = estado;
    seq.current += 1;
  }

  const semRubricas = proventos.length === 0 || abatimento.length === 0;

  return (
    <form
      ref={ref}
      action={action}
      data-acao="criar-parametro-do-adiantamento-salarial"
      className={CLASSE_PAINEL_FORMULARIO}
    >
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Novo parâmetro do adiantamento salarial
      </h2>
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Estes números decidem quanto cada servidor recebe de vale, e nenhum deles existe no sistema: todos vêm do ato do
        ente. Sem parâmetro da competência, a folha de adiantamento salarial recusa calcular e diz qual competência
        falta. Corrigir é cadastrar a versão seguinte — nada é editado, e a folha mensal lê a versão que apurou o vale,
        não a mais recente.
      </p>

      {semRubricas ? (
        <p className="mb-3 rounded border border-[color:var(--color-borda)] p-3 text-xs text-[color:var(--color-ink-2)]">
          Faltam rubricas para preencher este formulário. São necessárias: uma rubrica de PROVENTO para pagar o vale, e
          uma rubrica de DESCONTO de natureza &quot;Abatimento do adiantamento salarial&quot; para abatê-lo na folha
          mensal. A natureza do abatimento do 13º não serve aqui — ela abate na folha de 13º, e usá-la descontaria do
          salário do mês metade da gratificação natalina. Cadastre-as em Folha &gt; Rubricas, com versão aprovada.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Competência do vale (AAAA-MM)</span>
          <input name="competencia" required pattern="\d{4}-(0[1-9]|1[0-2])" placeholder="2026-06" className={CAMPO} />
          <span className="mt-1 block text-[11px]">
            O parâmetro é por competência, e não por ano: o ente pode mudar o percentual em julho sem reescrever o que
            valeu em junho.
          </span>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Percentual do adiantamento (%)</span>
          <input name="percentualDoAdiantamento" required inputMode="decimal" placeholder="40" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>O percentual incide sobre</span>
          <select name="baseDoAdiantamento" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            <option value="REMUNERACAO_DO_MES_ANTERIOR">
              A remuneração do mês anterior (o que a folha fechada dele apurou)
            </option>
            <option value="REMUNERACAO_PROJETADA_DO_MES">
              A remuneração projetada do próprio mês (motor mensal, tabelas vigentes)
            </option>
          </select>
          <span className="mt-1 block text-[11px]">
            <strong>Mês anterior:</strong> lê o que a folha mensal FECHADA do mês passado apurou; nada é recalculado.
            Quem foi admitido na própria competência não tem base e não recebe vale, e sem aquela folha fechada o
            cálculo recusa. <strong>Projetada:</strong> roda o motor mensal da competência corrente — admissão,
            desligamento e mudança de vencimento dentro do mês já aparecem no vale.
          </span>
          <span className="mt-1 block text-[11px]">
            Estas são as duas práticas que o sistema sabe calcular e conferir, e elas não esgotam as regras possíveis.
            Se o ato do seu município fixa outra coisa — valor fixo por faixa, percentual variável por tempo de serviço,
            vale limitado a um teto —, <strong>não escolha a mais parecida</strong>: o cálculo sairia todo mês com o
            valor errado e nada acusaria, porque a folha fecha e os totais batem. Registre a regra e peça a
            funcionalidade.
          </span>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Para ser abatido na folha mensal, o vale precisa estar</span>
          <select name="estadoMinimoParaAbater" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            <option value="FECHADO">Fechado — o cálculo do vale foi congelado</option>
            <option value="CERTIFICADO">Certificado — o cálculo foi atestado por quem o ente designou</option>
            <option value="PAGO">Pago — o vale deste servidor saiu do caixa</option>
          </select>
          <span className="mt-1 block text-[11px]">
            <strong>Fechar não é pagar.</strong> Fechar congela o cálculo e não move um centavo: escolher
            &ldquo;fechado&rdquo; faz a mensal descontar do servidor um vale que o ente pode ainda não ter pago. Quem
            declara qual fato basta é o ente, com o ato abaixo — o sistema não escolhe por você, e é por isso que este
            campo não tem opção em branco nem valor sugerido.
          </span>
          <span className="mt-1 block text-[11px]">
            {adiantamentosQuePermitemPago.length === 0
              ? "Exigir “pago” não é possível hoje: nenhuma rubrica de provento está num grupo de empenho que empenhe POR SERVIDOR, e sem isso não existe no banco quanto saiu para cada matrícula. Cadastre um grupo por servidor para a rubrica do vale, ou use “fechado” ou “certificado”."
              : `Exigir “pago” só funciona com a rubrica do vale empenhada POR SERVIDOR. Hoje servem: ${adiantamentosQuePermitemPago.join("; ")}.`}
          </span>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
        O vale não sofre contribuição nem IRRF neste sistema, e isso não é uma afirmação sobre a norma: é aritmética
        interna. O abatimento na mensal é um desconto que não reduz base, então a folha do mês tributa a remuneração
        inteira, o vale incluído — reter aqui tributaria a mesma base duas vezes. A memória de cada contracheque do vale
        diz isso por escrito.
      </p>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">As rubricas</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica que PAGA o vale</span>
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
            É ela que decide em qual grupo de empenho — e portanto em qual ficha — a verba do vale cai.
          </span>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica que ABATE o vale na folha mensal</span>
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
          <span className="mt-1 block text-[11px]">
            Só aparecem rubricas de natureza &quot;Abatimento do adiantamento salarial&quot;: é a única que o motor
            mensal sabe ler para descontar o vale.
          </span>
        </label>
      </div>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">O ato que fundamenta</h3>
      <p className="mb-2 text-[11px] text-[color:var(--color-ink-2)]">
        Uma frase não serve: o sistema confere que há um ato identificado (número com dígito), de ano possível, com o
        dispositivo onde a regra está. É o que permite ao controle interno conferir sem abrir o diário oficial — e é o
        que sustenta a base e o critério de abatimento escolhidos acima.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Esfera</span>
          <select name="atoEsfera" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            {OPCOES_DE_ESFERA_DO_ATO.map((o) => (
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
            {OPCOES_DE_TIPO_DE_ATO.map((o) => (
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
          <input name="atoAno" type="number" required min={1800} max={2200} placeholder="2020" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Dispositivo</span>
          <input name="atoDispositivo" required maxLength={120} placeholder="art. 3º, caput" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Ementa ou transcrição do dispositivo</span>
          <textarea name="atoEmenta" required rows={2} className={CAMPO} />
        </label>
      </div>

      {estado.erro !== undefined ? (
        <p
          role="alert"
          data-resultado-da-acao="criar-parametro-do-adiantamento-salarial"
          data-resultado-seq={seq.current}
          className="mt-3 text-xs text-[color:var(--color-perigo)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p
          role="status"
          data-resultado-da-acao="criar-parametro-do-adiantamento-salarial"
          data-resultado-seq={seq.current}
          className="mt-3 text-xs text-[color:var(--color-ink-2)]"
        >
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente || semRubricas} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Gravando…" : "Cadastrar o parâmetro"}
      </button>
    </form>
  );
}
