import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { gerarDiario, PortaSemBancoError, type LancamentoDoDiario } from "../../../../../lib/portas/livros";
import { SeletorPeriodo } from "../SeletorPeriodo";
import { lerPeriodo, PADRAO_DESDE, PADRAO_ATE } from "../periodo";
import { diaCivilBr } from "../../../../../packages/datas/index";

/** Livro DIÁRIO — todo lançamento da janela, em ordem cronológica. Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function DiarioPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);

  const cabecalho = (
    <PageHeader titulo="Livro Diário" subtitulo="Todos os lançamentos, em ordem cronológica estável (data do fato)" acoes={<SeletorPeriodo desde={desdeStr} ate={ateStr} />} />
  );

  let lancamentos: readonly LancamentoDoDiario[];
  try {
    lancamentos = await gerarDiario({ desde, ate });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Diário"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  if (lancamentos.length === 0) {
    return <div>{cabecalho}<EstadoVazio titulo="Sem lançamentos no período" descricao="Não há lançamento contábil na janela selecionada." /></div>;
  }

  const linhas = lancamentos.map((l) => ({
    ...l,
    totalDebito: l.partidas.filter((p) => p.tipo === "DEBITO").reduce((s, p) => s + Number(p.valor), 0).toFixed(2),
    dataFmt: diaCivilBr(l.data),
  }));

  return (
    <div className="space-y-4">
      {cabecalho}
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={linhas}
        keyDe={(l) => l.id}
        legenda={`${lancamentos.length} lançamento(s) · valores em R$ · ordem (data, registro, id).`}
      />
    </div>
  );
}

type LinhaDiario = LancamentoDoDiario & { totalDebito: string; dataFmt: string };
const COLUNAS: readonly ColunaTabela<LinhaDiario>[] = [
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => l.dataFmt },
  { chave: "nc", cabecalho: "Nº", alinhamento: "esquerda", largura: "8rem", celula: (l) => l.numeroControle },
  { chave: "hist", cabecalho: "Histórico", alinhamento: "esquerda", celula: (l) => l.historico },
  { chave: "origem", cabecalho: "Origem", alinhamento: "esquerda", largura: "10rem", celula: (l) => l.origemTipo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.totalDebito} /> },
];
