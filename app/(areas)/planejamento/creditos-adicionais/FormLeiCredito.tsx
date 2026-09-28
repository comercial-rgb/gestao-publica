"use client";

import { useActionState, useState } from "react";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { cadastrarLeiAction, type EstadoLei } from "./actions";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";

/**
 * CADASTRO DE LEI DE CRÉDITO (TR 4.30) — a fatia que esta tela vinha NOMEANDO como ausente.
 *
 * ═══ ⚠️ POR QUE ELA SÓ AGORA ═══
 * A porta de escrita (`criarLeiCredito`, ação `CRIAR_LEI_DE_CREDITO`) existia desde o M03, e a
 * tela dizia em voz alta que não a chamava — a lei entrava por seed. Isso era honesto e era
 * inútil: sem lei não há decreto, e sem decreto o crédito adicional inteiro ficava fora do
 * alcance de quem só tem a tela. A V7.1 fez o crédito adicional SUPLEMENTAR passar a funcionar em
 * instalação limpa; sem este formulário, ninguém chegaria nele sem um seed.
 *
 * ═══ NÃO-CONTROLADO, E ISSO É A DIFERENÇA PARA O IRMÃO AO LADO ═══
 * `FormDecretoCredito` é controlado porque tem uma LISTA de pernas e um indicador que depende de
 * todas ao mesmo tempo. Este tem campos FIXOS: o browser valida (`required`), o `FormData` basta,
 * e o estado de React seria peso sem função. O único estado aqui é o "abrir/fechar", que é
 * divulgação progressiva — a tela não abre dois formulários grandes de uma vez.
 *
 * ⚠️ O QUE ESTE FORM **NÃO** FAZ: conferir teto, percentual da LOA ou duplicidade de
 * `[ano, numero]`. Quem recusa é o domínio, na gravação, e a mensagem dele sobe inteira. Uma
 * conferência aqui viraria um segundo domínio, livre para divergir do primeiro.
 *
 * ⚠️ SEM `id` LITERAL: a associação rótulo-campo é por ENVOLVIMENTO (`<label>` em volta do
 * campo). É o que o resto desta tela faz, e é o que mantém a página correta quando o mesmo
 * componente aparece duas vezes.
 */

const TIPOS = [
  { valor: "SUPLEMENTAR", rotulo: "Suplementar (reforço de dotação já fixada na LOA)" },
  { valor: "ESPECIAL", rotulo: "Especial (despesa sem dotação específica na LOA)" },
  { valor: "EXTRAORDINARIO", rotulo: "Extraordinário (despesa imprevisível e urgente)" },
] as const;

export function FormLeiCredito({ exercicio }: { readonly exercicio: number }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoLei, FormData>(cadastrarLeiAction, {});
  const [aberto, setAberto] = useState(false);
  const [ultimoSucesso, setUltimoSucesso] = useState<string | undefined>(undefined);
  const [seq, setSeq] = useState(0);

  // ⚠️ FECHAR NO SUCESSO — E O SUCESSO PRECISA APARECER EM ALGUM LUGAR.
  // Sem isto o formulário fica aberto depois de gravar e NÃO exibe nada: a lei entra no banco e
  // quem enviou lê silêncio, que é indistinguível de "não aconteceu". A derivação de estado
  // durante a renderização é o padrão documentado do React para reagir a uma mudança de props
  // (aqui, o estado devolvido pela Server Action) sem um efeito que renderiza duas vezes.
  if (estado.sucesso !== undefined && estado.sucesso !== ultimoSucesso) {
    setUltimoSucesso(estado.sucesso);
    setSeq((n) => n + 1);
    setAberto(false);
  }

  if (!aberto) {
    return (
      <div className={CLASSE_PAINEL_FORMULARIO}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Nova lei autorizadora</h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
              A lei define o <strong>valor autorizado</strong> para os decretos de crédito adicional e
              deve ser cadastrada antes deles.
            </p>
          </div>
          <button type="button" onClick={() => setAberto(true)} className={CLASSE_BOTAO_PRIMARIO}>
            Cadastrar lei
          </button>
        </div>
        {/* ⚠️ O RESULTADO DE UM ATO QUE SAI DA TELA. O formulário some no sucesso, então a
            confirmação tem de existir FORA dele, com a marca que o percurso (e um leitor de
            tela) encontram. `data-resultado-seq` é um contador: dois sucessos seguidos
            produzem números diferentes, e ler o anterior como se fosse o novo deixa de ser
            possível. */}
        {estado.sucesso !== undefined ? (
          <p
            role="status"
            data-resultado-da-acao="cadastrar-lei-de-credito"
            data-resultado-seq={String(seq)}
            className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]"
          >
            {estado.sucesso}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} data-acao="cadastrar-lei-de-credito" className={CLASSE_PAINEL_FORMULARIO} aria-label="Nova lei autorizadora de crédito">
      <ChaveDeComando />
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Nova lei autorizadora</h2>

      {/* O exercício é o recorte da PÁGINA, como no decreto: uma lei de 2025 cadastrada numa tela
          de 2026 sumiria da lista logo depois de gravada. */}
      <input type="hidden" name="ano" value={String(exercicio)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da lei</span>
          <input name="numero" required placeholder="L-001" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Data de publicação</span>
          <input name="dataPublicacao" type="date" required className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Tipo de crédito autorizado</span>
          {/* ⚠️ SEM DEFAULT, e pelo mesmo motivo que a origem do recurso no decreto: o tipo decide
              em QUAL CONTA do PCASP o crédito entra (5.2.2.1.2 é "dotação adicional POR TIPO DE
              CRÉDITO"). Um default escolheria classificação contábil no lugar do usuário. */}
          <select name="tipoCredito" required defaultValue="" className={CAMPO}>
            <option value="">Escolha o tipo…</option>
            {TIPOS.map((t) => (
              <option key={t.valor} value={t.valor}>{t.rotulo}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Valor autorizado</span>
          <CampoValor name="valorAutorizado" required placeholder="50.000,00" className={CAMPO} />
        </label>
      </div>

      <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">
        A soma dos decretos vinculados a esta lei não pode ultrapassar o valor autorizado.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
          {pendente ? "Cadastrando…" : "Cadastrar lei"}
        </button>
        <button type="button" onClick={() => setAberto(false)} className="text-xs text-[color:var(--color-ink-3)] hover:underline">
          Cancelar
        </button>
        {estado.erro !== undefined ? (
          <span role="alert" className="text-xs whitespace-pre-line text-[color:var(--color-status-erro-fg)]">{estado.erro}</span>
        ) : null}
      </div>
    </form>
  );
}
