import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { lerDebitosDosCredores } from "../../../../lib/portas/debitos-do-credor";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import {
  TabelaDeDados,
  type ColunaTabela,
} from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  empenhoEhDeMaterial,
  listarLiquidacoesDaExecucao,
  opcoesDasEntradasDeMaterial,
  notasDasLiquidacoes,
  PortaSemBancoError,
  type LiquidacaoDaTela,
  type NotaDaLiquidacao,
  type OpcoesDasEntradasDeMaterial,
} from "../../../../lib/portas/liquidacao";
import { listarEmpenhosDaExecucao, nomesDosCredores, proximoNumeroDeDocumento } from "../../../../lib/portas/empenho";
import { EXTENSOES_ACEITAS, lerAnexosDasLiquidacoes, TAMANHO_MAXIMO_BYTES, type AnexoNaLista } from "../../../../lib/portas/documentos";
import { BotaoExcel } from "../../../../components/ui/BotaoExcel";
import { BotaoImprimir } from "../../../../components/ui/BotaoImprimir";
import { JanelaDeDetalhe } from "../../../../components/ui/JanelaDeDetalhe";
import { formatarDocumento } from "../../../../packages/documento/index";
import { ResumoDaLiquidacao, SituacaoDaLiquidacao } from "./ResumoDaLiquidacao";
import { FormAnular } from "../FormAnular";
import {
  EscopoDeLeituraError,
  ExercicioIlegivelError,
  recorteDePagina,
  type RecorteDaPagina,
} from "../../../../lib/portas/contexto";
import { dataBr, descreverRecorte } from "../../../../lib/recorte";
import { BotaoCsv } from "../../../../components/ui/BotaoCsv";
import { BotaoPdf } from "../../../../components/ui/BotaoPdf";
import { paraCsv } from "../../../../lib/csv/csv";
import { formatarMoeda } from "../../../../lib/format/moeda";
import { FormLiquidacao, type EmpenhoLiquidavel } from "./FormLiquidacao";
import { documentosConferidosParaLiquidar } from "../../../../lib/portas/recursos/documentos-fiscais-dados";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
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
  const sp = await searchParams;

  // ⚠️ O RECORTE VEM AUTORIZADO e a chamada está DENTRO do try: ela pode RECUSAR. E o
  // cabeçalho ficou para DEPOIS, porque ele imprime `descreverRecorte(recorte)` — montá-lo
  // antes afirmaria "consolidado (ente)" na tela de quem acabou de ser recusado.
  let recorte: RecorteDaPagina;
  let liquidacoes: readonly LiquidacaoDaTela[];
  let liquidaveis: readonly EmpenhoLiquidavel[];
  let opcoesDeMaterial: OpcoesDasEntradasDeMaterial;
  let documentos: readonly { readonly id: string; readonly rotulo: string }[];
  let extras: Extras;
  let numeroSugerido = "";
  let debitos: Awaited<ReturnType<typeof lerDebitosDosCredores>> = {};
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    // V37 — o próximo número livre do exercício, já no campo (só lê; o numerador continua conferindo na gravação).
    numeroSugerido = await proximoNumeroDeDocumento(recorte.exercicio);
    const [lista, empenhos, opcoes, docs] = await Promise.all([
      listarLiquidacoesDaExecucao({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
      listarEmpenhosDaExecucao({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
      opcoesDasEntradasDeMaterial(),
      documentosConferidosParaLiquidar(),
    ]);
    // V36 — o recorte das despesas realizadas sem empenho prévio.
    liquidacoes = sp["semEmpenhoPrevio"] === "1" ? lista.filter((l) => l.despesaSemEmpenhoPrevio) : lista;
    const ids = liquidacoes.map((l) => l.id);
    const [nomes, notas, anexos] = await Promise.all([
      nomesDosCredores(liquidacoes.map((l) => l.credorCpfCnpj)),
      notasDasLiquidacoes(ids),
      lerAnexosDasLiquidacoes(ids),
    ]);
    extras = { nomes, notas, anexos };
    opcoesDeMaterial = opcoes;
    documentos = docs;
    // Só o que ainda tem o que liquidar — e o anulado sai fora: não há saldo num fato
    // que deixou de valer.
    liquidaveis = empenhos
      .filter((e) => !e.anulado && e.saldoALiquidar !== "0.00")
      .map((e) => ({
        id: e.id,
        numero: e.numero,
        credorCpfCnpj: e.credorCpfCnpj,
        saldoALiquidar: e.saldoALiquidar,
        // V4 (§6): material de consumo (elemento que debita estoque) liquida COM as entradas no almoxarifado.
        ehMaterial: empenhoEhDeMaterial(e.naturezaCodigo),
        naturezaCodigo: e.naturezaCodigo,
      }));
    // V36 (TR 5.10.1.38) — o aviso de débito do credor, para os credores da lista de liquidáveis.
    debitos = await lerDebitosDosCredores(liquidaveis.map((e) => e.credorCpfCnpj));
  } catch (erro) {
    // ⚠️ A RECUSA DE ACESSO TEM TÍTULO PRÓPRIO: o genérico faria o servidor procurar
    // defeito no sistema quando o que falta é escopo — e a mensagem do erro já diz quem
    // resolve.
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Liquidações" subtitulo="Verificação do direito do credor (Lei 4.320/64, art. 63)" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Serviço indisponível"
                  : "Não foi possível carregar as liquidações"
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
        titulo="Liquidações"
        subtitulo={`${descreverRecorte(recorte)}: verificação do direito do credor (Lei 4.320/64, art. 63)`}
      />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Cada liquidação passa a integrar a <strong>ordem cronológica de pagamentos</strong> (Lei
        14.133/2021, art. 141). O <strong>responsável pelo atesto</strong> é obrigatório. A liquidação
        de <strong>material de consumo</strong> registra também as entradas no almoxarifado.
      </div>

      <FormLiquidacao empenhos={liquidaveis} opcoesDeMaterial={opcoesDeMaterial} documentos={documentos} empenhoInicial={typeof sp["empenho"] === "string" ? sp["empenho"] : undefined} numeroSugerido={numeroSugerido} debitos={debitos} />

      <nav aria-label="Recorte das liquidações" className="flex gap-3 text-xs" data-recorte-sem-empenho>
        {sp["semEmpenhoPrevio"] === "1" ? (
          <>
            <a className="underline" href={`/despesa/liquidacoes?exercicio=${recorte.exercicio}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}`}>Todas as liquidações</a>
            <span className="font-semibold">Só as despesas sem empenho prévio</span>
          </>
        ) : (
          <>
            <span className="font-semibold">Todas as liquidações</span>
            <a className="underline" href={`/despesa/liquidacoes?exercicio=${recorte.exercicio}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}&semEmpenhoPrevio=1`}>Só as despesas sem empenho prévio</a>
          </>
        )}
      </nav>

      {liquidacoes.length === 0 ? (
        <EstadoVazio
          titulo="Sem liquidações"
          descricao={`Nenhuma liquidação registrada em ${descreverRecorte(recorte).toLowerCase()}.`}
        />
      ) : (
        <>
          <div className="flex justify-end gap-2">
            <BotaoCsv csv={csvLiquidacoes(liquidacoes)} nomeArquivo={`liquidacoes-${recorte.exercicio}.csv`} />
            <BotaoExcel href={`/despesa/liquidacoes/xlsx?exercicio=${recorte.exercicio}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}`} />
            <BotaoPdf href={`/despesa/liquidacoes/pdf?exercicio=${recorte.exercicio}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}`} />
            <BotaoImprimir rotulo="Imprimir lista" />
          </div>
          <TabelaDeDados
            colunas={colunas({ ...extras, numeroSugerido })}
            linhas={liquidacoes}
            keyDe={(l) => l.id}
            legenda={`${liquidacoes.length} liquidação(ões) · valores em R$ · saldo a pagar = liquidado − pago.`}
          />
        </>
      )}
    </div>
  );
}

interface Extras {
  readonly nomes: ReadonlyMap<string, string>;
  readonly notas: ReadonlyMap<string, NotaDaLiquidacao>;
  readonly anexos: ReadonlyMap<string, readonly AnexoNaLista[]>;
  /** V37 — o próximo número livre, para a anulação da linha. */
  readonly numeroSugerido?: string;
}

/**
 * V22 — o número abre a liquidação por cima da lista (nota fiscal, valores, comprovantes e o envio
 * do comprovante do banco); a coluna de comprovantes diz quantos há, sem abrir.
 */
function colunas(x: Extras): readonly ColunaTabela<LiquidacaoDaTela>[] {
  return [
  {
    chave: "numero",
    cabecalho: "Nº",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => (
      <JanelaDeDetalhe
        gatilho={l.numero}
        rotuloDoGatilho={`Abrir a liquidação ${l.numero}`}
        titulo={`Liquidação ${l.numero}`}
        subtitulo={`${dataBr(l.data)} · empenho ${l.empenhoNumero} · fonte ${l.fonteCodigo}`}
      >
        <ResumoDaLiquidacao
          l={l}
          credorNome={x.nomes.get(l.credorCpfCnpj) ?? null}
          nota={x.notas.get(l.id)}
          anexos={x.anexos.get(l.id) ?? []}
          aceitos={EXTENSOES_ACEITAS}
          tamanhoMaximoBytes={TAMANHO_MAXIMO_BYTES}
        />
      </JanelaDeDetalhe>
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
    celula: (l) => {
      const nome = x.nomes.get(l.credorCpfCnpj);
      return (
        <span className="block min-w-0">
          {nome !== undefined ? <span className="block truncate text-[color:var(--color-ink)]" title={nome}>{nome}</span> : null}
          <span className="block text-[11px] text-[color:var(--color-ink-3)]">{formatarDocumento(l.credorCpfCnpj)}</span>
        </span>
      );
    },
  },
  {
    chave: "comprovantes",
    cabecalho: "Comprovantes",
    alinhamento: "esquerda",
    largura: "7rem",
    celula: (l) => {
      const n = (x.anexos.get(l.id) ?? []).length;
      return n === 0 ? <span className="text-xs text-[color:var(--color-ink-3)]">nenhum</span> : <span className="text-xs font-medium text-[color:var(--color-ink)]">{n} anexo{n > 1 ? "s" : ""}</span>;
    },
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
    celula: (l) => <SituacaoDaLiquidacao l={l} />,
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
        <FormAnular tipo="liquidacao" id={l.id} anulavelSaldo={l.saldoAPagar} estornavel={l.pago === "0.00"} numeroSugerido={x.numeroSugerido} />
      ),
  },
  ];
}

/** ⚠️ O CSV É A TELA (TR 7.48). */
function csvLiquidacoes(liquidacoes: readonly LiquidacaoDaTela[]): string {
  return paraCsv(
    ["Nº", "Data", "Empenho", "Credor", "Fonte", "Atesto", "Liquidado", "Pago", "A pagar", "Situação", "Sem empenho prévio"],
    liquidacoes.map((l) => [
      l.numero, dataBr(l.data), l.empenhoNumero, l.credorCpfCnpj, l.fonteCodigo, l.responsavelAtesto,
      formatarMoeda(l.liquidadoLiquido).texto, formatarMoeda(l.pago).texto, formatarMoeda(l.saldoAPagar).texto,
      l.anulado ? "Anulada" : l.saldoAPagar === "0.00" ? "Paga" : "Na fila",
      l.despesaSemEmpenhoPrevio ? "Sim" : "Não",
    ])
  );
}
