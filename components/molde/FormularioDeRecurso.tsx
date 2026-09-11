"use client";

import { useActionState, useId, useRef } from "react";
import {
  CampoCpfCnpj,
  CampoNumero,
  CampoSelect,
  CampoTexto,
  CampoTextarea,
  CampoValor,
} from "../ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../ui/Formulario";
import type { CampoDoMolde } from "../../lib/molde/tipos";

/**
 * ⚠️ CLASSES ESTÁTICAS, NÃO INTERPOLADAS. O Tailwind varre o código-fonte procurando nomes de
 * classe LITERAIS: um `md:col-span-${n}` não existe no CSS gerado, e o campo sairia com a
 * largura errada em produção enquanto funciona no dev. É a mesma armadilha que o
 * `CLASSE_LARGURA` do `Campos.tsx` já evita — e este arquivo a repetiu na primeira versão.
 */
const SPAN: Readonly<Record<1 | 2 | 3 | 4, string>> = {
  1: "md:col-span-1",
  2: "md:col-span-2",
  3: "md:col-span-3",
  4: "md:col-span-4",
};

/**
 * O FORMULÁRIO DO MOLDE — criação e edição, montado do descritor.
 *
 * ⚠️ ELE NÃO VALIDA NEGÓCIO. O `required` e o `min` daqui são conveniência de digitação; a
 * recusa que vale é a do caso de uso, dentro da transação, contra o SUM real. Repetir a regra
 * aqui criaria a segunda verdade — e ela divergiria em silêncio no dia em que o guard
 * aprendesse um caso novo.
 *
 * ⚠️ A AÇÃO CHEGA COMO PROP, e não é importada. Uma ilha client não importa porta (a porta
 * puxa o Prisma, que não bundla para o browser) — `test/ui/fronteira-ui.test.ts` cobra isso.
 * Quem liga a Server Action é a página, que é Server Component.
 *
 * ⚠️ `data-acao` NO `<form>`, e ids por `useId()`. Vários formulários coexistem na mesma
 * página (criar, e cada ação da barra): id repetido quebra o `label for`, o leitor de tela e
 * a navegação por teclado. É o que `test/ui/formularios-na-mesma-pagina.test.tsx` prende.
 */

export interface EstadoDoMolde {
  readonly erro?: string;
  readonly sucesso?: string;
}

export interface FormularioDeRecursoProps {
  readonly acao: string;
  readonly titulo: string;
  readonly campos: readonly CampoDoMolde[];
  readonly action: (
    estado: EstadoDoMolde,
    dados: FormData
  ) => EstadoDoMolde | Promise<EstadoDoMolde>;
  readonly rotuloEnviar: string;
  readonly rotuloEnviando?: string;
  /** Pares que viajam escondidos — o id do registro na edição, por exemplo. */
  readonly ocultos?: Readonly<Record<string, string>>;
  /** Valores iniciais, por nome de campo. Vazio ⇒ formulário de criação. */
  readonly valores?: Readonly<Record<string, string>>;
  readonly aviso?: string;
  readonly irreversivel?: boolean;
}

