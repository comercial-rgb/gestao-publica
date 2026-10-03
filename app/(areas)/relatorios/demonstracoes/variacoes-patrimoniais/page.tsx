import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  gerarDvp,
  PortaSemBancoError,
  type DemonstracaoVariacoesPatrimoniais,
  type LinhaDaDvp,
} from "../../../../../lib/portas/demonstrativos";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { SeletorPeriodo } from "../../livros/SeletorPeriodo";
import { lerPeriodo } from "../../livros/periodo";
import { ContasDaLinha, LinkDoBalancete } from "../ContasDaLinha";

/** ANEXO 15 — Demonstração das Variações Patrimoniais. Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

const ROTULO_DO_QUADRO: Record<string, string> = {
  VPA: "Variações patrimoniais aumentativas",
  VPD: "Variações patrimoniais diminutivas",
};

export default async function VariacoesPatrimoniaisPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const { desde, ate, desdeStr, ateStr } = lerPeriodo(sp);

  const cabecalho = (
    <PageHeader
      titulo="Demonstração das Variações Patrimoniais"
      subtitulo="Variações aumentativas e diminutivas do período, e o resultado patrimonial"
      acoes={
        <div className="flex flex-col items-end gap-1">
          <SeletorPeriodo desde={desdeStr} ate={ateStr} />
          <LinkDoBalancete desde={desdeStr} ate={ateStr} />
        </div>
      }
    />
  );

  let dados: DemonstracaoVariacoesPatrimoniais;
  try {
    dados = await gerarDvp({ inicio: desde, fim: ate });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Serviço indisponível"
              : "Não foi possível emitir a demonstração"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (dados.quadros.length === 0) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo="Mapeamento da demonstração não configurado"
          descricao="Nenhuma linha da demonstração das variações patrimoniais está cadastrada. Cadastre as linhas e as contas que compõem cada uma antes de emitir a demonstração."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}
      <div>
        <Badge status="neutro">
          Resultado patrimonial do período: <ValorMonetario valor={dados.resultadoPatrimonial} />
        </Badge>
      </div>

      {dados.quadros.map((q) => (
        <TabelaDeDados
          key={q.grupo}
          colunas={colunas(desdeStr, ateStr)}
          linhas={[
            ...q.linhas,
            { codigoLinha: "TOTAL", rotulo: `Total das ${(ROTULO_DO_QUADRO[q.grupo] ?? q.grupo).toLowerCase()}`, valor: q.total, contas: [] },
          ]}
          keyDe={(l) => `${q.grupo}-${l.codigoLinha}`}
          ehTotal={(l) => l.codigoLinha === "TOTAL"}
          legenda={`${ROTULO_DO_QUADRO[q.grupo] ?? q.grupo} — valores em R$`}
        />
      ))}

      <TabelaDeDados
        colunas={COLUNAS_RESUMO}
        linhas={[
          { rotulo: "Total das variações aumentativas", valor: dados.totalVPA },
          { rotulo: "Total das variações diminutivas", valor: dados.totalVPD },
          { rotulo: "Resultado patrimonial do período", valor: dados.resultadoPatrimonial },
        ]}
        keyDe={(l) => l.rotulo}
        ehTotal={(l) => l.rotulo.startsWith("Resultado")}
        legenda="Resumo — valores em R$ · déficit patrimonial aparece negativo"
      />
    </div>
  );
}

/** V33 — a coluna das contas abre o razão de cada uma no período da DVP. */
const colunas = (desde: string, ate: string): readonly ColunaTabela<LinhaDaDvp>[] => [
  { chave: "codigoLinha", cabecalho: "Linha", celula: (l) => (l.codigoLinha === "TOTAL" ? "" : l.codigoLinha) },
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "contas", cabecalho: "Contas (saldo)", celula: (l) => <ContasDaLinha contas={l.contas.map((c) => ({ codigo: c.codigo, saldo: c.valor }))} desde={desde} ate={ate} /> },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];

interface LinhaResumo {
  readonly rotulo: string;
  readonly valor: string;
}
const COLUNAS_RESUMO: readonly ColunaTabela<LinhaResumo>[] = [
  { chave: "rotulo", cabecalho: "Especificação", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];
