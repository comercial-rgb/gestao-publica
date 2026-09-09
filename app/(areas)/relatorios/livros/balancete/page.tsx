import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela, type GrupoColuna } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { gerarBalancete, PortaSemBancoError, type Balancete, type LinhaDoBalancete } from "../../../../../lib/portas/livros";
import { SeletorPeriodo } from "../SeletorPeriodo";
import { lerPeriodo } from "../periodo";

/** Livro BALANCETE de verificação — analítico. Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function BalancetePage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);

  const cabecalho = (
    <PageHeader titulo="Balancete de Verificação" subtitulo="Saldo anterior, movimento e saldo final por conta (art. 50 da LRF)" acoes={<SeletorPeriodo desde={desdeStr} ate={ateStr} />} />
  );

  let dados: Balancete;
  try {
    dados = await gerarBalancete({ desde, ate, modo: "ANALITICO" });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Balancete"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  if (dados.linhas.length === 0) {
    return <div>{cabecalho}<EstadoVazio titulo="Sem contas com movimento" descricao="Não há saldo nem movimento no período selecionado." /></div>;
  }

  const totalRow: LinhaDoBalancete = {
    conta: "TOTAL", sintetica: true,
    saldoAnteriorDevedor: dados.totalSaldoAnteriorDevedor, saldoAnteriorCredor: dados.totalSaldoAnteriorCredor,
    movimentoDebito: dados.totalMovimentoDebito, movimentoCredito: dados.totalMovimentoCredito,
    saldoFinalDevedor: dados.totalSaldoFinalDevedor, saldoFinalCredor: dados.totalSaldoFinalCredor,
  };

  return (
    <div className="space-y-4">
      {cabecalho}
      <div>
        <Badge status={dados.fecha ? "ok" : "erro"}>{dados.fecha ? "Balancete fecha (ΣD = ΣC)" : "Balancete NÃO fecha"}</Badge>
      </div>
      <TabelaDeDados
        colunas={COLUNAS}
        grupos={GRUPOS}
        linhas={[...dados.linhas, totalRow]}
        keyDe={(l) => l.conta}
        ehTotal={(l) => l.conta === "TOTAL"}
        legenda="Valores em R$ · saldo anterior (corte exclusivo) · movimento do período · saldo final."
      />
    </div>
  );
}

const GRUPOS: readonly GrupoColuna[] = [
  { rotulo: "", colSpan: 1 },
  { rotulo: "Saldo Anterior", colSpan: 2 },
  { rotulo: "Movimento", colSpan: 2 },
  { rotulo: "Saldo Final", colSpan: 2 },
];

const val = (get: (l: LinhaDoBalancete) => string): Omit<ColunaTabela<LinhaDoBalancete>, "chave" | "cabecalho"> => ({
  alinhamento: "direita", largura: "7.5rem", celula: (l) => <ValorMonetario valor={get(l)} />,
});
const COLUNAS: readonly ColunaTabela<LinhaDoBalancete>[] = [
  { chave: "conta", cabecalho: "Conta", alinhamento: "esquerda", celula: (l) => l.conta },
  { chave: "sad", cabecalho: "Devedor", ...val((l) => l.saldoAnteriorDevedor) },
  { chave: "sac", cabecalho: "Credor", ...val((l) => l.saldoAnteriorCredor) },
  { chave: "md", cabecalho: "Débito", ...val((l) => l.movimentoDebito) },
  { chave: "mc", cabecalho: "Crédito", ...val((l) => l.movimentoCredito) },
  { chave: "sfd", cabecalho: "Devedor", ...val((l) => l.saldoFinalDevedor) },
  { chave: "sfc", cabecalho: "Credor", ...val((l) => l.saldoFinalCredor) },
];
