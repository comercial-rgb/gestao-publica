"use client";

import { useEffect, useId, useState } from "react";
import {
  desmascararValor,
  mascararCep,
  mascararCpfCnpj,
  mascararTelefone,
  soDigitos,
} from "../../lib/format/mascaras";
import { formatarMoeda } from "../../lib/format/moeda";
import { CLASSE_AREA_TEXTO, CLASSE_CAMPO, CLASSE_ROTULO } from "./Formulario";

/**
 * CAMPOS MASCARADOS BR — ilhas client compartilhadas (7.9).
 *
 * ═══ ⚠️ A MÁSCARA É PRESENTATION-ONLY, E O PADRÃO ABAIXO É O QUE GARANTE ISSO ═══
 * Cada campo tem DOIS inputs:
 *
 *   · o VISÍVEL, mascarado, **sem `name`** → o usuário lê e digita nele, e ele NÃO é submetido
 *     (o browser só submete controles com `name`). É onde vive o `required`: um controle sem
 *     `name` continua sendo validado pelo browser, só não vai no `FormData`.
 *   · o HIDDEN, **com o `name`**, carregando o valor CRU → é este que entra no `FormData`.
 *
 * O efeito é o ponto todo da frente: **nenhuma Server Action mudou, nenhuma porta mudou**. O
 * `empenharAction` continua lendo `String(formData.get("valor"))` e recebendo `"1234.56"`, como
 * antes da 7.9. A máscara não vazou para o domínio, e a prova disso é o diff das actions: vazio.
 *
 * ⚠️ A TELA SUGERE; O DOMÍNIO DECIDE (MODULO-UI.md). Nenhum campo aqui recusa nada: o que a
 * máscara não entende ela entrega CRU ao domínio, que recusa nomeando. Máscara que valida vira
 * um segundo domínio, mal escrito e sem teste.
 *
 * ⚠️ AS DATAS NÃO ESTÃO AQUI, DE PROPÓSITO. `<input type="date">` já exibe dd/mm/aaaa em navegador
 * pt-BR e submete ISO `yyyy-mm-dd` — que é exatamente o que as quatro actions consomem
 * (`${dataBruta}T12:00:00Z`). Trocá-lo por máscara textual custaria o calendário e a validação
 * nativos e obrigaria a reescrever as actions para GANHAR o formato que o navegador já dá.
 */

export interface CampoMascaradoProps {
  /** O `name` do input HIDDEN — é ele que atravessa a fronteira, com o valor cru. */
  readonly name: string;
  readonly required?: boolean | undefined;
  /** Valor CRU inicial (ex.: "1234.56", "12345678000199"). */
  readonly defaultValue?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly className?: string | undefined;
  readonly id?: string | undefined;
  /**
   * ⚠️ ESPELHO DO VALOR CRU — opcional, e para UM caso só: um form CONTROLADO que precisa do valor
   * enquanto se digita, não só na submissão (o cadastro de decreto do M03 mostra o balanceamento
   * por fonte a cada tecla). Recebe exatamente o que o HIDDEN carrega — o cru, já desmascarado.
   *
   * Ausente = o comportamento de sempre, e é o default por um motivo: um form que não precisa do
   * valor a cada tecla não deve re-renderizar a cada tecla. Isto NÃO torna o campo controlado —
   * quem manda no texto exibido continua sendo o `useState` interno, e a máscara segue sendo a
   * única do sistema. É um ouvinte, não um dono.
   */
  readonly aoMudarValorCru?: ((cru: string) => void) | undefined;
  /** Nome acessível quando o rótulo visível se repete (uma lista de linhas iguais). */
  readonly "aria-label"?: string | undefined;
}

/** `formatarMoeda` só aceita string decimal bem-formada; texto meio-digitado passa reto. */
function exibirValor(texto: string): string {
  const cru = desmascararValor(texto);
  if (!/^-?\d+(\.\d+)?$/.test(cru)) return texto;
  return formatarMoeda(cru).texto;
}

/** Do contábil de volta para o editável: "(5.000,00)" → "-5.000,00". Parêntese não se digita. */
function editarValor(texto: string): string {
  const cru = desmascararValor(texto);
  if (!/^-?\d+(\.\d+)?$/.test(cru)) return texto;
  const { texto: bonito, negativo } = formatarMoeda(cru);
  return negativo ? `-${bonito.slice(1, -1)}` : bonito;
}

