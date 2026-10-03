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
  lerPropostaOrcamentaria,
  PortaSemBancoError,
  ROTULO_BASE_DESPESA,
  ROTULO_BASE_RECEITA,
  type PropostaDetalhada,
} from "../../../../../lib/portas/proposta-orcamentaria";
import { dataBr } from "../../../../../lib/recorte";
import { toMoney } from "../../../../../packages/contracts/index";
import { FormAbrirExercicio, FormAjusteDaLinha, FormEfetivarProposta } from "../Forms";

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

function colunasDaReceita(propostaOrcamentariaId: string, editavel: boolean, origem: number): readonly ColunaTabela<LinhaR>[] {
  return [
    {
      chave: "natureza",
      cabecalho: "Natureza da receita",
      alinhamento: "esquerda",
      celula: (l) => (
        <div>
          <strong>{l.naturezaCodigo}</strong> {l.naturezaDescricao}
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
          {editavel ? (
            <FormAjusteDaLinha propostaOrcamentariaId={propostaOrcamentariaId} lado="RECEITA" linhaId={l.id} rotulo={`a receita ${l.naturezaCodigo} fonte ${l.fonteCodigo}`} valorAtual={l.valorVigente} />
          ) : null}
        </div>
      ),
    },
  ];
}

function colunasDaDespesa(propostaOrcamentariaId: string, editavel: boolean, origem: number): readonly ColunaTabela<LinhaD>[] {
  return [
    { chave: "ficha", cabecalho: "Ficha", alinhamento: "esquerda", largura: "4rem", celula: (l) => <strong>{l.numero}</strong> },
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
          {editavel ? (
            <FormAjusteDaLinha propostaOrcamentariaId={propostaOrcamentariaId} lado="DESPESA" linhaId={l.id} rotulo={`a ficha ${String(l.numero)}`} valorAtual={l.valorVigente} />
          ) : null}
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

export default async function PropostaPage({ params }: { readonly params: Promise<{ readonly id: string }> }): Promise<React.ReactElement> {
  // Dado do ENTE: a proposta reúne as fichas de todas as unidades.
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const { id } = await params;
  let p: PropostaDetalhada | null;
  let permitidas: ReadonlySet<string>;
  try {
    [p, permitidas] = await Promise.all([
      lerPropostaOrcamentaria(id),
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
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }
  if (p === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Proposta orçamentária" subtitulo="" />
        <EstadoVazio titulo="Proposta não encontrada" descricao="Volte à lista de propostas." />
      </div>
    );
  }

  const efetivada = p.efetivacao !== null;
  const editavel = !efetivada && permitidas.has("CADASTRAR_LOA");
  const diferenca = toMoney(p.totalDaReceita.vigente).minus(p.totalDaDespesa.vigente).toFixed(2);
  const destinoVazio = p.destino.fichas === 0 && p.destino.receitas === 0;
  const pronta = p.destino.existe && !p.destino.encerrado && destinoVazio && !p.destino.efetivadoPorOutra;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo={p.descricao}
        subtitulo={`Orçamento de ${String(p.exercicio)}, importado de ${String(p.exercicioDeOrigem)} · criada em ${dataBr(p.criadoEm)} por ${p.criadoPor}`}
      />
      <p className="text-xs">
        <Link className="text-[color:var(--color-primary)] underline" href="/planejamento/proposta-orcamentaria">
          Todas as propostas
        </Link>
      </p>

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        Receita: partida na <strong>{ROTULO_BASE_RECEITA[p.baseDaReceita]}</strong> de {String(p.exercicioDeOrigem)}, reajuste de{" "}
        <strong>{p.percentualDaReceita.replace(".", ",")}%</strong>. Despesa: partida na{" "}
        <strong>{ROTULO_BASE_DESPESA[p.baseDaDespesa]}</strong> de {String(p.exercicioDeOrigem)}, reajuste de{" "}
        <strong>{p.percentualDaDespesa.replace(".", ",")}%</strong>. A coluna &quot;Na proposta&quot; é o valor que vai para o orçamento; linha com
        valor zero não é criada.
      </div>

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

      <section className="space-y-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3" aria-label="Gerar o orçamento">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Gerar o orçamento de {String(p.exercicio)}</h2>
        {efetivada ? (
          <div className="space-y-1 text-sm" data-proposta-efetivada>
            <p>
              <Badge status="ok">Orçamento gerado</Badge> em {dataBr(p.efetivacao!.criadoEm)} por {p.efetivacao!.criadoPor}:{" "}
              {String(p.efetivacao!.fichasCriadas)} ficha(s) e {String(p.efetivacao!.receitasCriadas)} receita(s) prevista(s).{" "}
              <Link className="text-[color:var(--color-primary)] underline" href={`/planejamento/fichas?exercicio=${String(p.exercicio)}`}>
                Ver as fichas
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
            {!p.destino.existe && permitidas.has("ABRIR_EXERCICIO") ? <FormAbrirExercicio ano={p.exercicio} propostaOrcamentariaId={p.id} /> : null}
            {permitidas.has("CRIAR_FICHA") ? <FormEfetivarProposta propostaOrcamentariaId={p.id} exercicio={p.exercicio} pronta={pronta} /> : null}
          </>
        )}
      </section>

      <section className="space-y-2" aria-label="Receitas da proposta">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Receitas ({String(p.receitas.length)})</h2>
        {p.receitas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma receita importada" descricao={`O exercício ${String(p.exercicioDeOrigem)} não tinha receita prevista.`} />
        ) : (
          <TabelaDeDados colunas={colunasDaReceita(p.id, editavel, p.exercicioDeOrigem)} linhas={p.receitas} keyDe={(l) => l.id} legenda="valores em R$" />
        )}
      </section>

      <section className="space-y-2" aria-label="Fichas da proposta">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Fichas ({String(p.despesas.length)})</h2>
        {p.despesas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma ficha importada" descricao={`O exercício ${String(p.exercicioDeOrigem)} não tinha fichas.`} />
        ) : (
          <TabelaDeDados colunas={colunasDaDespesa(p.id, editavel, p.exercicioDeOrigem)} linhas={p.despesas} keyDe={(l) => l.id} legenda="valores em R$" />
        )}
      </section>
    </div>
  );
}
