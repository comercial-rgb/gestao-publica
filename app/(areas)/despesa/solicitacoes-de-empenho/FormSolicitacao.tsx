"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ChaveDeComando } from "../../../../components/ui/ChaveDeComando";
import { CampoReferenciado, type OpcaoDoSeletor } from "../../../../components/ui/CampoReferenciado";
import { CampoValor } from "../../../../components/ui/Campos";
import {
  CLASSE_BOTAO_PRIMARIO,
  CLASSE_CAMPO as CAMPO,
  CLASSE_PAINEL_FORMULARIO,
  CLASSE_ROTULO as ROTULO,
} from "../../../../components/ui/Formulario";
import { formatarMoeda } from "../../../../lib/format/moeda";
import {
  autorizarSolicitacaoAction,
  cancelarSolicitacaoAction,
  rejeitarSolicitacaoAction,
  solicitarAction,
  type EstadoDaSolicitacao,
} from "./actions";

/**
 * ⚠️ TIPO DECLARADO AQUI, não importado de `lib/portas`: o grep da fronteira barra qualquer import de
 * porta numa ilha client (mesmo padrão do `FichaParaEmpenho`).
 */
export interface FichaParaSolicitacao {
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

/**
 * SOLICITAR EMPENHO — o setor propõe a despesa; a autoridade autoriza depois.
 *
 * A solicitação NÃO compromete saldo: o disponível da ficha aparece como referência, e a suficiência
 * é conferida na emissão do empenho. O contrato ou a ordem de compra escolhidos sugerem o credor, o
 * valor e a categoria — tudo continua editável, e o domínio confere de novo.
 */
export function FormSolicitacao({ fichas }: { readonly fichas: readonly FichaParaSolicitacao[] }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaSolicitacao, FormData>(solicitarAction, {});
  const ref = useRef<HTMLFormElement>(null);
  const [fichaId, setFichaId] = useState("");
  const [credor, setCredor] = useState<{ doc: string; versao: number }>({ doc: "", versao: 0 });
  const [valor, setValor] = useState<{ cru: string; versao: number }>({ cru: "", versao: 0 });
  const [categoria, setCategoria] = useState<Categoria>("");
  const [tipo, setTipo] = useState<"ORDINARIO" | "GLOBAL" | "ESTIMATIVO">("ORDINARIO");
  const [historico, setHistorico] = useState("");
  const [rodada, setRodada] = useState(0);

  useEffect(() => {
    if (estado.sucesso === undefined) return;
    ref.current?.reset();
    setFichaId("");
    setCredor({ doc: "", versao: 0 });
    setValor({ cru: "", versao: 0 });
    setCategoria("");
    setTipo("ORDINARIO");
    setHistorico("");
    setRodada((r) => r + 1);
  }, [estado]);

  function aplicar(o: OpcaoDoSeletor | null, contexto: "ordem" | "contrato"): void {
    if (o === null) return;
    const d = o.dados ?? {};
    const ficha = d["fichaId"];
    if (ficha !== undefined && ficha !== "" && fichas.some((f) => f.id === ficha)) setFichaId(ficha);
    const doc = d["credorDocumento"];
    if (doc !== undefined && doc !== "") setCredor((c) => ({ doc, versao: c.versao + 1 }));
    const v = d["valor"];
    if (v !== undefined && v !== "") setValor((x) => ({ cru: v, versao: x.versao + 1 }));
    if (ehCategoria(d["categoria"])) setCategoria(d["categoria"]);
    const t = d["tipoEmpenho"];
    if (t === "ORDINARIO" || t === "GLOBAL" || t === "ESTIMATIVO") setTipo(t);
    if (historico === "" && (d["objeto"] ?? "") !== "") {
      setHistorico((contexto === "ordem" ? `Ordem de Compra ${d["numero"] ?? ""} - ${d["objeto"] ?? ""}` : `Contrato ${d["numero"] ?? ""} - ${d["objeto"] ?? ""}`).replace(/[—–]/g, "-"));
    }
  }

  if (fichas.length === 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] p-4 text-xs text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Nenhuma ficha disponível</strong> para a unidade e o
        exercício selecionados. A solicitação indica a ficha de dotação da LOA que atenderá a despesa.
      </div>
    );
  }
  const fichaEscolhida = fichas.find((f) => f.id === fichaId);

  return (
    <form ref={ref} action={action} data-acao="solicitar-empenho" className={CLASSE_PAINEL_FORMULARIO}>
      <ChaveDeComando />
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Nova solicitação de empenho</h2>
      <p className="mb-4 text-xs text-[color:var(--color-ink-3)]">
        A solicitação registra a despesa proposta e segue para autorização. O empenho só pode ser emitido
        a partir dela depois de autorizado por outro usuário com essa atribuição.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2">
          <span className={ROTULO}>Ficha (dotação)</span>
          <select name="fichaId" required value={fichaId} onChange={(e) => setFichaId(e.target.value)} className={CAMPO}>
            <option value="" disabled>
              Escolha a ficha…
            </option>
            {fichas.map((f) => (
              <option key={f.id} value={f.id}>
                {f.numero} — {f.naturezaCodigo} {f.naturezaDescricao} · fonte {f.fonteCodigo} · disponível R$ {formatarMoeda(f.saldoDisponivel).texto}
              </option>
            ))}
          </select>
          {fichaEscolhida !== undefined ? (
            <span className="mt-1 block text-[11px] text-[color:var(--color-ink-3)]">
              Disponível na ficha hoje: <strong className="tabular text-[color:var(--color-ink)]">R$ {formatarMoeda(fichaEscolhida.saldoDisponivel).texto}</strong> (a solicitação não reserva saldo)
            </span>
          ) : null}
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Nº da solicitação</span>
          <input name="numero" required placeholder="2026SE000001" className={CAMPO} />
        </label>

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
          />
        </div>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Valor proposto (R$)</span>
          <CampoValor key={`valor-${rodada}-${valor.versao}`} name="valor" required defaultValue={valor.cru} placeholder="10.000,00" className={CAMPO} />
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Tipo de empenho</span>
          <select name="tipo" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} className={CAMPO}>
            <option value="ORDINARIO">Ordinário</option>
            <option value="GLOBAL">Global</option>
            <option value="ESTIMATIVO">Estimativo</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)]">
          <span className={ROTULO}>Categoria (art. 141)</span>
          <select name="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value as Categoria)} className={CAMPO}>
            <option value="">Herdar do contrato</option>
            <option value="FORNECIMENTO_BENS">Fornecimento de bens</option>
            <option value="LOCACAO">Locação</option>
            <option value="PRESTACAO_SERVICOS">Prestação de serviços</option>
            <option value="REALIZACAO_OBRAS">Realização de obras</option>
          </select>
        </label>

        <label className="text-xs text-[color:var(--color-ink-2)] sm:col-span-2 lg:col-span-3">
          <span className={ROTULO}>Histórico / justificativa da despesa</span>
          <textarea
            name="historico"
            required
            rows={2}
            value={historico}
            onChange={(e) => setHistorico(e.target.value)}
            placeholder="Aquisição de material de expediente para a Secretaria de Saúde — processo 2026/001"
            className={CAMPO}
          />
        </label>
      </div>

      <fieldset className="mt-4 grid gap-4 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 md:grid-cols-3">
        <legend className="px-1 text-xs font-semibold text-[color:var(--color-ink-2)]">Vinculações (opcional)</legend>
        <CampoReferenciado key={`ordem-${rodada}`} name="ordemDeCompraId" rotulo="Ordem de compra" catalogo="ordens-para-empenho" placeholder="Número da ordem" largura={1} aoEscolher={(o) => aplicar(o, "ordem")} />
        <CampoReferenciado key={`contrato-${rodada}`} name="contratoId" rotulo="Contrato" catalogo="contratos-para-empenho" placeholder="Número do contrato ou contratado" largura={1} aoEscolher={(o) => aplicar(o, "contrato")} />
        <CampoReferenciado key={`convenio-${rodada}`} name="convenioId" rotulo="Convênio" catalogo="convenios-para-empenho" placeholder="Número do termo, objeto ou concedente" largura={1} />
        <CampoReferenciado key={`obra-${rodada}`} name="obraId" rotulo="Obra" catalogo="obras-para-empenho" placeholder="Identificador ou descrição" ajuda="Obrigatória no elemento 51 (obras e instalações)." largura={1} />
        <CampoReferenciado key={`divida-${rodada}`} name="dividaId" rotulo="Dívida fundada" catalogo="dividas-para-empenho" placeholder="Identificador, credor ou objeto" ajuda="Somente em amortização da dívida (grupo 6)." largura={1} />
      </fieldset>

      <Mensagem estado={estado} />

      <button type="submit" disabled={pendente} className={`mt-4 ${CLASSE_BOTAO_PRIMARIO}`}>
        {pendente ? "Registrando…" : "Registrar solicitação"}
      </button>
    </form>
  );
}