/**
 * CAMPO DE VALOR — exibe `1.234.567,89`, submete `1234.56`.
 *
 * ⚠️ NEGATIVO EM PARÊNTESES **AO SAIR DO CAMPO**, não enquanto se digita. `(5.000,00)` é a
 * convenção contábil do `formatarMoeda` (e do balancete, e do RREO), mas parêntese não é uma tecla
 * que alguém aperte para dizer "menos": no foco o campo vira `-5.000,00`, typeável. É a reprevisão
 * que torna isso obrigatório — ela é a única frente com valor assinado (`"20000.00 ou -5000.00"`).
 *
 * ⚠️ NÃO REFORMATA A CADA TECLA. Máscara de milhar aplicada no meio da digitação pula o cursor —
 * e a alternativa comum (acumulador de centavos, em que `10000` vira `100,00`) transforma um
 * empenho de dez mil num de cem reais quando alguém digita o valor redondo sem centavos. Num
 * sistema em que o número digitado vira empenho, esse erro de 100× não é um preço aceitável por
 * uma animação. Formata no blur, aceita `10000`, `10000.00`, `10.000,00` e `10000,00` — todos
 * viram `10000.00` (ver `desmascararValor`).
 */
export function CampoValor({
  name,
  required,
  defaultValue,
  placeholder,
  className,
  id,
  aoMudarValorCru,
  "aria-label": rotuloAcessivel,
}: CampoMascaradoProps): React.ReactElement {
  const [texto, setTexto] = useState(() => exibirValor(defaultValue ?? ""));

  // O espelho recebe o MESMO cru que o hidden carrega — uma só travessia de fronteira, duas
  // saídas. Derivar aqui (e não num `useEffect`) mantém o valor do ouvinte e o do hidden
  // impossíveis de dessincronizar.
  const cru = desmascararValor(texto);

  return (
    <>
      <input
        {...(id !== undefined ? { id } : {})}
        {...(rotuloAcessivel !== undefined ? { "aria-label": rotuloAcessivel } : {})}
        type="text"
        inputMode="decimal"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          aoMudarValorCru?.(desmascararValor(e.target.value));
        }}
        onFocus={() => setTexto((t) => editarValor(t))}
        onBlur={() => setTexto((t) => exibirValor(t))}
        {...(required === true ? { required: true } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(className !== undefined ? { className } : {})}
        data-mascara="valor"
      />
      <input type="hidden" name={name} value={cru} />
    </>
  );
}

/**
 * CAMPO DE CPF/CNPJ — exibe `000.000.000-00` ou `00.000.000/0000-00`, submete só dígitos.
 *
 * ⚠️ SUBMETER SÓ DÍGITOS NÃO É ESTÉTICA, É INTEGRIDADE. O domínio distingue pessoa física de
 * jurídica pelo COMPRIMENTO (11 × 14) — `m13-transparencia/dominio.ts:47-63` — e chama "um CPF com
 * pontuação que ninguém normalizou" de DADO QUEBRADO, que ele se recusa a publicar. Se a máscara
 * vazasse, `123.456.789-01` teria 14 caracteres e seria lido como CNPJ. Por isso o hidden.
 *
 * ⚠️ NÃO VALIDA DÍGITO VERIFICADOR, e nem deve: a máscara é sobre FORMA. (O domínio hoje também
 * não valida — `zEmpenharInput` exige só `min(11)`. Se um dia validar, valida lá.)
 */
