"use client";

import { useActionState, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import {
  CLASSE_AREA_TEXTO as AREA,
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { registrarRealocacaoAction, type EstadoDaRealocacao } from "./actions";
import {
  desequilibrioPorFonte,
  errosDoRascunho,
  ESPECIES,
  type Papel,
  type PernaRascunho,
} from "./rascunho";

/**
 * O ATO DE REALOCAÇÃO — ilha client CONTROLADA, Server Action autenticada.
 *
 * ⚠️ CONTROLADA pelo mesmo motivo do decreto de crédito: a lista de fichas tem tamanho variável e o
 * aviso de fechamento por fonte depende de todas as linhas ao mesmo tempo.
 *
 * ⚠️ O FILTRO DE FICHAS. Um município tem centenas de fichas; um `select` com todas, ordenadas por
 * número, é um formulário bonito e inútil. O campo de filtro recorta as opções de TODAS as linhas por
 * número, unidade, programa, natureza ou fonte — o recorte é da tela, e o servidor continua
 * conferindo cada ficha.
 *
 * ⚠️ FECHA NO SUCESSO, E O SUCESSO APARECE FORA DO FORMULÁRIO. O formulário que some com o próprio
 * sucesso leva a confirmação junto, e o operador lê silêncio — a lição do decreto de crédito e da
 * virada dos controles.
 *
 * ⚠️ ILHA CLIENT NÃO IMPORTA PORTA: as fichas chegam como props, já lidas pelo servidor, e o tipo é
 * declarado aqui.
 */

export interface FichaDoForm {
  readonly id: string;
  readonly numero: number;
  readonly unidadeCodigo: string;
  readonly unidadeNome: string;
  readonly programaCodigo: string;
  readonly naturezaCodigo: string;
  readonly naturezaDescricao: string;
  readonly fonteId: string;
  readonly fonteCodigo: string;
  readonly dotacaoAtualizada: string;
  readonly saldoDisponivel: string;
}

interface LinhaForm {
  readonly chave: number;
  readonly fichaId: string;
  readonly papel: Papel;
  readonly valor: string;
}

const LINHAS_INICIAIS = (k: number): readonly LinhaForm[] => [
  { chave: k, fichaId: "", papel: "REDUCAO", valor: "" },
  { chave: k + 1, fichaId: "", papel: "ACRESCIMO", valor: "" },
];

function rotuloDaFicha(f: FichaDoForm): string {
  return (
    `${String(f.numero)} — ${f.naturezaCodigo} ${f.naturezaDescricao} · unidade ${f.unidadeCodigo} · ` +
    `programa ${f.programaCodigo} · fonte ${f.fonteCodigo} · disponível ${formatarMoeda(f.saldoDisponivel).texto}`
  );
}

export function FormRealocacao({
  exercicio,
  fichas,
}: {
  readonly exercicio: number;
  readonly fichas: readonly FichaDoForm[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaRealocacao, FormData>(registrarRealocacaoAction, {});
  const [aberto, setAberto] = useState(false);
  const [especie, setEspecie] = useState("");
  const [numero, setNumero] = useState("");
  const [data, setData] = useState("");
  const [leiNumero, setLeiNumero] = useState("");
  const [leiData, setLeiData] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [filtro, setFiltro] = useState("");
  const [linhas, setLinhas] = useState<readonly LinhaForm[]>(LINHAS_INICIAIS(0));
  const [proximaChave, setProximaChave] = useState(2);
  const [ultimoSucesso, setUltimoSucesso] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);

  if (estado.sucesso !== undefined && estado.sucesso !== ultimoSucesso) {
    setUltimoSucesso(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
    setNumero("");
    setJustificativa("");
    setLinhas(LINHAS_INICIAIS(proximaChave));
    setProximaChave((k) => k + 2);
  }

  const porId = new Map(fichas.map((f) => [f.id, f]));
  const pernas: readonly PernaRascunho[] = linhas.map((l) => {
    const f = porId.get(l.fichaId);
    return { fichaId: l.fichaId, papel: l.papel, valor: l.valor, fonteId: f?.fonteId ?? "", fonteCodigo: f?.fonteCodigo ?? "" };
  });
  const erros = errosDoRascunho({ especie, numero, data, leiNumero, leiData, justificativa, pernas });
  const desequilibrios = desequilibrioPorFonte(pernas);

  const termo = filtro.trim().toLowerCase();
  const visiveis = termo === "" ? fichas : fichas.filter((f) => rotuloDaFicha(f).toLowerCase().includes(termo) || f.unidadeNome.toLowerCase().includes(termo));

  const atualizar = (chave: number, campo: Partial<LinhaForm>): void =>
    setLinhas((atual) => atual.map((l) => (l.chave === chave ? { ...l, ...campo } : l)));

  if (fichas.length < 2) {
    return (
      <div className={`${CLASSE_PAINEL_FORMULARIO} text-xs text-[color:var(--color-ink-2)]`}>
        <strong className="text-[color:var(--color-ink)]">Fichas insuficientes neste exercício</strong> — a
        realocação tira dotação de uma ficha e põe em outra; são necessárias ao menos duas.
      </div>
    );
  }

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO} data-painel="registrar-realocacao">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Novo ato de realocação</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              Registra a lei que autorizou e as fichas que cedem e recebem dotação. O total que sai tem de
              ser igual ao que entra, em cada fonte.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            Registrar realocação
          </button>
        </div>
        {estado.sucesso !== undefined ? (
          <p
            role="status"
            data-resultado-da-acao="registrar-realocacao"
            data-resultado-seq={String(seq)}
            className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
          >
            {estado.sucesso}
          </p>
        ) : null}
      </div>
    );
  }

  const ajudaDaEspecie = ESPECIES.find((e) => e.valor === especie)?.ajuda;

  return (
    <form action={action} data-acao="registrar-realocacao" className={CLASSE_PAINEL_FORMULARIO} aria-label="Novo ato de realocação">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Novo ato de realocação — exercício {exercicio}</h2>
      <input type="hidden" name="pernas" value={JSON.stringify(pernas)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Espécie autorizada pela lei</span>
          {/* SEM PADRÃO: é a lei que diz qual das três autorizou, e o sistema não a deduz. */}
          <select name="especie" value={especie} onChange={(e) => setEspecie(e.target.value)} className={CAMPO}>
            <option value="">Escolha a espécie…</option>
            {ESPECIES.map((e) => (
              <option key={e.valor} value={e.valor}>{e.rotulo}</option>
            ))}
          </select>
          {ajudaDaEspecie !== undefined ? <span className="mt-1 block text-[color:var(--color-ink-3)]">{ajudaDaEspecie}</span> : null}
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Número do ato</span>
          <input name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Decreto 45" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data do ato</span>
          <input name="data" type="date" value={data} onChange={(e) => setData(e.target.value)} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Lei que autorizou</span>
          <input name="leiNumero" value={leiNumero} onChange={(e) => setLeiNumero(e.target.value)} placeholder="Lei 1.234/2026" className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Data de publicação da lei</span>
          <input name="leiData" type="date" value={leiData} onChange={(e) => setLeiData(e.target.value)} className={CAMPO} />
        </label>
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-4">
          <span className={ROTULO}>Justificativa</span>
          <textarea name="justificativa" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} className={AREA} placeholder="Por que a dotação muda de lugar" />
        </label>
      </div>

      <h3 className="mt-5 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Fichas que cedem e que recebem</h3>
      <label className="mt-2 block text-xs text-[color:var(--color-ink-2)]">
        <span className={ROTULO}>Filtrar fichas</span>
        <input
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          placeholder="número, unidade, programa, natureza ou fonte"
          className={CAMPO}
        />
        <span className="mt-1 block text-[color:var(--color-ink-3)]">
          {String(visiveis.length)} de {String(fichas.length)} fichas na lista.
        </span>
      </label>

      <div className="mt-2 space-y-2">
        {linhas.map((l, i) => {
          const ficha = porId.get(l.fichaId);
          // A ficha já escolhida continua na lista mesmo que o filtro a esconda — senão o select
          // mostraria "Escolha…" com uma ficha escolhida por baixo.
          const opcoes = ficha !== undefined && !visiveis.includes(ficha) ? [ficha, ...visiveis] : visiveis;
          return (
            <div key={l.chave} className="grid gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-2 sm:grid-cols-[1fr_9rem_10rem_auto]">
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Ficha</span>
                <select aria-label={`Ficha da linha ${String(i + 1)}`} value={l.fichaId} onChange={(e) => atualizar(l.chave, { fichaId: e.target.value })} className={CAMPO}>
                  <option value="">Escolha a ficha…</option>
                  {opcoes.map((f) => (
                    <option key={f.id} value={f.id}>{rotuloDaFicha(f)}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Papel</span>
                <select
                  aria-label={`Papel da linha ${String(i + 1)}`}
                  value={l.papel}
                  onChange={(e) => atualizar(l.chave, { papel: e.target.value === "ACRESCIMO" ? "ACRESCIMO" : "REDUCAO" })}
                  className={CAMPO}
                >
                  <option value="REDUCAO">Cede (−)</option>
                  <option value="ACRESCIMO">Recebe (+)</option>
                </select>
              </label>
              <label className="text-xs text-[color:var(--color-ink-2)]">
                <span className={ROTULO}>Valor (R$)</span>
                <CampoValor
                  name=""
                  aria-label={`Valor da linha ${String(i + 1)}`}
                  defaultValue={l.valor}
                  placeholder="10.000,00"
                  className={CAMPO}
                  aoMudarValorCru={(v) => atualizar(l.chave, { valor: v })}
                />
              </label>
              <div className="flex items-end justify-between gap-2 text-xs text-[color:var(--color-ink-3)]">
                <span>
                  Fonte: <strong>{ficha?.fonteCodigo ?? "— escolha a ficha"}</strong>
                </span>
                {linhas.length > 2 ? (
                  <button
                    type="button"
                    aria-label={`Remover linha ${String(i + 1)}`}
                    onClick={() => setLinhas((atual) => atual.filter((x) => x.chave !== l.chave))}
                    className="text-[color:var(--color-status-erro-fg)] hover:underline"
                  >
                    remover
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => {
          setLinhas((atual) => [...atual, { chave: proximaChave, fichaId: "", papel: "ACRESCIMO", valor: "" }]);
          setProximaChave((k) => k + 1);
        }}
        className="mt-2 text-xs font-medium text-[color:var(--color-primary)] hover:underline"
      >
        + incluir ficha
      </button>

      <div
        data-teste="fechamento"
        className={`mt-4 rounded-[var(--radius-md)] px-3 py-2 text-xs ${
          desequilibrios.length === 0
            ? "bg-[color:var(--color-status-ok-bg)] text-[color:var(--color-status-ok-fg)]"
            : "bg-[color:var(--color-status-alerta-bg)] text-[color:var(--color-status-alerta-fg)]"
        }`}
      >
        {desequilibrios.length === 0 ? (
          <>O que sai <strong>fecha com o que entra</strong> em cada fonte.</>
        ) : (
          <>
            <strong>Ainda não fecha</strong>:{" "}
            {desequilibrios.map((d) => `fonte ${d.fonteCodigo} sobra ${formatarMoeda(d.diferenca).texto}`).join("; ")}. Em cada
            fonte, o que as fichas cedem tem de ser igual ao que recebem.
          </>
        )}
      </div>

      {erros.length > 0 ? (
        <ul data-teste="erros-forma" className="mt-3 list-disc space-y-0.5 rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-6 py-2 text-xs text-[color:var(--color-ink-2)]">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      {estado.erro !== undefined ? (
        <p role="alert" data-resultado-da-acao="registrar-realocacao" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
          {estado.erro}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente || erros.length > 0} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Registrando…" : "Registrar o ato e mover a dotação"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
      </div>
    </form>
  );
}
