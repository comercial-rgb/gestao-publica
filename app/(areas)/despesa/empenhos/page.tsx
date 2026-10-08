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
  listarEmpenhosDaExecucao,
  listarFichasParaEmpenho,
  PortaSemBancoError,
  type EmpenhoDaTela,
  type FichaDaTela,
  proximoNumeroDeDocumento,
} from "../../../../lib/portas/empenho";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
} from "../../../../lib/portas/contexto";
import { dataBr, descreverRecorte, type RecorteDaPagina } from "../../../../lib/recorte";
import { FormEmpenho } from "./FormEmpenho";
import { podeUsarAtalhoDeCadastro } from "../../../../lib/portas/pessoas";
import { FormAnular } from "../FormAnular";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { BotaoExcel } from "../../../../components/ui/BotaoExcel";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { JanelaDeDetalhe } from "../../../../components/ui/JanelaDeDetalhe";
import { formatarDocumento } from "../../../../packages/documento/index";
import { ROTULO_STATUS_DO_EMPENHO as ROTULO_STATUS } from "./rotulos";
import { ResumoDoEmpenho, tomDoStatusDoEmpenho as tomDoStatus } from "./ResumoDoEmpenho";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
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
  // V37 — o credor que volta escolhido do atalho de cadastro, e se quem está aqui pode usar o atalho.
  const credorPadrao = typeof sp["credor"] === "string" && sp["credor"] !== "" ? sp["credor"].replace(/\D/g, "") : undefined;
  const podeCadastrarCredor = await podeUsarAtalhoDeCadastro();

  // ⚠️ O RECORTE VEM AUTORIZADO, e a chamada está DENTRO do try de propósito: ela pode
  // RECUSAR. Antes era `recorteDe(sp)` — parse puro, que aceitava qualquer `?ug=` e
  // entregava o ente inteiro quando o parâmetro faltava. Medido em
  // `test/caracterizacao/leitura-por-unidade.test.ts`.
  //
  // ⚠️ E O CABEÇALHO PASSOU PARA DEPOIS. Ele imprime `descreverRecorte(recorte)`, e um
  // recorte que ainda não foi autorizado não existe para ser descrito: montar o título
  // antes seria afirmar "consolidado (ente)" na tela de quem acabou de ser recusado.
  let recorte: RecorteDaPagina;
  let numeroSugerido = "";
  let empenhos: readonly EmpenhoDaTela[];
  let fichas: readonly FichaDaTela[];
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    // V37 — o próximo número livre do exercício, já no campo (só lê; o numerador continua conferindo na gravação).
    numeroSugerido = await proximoNumeroDeDocumento(recorte.exercicio);
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
                  ? "Serviço indisponível"
                  : "Não foi possível carregar os empenhos"
          }
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader
        titulo="Empenhos"
        subtitulo={`${descreverRecorte(recorte)}: empenhado, liquidado, pago e saldos`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O valor <strong>empenhado</strong> já desconta as anulações. O disponível exibido na ficha é
        indicativo: a suficiência de saldo é conferida no momento da emissão. Empenhos que dependem de
        autorização prévia são emitidos a partir das{" "}
        <a href={`/despesa/solicitacoes-de-empenho?${queryRecorte(recorte)}`} className="font-medium text-[color:var(--color-primary)] hover:underline">
          solicitações de empenho autorizadas
        </a>
        .
      </div>

      <FormEmpenho
        credorPadrao={credorPadrao}
        podeCadastrarCredor={podeCadastrarCredor}
        numeroSugerido={numeroSugerido}
        fichas={fichas.map((f) => ({
          id: f.id,
          numero: f.numero,
          fonteCodigo: f.fonteCodigo,
          naturezaCodigo: f.naturezaCodigo,
          naturezaDescricao: f.naturezaDescricao,
          unidade: `${f.unidadeCodigo} ${f.unidadeNome}`,
          classificacao: f.classificacao,
          saldoDisponivel: f.saldoDisponivel,
        }))}
        ordemPadrao={typeof sp["ordemId"] === "string" ? sp["ordemId"] : ""}
        solicitacaoPadrao={typeof sp["solicitacaoId"] === "string" ? sp["solicitacaoId"] : ""}
        reservaPadrao={typeof sp["reservaId"] === "string" ? sp["reservaId"] : ""}
      />

      {empenhos.length === 0 ? (
        <EstadoVazio
          titulo="Sem empenhos"
          descricao={`Nenhum empenho registrado em ${descreverRecorte(recorte).toLowerCase()}.`}
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <BotaoCsv csv={csvEmpenhos(empenhos)} nomeArquivo={`empenhos-${recorte.exercicio}.csv`} />
            <BotaoExcel href={`/despesa/empenhos/xlsx?${queryRecorte(recorte)}`} />
            <BotaoPdf href={`/despesa/empenhos/pdf?${queryRecorte(recorte)}`} />
            <BotaoImprimir rotulo="Imprimir lista" />
          </div>
          <TabelaDeDados
            colunas={[colunaNumero(recorte), ...COLUNAS, colunaAcoesEmpenho(recorte, numeroSugerido)]}
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
    ["Nº", "Data", "Credor", "CPF/CNPJ", "Ficha", "Fonte", "Empenhado", "Liquidado", "Pago", "A liquidar", "A pagar", "Anulações", "Status"],
    empenhos.map((e) => [
      e.numero, dataBr(e.data), e.credorNome ?? "", formatarDocumento(e.credorCpfCnpj), String(e.fichaNumero), e.fonteCodigo,
      formatarMoeda(e.empenhadoLiquido).texto, formatarMoeda(e.liquidado).texto, formatarMoeda(e.pago).texto,
      formatarMoeda(e.saldoALiquidar).texto, formatarMoeda(e.saldoAPagar).texto, formatarMoeda(e.anulacoes).texto,
      ROTULO_STATUS[e.status] ?? e.status,
    ])
  );
}

/** O status derivado, traduzido em tom — sóbrio, nunca o verde/vermelho do sinal contábil. */
const COLUNAS: readonly ColunaTabela<EmpenhoDaTela>[] = [
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
    largura: "14rem",
    // V22: o nome do cadastro quando o documento está lá; o documento sempre, formatado.
    celula: (l) => (
      <span className="block min-w-0">
        {l.credorNome !== null ? <span className="block truncate text-[color:var(--color-ink)]" title={l.credorNome}>{l.credorNome}</span> : null}
        <span className="block text-[11px] text-[color:var(--color-ink-3)]">{formatarDocumento(l.credorCpfCnpj)}</span>
      </span>
    ),
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
/**
 * O NÚMERO É A PORTA DO EMPENHO. A lista responde "o que aconteceu no exercício"; a pergunta
 * seguinte — "e com ESTE empenho?" — abre por cima da lista (V22), e dali o dossiê completo, a NE
 * e a impressão. É pelo número que o documento se chama na boca de quem confere.
 */
function colunaNumero(recorte: RecorteDaPagina): ColunaTabela<EmpenhoDaTela> {
  return {
    chave: "numero",
    cabecalho: "Nº",
    alinhamento: "esquerda",
    largura: "8rem",
    celula: (l) => (
      <JanelaDeDetalhe
        gatilho={l.numero}
        rotuloDoGatilho={`Abrir o empenho ${l.numero}`}
        titulo={`Empenho ${l.numero}`}
        subtitulo={`${dataBr(l.data)} · ficha ${l.fichaNumero} · fonte ${l.fonteCodigo}`}
      >
        <ResumoDoEmpenho e={l} queryRecorte={queryRecorte(recorte)} />
      </JanelaDeDetalhe>
    ),
  };
}

function queryRecorte(r: RecorteDaPagina): string {
  return `exercicio=${r.exercicio}${r.unidadeCodigo !== undefined ? `&ug=${r.unidadeCodigo}` : ""}`;
}

/** A coluna de AÇÕES: emitir a Nota de Empenho (F2) + anular (quando há saldo a liquidar). */
function colunaAcoesEmpenho(recorte: RecorteDaPagina, numeroSugerido: string): ColunaTabela<EmpenhoDaTela> {
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
          <FormAnular tipo="empenho" id={l.id} anulavelSaldo={l.saldoALiquidar} estornavel={l.liquidado === "0.00"} numeroSugerido={numeroSugerido} />
        )}
      </span>
    ),
  };
}