export function CampoCpfCnpj({
  name,
  required,
  defaultValue,
  placeholder,
  className,
  id,
}: CampoMascaradoProps): React.ReactElement {
  const [texto, setTexto] = useState(() => mascararCpfCnpj(defaultValue ?? ""));

  return (
    <>
      <input
        {...(id !== undefined ? { id } : {})}
        type="text"
        inputMode="numeric"
        value={texto}
        onChange={(e) => setTexto(mascararCpfCnpj(e.target.value))}
        {...(required === true ? { required: true } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(className !== undefined ? { className } : {})}
        data-mascara="cpf-cnpj"
      />
      <input type="hidden" name={name} value={soDigitos(texto)} />
    </>
  );
}

/**
 * CAMPO DE TELEFONE — exibe `(00) 00000-0000` (celular) ou `(00) 0000-0000` (fixo), submete só
 * dígitos.
 *
 * ⚠️ SEM CONSUMIDOR HOJE. Nenhum form deste sistema tem campo de telefone (a 7.9 procurou: zero
 * ocorrências em `app/`, `components/` e `lib/`). Ele existe porque a diretriz de máscaras o pediu,
 * e fica testado para o dia em que o cadastro de credor/fornecedor chegar. Está aqui como
 * componente pronto, não como código morto que alguém descobre e não sabe se pode apagar.
 */
export function CampoTelefone({
  name,
  required,
  defaultValue,
  placeholder,
  className,
  id,
}: CampoMascaradoProps): React.ReactElement {
  const [texto, setTexto] = useState(() => mascararTelefone(defaultValue ?? ""));

  return (
    <>
      <input
        {...(id !== undefined ? { id } : {})}
        type="text"
        inputMode="tel"
        value={texto}
        onChange={(e) => setTexto(mascararTelefone(e.target.value))}
        {...(required === true ? { required: true } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(className !== undefined ? { className } : {})}
        data-mascara="telefone"
      />
      <input type="hidden" name={name} value={soDigitos(texto)} />
    </>
  );
}

/**
 * CAMPO DE CEP — exibe `00000-000`, submete só dígitos.
 *
 * ⚠️ SEM CONSUMIDOR HOJE — mesma situação do `CampoTelefone`; ver o comentário dele.
 */
export function CampoCep({
  name,
  required,
  defaultValue,
  placeholder,
  className,
  id,
}: CampoMascaradoProps): React.ReactElement {
  const [texto, setTexto] = useState(() => mascararCep(defaultValue ?? ""));

  return (
    <>
      <input
        {...(id !== undefined ? { id } : {})}
        type="text"
        inputMode="numeric"
        value={texto}
        onChange={(e) => setTexto(mascararCep(e.target.value))}
        {...(required === true ? { required: true } : {})}
        {...(placeholder !== undefined ? { placeholder } : {})}
        {...(className !== undefined ? { className } : {})}
        data-mascara="cep"
      />
      <input type="hidden" name={name} value={soDigitos(texto)} />
    </>
  );
}

/* ════════════════════════════════════════════════════════════════════════════════════════════
 * OS CAMPOS SEM MÁSCARA — os que o scaffold declara em série
 * ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ TODOS NÃO-CONTROLADOS: `name` + `defaultValue`, sem `value`/`onChange`.
 *
 * Três razões, e a segunda é a que importa para este repo:
 *   1. O scaffold consome os quatro. Metade controlada e metade não obrigaria a declaração de
 *      cada campo a carregar um discriminador que só existe por acidente de implementação.
 *   2. **O `FormData` já é a fonte da verdade** — as Server Actions leem
 *      `String(formData.get("valor"))`. Um estado React seria um SEGUNDO lugar onde o valor mora,
 *      que depois precisa ser serializado de volta: a segunda verdade na forma mais sutil.
 *   3. Sem máscara, o browser já mantém o valor. Estado React aqui só adiciona re-render por
 *      tecla numa tela que pode ter 30 campos.
 *
 * ⚠️ OS NOMES DOS PROPS SEGUEM O ARQUIVO, NÃO A PROPOSTA. `name`, `required` e `defaultValue` já
 * são os nomes dos campos mascarados acima; renomeá-los para `nome`/`obrigatorio` faria o mesmo
 * arquivo falar duas línguas. Só os props QUE NÃO EXISTIAM (`rotulo`, `ajuda`, `erro`, `largura`)
 * entram em português, porque não há contraparte com que divergir.
 */
export interface CampoRotuladoProps {
  /** O `name` que atravessa a fronteira no `FormData`. */
  readonly name: string;
  readonly rotulo: string;
  readonly required?: boolean | undefined;
  readonly defaultValue?: string | undefined;
  readonly desabilitado?: boolean | undefined;
  /** A mensagem de erro. Presente ⇒ `aria-invalid` e `aria-describedby` apontando para ela. */
  readonly erro?: string | undefined;
  /** Texto de apoio — é onde a base legal do campo vive. */
  readonly ajuda?: string | undefined;
  /** Span no grid de 4 colunas do formulário. */
  readonly largura?: 1 | 2 | 3 | 4 | undefined;
  readonly placeholder?: string | undefined;
}

/**
 * ⚠️ CLASSES ESTÁTICAS, NÃO INTERPOLADAS. O Tailwind varre o código-fonte procurando nomes de
 * classe LITERAIS: um `col-span-${n}` não existe no CSS gerado, e o campo sairia com a largura
 * errada em produção enquanto funciona no dev. Por isso o mapa.
 */
/**
 * ⚠️ `md:` (768px), NÃO `sm:` (640px). O requisito é colapsar para UMA coluna ABAIXO de 768px, e
 * o `sm:` do Tailwind dispara em 640 — a 768px o grid ainda estaria em 4 colunas espremidas.
 * Descoberto na página de fumaça: em teste unitário as duas grafias passam igual.
 */
const CLASSE_LARGURA: Record<1 | 2 | 3 | 4, string> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

interface AriaDoCampo {
  readonly id: string;
  readonly "aria-invalid"?: true;
  readonly "aria-describedby"?: string;
}

/**
 * O INVÓLUCRO — rótulo, ajuda, erro e span, com a fiação de acessibilidade FEITA AQUI.
 *
 * ⚠️ O CONTROLE VEM POR RENDER-PROP, e não como `children` solto, justamente para que ele NÃO
 * possa ser renderizado sem receber o `id` e os `aria-*`. Se o invólucro apenas envolvesse, o dia
 * em que alguém esquecesse o `aria-describedby` a mensagem de erro existiria na tela e não
 * existiria para quem usa leitor — o pior tipo de acessibilidade, a que parece pronta.
 */
export function CampoEnvolvido({
  name,
  rotulo,
  required,
  erro,
  ajuda,
  largura = 4,
  children,
}: CampoRotuladoProps & {
  readonly children: (aria: AriaDoCampo) => React.ReactNode;
}): React.ReactElement {
  const gerado = useId();
  const id = `${name}-${gerado}`;
  const idAjuda = ajuda !== undefined ? `${id}-ajuda` : undefined;
  const idErro = erro !== undefined ? `${id}-erro` : undefined;

  // A ordem importa: o leitor de tela anuncia na ordem do `aria-describedby`, e o ERRO vem
  // primeiro porque é o que muda a ação do usuário.
  const descritores = [idErro, idAjuda].filter((d): d is string => d !== undefined);

  const aria: AriaDoCampo = {
    id,
    ...(erro !== undefined ? { "aria-invalid": true as const } : {}),
    ...(descritores.length > 0 ? { "aria-describedby": descritores.join(" ") } : {}),
  };

  return (
    <div className={CLASSE_LARGURA[largura]}>
      <label htmlFor={id} className={CLASSE_ROTULO}>
        {rotulo}
        {required === true ? (
          <span aria-hidden className="ml-1 text-[color:var(--color-negativo)]">*</span>
        ) : null}
        {required === true ? <span className="sr-only"> (obrigatório)</span> : null}
      </label>

      {children(aria)}

      {ajuda !== undefined ? (
        <p id={idAjuda} className="mt-1 text-xs text-[color:var(--color-ink-2)]">
          {ajuda}
        </p>
      ) : null}

      {/* ⚠️ `role="alert"`: o erro nasce DEPOIS da submissão, e sem ele o leitor de tela não
          anunciaria nada — o usuário ficaria esperando uma resposta que já está na tela. */}
      {erro !== undefined ? (
        <p id={idErro} role="alert" className="mt-1 text-xs font-medium text-[color:var(--color-negativo)]">
          {erro}
        </p>
      ) : null}
    </div>
  );
}

export function CampoTexto(props: CampoRotuladoProps & {
  readonly maxLength?: number | undefined;
}): React.ReactElement {
  const { name, required, defaultValue, desabilitado, placeholder, maxLength } = props;
  return (
    <CampoEnvolvido {...props}>
      {(aria) => (
        <input
          {...aria}
          type="text"
          name={name}
          className={CLASSE_CAMPO}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(required === true ? { required: true } : {})}
          {...(desabilitado === true ? { disabled: true } : {})}
          {...(placeholder !== undefined ? { placeholder } : {})}
          {...(maxLength !== undefined ? { maxLength } : {})}
        />
      )}
    </CampoEnvolvido>
  );
}

export function CampoTextarea(props: CampoRotuladoProps & {
  readonly linhas?: number | undefined;
  readonly maxLength?: number | undefined;
}): React.ReactElement {
  const { name, required, defaultValue, desabilitado, placeholder, linhas, maxLength } = props;
  return (
    <CampoEnvolvido {...props}>
      {(aria) => (
        <textarea
          {...aria}
          name={name}
          rows={linhas ?? 4}
          className={CLASSE_AREA_TEXTO}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(required === true ? { required: true } : {})}
          {...(desabilitado === true ? { disabled: true } : {})}
          {...(placeholder !== undefined ? { placeholder } : {})}
          {...(maxLength !== undefined ? { maxLength } : {})}
        />
      )}
    </CampoEnvolvido>
  );
}

