import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { RelatoriosRelacionados } from "../../../../../components/ui/RelatoriosRelacionados";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { RELACOES_RREO } from "../../../../../lib/navegacao";
import {
  gerarRreoAnexo2,
  PortaSemBancoError,
  type Anexo2,
  type LinhaFuncional,
} from "../../../../../lib/portas/rreo";
import { SeletorBimestreRreo } from "../anexo3/SeletorBimestreRreo";

/** RREO — Anexo 2 · Despesa por Função/Subfunção (LRF art. 52, II). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function RreoAnexo2Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;
  const exercicio = lerInteiro(sp["exercicio"], 2026);
  const b = lerInteiro(sp["bimestre"], 1);
  const bimestre = ([1, 2, 3, 4, 5, 6] as const).includes(b as 1) ? (b as 1) : 1;

  const cabecalho = (
    <PageHeader titulo="RREO — Anexo 2 · Despesa por Função/Subfunção" subtitulo="Execução da despesa por classificação funcional (LRF art. 52, II)" acoes={<SeletorBimestreRreo bimestre={bimestre} exercicio={exercicio} />} />
  );

  let dados: Anexo2;
  try {
    dados = await gerarRreoAnexo2({ exercicio, bimestre });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível gerar o Anexo 2"} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} /></div>;
  }

  if (dados.despesas.length === 0) {
    return <div>{cabecalho}<EstadoVazio titulo="Sem despesa no período" descricao={`Não há despesa executada até o ${bimestre}º bimestre de ${exercicio}.`} /></div>;
  }

  return (
    <div className="space-y-6">
      {cabecalho}
      <TabelaDeDados<LinhaFuncional>
        colunas={COLUNAS}
        linhas={[...dados.despesas, dados.subtotalExcetoIntra, ...dados.intra, dados.subtotalIntra, dados.total]}
        keyDe={(l, i) => `${l.nivel}-${l.codigo}-${i}`}
        ehTotal={(l) => l.nivel === "subtotal" || l.nivel === "total"}
        recuoDe={(l) => (l.nivel === "subfuncao" ? 1 : 0)}
        legenda="Valores em R$ · corte pela data do fato, líquido de estornos · (b) até o bimestre."
      />
      <RelatoriosRelacionados relacoes={RELACOES_RREO["/relatorios/rreo/anexo2"] ?? []} />
    </div>
  );
}

function lerInteiro(v: string | string[] | undefined, padrao: number): number {
  const bruto = Array.isArray(v) ? v[0] : v;
  if (bruto === undefined) return padrao;
  const n = Number.parseInt(bruto, 10);
  return Number.isNaN(n) ? padrao : n;
}

const COLUNAS: readonly ColunaTabela<LinhaFuncional>[] = [
  { chave: "rotulo", cabecalho: "Função / Subfunção", alinhamento: "esquerda", celula: (l) => l.rotulo },
  { chave: "da", cabecalho: "Dotação Atualizada", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.dotacaoAtualizada} /> },
  { chave: "ea", cabecalho: "Empenhadas até", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.empenhadasAte} /> },
  { chave: "se", cabecalho: "Saldo a Empenhar", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.saldoEmpenhar} /> },
  { chave: "la", cabecalho: "Liquidadas até", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.liquidadasAte} /> },
  { chave: "sl", cabecalho: "Saldo a Liquidar", alinhamento: "direita", largura: "8rem", celula: (l) => <ValorMonetario valor={l.saldoLiquidar} /> },
];
