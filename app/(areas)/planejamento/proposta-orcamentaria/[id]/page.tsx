import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { EscopoDeLeituraError } from "../../../../../lib/portas/contexto";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import {
  baseAdmiteEnsaioNaTela,
  lerPropostaComConferencia,
  PortaSemBancoError,
  ROTULO_BASE_DESPESA,
  ROTULO_BASE_RECEITA,
  type ConferenciaDaProposta,
  type PropostaDetalhada,
} from "../../../../../lib/portas/proposta-orcamentaria";
import { dataBr } from "../../../../../lib/recorte";
import { toMoney } from "../../../../../packages/contracts/index";
import { FormAbrirExercicio, FormAjusteDaLinha, FormEfetivarProposta, FormIncluirFicha, FormIncluirReceita, FormReajusteEmLote, FormRealocar } from "../Forms";
import { ConferenciaDaPropostaSecao } from "./Conferencia";

import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { TIPOS_DE_ATO_NA_TELA } from "../../../../../lib/portas/entidades-contabeis";
import { paginaDaLinha, recortar } from "../recorte-da-pagina";
/**
 * UMA PROPOSTA ORÇAMENTÁRIA (M02 V29): as receitas e as fichas importadas, com a base, o projetado e o
 * valor da proposta (o último ajuste); o que falta para gerar o orçamento; e o botão que o gera.
 */
export const dynamic = "force-dynamic";

type LinhaR = PropostaDetalhada["receitas"][number];
type LinhaD = PropostaDetalhada["despesas"][number];

const TIPO_RECEITA: Readonly<Record<string, string>> = {
  ORCAMENTARIA: "Orçamentária",
  INTRA_ORCAMENTARIA: "Intraorçamentária",
  DEDUCAO: "Dedução",
};

/** A variação do valor da proposta sobre a lei de origem, em pt-BR com uma casa. */
function Variacao({ lei, vigente }: { readonly lei: string; readonly vigente: string }): React.ReactElement {
  const l = toMoney(lei);
  const v = toMoney(vigente);
  if (l.isZero()) {
    return <p className="text-xs text-[color:var(--color-ink-3)]">{v.isZero() ? "sem valor na lei" : "não estava na lei"}</p>;
  }
  const pct = v.dividedBy(l).minus(1).times(100).toDecimalPlaces(1);
  const sinal = pct.isPositive() && !pct.isZero() ? "+" : "";
  return <p className="text-xs text-[color:var(--color-ink-3)]">{sinal}{pct.toFixed(1).replace(".", ",")}% sobre a lei</p>;
}

function UltimaAlteracao({ ajustes }: { readonly ajustes: LinhaR["ajustes"] }): React.ReactElement | null {
  const a = ajustes[0];
  if (a === undefined) return null;
  return (
    <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
      Alterado em {dataBr(a.criadoEm)}: {a.motivo}
      {ajustes.length > 1 ? ` (${String(ajustes.length)} alterações)` : ""}
    </p>
  );
}

/** V39-015 — o editor de UMA linha: o link "Alterar" leva à mesma página com `?editar=` (busca e página preservadas). */
interface EdicaoSobDemanda {
  readonly editar: string;
  readonly hrefEditar: (linhaId: string) => string;
}