/**
 * CAMPO NUMÉRICO — INTEIRO, e nunca dinheiro.
 *
 * ⚠️ DINHEIRO NÃO PASSA POR AQUI. `<input type="number">` entrega `value` como string do browser,
 * mas convida à coerção numérica do `e.target.value` na primeira vez que alguém precisar somar — e
 * a regra de ouro deste repo é que valor monetário não vira float em lugar nenhum. Para dinheiro
 * existe o `CampoValor`, que submete string decimal crua. Este é para quantidade, exercício, dias.
 */
export function CampoNumero(props: CampoRotuladoProps & {
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}): React.ReactElement {
  const { name, required, defaultValue, desabilitado, placeholder, min, max } = props;
  return (
    <CampoEnvolvido {...props}>
      {(aria) => (
        <input
          {...aria}
          type="number"
          inputMode="numeric"
          step={1}
          name={name}
          className={CLASSE_CAMPO}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(required === true ? { required: true } : {})}
          {...(desabilitado === true ? { disabled: true } : {})}
          {...(placeholder !== undefined ? { placeholder } : {})}
          {...(min !== undefined ? { min } : {})}
          {...(max !== undefined ? { max } : {})}
        />
      )}
    </CampoEnvolvido>
  );
}

export interface OpcaoSelect {
  readonly valor: string;
  readonly rotulo: string;
}

