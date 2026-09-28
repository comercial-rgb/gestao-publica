"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CLASSE_CAMPO as CAMPO, CLASSE_ROTULO as ROTULO } from "./Formulario";

/**
 * O SELETOR REFERENCIADO — pesquisa no servidor, pagina, e guarda o VALOR escolhido, não o texto.
 *
 * ⚠️ QUATRO GARANTIAS, e cada uma é um defeito que um `<select>` gordo ou um `datalist` teria:
 *
 *   1. **Resposta atrasada não troca a escolha.** Cada busca leva um número; só a resposta da ÚLTIMA
 *      é aplicada, e nenhuma resposta mexe no que já foi escolhido. Digitar "31", apagar e digitar
 *      "33" com a rede lenta não pode fazer a lista de "31" chegar por último e ser a oferecida.
 *   2. **O texto digitado não vale como escolha.** O `name` do formulário está num `hidden` que só
 *      recebe valor ao escolher uma opção. Enviar "3190" digitado sem escolher envia vazio — e o
 *      campo obrigatório diz isso antes do servidor.
 *   3. **Mudar o contexto revalida sem apagar em silêncio.** Quando um campo do qual este depende
 *      muda, a escolha é conferida de novo no servidor. Se ainda vale, fica; se não vale, o valor é
 *      retirado e a MENSAGEM diz por quê — o texto continua na tela para a pessoa ver o que perdeu.
 *   4. **Teclado e leitor de tela.** `combobox` + `listbox` (APG), setas, Enter, Esc; a opção ativa
 *      por `aria-activedescendant`; o estado da busca num `role=status`.
 *
 * ⚠️ OFERECER NÃO É AUTORIZAR: o caso de uso resolve e autoriza de novo na transação.
 */

export interface OpcaoDoSeletor {
  readonly valor: string;
  readonly rotulo: string;
  readonly detalhe?: string;
  /** V22: sugestão de preenchimento que o catálogo devolve (documento, ficha, objeto). */
  readonly dados?: Readonly<Record<string, string>>;
}

export interface CampoReferenciadoProps {
  readonly name: string;
  readonly rotulo: string;
  readonly catalogo: string;
  readonly obrigatorio?: boolean;
  readonly ajuda?: string;
  readonly placeholder?: string;
  /** Nomes de outros campos do MESMO formulário que entram na consulta como `ctx.<nome>`. */
  readonly contexto?: readonly string[];
  readonly largura?: 1 | 2 | 3 | 4;
  /** Para teste: a base da URL das opções. */
  readonly base?: string;
  /**
   * V22: avisa o formulário a cada escolha (e com `null` quando ela sai), para autopreencher outros
   * campos. Não muda nenhuma das quatro garantias: o valor continua só no hidden, depois de escolher.
   */
  readonly aoEscolher?: (opcao: OpcaoDoSeletor | null) => void;
  /**
   * V22: um valor já decidido (vindo da URL, ou de outro campo que o preencheu). É CONFERIDO no
   * servidor pelo mesmo catálogo antes de virar escolha — um id que não existe, ou que o catálogo não
   * oferece, não vira escolha nenhuma. Para trocar depois de montado, mude a `key` do componente.
   */
  readonly valorInicial?: string;
  /** Com `valorInicial`, também chama `aoEscolher` quando a conferência volta (padrão: não). */
  readonly avisarInicial?: boolean;
}

