import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { BotaoCsv } from "../../../../../components/ui/BotaoCsv";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { paraCsv } from "../../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { lerComposicao, linhaPedidaDaUrl, type ComposicaoDaTela, type DocumentoDaTela } from "../../../../../lib/portas/composicao";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { dataBr } from "../../../../../lib/recorte";
import { lerExercicio } from "../exercicio";

/**
 * V33 — A COMPOSIÇÃO DE UMA LINHA DO BALANÇO FINANCEIRO, DO ORÇAMENTÁRIO OU DA DFC: os documentos
 * que a formam, cada um com o caminho até o registro, e a conferência da soma contra a linha.
 */
export const dynamic = "force-dynamic";

export default async function ComposicaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const { exercicio } = lerExercicio(sp);
  const pedida = linhaPedidaDaUrl(Array.isArray(sp["linha"]) ? sp["linha"][0] : sp["linha"]);

  if (pedida === null) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Composição da linha" subtitulo={`Exercício ${String(exercicio)}`} />
        <EstadoVazio
          titulo="Linha não reconhecida"
          descricao="Abra a composição pelo link da própria linha, no Balanço Financeiro, no Balanço Orçamentário ou na Demonstração dos Fluxos de Caixa."
        />
      </div>
    );
  }

  let dados: ComposicaoDaTela;
  try {
    dados = await lerComposicao({ exercicio, linha: pedida });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Composição da linha" subtitulo={`Exercício ${String(exercicio)}`} />
        <EstadoVazio titulo="Não foi possível montar a composição" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }

  const linhas: readonly LinhaDaTabela[] = [
    ...dados.documentos.map((d) => ({ ...d, total: false })),
    { chave: "total", href: null, documento: "", data: null, descricao: "Total dos documentos", classificacao: "", valores: dados.totais, total: true },
  ];
  const csv = paraCsv(
    ["Data", "Documento", "Descrição", "Classificação", ...dados.colunas],
    dados.documentos.map((d) => [
      d.data === null ? "" : dataBr(d.data),
      d.documento,
      d.descricao,
      d.classificacao,
      ...d.valores.map((v) => formatarMoeda(v).texto),
    ])
  );

  return (
    <div className="space-y-4">
      <PageHeader
        titulo={dados.titulo}
        subtitulo={`${dados.demonstracao.nome}, exercício ${String(exercicio)}: os documentos que formam a linha`}
        acoes={
          <div className="flex flex-col items-end gap-1" data-chrome>
            <Link className="text-xs text-[color:var(--color-primary)] underline" href={dados.demonstracao.href}>
              Voltar para {dados.demonstracao.nome}
            </Link>
            <BotaoCsv csv={csv} nomeArquivo={`composicao-${String(exercicio)}.csv`} />
          </div>
        }
      />

      <Conferencia dados={dados} />

      {dados.documentos.length === 0 ? (
        <EstadoVazio titulo="Nenhum documento nesta linha" descricao="Não há arrecadação, empenho ou pagamento que forme esta linha no exercício." />
      ) : (
        <TabelaDeDados
          colunas={colunas(dados.colunas)}
          linhas={linhas}
          keyDe={(l) => l.chave}
          ehTotal={(l) => l.total}
          legenda="Documentos da linha — valores em R$ · anulações entram negativas"
        />
      )}
    </div>
  );
}

function Conferencia({ dados }: { readonly dados: ComposicaoDaTela }): React.ReactElement {
  if (dados.linha === null) {
    return <Badge status="alerta">Esta linha não aparece na demonstração do exercício.</Badge>;
  }
  if ("indisponivel" in dados.linha) {
    return (
      <div className="space-y-1">
        <Badge status="alerta">A demonstração não foi emitida; os documentos abaixo não puderam ser conferidos contra a linha.</Badge>
        <p className="text-xs text-[color:var(--color-ink-2)]">{dados.linha.indisponivel}</p>
      </div>
    );
  }
  const valores = dados.linha.valores;
  return (
    <div className="space-y-1">
      <Badge status={dados.confere === true ? "ok" : "erro"}>
        {dados.confere === true
          ? "A soma dos documentos confere com a linha da demonstração."
          : "A soma dos documentos NÃO confere com a linha da demonstração."}
      </Badge>
      <p className="text-xs text-[color:var(--color-ink-2)]">
        Linha {dados.linha.rotulo}:{" "}
        {dados.colunas.map((c, i) => (
          <span key={c}>
            {i > 0 ? " · " : ""}
            {c.toLowerCase()} <ValorMonetario valor={valores[i] ?? "0.00"} />
          </span>
        ))}
      </p>
    </div>
  );
}

interface LinhaDaTabela extends DocumentoDaTela {
  readonly total: boolean;
}

function colunas(nomes: readonly string[]): readonly ColunaTabela<LinhaDaTabela>[] {
  return [
    { chave: "data", cabecalho: "Data", celula: (l) => (l.data === null ? "" : dataBr(l.data)) },
    {
      chave: "documento",
      cabecalho: "Documento",
      celula: (l) =>
        l.href === null ? (
          l.documento
        ) : (
          <Link className="font-mono text-[color:var(--color-primary)] underline" href={l.href}>
            {l.documento}
          </Link>
        ),
    },
    { chave: "descricao", cabecalho: "Descrição", celula: (l) => (l.total ? <strong>{l.descricao}</strong> : l.descricao) },
    { chave: "classificacao", cabecalho: "Classificação", celula: (l) => l.classificacao },
    ...nomes.map(
      (n, i): ColunaTabela<LinhaDaTabela> => ({
        chave: `valor-${String(i)}`,
        cabecalho: n,
        alinhamento: "direita",
        celula: (l) => <ValorMonetario valor={l.valores[i] ?? "0.00"} />,
      })
    ),
  ];
}