/**
 * CAMPO SELECT — opções síncronas ou assíncronas.
 *
 * ⚠️ `aoMudar` É NOTIFICAÇÃO, NÃO CONTROLE. O `<select>` continua com `defaultValue` e o valor
 * continua saindo pelo `FormData`; `aoMudar` existe para a CADEIA DE DEPENDÊNCIA — escolher o
 * Órgão precisa filtrar a Unidade Orçamentária, e sem isso cada tela resolveria do seu jeito.
 * É o mesmo espírito do par visível/hidden dos campos mascarados: a máscara notifica, o hidden
 * carrega. (Ver `aoMudarValorCru` no `CampoValor` — mesmo conceito, e o dia em que um terceiro
 * campo precisar disso os dois nomes devem se unificar.)
 */
export function CampoSelect(props: CampoRotuladoProps & {
  readonly opcoes: readonly OpcaoSelect[] | (() => Promise<readonly OpcaoSelect[]>);
  readonly aoMudar?: ((valor: string) => void) | undefined;
  /** O texto da opção vazia. Ausente ⇒ sem opção vazia (o campo já nasce escolhido). */
  readonly vazio?: string | undefined;
}): React.ReactElement {
  const { name, required, defaultValue, desabilitado, opcoes, aoMudar, vazio } = props;

  const sincronas = typeof opcoes === "function" ? null : opcoes;
  const [carregadas, setCarregadas] = useState<readonly OpcaoSelect[] | null>(sincronas);
  const [carregando, setCarregando] = useState(sincronas === null);

  useEffect(() => {
    if (typeof opcoes !== "function") {
      setCarregadas(opcoes);
      setCarregando(false);
      return;
    }
    let vivo = true;
    setCarregando(true);
    void opcoes().then((lista) => {
      // ⚠️ O guard de desmontagem: sem ele, um select que sai da tela antes da Promise resolver
      // chamaria `setState` num componente morto — e o React avisa, mas só em dev.
      if (vivo) {
        setCarregadas(lista);
        setCarregando(false);
      }
    });
    return () => {
      vivo = false;
    };
  }, [opcoes]);

  const lista = carregadas ?? [];

  return (
    <CampoEnvolvido {...props}>
      {(aria) => (
        <select
          {...aria}
          name={name}
          className={CLASSE_CAMPO}
          {...(defaultValue !== undefined ? { defaultValue } : {})}
          {...(required === true ? { required: true } : {})}
          {...(desabilitado === true || carregando ? { disabled: true } : {})}
          onChange={aoMudar !== undefined ? (e) => aoMudar(e.target.value) : undefined}
        >
          {carregando ? (
            <option value="">Carregando…</option>
          ) : (
            <>
              {vazio !== undefined ? <option value="">{vazio}</option> : null}
              {lista.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </>
          )}
        </select>
      )}
    </CampoEnvolvido>
  );
}