const SPAN: Readonly<Record<1 | 2 | 3 | 4, string>> = { 1: "md:col-span-1", 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4" };

type Estado =
  | { readonly tipo: "ocioso" }
  | { readonly tipo: "buscando" }
  | { readonly tipo: "pronto" }
  | { readonly tipo: "erro"; readonly mensagem: string };

interface Resultado {
  readonly opcoes: readonly OpcaoDoSeletor[];
  readonly temMais: boolean;
  readonly pagina: number;
}

export function CampoReferenciado({ name, rotulo, catalogo, obrigatorio, ajuda, placeholder, contexto, largura, base, aoEscolher, valorInicial, avisarInicial }: CampoReferenciadoProps): React.ReactElement {
  const id = useId();
  const idLista = `${id}-lista`;
  const idStatus = `${id}-status`;
  const [texto, setTexto] = useState("");
  const [escolha, setEscolha] = useState<OpcaoDoSeletor | null>(null);
  const [estado, setEstado] = useState<Estado>({ tipo: "ocioso" });
  const [resultado, setResultado] = useState<Resultado>({ opcoes: [], temMais: false, pagina: 1 });
  const [aberta, setAberta] = useState(false);
  const [ativa, setAtiva] = useState(-1);
  const [aviso, setAviso] = useState<string | null>(null);
  const seq = useRef(0);
  const raiz = useRef<HTMLDivElement>(null);
  const contextoDaEscolha = useRef<string>("");

  const lerContexto = useCallback((): URLSearchParams => {
    const ps = new URLSearchParams();
    const form = raiz.current?.closest("form");
    for (const nome of contexto ?? []) {
      const el = form?.elements.namedItem(nome);
      const v = el instanceof HTMLInputElement || el instanceof HTMLSelectElement ? el.value : "";
      ps.set(`ctx.${nome}`, v);
    }
    return ps;
  }, [contexto]);

  const url = useCallback(
    (extra: Record<string, string>): string => {
      const ps = lerContexto();
      for (const [k, v] of Object.entries(extra)) ps.set(k, v);
      return `${base ?? ""}/opcoes/${encodeURIComponent(catalogo)}?${ps.toString()}`;
    },
    [base, catalogo, lerContexto]
  );

  const buscar = useCallback(
    async (q: string, pagina: number): Promise<void> => {
      const minha = ++seq.current;
      setEstado({ tipo: "buscando" });
      try {
        const r = await fetch(url({ q, pagina: String(pagina) }), { headers: { accept: "application/json" }, cache: "no-store" });
        const corpo = (await r.json()) as { opcoes?: OpcaoDoSeletor[]; temMais?: boolean; erro?: string };
        if (minha !== seq.current) return; // ⚠️ garantia 1: resposta atrasada é descartada
        if (!r.ok) {
          setEstado({ tipo: "erro", mensagem: corpo.erro ?? `Não foi possível consultar as opções (HTTP ${r.status}).` });
          return;
        }
        setResultado((anterior) => ({
          opcoes: pagina > 1 ? [...anterior.opcoes, ...(corpo.opcoes ?? [])] : (corpo.opcoes ?? []),
          temMais: corpo.temMais === true,
          pagina,
        }));
        setEstado({ tipo: "pronto" });
      } catch {
        if (minha !== seq.current) return;
        setEstado({ tipo: "erro", mensagem: "Não foi possível consultar as opções. Verifique a conexão e tente de novo; nada foi escolhido." });
      }
    },
    [url]
  );

  // Busca com espera curta enquanto se digita — e só com a lista aberta.
  useEffect(() => {
    if (!aberta) return;
    // Reabrir sobre uma escolha feita busca do início — o rótulo inteiro não é um prefixo útil.
    const q = escolha !== null && texto === escolha.rotulo ? "" : texto;
    const t = setTimeout(() => void buscar(q, 1), 250);
    return () => clearTimeout(t);
  }, [texto, aberta, buscar, escolha]);

  // ⚠️ garantia 3: o contexto mudou ⇒ revalida a escolha no servidor.
  useEffect(() => {
    const form = raiz.current?.closest("form");
    if (form === null || form === undefined || (contexto ?? []).length === 0) return;
    const aoMudar = (ev: Event): void => {
      const alvo = ev.target as HTMLInputElement | null;
      if (alvo === null || !(contexto ?? []).includes(alvo.name)) return;
      if (escolha === null) return;
      const agora = lerContexto().toString();
      if (agora === contextoDaEscolha.current) return;
      const minha = ++seq.current;
      void fetch(url({ valor: escolha.valor }), { cache: "no-store" })
        .then(async (r) => ({ ok: r.ok, corpo: (await r.json()) as { opcoes?: OpcaoDoSeletor[]; erro?: string } }))
        .then(({ ok, corpo }) => {
          if (minha !== seq.current) return;
          if (ok && (corpo.opcoes ?? []).some((o) => o.valor === escolha.valor)) {
            contextoDaEscolha.current = agora;
            setAviso(null);
            return;
          }
          setEscolha(null);
          setAviso(`A escolha "${escolha.rotulo}" não vale para o que foi alterado acima e foi retirada. Escolha de novo.`);
        })
        .catch(() => {
          if (minha !== seq.current) return;
          setEscolha(null);
          setAviso("Não foi possível conferir a escolha depois da mudança acima; ela foi retirada para não seguir sem conferência.");
        });
    };
    form.addEventListener("change", aoMudar);
    return () => form.removeEventListener("change", aoMudar);
  }, [contexto, escolha, lerContexto, url]);

  function escolher(o: OpcaoDoSeletor, avisar = true): void {
    seq.current++; // nenhuma resposta em voo mexe mais nesta escolha
    setEscolha(o);
    setTexto(o.rotulo);
    setAberta(false);
    setAtiva(-1);
    setAviso(null);
    contextoDaEscolha.current = lerContexto().toString();
    if (avisar) aoEscolher?.(o);
  }

  // V22: o valor inicial é conferido no servidor antes de virar escolha — uma vez, na montagem.
  const aoEscolherRef = useRef(aoEscolher);
  aoEscolherRef.current = aoEscolher;
  useEffect(() => {
    if (valorInicial === undefined || valorInicial === "") return;
    const minha = ++seq.current;
    void fetch(url({ valor: valorInicial }), { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as { opcoes?: OpcaoDoSeletor[] }) : { opcoes: [] }))
      .then((corpo) => {
        if (minha !== seq.current) return;
        const o = (corpo.opcoes ?? []).find((x) => x.valor === valorInicial);
        if (o === undefined) {
          setAviso("O valor indicado não está entre as opções disponíveis; escolha na lista.");
          return;
        }
        setEscolha(o);
        setTexto(o.rotulo);
        contextoDaEscolha.current = lerContexto().toString();
        if (avisarInicial === true) aoEscolherRef.current?.(o);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só na montagem; trocar o valor é trocar a key
  }, []);

  const opcoes = resultado.opcoes;

  function teclado(ev: React.KeyboardEvent<HTMLInputElement>): void {
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      setAberta(true);
      setAtiva((i) => Math.min(i + 1, opcoes.length - 1));
    } else if (ev.key === "ArrowUp") {
      ev.preventDefault();
      setAtiva((i) => Math.max(i - 1, 0));
    } else if (ev.key === "Enter" && aberta) {
      // ⚠️ Enter com a lista aberta ESCOLHE — não envia o formulário com o texto pela metade.
      ev.preventDefault();
      const o = opcoes[ativa];
      if (o !== undefined) escolher(o);
    } else if (ev.key === "Escape") {
      setAberta(false);
    }
  }

  const statusTexto =
    estado.tipo === "buscando" ? "Consultando…"
      : estado.tipo === "erro" ? estado.mensagem
        : estado.tipo === "pronto" && aberta ? (opcoes.length === 0 ? "Nenhuma opção encontrada para esta busca." : `${opcoes.length}${resultado.temMais ? "+" : ""} opção(ões).`)
          : "";

  return (
    <div ref={raiz} className={`relative text-xs text-[color:var(--color-ink-2)] ${SPAN[largura ?? 2]}`} data-seletor={catalogo}>
      <label htmlFor={`${id}-busca`} className={ROTULO}>{rotulo}</label>
      <input
        id={`${id}-busca`}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={aberta}
        aria-controls={idLista}
        aria-describedby={idStatus}
        aria-activedescendant={aberta && ativa >= 0 ? `${id}-op-${ativa}` : undefined}
        autoComplete="off"
        value={texto}
        placeholder={placeholder ?? "Digite o código ou parte da descrição"}
        onChange={(e) => {
          setTexto(e.target.value);
          if (escolha !== null && e.target.value !== escolha.rotulo) {
            setEscolha(null);
            aoEscolher?.(null);
          }
          setAberta(true);
          setAtiva(-1);
        }}
        onFocus={(e) => {
          // V22: com uma escolha feita, focar seleciona o rótulo — digitar SUBSTITUI, não emenda no fim.
          if (escolha !== null) e.target.select();
          setAberta(true);
        }}
        onBlur={() => setTimeout(() => setAberta(false), 150)}
        onKeyDown={teclado}
        className={CAMPO}
      />
      {/* ⚠️ garantia 2: o VALOR viaja aqui, e só existe depois de escolher. `required` num hidden não
          é validado pelo navegador — por isso o `data-obrigatorio` e a checagem do caso de uso. */}
      <input type="hidden" name={name} value={escolha?.valor ?? ""} data-obrigatorio={obrigatorio === true ? "sim" : undefined} />
      <span id={idStatus} role="status" className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">
        {escolha !== null ? `Escolhido: ${escolha.rotulo}` : obrigatorio === true && statusTexto === "" ? "Obrigatório — escolha uma opção da lista." : statusTexto}
      </span>
      {aviso !== null ? <span role="alert" className="mt-1 block text-[11px] text-[color:var(--color-status-erro-fg)]">{aviso}</span> : null}
      {ajuda !== undefined ? <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">{ajuda}</span> : null}
      {aberta && opcoes.length > 0 ? (
        <ul id={idLista} role="listbox" aria-label={rotulo} className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] shadow">
          {opcoes.map((o, i) => (
            <li
              key={o.valor}
              id={`${id}-op-${i}`}
              role="option"
              aria-selected={i === ativa}
              data-valor={o.valor}
              onMouseDown={(e) => {
                e.preventDefault();
                escolher(o);
              }}
              className={`cursor-pointer px-3 py-1.5 text-sm ${i === ativa ? "bg-[color:var(--color-surface-2)]" : ""}`}
            >
              <span className="text-[color:var(--color-ink)]">{o.rotulo}</span>
              {o.detalhe !== undefined ? <span className="block text-[11px] text-[color:var(--color-ink-3)]">{o.detalhe}</span> : null}
            </li>
          ))}
          {resultado.temMais ? (
            <li role="presentation" className="px-3 py-1.5">
              <button type="button" onMouseDown={(e) => { e.preventDefault(); void buscar(texto, resultado.pagina + 1); }} className="text-xs underline underline-offset-2">
                Mais resultados
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
