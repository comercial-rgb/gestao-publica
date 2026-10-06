"use client";

import { useActionState, useRef } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
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
  contasDoAdiantamento,
  opcoesDeEsferaDoAto,
  opcoesDeTipoDeAto,
}: {
  readonly proventos: readonly Opcao[];
  readonly abatimento: readonly Opcao[];
  readonly adiantamentosQuePermitemPago: readonly string[];
  readonly contasDoAdiantamento: readonly Opcao[];
  /** Os róis do ato (esfera e tipo), lidos pelo Server Component: a ilha client não importa porta. */
  readonly opcoesDeEsferaDoAto: readonly Opcao[];
  readonly opcoesDeTipoDeAto: readonly Opcao[];
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
  /**
   * ⚠️ SEM CONTA DO RAMO, O FORMULÁRIO DIZ O QUE FALTA — não mostra um seletor vazio. Seletor
   * obrigatório e vazio é um formulário que não pode ser enviado e não explica por quê; o operador
   * conclui que a tela está quebrada.
   */
  const semContas = contasDoAdiantamento.length === 0;

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
        Informe os valores conforme o ato do ente. Sem parâmetro publicado para a competência, o cálculo da folha de
        adiantamento salarial não é realizado. Para corrigir, cadastre nova versão; a folha mensal utiliza a versão que
        apurou o adiantamento.
      </p>

      {semRubricas ? (
        <p className="mb-3 rounded border border-[color:var(--color-borda)] p-3 text-xs text-[color:var(--color-ink-2)]">
          Faltam rubricas para preencher este formulário. São necessárias: uma rubrica de provento para pagar o
          adiantamento e uma rubrica de desconto de natureza &quot;Abatimento do adiantamento salarial&quot; para abatê-lo
          na folha mensal (a natureza do abatimento do 13º não se aplica). Cadastre-as em <a href="/folha/rubricas" className="font-medium text-[color:var(--color-primary)] underline" data-atalho-de-cadastro>Folha &gt; Rubricas</a>, com versão
          aprovada.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Competência do adiantamento (AAAA-MM)</span>
          <input name="competencia" required pattern="\d{4}-(0[1-9]|1[0-2])" placeholder="2026-06" className={CAMPO} />
          <span className="mt-1 block text-[11px]">
            O parâmetro é definido por competência, o que permite alterar o percentual sem afetar as competências anteriores.
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
              A remuneração do mês anterior (apurada na folha fechada)
            </option>
            <option value="REMUNERACAO_PROJETADA_DO_MES">
              A remuneração projetada do próprio mês (com as tabelas vigentes)
            </option>
          </select>
          <span className="mt-1 block text-[11px]">
            <strong>Mês anterior:</strong> utiliza o valor apurado na folha mensal fechada do mês anterior. Servidores
            admitidos na própria competência não recebem adiantamento, e o cálculo exige que aquela folha esteja fechada.
            <strong> Projetada:</strong> calcula a remuneração da competência corrente, considerando admissões,
            desligamentos e alterações de vencimento ocorridos no mês.
          </span>
          <span className="mt-1 block text-[11px]">
            Estas duas opções não esgotam as regras possíveis. Se o ato do município prevê outra forma (valor fixo por
            faixa, percentual variável por tempo de serviço ou limite máximo), <strong>não escolha a mais parecida</strong>:
            registre a regra e solicite a inclusão da funcionalidade.
          </span>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Para ser abatido na folha mensal, o adiantamento precisa estar</span>
          <select name="estadoMinimoParaAbater" required defaultValue="" className={CAMPO}>
            <option value="" disabled>
              Escolha
            </option>
            <option value="FECHADO">Fechado (o cálculo do adiantamento foi encerrado)</option>
            <option value="CERTIFICADO">Certificado (o cálculo foi atestado pelo servidor designado)</option>
            <option value="PAGO">Pago (o adiantamento deste servidor foi pago)</option>
          </select>
          <span className="mt-1 block text-[11px]">
            <strong>Fechar não é pagar.</strong> O fechamento encerra o cálculo, sem efetuar pagamento: com a opção
            &ldquo;fechado&rdquo;, a folha mensal pode descontar um adiantamento ainda não pago. A definição cabe ao
            ente, conforme o ato informado abaixo.
          </span>
          <span className="mt-1 block text-[11px]">
            {adiantamentosQuePermitemPago.length === 0
              ? "A opção “pago” não está disponível: nenhuma rubrica de provento está em grupo de empenho por servidor. Cadastre um grupo de empenho por servidor para a rubrica do adiantamento, ou utilize “fechado” ou “certificado”."
              : `A opção “pago” exige a rubrica do adiantamento empenhada por servidor. Rubricas disponíveis: ${adiantamentosQuePermitemPago.join("; ")}.`}
          </span>
        </label>
      </div>

      <p className="mt-2 text-[11px] text-[color:var(--color-ink-2)]">
        Não há retenção de contribuição nem de IRRF sobre o adiantamento: a folha mensal tributa a remuneração integral,
        incluído o adiantamento, o que evita tributar a mesma base duas vezes. A memória de cada contracheque do
        adiantamento registra essa condição.
      </p>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">Registro contábil</h3>
      {semContas ? (
        <p className="mb-3 rounded border border-[color:var(--color-borda)] p-3 text-xs text-[color:var(--color-ink-2)]">
          O plano de contas do ente não possui conta analítica do grupo 1.1.3.1 (Adiantamentos concedidos), necessária
          para registrar o adiantamento como direito a receber. O plano oficial do TCE-PB prevê a conta 1.1.3.1.1.01.01
          (Salários e ordenados - adiantamentos) para este caso. Cadastre a conta no plano de contas antes de continuar.
        </p>
      ) : null}
      <div className="grid gap-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Conta de registro do adiantamento como direito a receber</span>
          <select name="contaDoAdiantamentoId" required defaultValue="" className={CAMPO} disabled={semContas}>
            <option value="" disabled>
              Escolha
            </option>
            {contasDoAdiantamento.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-[11px]">
            O adiantamento <strong>não é despesa de pessoal do mês</strong>: quando pago, é registrado nesta conta como
            direito a receber do servidor, baixado pela folha mensal da mesma competência ao abater o valor do líquido. A
            despesa de pessoal é reconhecida uma única vez, na folha mensal, pelo valor bruto.
          </span>
          <span className="mt-1 block text-[11px]">
            São listadas apenas contas analíticas do grupo 1.1.3.1 (Adiantamentos concedidos).
          </span>
        </label>
      </div>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">As rubricas</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica de pagamento do adiantamento</span>
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
            Define o grupo de empenho e a ficha orçamentária do adiantamento.
          </span>
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Rubrica de abatimento na folha mensal</span>
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
            São listadas apenas rubricas de natureza &quot;Abatimento do adiantamento salarial&quot;.
          </span>
        </label>
      </div>

      <h3 className="mt-5 mb-2 text-xs font-semibold text-[color:var(--color-ink)]">O ato que fundamenta</h3>
      <p className="mb-2 text-[11px] text-[color:var(--color-ink-2)]">
        Informe o ato com número, ano e dispositivo em que a regra está prevista. Ele fundamenta a base e o critério de
        abatimento escolhidos acima e permite a conferência pelo controle interno.
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

      {/* ⚠️ `semContas` TRANCA O ENVIO junto de `semRubricas`. Um seletor obrigatório e desabilitado
          deixaria o botão ativo num formulário que o navegador nunca envia — e o operador clicaria
          sem nada acontecer, que é a definição de botão sem handler. */}
      <button type="submit" disabled={pendente || semRubricas || semContas} className={`${CLASSE_BOTAO_PRIMARIO} mt-4`}>
        {pendente ? "Gravando…" : "Cadastrar o parâmetro"}
      </button>
    </form>
  );
}