function colunasDaReceita(propostaOrcamentariaId: string, editavel: boolean, origem: number, ed: EdicaoSobDemanda): readonly ColunaTabela<LinhaR>[] {
  return [
    {
      chave: "natureza",
      cabecalho: "Natureza da receita",
      alinhamento: "esquerda",
      celula: (l) => (
        <div id={`linha-${l.id}`} className="scroll-mt-4">
          <strong>{l.naturezaCodigo}</strong> {l.naturezaDescricao}
          {l.nova ? <p className="text-xs text-[color:var(--color-ink-3)]"><Badge status="neutro">nova</Badge> {l.motivo}</p> : null}
        </div>
      ),
    },
    { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "5rem", celula: (l) => l.fonteCodigo },
    { chave: "tipo", cabecalho: "Tipo", alinhamento: "esquerda", largura: "8rem", celula: (l) => TIPO_RECEITA[l.tipoReceita] ?? l.tipoReceita },
    { chave: "lei", cabecalho: `Lei de ${String(origem)}`, alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorNaLeiDeOrigem} /> },
    { chave: "base", cabecalho: "Partida", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorBase} /> },
    { chave: "projetado", cabecalho: "Com reajuste", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorProjetado} /> },
    {
      chave: "proposta",
      cabecalho: "Na proposta",
      alinhamento: "direita",
      largura: "12rem",
      celula: (l) => (
        <div>
          <strong>
            <ValorMonetario valor={l.valorVigente} />
          </strong>
          <Variacao lei={l.valorNaLeiDeOrigem} vigente={l.valorVigente} />
          <UltimaAlteracao ajustes={l.ajustes} />
          {!editavel ? null : ed.editar === l.id ? (
            <FormAjusteDaLinha aberto propostaOrcamentariaId={propostaOrcamentariaId} lado="RECEITA" linhaId={l.id} rotulo={`a receita ${l.naturezaCodigo} fonte ${l.fonteCodigo}`} valorAtual={l.valorVigente} />
          ) : (
            <Link href={ed.hrefEditar(l.id)} className="text-xs font-semibold text-[color:var(--color-primary)]" data-editar-linha={l.id}>Alterar</Link>
          )}
        </div>
      ),
    },
  ];
}

function colunasDaDespesa(propostaOrcamentariaId: string, editavel: boolean, origem: number, ed: EdicaoSobDemanda): readonly ColunaTabela<LinhaD>[] {
  return [
    { chave: "ficha", cabecalho: "Ficha", alinhamento: "esquerda", largura: "4rem", celula: (l) => (<span id={`linha-${l.id}`} className="scroll-mt-4">{l.nova ? <Badge status="neutro">nova</Badge> : <strong id={`ficha-${String(l.numero)}`} className="scroll-mt-4">{l.numero}</strong>}</span>) },
    {
      chave: "unidade",
      cabecalho: "Unidade orçamentária",
      alinhamento: "esquerda",
      celula: (l) => (
        <div>
          {l.unidadeCodigo} {l.unidadeNome}
          <p className="text-xs text-[color:var(--color-ink-3)]">
            Programa {l.programaCodigo} · ação {l.acaoCodigo} · {l.naturezaCodigo} {l.naturezaDescricao}
          </p>
          {l.nova ? <p className="text-xs text-[color:var(--color-ink-3)]">Incluída na proposta: {l.motivo}. O número vem ao gerar o orçamento.</p> : null}
        </div>
      ),
    },
    { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "5rem", celula: (l) => l.fonteCodigo },
    { chave: "lei", cabecalho: `Lei de ${String(origem)}`, alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorNaLeiDeOrigem} /> },
    { chave: "base", cabecalho: "Partida", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorBase} /> },
    { chave: "projetado", cabecalho: "Com reajuste", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.valorProjetado} /> },
    {
      chave: "proposta",
      cabecalho: "Na proposta",
      alinhamento: "direita",
      largura: "12rem",
      celula: (l) => (
        <div>
          <strong>
            <ValorMonetario valor={l.valorVigente} />
          </strong>
          <Variacao lei={l.valorNaLeiDeOrigem} vigente={l.valorVigente} />
          <UltimaAlteracao ajustes={l.ajustes} />
          {!editavel ? null : ed.editar === l.id ? (
            <FormAjusteDaLinha aberto propostaOrcamentariaId={propostaOrcamentariaId} lado="DESPESA" linhaId={l.id} rotulo={l.nova ? `a ficha nova (${l.naturezaCodigo}, fonte ${l.fonteCodigo})` : `a ficha ${String(l.numero)}`} valorAtual={l.valorVigente} />
          ) : (
            <Link href={ed.hrefEditar(l.id)} className="text-xs font-semibold text-[color:var(--color-primary)]" data-editar-linha={l.id}>Alterar</Link>
          )}
        </div>
      ),
    },
  ];
}

