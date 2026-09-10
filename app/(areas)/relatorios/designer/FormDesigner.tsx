"use client";

import { useActionState, useState } from "react";
import { CampoSelect, CampoTexto, CampoTextarea } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO,
  CLASSE_PAINEL_FORMULARIO,
} from "../../../../components/ui/Formulario";
import {
  copiarModeloAction,
  criarModeloAction,
  distribuirModeloAction,
  executarAction,
  retirarModeloAction,
  type EstadoDoDesigner,
} from "./actions";

export interface ColunaDisponivelDoForm {
  readonly nome: string;
  readonly rotulo: string;
  readonly tipo: string;
}

export interface FuncaoDoForm {
  readonly nome: string;
  readonly ajuda: string;
}

export interface UnidadeDoForm {
  readonly id: string;
  readonly rotulo: string;
}

export interface ModeloDoForm {
  readonly id: string;
  readonly rotulo: string;
}

export function ResultadoDesigner({
  estado,
}: {
  readonly estado: EstadoDoDesigner;
}): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p
        role="alert"
        className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]"
      >
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p className="mt-2 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}

const QUANTAS_COLUNAS = 6;

/**
 * O DESENHO DO MODELO.
 *
 * ═══ ⚠️ AS COLUNAS SÃO SEIS LINHAS FIXAS, e não um construtor dinâmico ═══
 * Um "adicionar coluna" por JavaScript pareceria melhor e teria um custo concreto: o
 * formulário deixaria de funcionar sem script, e um smoke de navegador — que é como
 * este repositório prova que a tela funciona — passaria a depender do que o React
 * montou. Seis linhas vazias cobrem o caso real e são HTML puro; as em branco são
 * descartadas na ação.
 *
 * ═══ ⚠️ A LISTA DE CAMPOS E DE FUNÇÕES FICA À VISTA ═══
 * A gramática é pequena de propósito, e quem escreve a expressão precisa saber o que
 * existe. Escondê-la atrás de uma documentação faria o usuário adivinhar — e cada
 * adivinhação errada vira um erro que só aparece ao salvar.
 */
export function FormNovoModelo({
  unidades,
  colunasPorFonte,
  funcoes,
}: {
  readonly unidades: readonly UnidadeDoForm[];
  readonly colunasPorFonte: Readonly<Record<string, readonly ColunaDisponivelDoForm[]>>;
  readonly funcoes: readonly FuncaoDoForm[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDesigner, FormData>(
    criarModeloAction,
    {}
  );
  const [fonte, setFonte] = useState<string>("PROCESSOS");
  const disponiveis = colunasPorFonte[fonte] ?? [];

  return (
    <form data-acao="novo-modelo" action={action} className={CLASSE_PAINEL_FORMULARIO}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <CampoTexto
          name="codigo"
          rotulo="Código"
          required
          largura={1}
          placeholder="processos_por_assunto"
          ajuda="Identificador estável ao longo das versões."
        />
        <CampoTexto name="nome" rotulo="Nome" required largura={3} />
        <CampoSelect
          name="unidadeOrcId"
          rotulo="Unidade gestora"
          required
          largura={2}
          opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.rotulo }))}
        />
        <CampoSelect
          name="fonte"
          rotulo="Fonte de dados"
          required
          largura={1}
          opcoes={[
            { valor: "PROCESSOS", rotulo: "Processos digitais" },
            { valor: "COMUNICADOS", rotulo: "Comunicados internos" },
          ]}
          aoMudar={setFonte}
          ajuda="Rol fechado: cada fonte é uma consulta revisável, nunca SQL do usuário."
        />
        <CampoSelect
          name="visibilidade"
          rotulo="Visibilidade"
          required
          largura={1}
          opcoes={[
            { valor: "AUTOR", rotulo: "Restrito ao autor" },
            { valor: "PUBLICO", rotulo: "Público" },
          ]}
        />
        <CampoTextarea name="descricao" rotulo="Descrição" largura={4} linhas={2} />
      </div>

      <div className="mt-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        <p className="font-medium text-[color:var(--color-ink)]">
          Campos disponíveis nesta fonte
        </p>
        <p className="mt-1">
          {disponiveis.map((c) => `${c.nome} (${c.rotulo})`).join(" · ")}
        </p>
        <p className="mt-2 font-medium text-[color:var(--color-ink)]">Funções permitidas</p>
        <p className="mt-1">{funcoes.map((f) => f.ajuda).join(" · ")}</p>
        <p className="mt-2">
          Operadores: <code>+ - * /</code> · comparações <code>= &lt;&gt; &lt; &lt;= &gt; &gt;=</code> ·
          concatenação <code>&amp;</code>. A aritmética é decimal, e a divisão por zero é
          erro nomeado — nunca &quot;Infinity&quot; numa célula.
        </p>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
            <tr>
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Rótulo</th>
              <th className="py-1 pr-2">Expressão</th>
              <th className="py-1 pr-2">Tipo</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: QUANTAS_COLUNAS }, (_, i) => (
              <tr key={i}>
                <td className="py-1 pr-2 text-xs text-[color:var(--color-ink-2)]">{i + 1}</td>
                <td className="py-1 pr-2">
                  <input
                    name="colRotulo"
                    className={CLASSE_CAMPO}
                    aria-label={`Rótulo da coluna ${i + 1}`}
                  />
                </td>
                <td className="py-1 pr-2">
                  <input
                    name="colExpressao"
                    className={`${CLASSE_CAMPO} font-mono`}
                    aria-label={`Expressão da coluna ${i + 1}`}
                    placeholder={i === 0 ? 'numero & "/" & ano' : undefined}
                  />
                </td>
                <td className="py-1 pr-2">
                  <select name="colTipo" className={CLASSE_CAMPO} aria-label={`Tipo da coluna ${i + 1}`}>
                    <option value="TEXTO">Texto</option>
                    <option value="NUMERO">Número</option>
                    <option value="MOEDA">Moeda</option>
                    <option value="DATA">Data</option>
                    <option value="BOOLEANO">Sim/Não</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ResultadoDesigner estado={estado} />
      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Criando…" : "Criar modelo"}
      </button>
    </form>
  );
}