/** AUTORIZAR — quem solicitou não autoriza; a recusa vem do servidor, com o motivo. */
export function FormAutorizarSolicitacao({ solicitacaoId }: { readonly solicitacaoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaSolicitacao, FormData>(autorizarSolicitacaoAction, {});
  return (
    <form action={action} data-acao="autorizar-solicitacao" className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs">
      <ChaveDeComando />
      <input type="hidden" name="solicitacaoId" value={solicitacaoId} />
      <p className="text-[color:var(--color-ink-2)]">
        A autorização <strong>libera a emissão do empenho</strong> nos termos da solicitação. Quem solicitou não pode autorizá-la.
      </p>
      <label className="block">
        <span className={ROTULO}>Observação (opcional)</span>
        <input name="motivo" placeholder="Conferida a disponibilidade e o processo administrativo" className={CAMPO} />
      </label>
      <Mensagem estado={estado} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Autorizando…" : "Autorizar solicitação"}
      </button>
    </form>
  );
}

/** REJEITAR — a mesma autoridade de autorizar, com motivo obrigatório. */
export function FormRejeitarSolicitacao({ solicitacaoId }: { readonly solicitacaoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaSolicitacao, FormData>(rejeitarSolicitacaoAction, {});
  return (
    <form action={action} data-acao="rejeitar-solicitacao" className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs">
      <ChaveDeComando />
      <input type="hidden" name="solicitacaoId" value={solicitacaoId} />
      <label className="block">
        <span className={ROTULO}>Motivo da rejeição (mínimo de 10 caracteres)</span>
        <input name="motivo" required minLength={10} placeholder="Despesa sem pesquisa de preços no processo" className={CAMPO} />
      </label>
      <Mensagem estado={estado} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Rejeitando…" : "Rejeitar solicitação"}
      </button>
    </form>
  );
}

/** CANCELAR — o setor retira o pedido (antes de virar empenho). Motivo obrigatório. */
export function FormCancelarSolicitacao({ solicitacaoId }: { readonly solicitacaoId: string }): React.ReactElement {
  const [estado, action, pendente] = useActionState<EstadoDaSolicitacao, FormData>(cancelarSolicitacaoAction, {});
  return (
    <form action={action} data-acao="cancelar-solicitacao" className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs">
      <ChaveDeComando />
      <input type="hidden" name="solicitacaoId" value={solicitacaoId} />
      <label className="block">
        <span className={ROTULO}>Motivo do cancelamento (mínimo de 10 caracteres)</span>
        <input name="motivo" required minLength={10} placeholder="O setor desistiu da contratação" className={CAMPO} />
      </label>
      <Mensagem estado={estado} />
      <button type="submit" disabled={pendente} className={CLASSE_BOTAO_PRIMARIO}>
        {pendente ? "Cancelando…" : "Cancelar solicitação"}
      </button>
    </form>
  );
}

function Mensagem({ estado }: { readonly estado: EstadoDaSolicitacao }): React.ReactElement | null {
  if (estado.erro !== undefined) {
    return (
      <p role="alert" data-resultado-do-envio="erro" className="mt-3 whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-status-erro-bg)] px-3 py-2 text-sm text-[color:var(--color-status-erro-fg)]">
        {estado.erro}
      </p>
    );
  }
  if (estado.sucesso !== undefined) {
    return (
      <p role="status" data-resultado-do-envio="sucesso" className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--color-status-ok-bg)] px-3 py-2 text-sm text-[color:var(--color-status-ok-fg)]">
        {estado.sucesso}
      </p>
    );
  }
  return null;
}
