"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoReferenciado, type OpcaoDoSeletor } from "../../../../components/ui/CampoReferenciado";
import { CampoCpfCnpj, CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { empenharAction, type EstadoEmpenho } from "./actions";

/**
 * A ficha como ESTE form a consome.
 *
 * ⚠️ DECLARADA AQUI, e não importada de `lib/portas/empenho`. Seria `import type` (some
 * na compilação, não bundla o Prisma), mas o grep trivalente é TEXTUAL e barra qualquer
 * `from ".../lib/portas/"` numa ilha client — e ele está certo em ser cego: a diferença
 * entre `import type` e `import` é uma palavra que alguém apaga sem perceber, e aí o
 * Prisma vai para o browser (ou o build quebra, no melhor caso). O form declara o que
 * precisa; a página mapeia. É o mesmo padrão das outras três frentes.
 */
export interface FichaParaEmpenho {
  readonly id: string;
  readonly numero: number;
  readonly fonteCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly saldoDisponivel: string;
}

type Categoria = "" | "FORNECIMENTO_BENS" | "LOCACAO" | "PRESTACAO_SERVICOS" | "REALIZACAO_OBRAS";
const CATEGORIAS: readonly Exclude<Categoria, "">[] = ["FORNECIMENTO_BENS", "LOCACAO", "PRESTACAO_SERVICOS", "REALIZACAO_OBRAS"];
const ehCategoria = (v: string | undefined): v is Exclude<Categoria, ""> => v !== undefined && (CATEGORIAS as readonly string[]).includes(v);

/** O que cada vínculo escolhido trouxe do catálogo — só para compor sugestões. */
interface Origens {
  readonly ordem: OpcaoDoSeletor | null;
  readonly contrato: OpcaoDoSeletor | null;
  readonly reserva: OpcaoDoSeletor | null;
}

/**
 * OS TEXTOS DE HISTÓRICO (V22) — compostos do documento de origem, nunca de uma lista fixa de
 * frases: o histórico tem de dizer QUAL ordem, QUAL contrato, QUAL processo, e isso só o vínculo
 * escolhido sabe. São sugestões: a pessoa escolhe uma, edita, ou escreve o seu.
 */
export function sugestoesDeHistorico(o: Origens, credorNome: string): readonly string[] {
  const s: string[] = [];
  // sem o ponto final do texto de origem: a frase recebe o dela, e "setembro.." não chega ao histórico
  const a = (x: string | undefined): string => (x ?? "").trim().replace(/[.;,s]+$/, "");
  const credor = credorNome.trim() !== "" ? ` Credor: ${credorNome.trim()}.` : "";
  if (o.ordem !== null) {
    const d = o.ordem.dados ?? {};
    s.push(`Empenho referente à Ordem de Compra ${a(d["numero"])} — ${a(d["objeto"])}.${credor}`);
  }
  if (o.contrato !== null) {
    const d = o.contrato.dados ?? {};
    s.push(`Empenho para atender ao Contrato ${a(d["numero"])}, processo ${a(d["processo"])} — ${a(d["objeto"])}.${credor}`);
    s.push(`Despesa com ${a(d["objeto"]).toLowerCase()}, conforme Contrato ${a(d["numero"])}.`);
  }
  if (o.reserva !== null) {
    const d = o.reserva.dados ?? {};
    const proc = a(d["processo"]) !== "" ? `, processo ${a(d["processo"])}` : "";
    s.push(`Empenho à conta da reserva de dotação${proc} — ${a(d["objeto"])}.${credor}`);
  }
  return s.filter((x) => x.replace(/[\s.—,]/g, "") !== "");
}

/**
 * FORM DE EMPENHO — ilha client, Server Action autenticada.
 *
 * ⚠️ A CATEGORIA DA ORDEM CRONOLÓGICA NASCE VAZIA, de propósito. O `zEmpenharInput`
 * recusa empenho sem contrato e sem categoria, e o comentário dele diz por quê: um
 * default a faria virar FORNECIMENTO_BENS em silêncio, e a fila de obras se misturaria
 * com a de bens sem ninguém perceber. O `required` do select repete a regra do domínio
 * na tela — não a substitui. (V22: o contrato escolhido PREENCHE a categoria dele — é a
 * categoria declarada no contrato, não um default.)
 *
 * ⚠️ V22 — A ORIGEM PREENCHE, NÃO DECIDE. Escolher a ordem, o contrato ou a reserva sugere a ficha,
 * o credor, o valor, a categoria e o histórico; tudo continua editável, e o que viaja é o que está
 * nos campos. Saldo, vigência, fonte e elemento continuam conferidos pelo domínio, na transação.
 */
export function FormEmpenho({
  fichas,
  ordemPadrao = "",
}: {
  readonly fichas: readonly FichaParaEmpenho[];
  readonly ordemPadrao?: string;
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoEmpenho, FormData>(empenharAction, {});
  const ref = useRef<HTMLFormElement>(null);

  const [fichaId, setFichaId] = useState("");
  const [credor, setCredor] = useState<{ doc: string; nome: string; versao: number }>({ doc: "", nome: "", versao: 0 });
  const [credorManual, setCredorManual] = useState(false);
  const [valor, setValor] = useState<{ cru: string; versao: number }>({ cru: "", versao: 0 });
  const [categoria, setCategoria] = useState<Categoria>("");
  const [tipo, setTipo] = useState<"ORDINARIO" | "GLOBAL" | "ESTIMATIVO">("ORDINARIO");
  const [historico, setHistorico] = useState("");
  const historicoAutomatico = useRef("");
  const [origens, setOrigens] = useState<Origens>({ ordem: null, contrato: null, reserva: null });
  const [rodada, setRodada] = useState(0);

  // Sucesso: limpa o formulário inteiro (inclusive os seletores, pela `key` da rodada).
  useEffect(() => {
    if (estado.sucesso === undefined) return;
    ref.current?.reset();
    setFichaId("");
    setCredor({ doc: "", nome: "", versao: 0 });
    setCredorManual(false);
    setValor({ cru: "", versao: 0 });
    setCategoria("");
    setTipo("ORDINARIO");
    setHistorico("");
    historicoAutomatico.current = "";
    setOrigens({ ordem: null, contrato: null, reserva: null });
    setRodada((r) => r + 1);
  }, [estado]);

  const sugestoes = sugestoesDeHistorico(origens, credor.nome);

  // O histórico se autopreenche enquanto a pessoa não escreveu o dela.
  useEffect(() => {
    const primeira = sugestoes[0] ?? "";
    if (historico === "" || historico === historicoAutomatico.current) {
      historicoAutomatico.current = primeira;
      setHistorico(primeira);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recalcula só quando a origem muda
  }, [origens, credor.nome]);

  function aplicarOrigem(tipo: keyof Origens, o: OpcaoDoSeletor | null): void {
    setOrigens((atual) => ({ ...atual, [tipo]: o }));
    if (o === null) return;
    const d = o.dados ?? {};
    const ficha = d["fichaId"];
    if (ficha !== undefined && ficha !== "" && fichas.some((f) => f.id === ficha)) setFichaId(ficha);
    const doc = d["credorDocumento"];
    if (doc !== undefined && doc !== "") {
      setCredor((c) => ({ doc, nome: d["credorNome"] ?? "", versao: c.versao + 1 }));
    }
    const v = d["valor"] ?? (tipo === "reserva" ? d["saldo"] : undefined);
    if (v !== undefined && v !== "") setValor((x) => ({ cru: v, versao: x.versao + 1 }));
    if (ehCategoria(d["categoria"])) setCategoria(d["categoria"]);
    // o tipo do empenho acompanha o tipo da ordem (ordinária → ordinário...) — o M05 recusa o contrário
    const t = d["tipoEmpenho"];
    if (t === "ORDINARIO" || t === "GLOBAL" || t === "ESTIMATIVO") setTipo(t);
  }

  if (fichas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Nenhuma ficha disponível</strong> para a unidade e o
        exercício selecionados. O empenho exige uma ficha de dotação da LOA.
      </div>
    );
  }

  const fichaEscolhida = fichas.find((f) => f.id === fichaId);

  return (
    <form ref={ref} action={action} data-acao="empenhar" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Emitir empenho</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        Comece pela origem: a ordem de compra, o contrato ou a reserva preenchem a ficha, o credor, o
        valor e o histórico. Tudo continua editável.
      </p>

      <fieldset className="mb-4 grid gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 md:grid-cols-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink-2)]">Origem (opcional)</legend>
        <CampoReferenciado
          key={`ordem-${rodada}`}
          name="ordemDeCompraId"
          rotulo="Ordem de compra"
          catalogo="ordens-para-empenho"
          placeholder="Digite o número da ordem"
          largura={1}
          valorInicial={ordemPadrao}
          avisarInicial
          aoEscolher={(o) => aplicarOrigem("ordem", o)}
        />
        <CampoReferenciado
          key={`contrato-${rodada}`}
          name="contratoId"
          rotulo="Contrato"
          catalogo="contratos-para-empenho"
          placeholder="Digite o número do contrato"
          largura={1}
          aoEscolher={(o) => aplicarOrigem("contrato", o)}
        />
        <CampoReferenciado
          key={`reserva-${rodada}`}
          name="reservaId"
          rotulo="Reserva de dotação"
          catalogo="reservas-para-empenho"
          placeholder="Ficha, processo ou texto"
          largura={1}
          aoEscolher={(o) => aplicarOrigem("reserva", o)}
        />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Ficha (dotação)</span>
          <select name="fichaId" required value={fichaId} onChange={(e) => setFichaId(e.target.value)} className={CAMPO}>
            <option value="" disabled>
              Escolha a ficha…
            </option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} — {f.naturezaCodigo} {f.naturezaDescricao} · fonte {f.fonteCodigo} · disponível R${" "}
                {formatarMoeda(f.saldoDisponivel).texto}
              </option>
            ))}
          </select>
          {fichaEscolhida !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]" data-disponivel>
              Disponível na ficha: <strong className="tabular text-[color:var(--color-ink)]">R$ {formatarMoeda(fichaEscolhida.saldoDisponivel).texto}</strong>
            </span>
          ) : null}
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da nota</span>
          <input name="numero" required placeholder="2026NE000001" className={CAMPO} />
        </label>

        {credorManual ? (
          <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
            <span className={ROTULO}>Credor (CPF/CNPJ sem cadastro)</span>
            {/*
              ⚠️ O `minLength={11}` SAIU com a máscara, e não foi um afrouxamento. Quem mede o
              comprimento é o domínio, sobre os DÍGITOS que o hidden submete (`zEmpenharInput`).
            */}
            <CampoCpfCnpj key={`manual-${credor.versao}`} name="credor" required defaultValue={credor.doc} placeholder="12.345.678/0001-99" className={CAMPO} />
            <button type="button" onClick={() => setCredorManual(false)} className="mt-1 text-[11px] font-medium text-[color:var(--color-primary)] hover:underline">
              Buscar no cadastro de credores
            </button>
          </label>
        ) : (
          <div className="sm:col-span-2">
            <CampoReferenciado
              key={`credor-${rodada}-${credor.versao}`}
              name="credor"
              rotulo="Credor"
              catalogo="credores"
              obrigatorio
              placeholder="Digite o CPF, o CNPJ ou o nome"
              largura={4}
              {...(credor.doc !== "" ? { valorInicial: credor.doc } : {})}
              aoEscolher={(o) => setCredor((c) => ({ doc: o?.valor ?? "", nome: o?.dados?.["credorNome"] ?? "", versao: c.versao }))}
            />
            <button type="button" onClick={() => setCredorManual(true)} className="mt-1 text-[11px] font-medium text-[color:var(--color-primary)] hover:underline">
              Credor sem cadastro? Digitar o documento
            </button>
          </div>
        )}

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor (R$)</span>
          <CampoValor key={`valor-${rodada}-${valor.versao}`} name="valor" required defaultValue={valor.cru} placeholder="10.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do empenho</span>
          <input name="data" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo</span>
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={CAMPO}>
            <option value="ORDINARIO">Ordinário</option>
            <option value="GLOBAL">Global</option>
            <option value="ESTIMATIVO">Estimativo</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Categoria (art. 141)</span>
          {/* ⚠️ sem default — ver o cabeçalho: por decisão do domínio. */}
          <select name="categoria" required value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className={CAMPO}>
            <option value="" disabled>
              Escolha…
            </option>
            <option value="FORNECIMENTO_BENS">Fornecimento de bens</option>
            <option value="LOCACAO">Locação</option>
            <option value="PRESTACAO_SERVICOS">Prestação de serviços</option>
            <option value="REALIZACAO_OBRAS">Realização de obras</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico</span>
          <textarea
            name="historico"
            required
            rows={2}
            value={historico}
            onChange={(e) => setHistorico(e.target.value)}
            placeholder="aquisição de material de expediente — processo 2026/001"
            className={CAMPO}
          />
        </label>
        {sugestoes.length > 0 ? (
          <div className="sm:col-span-2 lg:col-span-3" data-sugestoes-de-historico>
            <span className={ROTULO}>Textos sugeridos pela origem</span>
            <ul className="flex flex-col gap-1">
              {sugestoes.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => {
                      historicoAutomatico.current = s;
                      setHistorico(s);
                    }}
                    aria-pressed={historico === s}
                    className={`w-full rounded-[var(--radius-md)] border px-3 py-1.5 text-left text-xs ${
                      historico === s
                        ? "border-[color:var(--color-primary)] bg-[color:var(--color-primary-soft)] text-[color:var(--color-ink)]"
                        : "border-[color:var(--color-border)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface-2)]"
                    }`}
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-do-envio="erro" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}
      {estado.sucesso !== undefined ? (
        <p role="status" data-resultado-do-envio="sucesso" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
          {estado.sucesso}
        </p>
      ) : null}

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Emitindo…" : "Emitir empenho"}
      </button>
    </form>
  );
}
