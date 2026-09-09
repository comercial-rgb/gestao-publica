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
  lerContasBancarias,
  lerFilasDePagamento,
  PortaSemBancoError,
  type ContaBancariaDaTela,
  type GrupoDaFila,
  type LinhaDaFila,
} from "../../../../lib/portas/pagamento";
import { dataBr, descreverRecorte, recorteDe } from "../../../../lib/recorte";
import { FormPagamento, type LiquidacaoPagavel } from "./FormPagamento";
import { listarPagamentosDaExecucao, type PagamentoDaTela } from "../../../../lib/portas/anulacao";
import { FormAnular } from "../FormAnular";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";

/**
 * PAGAMENTOS — A FILA DO ART. 141 (ordem cronológica), por fonte × categoria (TR 5.29).
 *
 * ⚠️ A FILA NÃO TEM RECORTE POR EXERCÍCIO NEM POR UG, e isso é do art. 141, não desta tela.
 * A ordem é por FONTE e CATEGORIA DE CONTRATO: o credor de obras da fonte 500 disputa com os
 * outros credores de obras da fonte 500 — não com os de bens, nem com os da fonte 999, nem
 * "com os da Secretaria de Saúde". Recortar a fila por unidade a partiria em filas que a lei
 * não criou, e cada pedaço teria uma "posição 1" própria: quatro cabeças de fila onde a lei
 * quer uma. Por isso o seletor do cabeçalho não afeta esta página.
 *
 * ⚠️ SÓ LEITURA NESTA FATIA. Quando o pagamento nascer (pendência **7.2-roteiro-pcasp**), ele
 * chama `pagar()` do M05 com `justificativaQuebraOrdem` — nunca o M06 direto, para que a
 * justificativa e o pagamento sejam atômicos. O desenho está em `lib/portas/pagamento.ts`.
 */
export const dynamic = "force-dynamic";

const ROTULO_CATEGORIA: Record<string, string> = {
  FORNECIMENTO_BENS: "Fornecimento de bens",
  LOCACAO: "Locações",
  PRESTACAO_SERVICOS: "Prestação de serviços",
  REALIZACAO_OBRAS: "Realização de obras",
};