function Campo({
  campo,
  valor,
}: {
  readonly campo: CampoDoMolde;
  readonly valor: string | undefined;
}): React.ReactElement {
  const comum = {
    name: campo.nome,
    rotulo: campo.rotulo,
    required: campo.obrigatorio === true,
    largura: campo.largura ?? 2,
    ...(campo.ajuda !== undefined ? { ajuda: campo.ajuda } : {}),
    ...(campo.placeholder !== undefined ? { placeholder: campo.placeholder } : {}),
    ...(valor !== undefined ? { defaultValue: valor } : {}),
  } as const;

  switch (campo.tipo) {
    case "textoLongo":
      return <CampoTextarea {...comum} />;
    case "inteiro":
      return (
        <CampoNumero
          {...comum}
          {...(campo.minimo !== undefined ? { min: campo.minimo } : {})}
          {...(campo.maximo !== undefined ? { max: campo.maximo } : {})}
        />
      );
    case "cpfCnpj":
      // ⚠️ `CampoCpfCnpj` É UM CAMPO NU — como o `CampoValor`, ele renderiza só o input
      // mascarado e o hidden, sem invólucro. A primeira versão passava `rotulo` para ele e o
      // componente simplesmente IGNORAVA: o campo aparecia na tela SEM RÓTULO NENHUM.
      //
      // ⚠️ E NENHUM TESTE DE MÓDULO PEGARIA ISSO. O formulário funcionava, o valor chegava ao
      // servidor, o registro gravava. O que faltava era o rótulo — quem usa leitor de tela
      // ouviria "caixa de edição" e nada mais. Quem achou foi o percurso de navegador, e foi
      // pelo sintoma certo: o texto da página não trazia o rótulo declarado no descritor.
      return (
        <label className={`text-xs text-[color:var(--color-ink-2)] ${SPAN[campo.largura ?? 2]}`}>
          <span className={ROTULO}>{campo.rotulo}</span>
          <CampoCpfCnpj
            name={campo.nome}
            className={CAMPO}
            {...(campo.obrigatorio === true ? { required: true } : {})}
            {...(campo.placeholder !== undefined ? { placeholder: campo.placeholder } : {})}
            {...(valor !== undefined ? { defaultValue: valor } : {})}
          />
          {campo.ajuda !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">
              {campo.ajuda}
            </span>
          ) : null}
        </label>
      );
    case "selecao": {
      const opcoes = campo.opcoes ?? [];
      // ⚠️ SELEÇÃO SEM OPÇÃO APARECE DESABILITADA DIZENDO O MOTIVO, e não escondida. Um campo
      // que desaparece ensina que ele não existe; um campo vazio e habilitado ensina que o
      // usuário fez algo errado. O que falta é PARAMETRIZAÇÃO, e é isso que ele diz.
      if (opcoes.length === 0) {
        return (
          <CampoSelect
            {...comum}
            opcoes={[]}
            desabilitado
            ajuda={`Nenhuma opção cadastrada para ${campo.rotulo.toLowerCase()}. Cadastre antes de usar esta tela.`}
          />
        );
      }
      return (
        <CampoSelect
          {...comum}
          opcoes={opcoes.map((o) => ({ valor: o.valor, rotulo: o.rotulo }))}
          vazio="Escolha…"
        />
      );
    }
    case "dinheiro":
      return (
        <label className={`text-xs text-[color:var(--color-ink-2)] ${SPAN[campo.largura ?? 2]}`}>
          <span className={ROTULO}>{campo.rotulo}</span>
          <CampoValor
            name={campo.nome}
            className={CAMPO}
            {...(campo.obrigatorio === true ? { required: true } : {})}
            {...(campo.placeholder !== undefined ? { placeholder: campo.placeholder } : {})}
            {...(valor !== undefined ? { defaultValue: valor } : {})}
          />
          {campo.ajuda !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">
              {campo.ajuda}
            </span>
          ) : null}
        </label>
      );
    case "booleano":
      return (
        <label className="flex items-center gap-2 text-xs text-[color:var(--color-ink-2)] md:col-span-2">
          <input
            type="checkbox"
            name={campo.nome}
            value="sim"
            defaultChecked={valor === "sim"}
            className="h-4 w-4"
          />
          <span>{campo.rotulo}</span>
        </label>
      );
    case "data":
      return (
        <label className={`text-xs text-[color:var(--color-ink-2)] ${SPAN[campo.largura ?? 2]}`}>
          <span className={ROTULO}>{campo.rotulo}</span>
          {/* ⚠️ `type="date"` submete `YYYY-MM-DD` — um DIA, não um instante. Quem o transforma
              em instante é o caso de uso, pelo dia civil do ente (`packages/datas`). */}
          <input
            type="date"
            name={campo.nome}
            className={CAMPO}
            {...(campo.obrigatorio === true ? { required: true } : {})}
            {...(valor !== undefined ? { defaultValue: valor } : {})}
          />
          {campo.ajuda !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">
              {campo.ajuda}
            </span>
          ) : null}
        </label>
      );
    default:
      return <CampoTexto {...comum} />;
  }
}

export function FormularioDeRecurso({
  acao,
  titulo,
  campos,
  action,
  rotuloEnviar,
  rotuloEnviando,
  ocultos,
  valores,
  aviso,
  irreversivel,
}: FormularioDeRecursoProps): React.ReactElement {
  const [estado, disparar, pendente] = useActionState<EstadoDoMolde, FormData>(action, {});
  const ref = useRef<HTMLFormElement>(null);
  const idAviso = `aviso-${useId()}`;
  // Sucesso limpa o formulário — sem isto, reenviar o mesmo conteúdo é um clique de distância.
  if (estado.sucesso !== undefined) ref.current?.reset();

  return (
    <form ref={ref} action={disparar} data-acao={acao} className={CLASSE_PAINEL_FORMULARIO}>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">{titulo}</h2>
      {aviso !== undefined ? (
        <p id={idAviso} className="mb-3 text-[11px] text-[color:var(--color-ink-2)]">
          {irreversivel === true ? <strong>Irreversível. </strong> : null}
          {aviso}
        </p>
      ) : null}

      {Object.entries(ocultos ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      {campos.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {campos.map((c) => (
            <Campo key={c.nome} campo={c} valor={valores?.[c.nome]} />
          ))}
        </div>
      ) : null}

      {estado.erro !== undefined ? (
        <p
          role="alert"
          className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
        >
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pendente}
        aria-describedby={aviso !== undefined ? idAviso : undefined}
        className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}
      >
        {pendente ? (rotuloEnviando ?? "Enviando…") : rotuloEnviar}
      </button>
    </form>
  );
}