function Total({
  titulo,
  t,
  origem,
  detalhe,
}: {
  readonly titulo: string;
  readonly t: PropostaDetalhada["totalDaReceita"];
  readonly origem: number;
  readonly detalhe?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-[color:var(--color-ink)]">
        <ValorMonetario valor={t.vigente} />
      </p>
      <Variacao lei={t.lei} vigente={t.vigente} />
      <p className="text-xs text-[color:var(--color-ink-3)]">
        Lei de {String(origem)} <ValorMonetario valor={t.lei} /> · partida <ValorMonetario valor={t.base} /> · com reajuste{" "}
        <ValorMonetario valor={t.projetado} />
      </p>
      {detalhe}
    </div>
  );
}

/**
 * V38 (AUD-103) — O QUE VEIO E O QUE NÃO VEIO da origem, depois de criada a proposta: as contagens contra o exercício
 * de origem de hoje e o que nunca vem (a execução, os saldos, a aprovação).
 */
function OQueVeio({ p }: { readonly p: PropostaDetalhada }): React.ReactElement {
  const fichasImportadas = p.despesas.filter((l) => !l.nova).length;
  const receitasImportadas = p.receitas.filter((l) => !l.nova).length;
  const fichasNovas = p.despesas.length - fichasImportadas;
  const receitasNovas = p.receitas.length - receitasImportadas;
  const fichasDeFora = Math.max(0, p.naOrigem.fichas - fichasImportadas);
  const receitasDeFora = Math.max(0, p.naOrigem.receitas - receitasImportadas);
  return (
    <details className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3 text-xs text-[color:var(--color-ink-2)]" data-secao="o-que-veio">
      <summary className="cursor-pointer text-sm font-semibold text-[color:var(--color-ink)]">O que veio de {String(p.exercicioDeOrigem)} e o que não veio</summary>
      <ul className="mt-2 list-disc space-y-0.5 pl-4">
        <li data-veio-fichas={String(fichasImportadas)}>
          Fichas: {String(fichasImportadas)} de {String(p.naOrigem.fichas)} vieram de {String(p.exercicioDeOrigem)}
          {fichasDeFora > 0
            ? `; ${String(fichasDeFora)} ficaram de fora (${p.aproveitaFichas ? (p.incluiFichasAbertasPorCredito ? "criadas na origem depois da importação" : "abertas por crédito especial ou extraordinário, de recurso de exercício anterior, ou criadas depois da importação") : "a proposta não aproveitou as fichas"})`
            : ""}
          {fichasNovas > 0 ? `; ${String(fichasNovas)} incluída(s) na proposta` : ""}.
        </li>
        <li data-veio-receitas={String(receitasImportadas)}>
          Receitas previstas: {String(receitasImportadas)} de {String(p.naOrigem.receitas)} vieram de {String(p.exercicioDeOrigem)}
          {receitasDeFora > 0 ? `; ${String(receitasDeFora)} ficaram de fora (${p.aproveitaReceitas ? "criadas na origem depois da importação" : "a proposta não aproveitou as receitas"})` : ""}
          {receitasNovas > 0 ? `; ${String(receitasNovas)} incluída(s) na proposta` : ""}.
        </li>
        <li>
          Não vêm da origem: empenhos, liquidações e pagamentos (o empenhado serve só como valor de partida), saldos bancários, a aprovação e o número da
          lei. A dotação inicial de cada ficha é lançada em 1º de janeiro quando o orçamento é gerado.
        </li>
      </ul>
    </details>
  );
}

/** A soma do valor vigente de um conjunto de linhas (o total do filtro, independente da página). */
function somaVigente(linhas: readonly { readonly valorVigente: string }[]): string {
  return linhas.reduce((acc, l) => acc.plus(toMoney(l.valorVigente)), toMoney("0")).toFixed(2);
}

