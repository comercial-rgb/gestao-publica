import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { JanelaDeDetalhe } from "../../../../components/ui/JanelaDeDetalhe";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { listarFichasParaEmpenho, type FichaDaTela } from "../../../../lib/portas/empenho";
import {
  lerSolicitacoesDeEmpenho,
  PortaSemBancoError,
  type SolicitacaoDaTela,
} from "../../../../lib/portas/solicitacao-de-empenho";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
} from "../../../../lib/portas/contexto";
import { dataBr, descreverRecorte, type RecorteDaPagina } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";
import { instanteCivilBr } from "../../../../packages/datas/index";
import {
  FormAutorizarSolicitacao,
  FormCancelarSolicitacao,
  FormRejeitarSolicitacao,
  FormSolicitacao,
} from "./FormSolicitacao";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
import { podeUsarAtalhoDeCadastro } from "../../../../lib/portas/pessoas";
/**
 * SOLICITAÇÕES DE EMPENHO (M05, V22) — pedir, autorizar, e só então emitir.
 *
 * A lista mostra a situação DERIVADA de cada solicitação; o número abre o detalhe por cima da lista,
 * com as ações que a situação admite. As ações aparecem para quem abre a tela, e quem decide se a
 * pessoa pode é o servidor: autorizar exige a ação no escopo da unidade da ficha, e quem solicitou
 * não decide a própria solicitação — a recusa volta com o motivo.
 */
export const dynamic = "force-dynamic";

const ROTULO_SITUACAO: Readonly<Record<string, string>> = {
  PENDENTE: "Aguardando autorização",
  AUTORIZADA: "Autorizada",
  REJEITADA: "Rejeitada",
  CANCELADA: "Cancelada",
  EMPENHADA: "Empenhada",
};

const ROTULO_TIPO: Readonly<Record<string, string>> = { ORDINARIO: "Ordinário", GLOBAL: "Global", ESTIMATIVO: "Estimativo" };
const ROTULO_CATEGORIA: Readonly<Record<string, string>> = {
  FORNECIMENTO_BENS: "Fornecimento de bens",
  LOCACAO: "Locação",
  PRESTACAO_SERVICOS: "Prestação de serviços",
  REALIZACAO_OBRAS: "Realização de obras",
};

function tomDaSituacao(s: string): StatusBadge {
  if (s === "REJEITADA" || s === "CANCELADA") return "erro";
  if (s === "EMPENHADA") return "ok";
  if (s === "AUTORIZADA") return "alerta";
  return "neutro";
}

const CLASSE_ACAO_PRINCIPAL =
  "inline-flex h-8 items-center rounded-[var(--radius-pilula)] bg-[color:var(--color-acao)] px-3 text-xs font-semibold text-[color:var(--color-acao-tinta)] hover:bg-[color:var(--color-acao-hover)]";

export default async function SolicitacoesDeEmpenhoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  // V37 — o credor que volta escolhido do atalho de cadastro, e se quem está aqui pode usar o atalho.
  const credorPadrao = typeof sp["credor"] === "string" && sp["credor"] !== "" ? sp["credor"].replace(/\D/g, "") : undefined;
  const podeCadastrarCredor = await podeUsarAtalhoDeCadastro();
  let recorte: RecorteDaPagina;
  let solicitacoes: readonly SolicitacaoDaTela[];
  let fichas: readonly FichaDaTela[];
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    [solicitacoes, fichas] = await Promise.all([
      lerSolicitacoesDeEmpenho({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo }),
      listarFichasParaEmpenho({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Solicitações de empenho" subtitulo="Execução da despesa" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Serviço indisponível"
                  : "Não foi possível carregar as solicitações"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  const query = `exercicio=${recorte.exercicio}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}`;
  const pendentes = solicitacoes.filter((s) => s.situacao === "PENDENTE").length;
  const autorizadas = solicitacoes.filter((s) => s.situacao === "AUTORIZADA").length;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Solicitações de empenho"
        subtitulo={`${descreverRecorte(recorte)}: pedido, autorização e emissão do empenho`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O setor registra a despesa proposta; um usuário com atribuição de autorizar, diferente de quem
        solicitou, autoriza ou rejeita com motivo. O empenho é emitido na tela de{" "}
        <Link href={`/despesa/empenhos?${query}`} className="font-medium text-[color:var(--color-primary)] hover:underline">
          Empenhos
        </Link>
        , a partir da solicitação autorizada. A solicitação não reserva saldo: a suficiência é conferida na emissão.
      </div>

      <FormSolicitacao
        credorPadrao={credorPadrao}
        podeCadastrarCredor={podeCadastrarCredor}
        fichas={fichas.map((f) => ({
          id: f.id,
          numero: f.numero,
          fonteCodigo: f.fonteCodigo,
          naturezaCodigo: f.naturezaCodigo,
          naturezaDescricao: f.naturezaDescricao,
          saldoDisponivel: f.saldoDisponivel,
        }))}
      />

      {solicitacoes.length === 0 ? (
        <EstadoVazio
          titulo="Sem solicitações"
          descricao={`Nenhuma solicitação de empenho registrada em ${descreverRecorte(recorte).toLowerCase()}.`}
        />
      ) : (
        <TabelaDeDados
          colunas={[colunaNumero(query), ...COLUNAS]}
          linhas={solicitacoes}
          keyDe={(l) => l.id}
          legenda={`${solicitacoes.length} solicitação(ões) · ${pendentes} aguardando autorização · ${autorizadas} autorizada(s) sem empenho · valores em R$.`}
        />
      )}
    </div>
  );
}

const COLUNAS: readonly ColunaTabela<SolicitacaoDaTela>[] = [
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => dataBr(l.solicitadaEm) },
  {
    chave: "credor",
    cabecalho: "Credor",
    alinhamento: "esquerda",
    largura: "14rem",
    celula: (l) => (
      <span className="block min-w-0">
        {l.credorNome !== null ? <span className="block truncate text-[color:var(--color-ink)]" title={l.credorNome}>{l.credorNome}</span> : null}
        <span className="block text-[11px] text-[color:var(--color-ink-3)]">{formatarDocumento(l.credorCpfCnpj)}</span>
      </span>
    ),
  },
  { chave: "ficha", cabecalho: "Ficha", alinhamento: "direita", largura: "4rem", celula: (l) => l.fichaNumero },
  { chave: "historico", cabecalho: "Histórico", alinhamento: "esquerda", largura: "18rem", celula: (l) => <span className="line-clamp-2">{l.historico}</span> },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.valor} /> },
  { chave: "solicitante", cabecalho: "Solicitante", alinhamento: "esquerda", largura: "10rem", celula: (l) => l.solicitadaPor },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "9rem",
    celula: (l) => (
      <span className="flex flex-col gap-1">
        <Badge status={tomDaSituacao(l.situacao)}>{ROTULO_SITUACAO[l.situacao] ?? l.situacao}</Badge>
        {l.empenhoNumero !== null ? (
          <span className="text-[11px] text-[color:var(--color-ink-3)]">
            {l.empenhoNumero}
            {l.empenhoAnulado ? " (anulado)" : ""}
          </span>
        ) : null}
      </span>
    ),
  },
];

function colunaNumero(query: string): ColunaTabela<SolicitacaoDaTela> {
  return {
    chave: "numero",
    cabecalho: "Nº",
    alinhamento: "esquerda",
    largura: "8rem",
    celula: (l) => (
      <JanelaDeDetalhe
        gatilho={l.numero}
        rotuloDoGatilho={`Abrir a solicitação de empenho ${l.numero}`}
        titulo={`Solicitação de empenho ${l.numero}`}
        subtitulo={`${dataBr(l.solicitadaEm)} · ficha ${l.fichaNumero} · unidade ${l.unidadeCodigo}`}
      >
        <DetalheDaSolicitacao s={l} query={query} />
      </JanelaDeDetalhe>
    ),
  };
}