export function FormExecutar({
  modelos,
  unidades,
}: {
  readonly modelos: readonly ModeloDoForm[];
  readonly unidades: readonly UnidadeDoForm[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDesigner, FormData>(
    executarAction,
    {}
  );
  if (modelos.length === 0) {
    return (
      <p className="text-xs text-[color:var(--color-ink-2)]">
        Nenhum modelo disponível para executar.
      </p>
    );
  }
  return (
    <form data-acao="executar-relatorio" action={action} className="grid grid-cols-1 gap-3 md:grid-cols-4">
      <CampoSelect
        name="modeloId"
        rotulo="Modelo"
        required
        largura={2}
        vazio="Escolha"
        opcoes={modelos.map((m) => ({ valor: m.id, rotulo: m.rotulo }))}
      />
      <CampoSelect
        name="unidadeOrcId"
        rotulo="Sobre os dados da unidade"
        required
        largura={2}
        opcoes={unidades.map((u) => ({ valor: u.id, rotulo: u.rotulo }))}
        ajuda="Um modelo distribuído roda sobre os dados de quem o executa."
      />
      <CampoTextarea
        name="filtros"
        rotulo="Filtros (um por linha, campo=valor)"
        largura={4}
        linhas={3}
        placeholder={"assunto=Alvará\nsituacao=Encerrado"}
        ajuda="Comparados em memória sobre a fonte já lida — nunca viram SQL."
      />
      <div className="md:col-span-4">
        <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
          {pendente ? "Enfileirando…" : "Executar em segundo plano"}
        </button>
        <ResultadoDesigner estado={estado} />
      </div>
    </form>
  );
}

export function FormCopiar({ modeloId }: { readonly modeloId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDesigner, FormData>(
    copiarModeloAction,
    {}
  );
  return (
    <form data-acao="copiar-modelo" action={action} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
      <input type="hidden" name="modeloId" value={modeloId} />
      <input name="novoCodigo" className={CLASSE_CAMPO} placeholder="novo_codigo" aria-label="Código da cópia" required />
      <input name="novoNome" className={CLASSE_CAMPO} placeholder="Nome da cópia" aria-label="Nome da cópia" required />
      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Copiando…" : "Copiar"}
      </button>
      <div className="md:col-span-3">
        <ResultadoDesigner estado={estado} />
      </div>
    </form>
  );
}

export function FormDistribuir({
  modeloId,
  unidades,
}: {
  readonly modeloId: string;
  readonly unidades: readonly UnidadeDoForm[];
}): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDesigner, FormData>(
    distribuirModeloAction,
    {}
  );
  return (
    <form action={action} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
      <input type="hidden" name="modeloId" value={modeloId} />
      <select name="unidadeOrcId" className={CLASSE_CAMPO} aria-label="Unidade de destino" required>
        <option value="">Distribuir para…</option>
        {unidades.map((u) => (
          <option key={u.id} value={u.id}>
            {u.rotulo}
          </option>
        ))}
      </select>
      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Distribuindo…" : "Distribuir"}
      </button>
      <div className="md:col-span-3">
        <ResultadoDesigner estado={estado} />
      </div>
    </form>
  );
}

export function FormRetirar({ modeloId }: { readonly modeloId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDoDesigner, FormData>(
    retirarModeloAction,
    {}
  );
  return (
    <form action={action} className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-3">
      <input type="hidden" name="modeloId" value={modeloId} />
      <input
        name="motivo"
        className={`${CLASSE_CAMPO} md:col-span-2`}
        placeholder="Motivo da retirada (mín. 10 caracteres)"
        aria-label="Motivo da retirada"
        required
      />
      <button type="submit" className={CLASSE_BOTAO_PRIMARIO} disabled={pendente}>
        {pendente ? "Retirando…" : "Retirar de vigência"}
      </button>
      <div className="md:col-span-3">
        <ResultadoDesigner estado={estado} />
      </div>
    </form>
  );
}