/** "Mostrando 101 a 200 de 1.059", a soma do filtro e a navegação entre páginas. */
function ResumoDoRecorte(props: {
  readonly r: { readonly primeira: number; readonly ultima: number; readonly total: number; readonly filtradas: readonly unknown[]; readonly pagina: number; readonly paginas: number };
  readonly rotulo: string;
  readonly totalFiltrado: string;
  readonly busca: string;
  readonly hrefPagina: (n: number) => string;
}): React.ReactElement {
  const { r } = props;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-[color:var(--color-ink-2)]" data-recorte={props.rotulo}>
      <span>
        {r.filtradas.length === 0
          ? `Nenhuma das ${String(r.total)} ${props.rotulo} casa com a busca.`
          : `Mostrando ${String(r.primeira)} a ${String(r.ultima)} de ${String(r.filtradas.length)}${props.busca === "" ? "" : ` (das ${String(r.total)}, com a busca)`}; soma ${props.busca === "" ? "" : "do filtro "}`}
        {r.filtradas.length === 0 ? null : <ValorMonetario valor={props.totalFiltrado} />}
      </span>
      {r.paginas > 1 ? (
        <nav aria-label={`Páginas das ${props.rotulo}`} className="flex items-center gap-2" data-paginas={String(r.paginas)}>
          {r.pagina > 1 ? <Link href={props.hrefPagina(r.pagina - 1)} className="text-[color:var(--color-primary)] underline underline-offset-2">Anteriores</Link> : null}
          <span>{`Página ${String(r.pagina)} de ${String(r.paginas)}`}</span>
          {r.pagina < r.paginas ? <Link href={props.hrefPagina(r.pagina + 1)} className="text-[color:var(--color-primary)] underline underline-offset-2" data-pagina-seguinte>Seguintes</Link> : null}
        </nav>
      ) : null}
    </div>
  );
}

