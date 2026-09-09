import { CardEstatistica } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { gerarRazao, PortaSemBancoError, type LinhaDoRazao, type RazaoAnalitico } from "../../../../../lib/portas/livros";
import { SeletorPeriodo } from "../SeletorPeriodo";
import { lerPeriodo } from "../periodo";

/** Livro RAZÃO de uma conta — saldo anterior, movimentos com saldo corrente, saldo final. */
export const dynamic = "force-dynamic";

export default async function RazaoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);
  const conta = (Array.isArray(sp["conta"]) ? sp["conta"][0] : sp["conta"])?.trim();

  const cabecalho = (
    <PageHeader titulo="Livro Razão" subtitulo="O razão de uma conta: saldo anterior, movimentos e saldo corrente" acoes={<SeletorPeriodo desde={desdeStr} ate={ateStr} conta={conta ?? ""} comConta />} />
  );

  if (conta === undefined || conta === "") {
    return <div>{cabecalho}<EstadoVazio titulo="Informe uma conta" descricao="Digite o código de uma conta (ex.: 6.2.2.1.1.00.00) e aplique para ver o razão dela." /></div>;
  }

  let dados: RazaoAnalitico;
  try {
    dados = await gerarRazao({ conta, desde, ate });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Razão"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  if (dados.linhas.length === 0 && dados.saldoAnterior === "0.00") {
    return <div>{cabecalho}<EstadoVazio titulo="Sem movimento" descricao={`A conta ${conta} não tem saldo anterior nem movimento no período.`} /></div>;
  }

  const linhas = dados.linhas.map((l) => ({ ...l, dataFmt: l.data.toISOString().slice(0, 10).split("-").reverse().join("/") }));

  return (
    <div className="space-y-4">
      {cabecalho}
      <div className="grid gap-3 sm:grid-cols-3">
        <CardEstatistica rotulo="Conta">{conta}</CardEstatistica>
        <CardEstatistica rotulo="Saldo anterior"><ValorMonetario valor={dados.saldoAnterior} /></CardEstatistica>
        <CardEstatistica rotulo="Saldo final"><ValorMonetario valor={dados.saldoFinal} /></CardEstatistica>
      </div>
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={linhas}
        keyDe={(l) => l.lancamentoId}
        legenda="Saldo corrente = ΣD − ΣC acumulado (saldo bruto do razão). Valores em R$."
      />
    </div>
  );
}

type LinhaR = LinhaDoRazao & { dataFmt: string };
const COLUNAS: readonly ColunaTabela<LinhaR>[] = [
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => l.dataFmt },
  { chave: "nc", cabecalho: "Nº", alinhamento: "esquerda", largura: "8rem", celula: (l) => l.numeroControle },
  { chave: "hist", cabecalho: "Histórico", alinhamento: "esquerda", celula: (l) => l.historico },
  { chave: "d", cabecalho: "Débito", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.debito} /> },
  { chave: "c", cabecalho: "Crédito", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.credito} /> },
  { chave: "sc", cabecalho: "Saldo corrente", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.saldoCorrente} /> },
];
