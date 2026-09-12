import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  listarEmpenhosDaExecucao,
  listarFichasParaEmpenho,
  PortaSemBancoError,
  type EmpenhoDaTela,
  type FichaDaTela,
} from "../../../../lib/portas/empenho";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
} from "../../../../lib/portas/contexto";
import { dataBr, descreverRecorte, type RecorteDaPagina } from "../../../../lib/recorte";
import { FormEmpenho } from "./FormEmpenho";
import { FormAnular } from "../FormAnular";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";

/**
 * EMPENHOS — a execução da despesa do exercício/unidade, com os saldos da TR 5.17.
 *
 * A emissão voltou na 7.3: a 7.1 a deixou de fora porque não havia roteiro contábil em
 * produção, e a 7.2 resolveu as duas pontas (roteiros no M01, plano no seed).
 */
export const dynamic = "force-dynamic";

export default async function EmpenhosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const sp = await searchParams;

  // ⚠️ O RECORTE VEM AUTORIZADO, e a chamada está DENTRO do try de propósito: ela pode
  // RECUSAR. Antes era `recorteDe(sp)` — parse puro, que aceitava qualquer `?ug=` e
  // entregava o ente inteiro quando o parâmetro faltava. Medido em
  // `test/caracterizacao/leitura-por-unidade.test.ts`.
  //
  // ⚠️ E O CABEÇALHO PASSOU PARA DEPOIS. Ele imprime `descreverRecorte(recorte)`, e um
  // recorte que ainda não foi autorizado não existe para ser descrito: montar o título
  // antes seria afirmar "consolidado (ente)" na tela de quem acabou de ser recusado.
  let recorte: RecorteDaPagina;
  let empenhos: readonly EmpenhoDaTela[];
  let fichas: readonly FichaDaTela[];
  try {
    recorte = await recorteDePagina(sp);
    [empenhos, fichas] = await Promise.all([
      listarEmpenhosDaExecucao({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
      listarFichasParaEmpenho({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
    ]);
  } catch (erro) {
    // ⚠️ A RECUSA DE ACESSO TEM TÍTULO PRÓPRIO, e isso não é estética. Cair no genérico
    // "não foi possível ler os empenhos" faria o servidor procurar defeito no sistema
    // quando o que falta é escopo — e a mensagem do erro já diz quem resolve. Dizer "sem
    // empenhos" seria pior ainda: a mentira mais cara que esta camada pode contar.
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Empenhos" subtitulo="Execução da despesa" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Banco de dados não configurado"
                  : "Não foi possível ler os empenhos"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Empenhos"
        subtitulo={`${descreverRecorte(recorte)} — empenhado, liquidado, pago e saldos`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O <strong>status</strong> e os saldos são <strong>derivados</strong> dos fatos — não há
        coluna de status no banco. <strong>Empenhado</strong> já vem líquido das anulações (a
        total zera; as parciais subtraem). O saldo mostrado na ficha é{" "}
        <strong>orientação</strong>: quem decide se cabe é o domínio, contra o saldo real,
        dentro da transação.
      </div>

      <FormEmpenho
        fichas={fichas.map((f) => ({
          id: f.id,
          numero: f.numero,
          fonteCodigo: f.fonteCodigo,
          naturezaCodigo: f.naturezaCodigo,
          naturezaDescricao: f.naturezaDescricao,
          saldoDisponivel: f.saldoDisponivel,
        }))}
      />

      {empenhos.length === 0 ? (
        <EstadoVazio
          titulo="Sem empenhos"
          descricao={`Nenhum empenho em ${descreverRecorte(recorte).toLowerCase()}. Ou o exercício não foi executado, ou a unidade selecionada não tem fichas.`}
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <BotaoCsv csv={csvEmpenhos(empenhos)} nomeArquivo={`empenhos-${recorte.exercicio}.csv`} />
            <BotaoPdf href={`/despesa/empenhos/pdf?${queryRecorte(recorte)}`} />
          </div>
          <TabelaDeDados
            colunas={[...COLUNAS, colunaAcoesEmpenho(recorte)]}
            linhas={empenhos}
            keyDe={(l) => l.id}
            legenda={`${empenhos.length} empenho(s) · valores em R$ · saldo a pagar = liquidado − pago.`}
          />
        </>
      )}
    </div>
  );
}

/** ⚠️ O CSV É A TELA: as mesmas colunas/linhas, formatadas igual (TR 7.48). */
function csvEmpenhos(empenhos: readonly EmpenhoDaTela[]): string {
  return paraCsv(
    ["Nº", "Data", "Credor", "Ficha", "Fonte", "Empenhado", "Liquidado", "Pago", "A liquidar", "A pagar", "Anulações", "Status"],
    empenhos.map((e) => [
      e.numero, dataBr(e.data), e.credorCpfCnpj, String(e.fichaNumero), e.fonteCodigo,
      formatarMoeda(e.empenhadoLiquido).texto, formatarMoeda(e.liquidado).texto, formatarMoeda(e.pago).texto,
      formatarMoeda(e.saldoALiquidar).texto, formatarMoeda(e.saldoAPagar).texto, formatarMoeda(e.anulacoes).texto,
      ROTULO_STATUS[e.status] ?? e.status,
    ])
  );
}

/** O status derivado, traduzido em tom — sóbrio, nunca o verde/vermelho do sinal contábil. */
function tomDoStatus(status: string): StatusBadge {
  if (status === "ANULADO") return "erro";
  if (status === "PAGO") return "ok";
  if (status === "EMPENHADO") return "neutro";
  return "alerta";
}

const ROTULO_STATUS: Record<string, string> = {
  EMPENHADO: "Empenhado",
  PARCIAL_LIQUIDADO: "Liq. parcial",
  LIQUIDADO: "Liquidado",
  PARCIAL_PAGO: "Pago parcial",
  PAGO: "Pago",
  ANULADO: "Anulado",
};

const COLUNAS: readonly ColunaTabela<EmpenhoDaTela>[] = [
  {
    chave: "numero",
    cabecalho: "Nº",
    alinhamento: "esquerda",
    largura: "7rem",
    // O NÚMERO É A PORTA DO DOSSIÊ. A lista responde "o que aconteceu no exercício"; a
    // pergunta seguinte — "e com ESTE empenho?" — tem tela própria, e o caminho até ela
    // é o número, que é como o documento se chama na boca de quem confere.
    celula: (l) => (
      <Link
        href={`/despesa/empenhos/${l.id}`}
        className="font-medium text-[color:var(--color-ink)] underline-offset-2 hover:underline"
      >
        {l.numero}
      </Link>
    ),
  },
  {
    chave: "data",
    cabecalho: "Data",
    alinhamento: "esquerda",
    largura: "6rem",
    celula: (l) => dataBr(l.data),
  },
  {
    chave: "credor",
    cabecalho: "Credor",
    alinhamento: "esquerda",
    largura: "11rem",
    celula: (l) => l.credorCpfCnpj,
  },
  {
    chave: "ficha",
    cabecalho: "Ficha",
    alinhamento: "direita",
    largura: "4rem",
    celula: (l) => l.fichaNumero,
  },
  {
    chave: "fonte",
    cabecalho: "Fonte",
    alinhamento: "esquerda",
    largura: "4rem",
    celula: (l) => l.fonteCodigo,
  },
  {
    chave: "empenhado",
    cabecalho: "Empenhado",
    alinhamento: "direita",
    largura: "8rem",
    celula: (l) => <ValorMonetario valor={l.empenhadoLiquido} />,
  },
  {
    chave: "liquidado",
    cabecalho: "Liquidado",
    alinhamento: "direita",
    largura: "8rem",
    celula: (l) => <ValorMonetario valor={l.liquidado} />,
  },
  {
    chave: "pago",
    cabecalho: "Pago",
    alinhamento: "direita",
    largura: "8rem",
    celula: (l) => <ValorMonetario valor={l.pago} />,
  },
  {
    chave: "aLiquidar",
    cabecalho: "A liquidar",
    alinhamento: "direita",
    largura: "8rem",
    celula: (l) => <ValorMonetario valor={l.saldoALiquidar} />,
  },
  {
    chave: "aPagar",
    cabecalho: "A pagar",
    alinhamento: "direita",
    largura: "8rem",
    celula: (l) => <ValorMonetario valor={l.saldoAPagar} />,
  },
  {
    chave: "anulacoes",
    cabecalho: "Anulações",
    alinhamento: "direita",
    largura: "8rem",
    celula: (l) => <ValorMonetario valor={l.anulacoes} />,
  },
  {
    chave: "status",
    cabecalho: "Status",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => (
      <Badge status={tomDoStatus(l.status)}>
        {ROTULO_STATUS[l.status] ?? l.status}
      </Badge>
    ),
  },
];

/** exercicio(+ug) da URL, para os links de emissão refletirem o recorte da tela. */
function queryRecorte(r: RecorteDaPagina): string {
  return `exercicio=${r.exercicio}${r.unidadeCodigo !== undefined ? `&ug=${r.unidadeCodigo}` : ""}`;
}

/** A coluna de AÇÕES: emitir a Nota de Empenho (F2) + anular (quando há saldo a liquidar). */
function colunaAcoesEmpenho(recorte: RecorteDaPagina): ColunaTabela<EmpenhoDaTela> {
  return {
    chave: "acoes",
    cabecalho: "Ações",
    alinhamento: "esquerda",
    largura: "9rem",
    // Todo empenho emite a sua NE. Só há o que anular se sobra saldo a liquidar; estornável = nada
    // liquidado ainda (senão a anulação total deixaria a liquidação órfã — e aí só a parcial).
    celula: (l) => (
      <span className="flex flex-wrap items-center gap-2">
        <a href={`/despesa/empenhos/ne?id=${l.id}&${queryRecorte(recorte)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-[color:var(--color-primary)] hover:underline">
          Emitir NE
        </a>
        {l.saldoALiquidar === "0.00" || l.anulado ? null : (
          <FormAnular tipo="empenho" id={l.id} anulavelSaldo={l.saldoALiquidar} estornavel={l.liquidado === "0.00"} />
        )}
      </span>
    ),
  };
}
