import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  DfcItemNaoClassificadoError,
  DfcNaoFechaError,
  gerarFluxosDeCaixa,
  PortaSemBancoError,
  RolDeDisponibilidadeAusenteError,
  type DemonstracaoFluxosDeCaixa,
  type FluxoDaAtividade,
} from "../../../../../lib/portas/fluxos-de-caixa";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { SeletorExercicio } from "../SeletorExercicio";
import { lerExercicio } from "../exercicio";
import { LinkDoBalancete } from "../ContasDaLinha";

/** DEMONSTRAÇÃO DOS FLUXOS DE CAIXA (MCASP, Parte V). Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

export default async function FluxosDeCaixaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const { exercicio, exercicioStr } = lerExercicio(sp);

  const cabecalho = (
    <PageHeader
      titulo="Demonstração dos Fluxos de Caixa"
      subtitulo="Ingressos e desembolsos das atividades operacionais, de investimento e de financiamento, e a geração líquida de caixa"
      acoes={
        <div className="flex flex-col items-end gap-1">
          <SeletorExercicio exercicio={exercicioStr} />
          <LinkDoBalancete desde={`${exercicioStr}-01-01`} ate={`${exercicioStr}-12-31`} />
        </div>
      }
    />
  );

  let dados: DemonstracaoFluxosDeCaixa;
  try {
    dados = await gerarFluxosDeCaixa({ exercicio });
  } catch (erro) {
    // Cada recusa com o NOME dela: o operador precisa saber se falta cadastro (o rol de caixa),
    // se um item não tem atividade definida, ou se o caixa não fecha — são três caminhos
    // diferentes para resolver, e "não foi possível" sozinho não aponta nenhum.
    const titulo =
      erro instanceof RolDeDisponibilidadeAusenteError
        ? "Contas de disponibilidade não informadas"
        : erro instanceof DfcItemNaoClassificadoError
          ? "Há valores sem atividade definida"
          : erro instanceof DfcNaoFechaError
            ? "Os fluxos não fecham com o caixa"
            : erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível emitir a Demonstração dos Fluxos de Caixa";
    return (
      <div>
        {cabecalho}
        <EstadoVazio titulo={titulo} descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }

  // A conferência caixa final × caixa das partidas é do MOTOR (ele recusa quando divergem), e a
  // emissão é a prova dela — mesma decisão da tela do Balanço Financeiro: nenhum selo aqui
  // compara strings de dinheiro. Os números ficam na tabela para o operador ver.
  return (
    <div className="space-y-4">
      {cabecalho}
      <div>
        <Badge status={dados.parcial ? "alerta" : "ok"}>
          {dados.parcial
            ? `Exercício ${dados.exercicio} em andamento — posição parcial`
            : `Exercício ${dados.exercicio} encerrado`}
        </Badge>
      </div>

      {dados.fluxos.map((f) => (
        <TabelaDeDados
          key={f.atividade}
          colunas={COLUNAS}
          linhas={linhasDoFluxo(f)}
          keyDe={(l, i) => `${f.atividade}-${i}`}
          ehTotal={(l) => l.tipo === "TOTAL"}
          recuoDe={(l) => (l.tipo === "DETALHE" ? 2 : l.tipo === "ITEM" ? 1 : 0)}
          legenda={`${rotuloDaAtividade(f)} — valores em R$`}
        />
      ))}

      <TabelaDeDados
        colunas={COLUNAS}
        linhas={[
          { rotulo: "Geração líquida de caixa e equivalentes de caixa", valor: dados.geracaoLiquida, tipo: "TOTAL" },
          { rotulo: "Caixa e equivalentes de caixa inicial", valor: dados.caixaInicial, tipo: "ITEM" },
          { rotulo: "Caixa e equivalentes de caixa final", valor: dados.caixaFinal, tipo: "TOTAL" },
          { rotulo: "Caixa apurado pelos lançamentos contábeis", valor: dados.caixaApuradoPelasPartidas, tipo: "ITEM" },
        ]}
        keyDe={(l) => l.rotulo}
        ehTotal={(l) => l.tipo === "TOTAL"}
        legenda="Apuração do fluxo de caixa do período — valores em R$"
      />
    </div>
  );
}

type TipoLinhaTela = "SECAO" | "ITEM" | "DETALHE" | "TOTAL";

interface LinhaTela {
  readonly rotulo: string;
  /** `null` só nas linhas de seção ("Ingressos", "Desembolsos"), que não têm valor. */
  readonly valor: string | null;
  readonly tipo: TipoLinhaTela;
}

/** O título do leiaute em caixa normal, para a legenda da tabela. */
function rotuloDaAtividade(f: FluxoDaAtividade): string {
  return f.titulo.charAt(0) + f.titulo.slice(1).toLowerCase();
}

/**
 * Montagem de linha, não aritmética: os totais e o fluxo líquido vêm do motor. A linha DETALHE
 * ("dos quais, restos a pagar") vem recuada e já está DENTRO da linha acima — o motor não a soma.
 */
function linhasDoFluxo(f: FluxoDaAtividade): readonly LinhaTela[] {
  return [
    { rotulo: "Ingressos", valor: null, tipo: "SECAO" },
    ...f.ingressos.map((l) => ({ rotulo: l.rotulo, valor: l.valor, tipo: l.nivel })),
    { rotulo: "Total dos ingressos", valor: f.totalIngressos, tipo: "TOTAL" },
    { rotulo: "Desembolsos", valor: null, tipo: "SECAO" },
    ...f.desembolsos.map((l) => ({ rotulo: l.rotulo, valor: l.valor, tipo: l.nivel })),
    { rotulo: "Total dos desembolsos", valor: f.totalDesembolsos, tipo: "TOTAL" },
    { rotulo: "Fluxo de caixa líquido da atividade", valor: f.fluxoLiquido, tipo: "TOTAL" },
  ];
}

const COLUNAS: readonly ColunaTabela<LinhaTela>[] = [
  {
    chave: "rotulo",
    cabecalho: "Especificação",
    celula: (l) => (l.tipo === "SECAO" ? <strong>{l.rotulo}</strong> : l.rotulo),
  },
  {
    chave: "valor",
    cabecalho: "Valor",
    alinhamento: "direita",
    celula: (l) => (l.valor === null ? "" : <ValorMonetario valor={l.valor} />),
  },
];
