import { BarraFiltros } from "../../../../components/ui/BarraFiltros";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { CampoSelect } from "../../../../components/ui/Campos";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../lib/csv/csv";
import { EscopoDeLeituraError } from "../../../../lib/portas/contexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  ComparacaoInvalidaError,
  lerComparacao,
  lerExerciciosComparaveis,
  pedidoDaUrl,
  PortaSemBancoError,
  ROTULO_AGRUPAMENTO_DESPESA,
  ROTULO_AGRUPAMENTO_RECEITA,
  type ComparacaoDeExercicios,
} from "../../../../lib/portas/comparacao-de-exercicios";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * COMPARAÇÃO DE EXERCÍCIOS (V31) — dois orçamentos lado a lado, para conferir a proposta do ano seguinte
 * contra o ano em execução, ou dois anos executados entre si.
 *
 * Os valores são os mesmos da proposta orçamentária (dotação autorizada e empenhada pela soma dos
 * movimentos; previsão atualizada com as reprevisões). A linha que só existe num dos exercícios
 * aparece com zero no outro: é a ação nova ou a extinta. Só leitura.
 */
export const dynamic = "force-dynamic";

type Linha = ComparacaoDeExercicios["linhas"][number];

function colunas(c: ComparacaoDeExercicios): readonly ColunaTabela<Linha>[] {
  const despesa = c.lado === "despesa";
  const ini = despesa ? "Dotação inicial" : "Previsão inicial";
  const atu = despesa ? "Dotação autorizada" : "Previsão atualizada";
  const lado = (ano: number, k: "a" | "b"): ColunaTabela<Linha>[] => [
    { chave: `${k}-ini`, cabecalho: `${ini} ${String(ano)}`, alinhamento: "direita", celula: (l) => <ValorMonetario valor={l[k].inicial} /> },
    { chave: `${k}-atu`, cabecalho: `${atu} ${String(ano)}`, alinhamento: "direita", celula: (l) => <ValorMonetario valor={l[k].atualizado} /> },
    ...(despesa
      ? [{ chave: `${k}-emp`, cabecalho: `Empenhado ${String(ano)}`, alinhamento: "direita" as const, celula: (l: Linha) => <ValorMonetario valor={l[k].executado ?? "0"} /> }]
      : []),
  ];
  return [
    { chave: "rotulo", cabecalho: c.agrupamento, celula: (l) => <span>{l.chave === "TOTAL" ? <strong>Total</strong> : <>{l.chave} — {l.rotulo}</>}</span> },
    ...lado(c.exercicioA, "a"),
    ...lado(c.exercicioB, "b"),
    { chave: "dif", cabecalho: `Diferença (${atu.toLowerCase()})`, alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.diferenca} /> },
    {
      chave: "var",
      cabecalho: "Variação",
      alinhamento: "direita",
      celula: (l) => <span>{l.variacao === null ? (l.b.atualizado === "0.00" ? "—" : "nova") : `${l.variacao.replace(".", ",")}%`}</span>,
    },
  ];
}

function csv(c: ComparacaoDeExercicios): string {
  const despesa = c.lado === "despesa";
  const cab = [
    "Código",
    c.agrupamento,
    ...[c.exercicioA, c.exercicioB].flatMap((a) => [`Inicial ${String(a)}`, `Atualizado ${String(a)}`, ...(despesa ? [`Empenhado ${String(a)}`] : [])]),
    "Diferença",
    "Variação %",
  ];
  const linha = (l: Linha): string[] => [
    l.chave,
    l.rotulo,
    ...[l.a, l.b].flatMap((v) => [v.inicial, v.atualizado, ...(despesa ? [v.executado ?? "0.00"] : [])]),
    l.diferenca,
    l.variacao ?? "",
  ];
  return paraCsv(cab, [...c.linhas.map(linha), linha(c.total)]);
}

export default async function ComparacaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
  const sp = await searchParams;
  let anos: readonly number[] = [];
  let c: ComparacaoDeExercicios | null = null;
  let falha: { titulo: string; descricao: string } | null = null;
  try {
    anos = await lerExerciciosComparaveis();
    c = await lerComparacao(pedidoDaUrl(sp, anos), anos);
  } catch (erro) {
    falha = {
      titulo:
        erro instanceof ComparacaoInvalidaError
          ? "Comparação não montada"
          : erro instanceof EscopoDeLeituraError
            ? "O planejamento não está no seu acesso"
            : erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível montar a comparação",
      descricao: erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido.",
    };
  }
  const pedido = pedidoDaUrl(sp, anos);
  const opcoesAno = anos.map((a) => ({ valor: String(a), rotulo: String(a) }));
  const agrupamentos = pedido.lado === "despesa" ? ROTULO_AGRUPAMENTO_DESPESA : ROTULO_AGRUPAMENTO_RECEITA;

  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Comparação de exercícios"
        subtitulo="Dois orçamentos lado a lado: a proposta do ano seguinte contra o ano em execução, ou dois anos entre si."
      />
      <BarraFiltros hrefLimpar="/planejamento/comparacao-de-exercicios" rotuloAplicar="Comparar">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <CampoSelect name="a" rotulo="Exercício de referência" largura={1} defaultValue={String(pedido.exercicioA)} opcoes={opcoesAno} />
          <CampoSelect name="b" rotulo="Exercício comparado" largura={1} defaultValue={String(pedido.exercicioB)} opcoes={opcoesAno} />
          <CampoSelect
            name="lado"
            rotulo="Comparar"
            largura={1}
            defaultValue={pedido.lado}
            opcoes={[
              { valor: "despesa", rotulo: "Despesa (fichas)" },
              { valor: "receita", rotulo: "Receita prevista" },
            ]}
          />
          <CampoSelect
            name="por"
            rotulo="Agrupar por"
            largura={1}
            defaultValue={pedido.agrupamento}
            opcoes={Object.entries(agrupamentos).map(([valor, rotulo]) => ({ valor, rotulo }))}
          />
        </div>
      </BarraFiltros>
      {falha !== null || c === null ? (
        <EstadoVazio titulo={falha?.titulo ?? "Sem comparação"} descricao={falha?.descricao ?? ""} />
      ) : c.linhas.length === 0 ? (
        <EstadoVazio titulo="Nada a comparar" descricao={`Nem ${String(c.exercicioA)} nem ${String(c.exercicioB)} têm ${c.lado === "despesa" ? "fichas" : "receita prevista"}.`} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[color:var(--color-ink-3)]">
            <p data-abrangencia>
              {c.linhas.length} linha(s) · {c.lado === "despesa" ? "todas as fichas" : "toda a receita prevista, líquida das deduções"} de {String(c.exercicioA)} e{" "}
              {String(c.exercicioB)}, de todas as unidades.
            </p>
            <BotaoCsv csv={csv(c)} nomeArquivo={`comparacao-${String(c.exercicioA)}-${String(c.exercicioB)}-${c.lado}.csv`} />
          </div>
          <TabelaDeDados colunas={colunas(c)} linhas={[...c.linhas, c.total]} keyDe={(l) => l.chave} legenda="valores em R$" />
        </>
      )}
    </div>
  );
}
