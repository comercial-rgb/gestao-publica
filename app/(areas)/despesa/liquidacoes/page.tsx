import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  listarLiquidacoesDaExecucao,
  PortaSemBancoError,
  type LiquidacaoDaTela,
} from "../../../../lib/portas/liquidacao";
import { listarEmpenhosDaExecucao } from "../../../../lib/portas/empenho";
import { FormAnular } from "../FormAnular";
import { dataBr, descreverRecorte, recorteDe } from "../../../../lib/recorte";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { FormLiquidacao, type EmpenhoLiquidavel } from "./FormLiquidacao";

/**
 * LIQUIDAÇÕES — o marco de exigibilidade (art. 141, caput), com o empenho de origem.
 *
 * ⚠️ O SELECT DE EMPENHOS SAI DA PORTA DE EMPENHO, e isso não é uma frente importando a
 * outra: é a mesma pergunta que a tela de empenhos faz ("quais empenhos, com que
 * saldos"), e a resposta tem UM dono. Uma segunda leitura própria daria à liquidação um
 * "saldo a liquidar" que poderia divergir do que a outra tela mostra.
 */
export const dynamic = "force-dynamic";

export default async function LiquidacoesPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const recorte = recorteDe(await searchParams);

  const cabecalho = (
    <PageHeader
      titulo="Liquidações"
      subtitulo={`${descreverRecorte(recorte)} — o marco de exigibilidade da despesa`}
    />
  );

  let liquidacoes: readonly LiquidacaoDaTela[];
  let liquidaveis: readonly EmpenhoLiquidavel[];
  try {
    const [lista, empenhos] = await Promise.all([
      listarLiquidacoesDaExecucao({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
      listarEmpenhosDaExecucao({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
    ]);
    liquidacoes = lista;
    // Só o que ainda tem o que liquidar — e o anulado sai fora: não há saldo num fato
    // que deixou de valer.
    liquidaveis = empenhos
      .filter((e) => !e.anulado && e.saldoALiquidar !== "0.00")
      .map((e) => ({
        id: e.id,
        numero: e.numero,
        credorCpfCnpj: e.credorCpfCnpj,
        saldoALiquidar: e.saldoALiquidar,
      }));
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler as liquidações"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A liquidação é o que <strong>põe a despesa na fila do art. 141</strong> — o saldo a pagar
        de cada uma é a sua posição na ordem cronológica.{" "}
        <strong>O responsável pelo atesto</strong> é obrigatório. A liquidação de{" "}
        <strong>material de consumo</strong>, que vira estoque, repercute na contabilidade
        patrimonial e é tratada no módulo de almoxarifado.
      </div>

      <FormLiquidacao empenhos={liquidaveis} />

      {liquidacoes.length === 0 ? (
        <EstadoVazio
          titulo="Sem liquidações"
          descricao={`Nenhuma liquidação em ${descreverRecorte(recorte).toLowerCase()}. Sem liquidação não há fila de pagamento: a ordem cronológica começa aqui.`}
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <BotaoCsv csv={csvLiquidacoes(liquidacoes)} nomeArquivo={`liquidacoes-${recorte.exercicio}.csv`} />
            <BotaoPdf href={`/despesa/liquidacoes/pdf?exercicio=${recorte.exercicio}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}`} />
          </div>
          <TabelaDeDados
            colunas={COLUNAS}
            linhas={liquidacoes}
            keyDe={(l) => l.id}
            legenda={`${liquidacoes.length} liquidação(ões) · valores em R$ · saldo a pagar = liquidado − pago.`}
          />
        </>
      )}
    </div>
  );
}

const COLUNAS: readonly ColunaTabela<LiquidacaoDaTela>[] = [
  {
    chave: "numero",
    cabecalho: "Nº",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.numero,
  },
  {
    chave: "data",
    cabecalho: "Data",
    alinhamento: "esquerda",
    largura: "6rem",
    celula: (l) => dataBr(l.data),
  },
  {
    chave: "empenho",
    cabecalho: "Empenho",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.empenhoNumero,
  },
  {
    chave: "credor",
    cabecalho: "Credor",
    alinhamento: "esquerda",
    largura: "11rem",
    celula: (l) => l.credorCpfCnpj,
  },
  {
    chave: "fonte",
    cabecalho: "Fonte",
    alinhamento: "esquerda",
    largura: "4rem",
    celula: (l) => l.fonteCodigo,
  },
  {
    chave: "atesto",
    cabecalho: "Atesto (responsável)",
    alinhamento: "esquerda",
    celula: (l) => l.responsavelAtesto,
  },
  {
    chave: "valor",
    cabecalho: "Liquidado",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.liquidadoLiquido} />,
  },
  {
    chave: "pago",
    cabecalho: "Pago",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.pago} />,
  },
  {
    chave: "aPagar",
    cabecalho: "A pagar",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.saldoAPagar} />,
  },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) =>
      l.anulado ? (
        <Badge status="erro">Anulada</Badge>
      ) : l.saldoAPagar === "0.00" ? (
        <Badge status="ok">Paga</Badge>
      ) : (
        <Badge status="alerta">Na fila</Badge>
      ),
  },
  {
    chave: "acoes",
    cabecalho: "Ações",
    alinhamento: "esquerda",
    largura: "7rem",
    // Só se anula o que ainda não foi pago. Estornável = nada pago (senão o pagamento ficaria órfão).
    celula: (l) =>
      l.saldoAPagar === "0.00" || l.anulado ? (
        <span className="text-xs text-[color:var(--color-ink-3)]">—</span>
      ) : (
        <FormAnular tipo="liquidacao" id={l.id} anulavelSaldo={l.saldoAPagar} estornavel={l.pago === "0.00"} />
      ),
  },
];

/** ⚠️ O CSV É A TELA (TR 7.48). */
function csvLiquidacoes(liquidacoes: readonly LiquidacaoDaTela[]): string {
  return paraCsv(
    ["Nº", "Data", "Empenho", "Credor", "Fonte", "Atesto", "Liquidado", "Pago", "A pagar", "Situação"],
    liquidacoes.map((l) => [
      l.numero, dataBr(l.data), l.empenhoNumero, l.credorCpfCnpj, l.fonteCodigo, l.responsavelAtesto,
      formatarMoeda(l.liquidadoLiquido).texto, formatarMoeda(l.pago).texto, formatarMoeda(l.saldoAPagar).texto,
      l.anulado ? "Anulada" : l.saldoAPagar === "0.00" ? "Paga" : "Na fila",
    ])
  );
}