export default async function PropostaPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ readonly id: string }>;
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  // Dado do ENTE: a proposta reúne as fichas de todas as unidades.
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  const sp = await searchParams;
  const um = (k: string): string => { const v = sp[k]; return typeof v === "string" ? v : ""; };
  let lido: { readonly proposta: PropostaDetalhada; readonly conferencia: ConferenciaDaProposta } | null;
  let permitidas: ReadonlySet<string>;
  try {
    [lido, permitidas] = await Promise.all([
      lerPropostaComConferencia(id),
      acoesPermitidas(["CADASTRAR_LOA", "CRIAR_FICHA", "ABRIR_EXERCICIO"]),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Proposta orçamentária" subtitulo="" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "O planejamento não está no seu acesso"
              : erro instanceof PortaSemBancoError
                ? "Banco de dados não configurado"
                : "Não foi possível ler a proposta"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }
  if (lido === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Proposta orçamentária" subtitulo="" />
        <EstadoVazio titulo="Proposta não encontrada" descricao="Volte à lista de propostas." />
      </div>
    );
  }

  const p = lido.proposta;
  const efetivada = p.efetivacao !== null;
  const editavel = !efetivada && permitidas.has("CADASTRAR_LOA");
  const diferenca = toMoney(p.totalDaReceita.vigente).minus(p.totalDaDespesa.vigente).toFixed(2);
  const destinoVazio = p.destino.fichas === 0 && p.destino.receitas === 0;
  const pronta = p.destino.existe && !p.destino.encerrado && destinoVazio && !p.destino.efetivadoPorOutra;

  // V39-013/014/015 — o recorte da página (ver `recorte-da-pagina.ts`: 13 MB de HTML e 1.140 formulários medidos).
  const busca = um("busca").trim().slice(0, 120);
  const editar = um("editar");
  const textoR = (l: LinhaR): string => `${l.naturezaCodigo} ${l.naturezaDescricao} fonte ${l.fonteCodigo} ${l.tipoReceita}`;
  const textoD = (l: LinhaD): string => `ficha ${String(l.numero)} ${l.unidadeCodigo} ${l.unidadeNome} programa ${l.programaCodigo} ação ${l.acaoCodigo} ${l.naturezaCodigo} ${l.naturezaDescricao} fonte ${l.fonteCodigo}`;
  const filtR = recortar(p.receitas, textoR, busca, 1).filtradas;
  const filtD = recortar(p.despesas, textoD, busca, 1).filtradas;
  // A linha a editar abre na página dela, mesmo que o endereço peça outra.
  const rpag = paginaDaLinha(filtR, (l) => l.id === editar) ?? Number(um("rpag") || "1");
  const dpag = paginaDaLinha(filtD, (l) => l.id === editar) ?? Number(um("dpag") || "1");
  const rr = recortar(p.receitas, textoR, busca, rpag);
  const rd = recortar(p.despesas, textoD, busca, dpag);
  const href = (muda: { readonly rpag?: number; readonly dpag?: number; readonly editar?: string }): string => {
    const q = new URLSearchParams();
    if (busca !== "") q.set("busca", busca);
    const r = muda.rpag ?? rr.pagina;
    const d = muda.dpag ?? rd.pagina;
    if (r > 1) q.set("rpag", String(r));
    if (d > 1) q.set("dpag", String(d));
    if (muda.editar !== undefined) q.set("editar", muda.editar);
    const ancora = muda.editar !== undefined ? `#linha-${muda.editar}` : muda.rpag !== undefined ? "#receitas" : muda.dpag !== undefined ? "#fichas" : "";
    const qs = q.toString();
    return `/planejamento/proposta-orcamentaria/${p.id}${qs === "" ? "" : `?${qs}`}${ancora}`;
  };

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo={p.descricao}
        subtitulo={`Orçamento de ${String(p.exercicio)}, importado de ${String(p.exercicioDeOrigem)} · criada em ${dataBr(p.criadoEm)} por ${p.criadoPor}`}
      />
      {/* V38 (AUD-093) — os atalhos ficam no topo, também na proposta já efetivada; cada ficha importada tem a própria
          âncora (#ficha-<número>), para voltar a ela pelo endereço. */}
      <nav className="text-xs" aria-label="Atalhos da proposta">
        <Link className="text-[color:var(--color-primary)] underline" href="/planejamento/proposta-orcamentaria">
          Todas as propostas
        </Link>
        {" · "}
        <a href="#receitas" className="text-[color:var(--color-primary)] underline">Receitas ({String(p.receitas.length)})</a>
        {" · "}
        <a href="#fichas" className="text-[color:var(--color-primary)] underline">Fichas ({String(p.despesas.length)})</a>
        {" · "}
        <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/fichas?exercicio=${String(p.exercicioDeOrigem)}`}>
          Fichas de {String(p.exercicioDeOrigem)}
        </Link>
      </nav>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        Receita: partida na <strong>{ROTULO_BASE_RECEITA[p.baseDaReceita]}</strong> de {String(p.exercicioDeOrigem)}, reajuste de{" "}
        <strong>{p.percentualDaReceita.replace(".", ",")}%</strong>. Despesa: partida na{" "}
        <strong>{ROTULO_BASE_DESPESA[p.baseDaDespesa]}</strong> de {String(p.exercicioDeOrigem)}, reajuste de{" "}
        <strong>{p.percentualDaDespesa.replace(".", ",")}%</strong>. A coluna &quot;Na proposta&quot; é o valor que vai para o orçamento; linha com
        valor zero não é criada.
      </div>

      <OQueVeio p={p} />

      <div className="grid gap-3 sm:grid-cols-3">
        <Total
          titulo="Receita prevista (líquida)"
          t={p.totalDaReceita}
          origem={p.exercicioDeOrigem}
          detalhe={
            toMoney(p.deducoesDaReceita.vigente).isZero() ? null : (
              <p className="text-xs text-[color:var(--color-ink-3)]">
                Receita <ValorMonetario valor={p.receitaBruta.vigente} /> menos deduções <ValorMonetario valor={p.deducoesDaReceita.vigente} />
              </p>
            )
          }
        />
        <Total titulo="Despesa fixada" t={p.totalDaDespesa} origem={p.exercicioDeOrigem} />
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-ink-3)]">Receita menos despesa</p>
          <p className="mt-1 text-lg font-semibold text-[color:var(--color-ink)]">
            <ValorMonetario valor={diferenca} />
          </p>
          <p className="text-xs text-[color:var(--color-ink-3)]">
            {toMoney(diferenca).isZero() ? "Receita e despesa equilibradas." : "A lei orçamentária pede receita e despesa equilibradas."}
          </p>
        </div>
      </div>

      <ConferenciaDaPropostaSecao c={lido.conferencia} />

      {/* V38 — o que a contadora pediu: "puxar do anterior e só fazer as alterações" — incluir o que não existia e
          reajustar em lote. Só enquanto a proposta não virou orçamento. */}
      {editavel ? (
        <section className="space-y-3" aria-label="Incluir linhas e reajustar em lote" data-secao="incluir-e-reajustar">
          <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Incluir o que a lei de origem não tinha, reajustar em lote e realocar</h2>
          <FormReajusteEmLote propostaOrcamentariaId={p.id} />
          <FormRealocar propostaOrcamentariaId={p.id} />
          <FormIncluirReceita propostaOrcamentariaId={p.id} />
          <FormIncluirFicha propostaOrcamentariaId={p.id} />
        </section>
      ) : null}

      <section className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" aria-label="Gerar o orçamento">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Gerar o orçamento de {String(p.exercicio)}</h2>
        {efetivada ? (
          <div className="space-y-1 text-sm" data-proposta-efetivada>
            <p>
              <Badge status="ok">Orçamento gerado</Badge> em {dataBr(p.efetivacao!.criadoEm)} por {p.efetivacao!.criadoPor}:{" "}
              {String(p.efetivacao!.fichasCriadas)} ficha(s) e {String(p.efetivacao!.receitasCriadas)} receita(s) prevista(s)
              {/* V39-021 — o que permitiu executar. Nulo: efetivação anterior à exigência. */}
              {p.efetivacao!.fundamento === "LEI_APROVADA"
                ? `, pela lei aprovada${p.destino.lei?.numeroDaLei == null ? "" : ` (Lei ${p.destino.lei.numeroDaLei})`}`
                : p.efetivacao!.fundamento === "EXECUCAO_PROVISORIA"
                  ? `, pela execução provisória autorizada no ato ${p.efetivacao!.atoNumero ?? ""}/${String(p.efetivacao!.atoAno ?? "")}, ${p.efetivacao!.atoDispositivo ?? ""}`
                  : p.efetivacao!.fundamento === "ENSAIO"
                    ? ", em ensaio nesta base de demonstração (não vale como orçamento aprovado)"
                    : ""}
              .{" "}
              <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/fichas?exercicio=${String(p.exercicio)}`}>
                Ver as fichas
              </Link>
              {" · "}
              <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/loa?exercicio=${String(p.exercicio)}`}>
                Anexos da LOA de {String(p.exercicio)}
              </Link>
              {" · "}
              <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/qdd?exercicio=${String(p.exercicio)}`}>
                QDD
              </Link>
            </p>
            {p.destino.deducoesSemTipo > 0 ? (
              <p className="text-xs">
                <Badge status="alerta">Pendente</Badge> {String(p.destino.deducoesSemTipo)} dedução(ões) de {String(p.exercicio)} sem o tipo da dedução, que a
                prestação de contas exige.{" "}
                <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/receita-prevista?exercicio=${String(p.exercicio)}`}>
                  Informar em Receita prevista
                </Link>
              </p>
            ) : null}
          </div>
        ) : (
          <>
            <ul className="space-y-1 text-xs text-[color:var(--color-ink-2)]">
              <li>
                {p.destino.existe && !p.destino.encerrado ? <Badge status="ok">Pronto</Badge> : <Badge status="alerta">Falta</Badge>} Exercício{" "}
                {String(p.exercicio)} aberto
                {p.destino.encerrado ? " (está encerrado)" : ""}
              </li>
              <li>
                {destinoVazio ? <Badge status="ok">Pronto</Badge> : <Badge status="alerta">Falta</Badge>} Nenhuma ficha nem receita
                prevista cadastrada em {String(p.exercicio)}
                {destinoVazio ? "" : ` (há ${String(p.destino.fichas)} ficha(s) e ${String(p.destino.receitas)} receita(s))`}
              </li>
              <li>
                {p.destino.lei === null ? <Badge status="neutro">A cadastrar</Badge> : <Badge status="ok">Cadastrado</Badge>} Projeto de lei de{" "}
                {String(p.exercicio)}{" "}
                {p.destino.lei === null ? (
                  <Link className="text-[color:var(--color-primary)] underline" href="/planejamento/leis-orcamentarias">
                    cadastrar
                  </Link>
                ) : (
                  <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/leis-orcamentarias/${p.destino.lei.id}`}>
                    {p.destino.lei.numeroDaLei === null ? `projeto ${p.destino.lei.numeroDoProjeto}, ainda não aprovado` : `Lei ${p.destino.lei.numeroDaLei}`}
                  </Link>
                )}
              </li>
              {p.destino.efetivadoPorOutra ? (
                <li>
                  <Badge status="alerta">Falta</Badge> O orçamento de {String(p.exercicio)} já foi gerado por outra proposta
                </li>
              ) : null}
            </ul>
          </>
        )}
        {/* Fora do ternário e sempre na mesma posição: o sucesso não pode desmontar o formulário que o mostra. */}
        {!efetivada && permitidas.has("ABRIR_EXERCICIO") ? (
          <FormAbrirExercicio ano={p.exercicio} propostaOrcamentariaId={p.id} aberto={p.destino.existe} />
        ) : null}
        {permitidas.has("CRIAR_FICHA") ? (
          <FormEfetivarProposta
            propostaOrcamentariaId={p.id}
            exercicio={p.exercicio}
            pronta={pronta}
            efetivada={efetivada}
            leiAprovada={p.destino.lei?.numeroDaLei ?? null}
            admiteEnsaio={await baseAdmiteEnsaioNaTela()}
            tiposDeAto={TIPOS_DE_ATO_NA_TELA}
          />
        ) : null}
      </section>

      {/* V39-013/014/015 — o recorte: busca e páginas de 100 no servidor; o editor só da linha escolhida. */}
      <form method="get" data-busca-da-proposta className="flex flex-wrap items-end gap-2 text-sm">
        <label>
          <span className="block text-xs font-semibold text-[color:var(--color-ink-2)]">Buscar nas receitas e fichas</span>
          <input name="busca" defaultValue={busca} placeholder="ficha, natureza, fonte, unidade, programa ou ação" className="mt-1 w-80 max-w-full rounded-[var(--radius-sm)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-2 py-1" />
        </label>
        <button type="submit" className="rounded-[var(--radius-sm)] border border-[color:var(--color-border)] px-3 py-1 font-semibold">Buscar</button>
        {busca === "" ? null : <Link href={`/planejamento/proposta-orcamentaria/${p.id}`} className="text-[color:var(--color-primary)] underline underline-offset-2">Limpar</Link>}
      </form>

      <section id="receitas" className="space-y-2" aria-label="Receitas da proposta">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Receitas ({String(p.receitas.length)})</h2>
        {p.receitas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma receita importada" descricao={`O exercício ${String(p.exercicioDeOrigem)} não tinha receita prevista.`} />
        ) : (
          <>
            <ResumoDoRecorte r={rr} rotulo="receitas" totalFiltrado={somaVigente(rr.filtradas)} busca={busca} hrefPagina={(n) => href({ rpag: n })} />
            {rr.linhas.length === 0 ? null : <TabelaDeDados colunas={colunasDaReceita(p.id, editavel, p.exercicioDeOrigem, { editar, hrefEditar: (l) => href({ editar: l }) })} linhas={rr.linhas} keyDe={(l) => l.id} legenda="valores em R$" />}
          </>
        )}
      </section>

      <section id="fichas" className="space-y-2" aria-label="Fichas da proposta">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Fichas ({String(p.despesas.length)})</h2>
        {p.despesas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma ficha importada" descricao={`O exercício ${String(p.exercicioDeOrigem)} não tinha fichas.`} />
        ) : (
          <>
            <ResumoDoRecorte r={rd} rotulo="fichas" totalFiltrado={somaVigente(rd.filtradas)} busca={busca} hrefPagina={(n) => href({ dpag: n })} />
            {rd.linhas.length === 0 ? null : <TabelaDeDados colunas={colunasDaDespesa(p.id, editavel, p.exercicioDeOrigem, { editar, hrefEditar: (l) => href({ editar: l }) })} linhas={rd.linhas} keyDe={(l) => l.id} legenda="valores em R$" />}
          </>
        )}
      </section>
    </div>
  );
}