function DetalheDaSolicitacao({ s, query }: { readonly s: SolicitacaoDaTela; readonly query: string }): React.ReactElement {
  const linha = (rotulo: string, valor: React.ReactNode): React.ReactElement => (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{rotulo}</dt>
      <dd className="mt-0.5 break-words text-sm text-[color:var(--color-ink)]">{valor}</dd>
    </div>
  );
  const decisao =
    s.decididaPor === null
      ? null
      : s.situacao === "REJEITADA"
        ? "Rejeitada"
        : s.situacao === "CANCELADA"
          ? "Cancelada"
          : "Autorizada";
  return (
    <div className="space-y-5" data-detalhe-da-solicitacao={s.numero}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge status={tomDaSituacao(s.situacao)}>{ROTULO_SITUACAO[s.situacao] ?? s.situacao}</Badge>
        <Badge status="neutro">{ROTULO_TIPO[s.tipo] ?? s.tipo}</Badge>
        {s.categoria !== null ? <Badge status="neutro">{ROTULO_CATEGORIA[s.categoria] ?? s.categoria}</Badge> : null}
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {linha("Credor", s.credorNome !== null ? <>{s.credorNome}<span className="block text-xs text-[color:var(--color-ink-3)]">{formatarDocumento(s.credorCpfCnpj)}</span></> : formatarDocumento(s.credorCpfCnpj))}
        {linha("Valor proposto", <ValorMonetario valor={s.valor} />)}
        {linha("Ficha", `${s.fichaNumero} · fonte ${s.fonteCodigo} · ${s.naturezaCodigo}`)}
        {linha("Solicitada por", `${s.solicitadaPor} em ${instanteCivilBr(s.solicitadaEm)}`)}
        {decisao !== null && s.decididaPor !== null && s.decididaEm !== null
          ? linha(`${decisao} por`, `${s.decididaPor} em ${instanteCivilBr(s.decididaEm)}`)
          : null}
        {s.empenhoNumero !== null ? linha("Empenho emitido", `${s.empenhoNumero}${s.empenhoAnulado ? " — anulado depois (a solicitação não volta a ficar disponível)" : ""}`) : null}
      </dl>

      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Histórico</h3>
        <p className="whitespace-pre-line rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-3 py-2 text-sm text-[color:var(--color-ink)]">{s.historico}</p>
      </div>

      {s.motivo !== null ? (
        <div>
          <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">
            {s.situacao === "AUTORIZADA" || s.situacao === "EMPENHADA" ? "Observação da autorização" : "Motivo"}
          </h3>
          <p className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-sm text-[color:var(--color-ink)]">{s.motivo}</p>
        </div>
      ) : null}

      <div>
        <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Vinculações</h3>
        {s.vinculos.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma vinculação indicada.</p>
        ) : (
          <ul className="flex flex-wrap gap-2 text-xs">
            {s.vinculos.map((v) => (
              <li key={v.rotulo} className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-2 py-1 text-[color:var(--color-ink-2)]">
                {v.rotulo}: <strong className="text-[color:var(--color-ink)]">{v.valor}</strong>
              </li>
            ))}
          </ul>
        )}
      </div>

      {s.situacao === "PENDENTE" ? (
        <div className="grid gap-3 border-t border-[color:var(--color-border)] pt-4 md:grid-cols-2">
          <FormAutorizarSolicitacao solicitacaoId={s.id} />
          <FormRejeitarSolicitacao solicitacaoId={s.id} />
          <FormCancelarSolicitacao solicitacaoId={s.id} />
        </div>
      ) : null}
      {s.situacao === "AUTORIZADA" ? (
        <div className="space-y-3 border-t border-[color:var(--color-border)] pt-4">
          <Link href={`/despesa/empenhos?${query}&solicitacaoId=${s.id}`} className={CLASSE_ACAO_PRINCIPAL} data-emitir-empenho={s.numero}>
            Emitir o empenho desta solicitação
          </Link>
          <FormCancelarSolicitacao solicitacaoId={s.id} />
        </div>
      ) : null}
    </div>
  );
}