export default async function PagamentosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const recorte = recorteDe(await searchParams);
  const cabecalho = (
    <PageHeader
      titulo="Fila de Pagamentos"
      subtitulo="Ordem cronológica por fonte e categoria — Lei 14.133/2021, art. 141"
      acoes={<BotaoPdf href="/despesa/pagamentos/pdf" rotulo="Imprimir fila (PDF)" />}
    />
  );

  let filas: readonly GrupoDaFila[];
  let contas: readonly ContaBancariaDaTela[];
  let pagamentos: readonly PagamentoDaTela[];
  try {
    [filas, contas, pagamentos] = await Promise.all([
      lerFilasDePagamento(),
      lerContasBancarias(),
      // ⚠️ Os pagamentos EXECUTADOS (para anular, TR 5.35) — a fila mostra o que falta; esta lista, o
      // que já saiu. Esta SIM tem recorte por exercício/UG (diferente da fila do art. 141).
      listarPagamentosDaExecucao({ exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo }),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler a fila de pagamentos"
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
        Cada <strong>fonte × categoria</strong> é uma fila própria — elas não se disputam. A
        ordem é a <strong>data de liquidação</strong> (o marco de exigibilidade do caput), com
        desempate pelo número. Pagar fora da posição 1 exige{" "}
        <strong>justificativa prévia</strong> numa das cinco hipóteses taxativas do §1º; sem ela,
        o domínio recusa o pagamento — e é ele quem confere a posição, dentro da transação
        do pagamento, contra a fila de agora.
      </div>

      <FormPagamento
        liquidacoes={filas.flatMap((f) =>
          f.linhas.map(
            (l): LiquidacaoPagavel => ({
              liquidacaoId: l.liquidacaoId,
              posicao: l.posicao,
              numero: l.numero,
              credorCpfCnpj: l.credorCpfCnpj,
              saldoAPagar: l.saldoAPagar,
              fonteCodigo: f.fonteCodigo,
              categoria: f.categoria,
            })
          )
        )}
        contas={contas}
      />

      {filas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma fila aberta"
          descricao="Não há liquidação com saldo a pagar. A fila do art. 141 é derivada: ela existe enquanto houver despesa liquidada e não paga."
        />
      ) : (
        filas.map((f) => (
          <section key={`${f.fonteCodigo}|${f.categoria}`} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
                Fonte {f.fonteCodigo} ·{" "}
                {ROTULO_CATEGORIA[f.categoria] ?? f.categoria}
              </h2>
              <span className="text-xs text-[color:var(--color-ink-2)]">
                {f.linhas.length} na fila · total{" "}
                <ValorMonetario valor={f.total} />
              </span>
            </div>
            <TabelaDeDados
              colunas={COLUNAS}
              linhas={f.linhas}
              keyDe={(l) => l.liquidacaoId}
              legenda={`Ordem cronológica da fonte ${f.fonteCodigo} — ${ROTULO_CATEGORIA[f.categoria] ?? f.categoria}. Pagar fora da posição 1 exige justificativa (§1º).`}
            />
          </section>
        ))
      )}

      {/* ⚠️ PAGAMENTOS EXECUTADOS — a outra pergunta: o que já saiu, para poder anular (TR 5.35). */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
          Pagamentos executados — {descreverRecorte(recorte).toLowerCase()}
        </h2>
        {pagamentos.length === 0 ? (
          <EstadoVazio
            titulo="Nenhum pagamento executado"
            descricao="Não há pagamento neste recorte. Assim que a fila for paga, os pagamentos aparecem aqui — e é daqui que se anula um cheque emitido por engano."
          />
        ) : (
          <>
            <div className="flex justify-end">
              <BotaoCsv csv={csvPagamentos(pagamentos)} nomeArquivo={`pagamentos-${recorte.exercicio}.csv`} />
            </div>
            <TabelaDeDados
              colunas={COLUNAS_PAGAMENTOS}
              linhas={pagamentos}
              keyDe={(l) => l.id}
              legenda={`${pagamentos.length} pagamento(s) · valores em R$ · anular reduz (parcial) ou estorna (integral) o cheque.`}
            />
          </>
        )}
      </section>
    </div>
  );
}

/** ⚠️ O CSV É A TELA (TR 7.48). */
function csvPagamentos(pagamentos: readonly PagamentoDaTela[]): string {
  return paraCsv(
    ["Nº", "Data", "Liquidação", "Empenho", "Credor", "Fonte", "Pago (líquido)", "Situação"],
    pagamentos.map((p) => [
      p.numero, dataBr(p.data), p.liquidacaoNumero, p.empenhoNumero, p.credorCpfCnpj, p.fonteCodigo,
      formatarMoeda(p.pagoLiquido).texto, p.anulado ? "Anulado" : "Pago",
    ])
  );
}

const COLUNAS_PAGAMENTOS: readonly ColunaTabela<PagamentoDaTela>[] = [
  { chave: "numero", cabecalho: "Nº", alinhamento: "esquerda", largura: "7rem", celula: (l) => l.numero },
  { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "6rem", celula: (l) => dataBr(l.data) },
  { chave: "liquidacao", cabecalho: "Liquidação", alinhamento: "esquerda", largura: "7rem", celula: (l) => l.liquidacaoNumero },
  { chave: "empenho", cabecalho: "Empenho", alinhamento: "esquerda", largura: "7rem", celula: (l) => l.empenhoNumero },
  { chave: "credor", cabecalho: "Credor", alinhamento: "esquerda", largura: "11rem", celula: (l) => l.credorCpfCnpj },
  { chave: "fonte", cabecalho: "Fonte", alinhamento: "esquerda", largura: "4rem", celula: (l) => l.fonteCodigo },
  { chave: "valor", cabecalho: "Pago (líquido)", alinhamento: "direita", largura: "9rem", celula: (l) => <ValorMonetario valor={l.pagoLiquido} /> },
  {
    chave: "situacao",
    cabecalho: "Situação",
    alinhamento: "esquerda",
    largura: "6rem",
    celula: (l) => (l.anulado ? <Badge status="erro">Anulado</Badge> : <Badge status="ok">Pago</Badge>),
  },
  {
    chave: "acoes",
    cabecalho: "Ações",
    alinhamento: "esquerda",
    largura: "7rem",
    // Um pagamento não tem nível de baixo: é sempre estornável (só a parcial é barrada por retenção,
    // e aí o domínio manda anular o pagamento inteiro — a mensagem sobe intacta).
    celula: (l) =>
      l.pagoLiquido === "0.00" || l.anulado ? (
        <span className="text-xs text-[color:var(--color-ink-3)]">—</span>
      ) : (
        <FormAnular tipo="pagamento" id={l.id} anulavelSaldo={l.pagoLiquido} estornavel={true} />
      ),
  },
];

const COLUNAS: readonly ColunaTabela<LinhaDaFila>[] = [
  {
    chave: "posicao",
    cabecalho: "Pos.",
    alinhamento: "direita",
    largura: "3.5rem",
    celula: (l) =>
      l.posicao === 1 ? (
        // A cabeça da fila é a única que se paga sem justificar nada — e é a
        // informação mais importante da tela.
        <Badge status="ok">1</Badge>
      ) : (
        l.posicao
      ),
  },
  {
    chave: "liquidacao",
    cabecalho: "Liquidação",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => l.numero,
  },
  {
    chave: "data",
    cabecalho: "Liquidada em",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => dataBr(l.dataLiquidacao),
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
    chave: "historico",
    cabecalho: "Histórico",
    alinhamento: "esquerda",
    celula: (l) => l.historico,
  },
  {
    chave: "valor",
    cabecalho: "Valor liquidado",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.valorLiquidado} />,
  },
  {
    chave: "aPagar",
    cabecalho: "Saldo a pagar",
    alinhamento: "direita",
    largura: "9rem",
    celula: (l) => <ValorMonetario valor={l.saldoAPagar} />,
  },
];
