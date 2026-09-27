import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  atosDoResto,
  eventosConfigurados,
  lerRestoAPagar,
  PortaSemBancoError,
  type RestoAPagarDetalhe,
} from "../../../../../lib/portas/restos-a-pagar";
import { lerContasBancarias } from "../../../../../lib/portas/pagamento";
import {
  FormAnularCancelamento,
  FormAnularPagamento,
  FormCancelar,
  FormLiquidar,
  FormPagar,
} from "./AcoesDoResto";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { diaCivilBr } from "../../../../../packages/datas/index";

/** DETALHE de uma inscrição de restos a pagar. Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

const ROTULO_DO_TIPO: Record<RestoAPagarDetalhe["tipo"], string> = {
  PROCESSADO: "Processado",
  NAO_PROCESSADO: "Não processado",
};

const STATUS_DA_SITUACAO: Record<RestoAPagarDetalhe["situacao"], "ok" | "alerta" | "neutro"> = {
  "A PAGAR": "alerta",
  QUITADO: "ok",
  CANCELADO: "neutro",
};

export default async function RestoAPagarDetalhePage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_DESPESA");
  const { id } = await params;

  const voltar = (
    <Link className="text-sm underline hover:no-underline" href="/despesa/restos-a-pagar">
      Voltar aos restos a pagar
    </Link>
  );

  let dados: RestoAPagarDetalhe | null;
  try {
    dados = await lerRestoAPagar(id);
  } catch (erro) {
    return (
      <div>
        <PageHeader titulo="Resto a Pagar" acoes={voltar} />
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível consultar a inscrição"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (dados === null) {
    return (
      <div>
        <PageHeader titulo="Resto a Pagar" acoes={voltar} />
        <EstadoVazio titulo="Inscrição não encontrada" descricao="A inscrição de resto a pagar informada não existe." />
      </div>
    );
  }

  const d = dados;

  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Resto a Pagar — empenho ${d.empenhoNumero}`}
        subtitulo={`${ROTULO_DO_TIPO[d.tipo]} · exercício de origem ${d.exercicioOrigem}`}
        acoes={voltar}
      />
      <div>
        <Badge status={STATUS_DA_SITUACAO[d.situacao]}>{d.situacao}</Badge>
      </div>

      <TabelaDeDados
        colunas={COLUNAS_ORIGEM}
        linhas={[
          { rotulo: "Empenho", valor: d.empenhoNumero },
          { rotulo: "Data do empenho", valor: diaCivilBr(d.empenhoData) },
          { rotulo: "Valor do empenho", valor: d.empenhoValor, dinheiro: true },
          { rotulo: "Credor", valor: d.credorNome ?? d.credorCpfCnpj },
          { rotulo: "Documento do credor", valor: d.credorCpfCnpj },
          { rotulo: "Fonte de recursos", valor: `${d.fonteCodigo} — ${d.fonteDescricao}` },
          { rotulo: "Exercício de origem", valor: String(d.exercicioOrigem) },
          { rotulo: "Tipo", valor: ROTULO_DO_TIPO[d.tipo] },
        ]}
        keyDe={(l) => l.rotulo}
        legenda="Origem da inscrição"
      />

      {/* ⚠️ AS PERNAS BRUTAS ANTES DO LÍQUIDO — é o que torna o saldo auditável, e é por isso que
          estorno aparece como LINHA e não embutido. "Pago 400,00" esconde um pagamento de 500,00
          com estorno de 100,00, e as duas histórias têm consequências diferentes para o credor. */}
      <TabelaDeDados
        colunas={COLUNAS_COMPOSICAO}
        linhas={[
          { rotulo: "Valor inscrito", valor: d.valorInscrito, destaque: false },
          { rotulo: "Pago (bruto)", valor: d.pago, destaque: false },
          { rotulo: "Estorno de pagamento", valor: d.estornoDePagamento, destaque: false },
          { rotulo: "Pago líquido", valor: d.pagoLiquido, destaque: true },
          { rotulo: "Cancelado (bruto)", valor: d.cancelado, destaque: false },
          { rotulo: "Estorno de cancelamento", valor: d.estornoDeCancelamento, destaque: false },
          { rotulo: "Cancelado líquido", valor: d.canceladoLiquido, destaque: true },
          { rotulo: "Saldo a pagar", valor: d.saldo, destaque: true },
        ]}
        keyDe={(l) => l.rotulo}
        ehTotal={(l) => l.destaque}
        legenda="Composição do saldo — valores em R$ · líquido = bruto − estorno · saldo = inscrito − pago líquido − cancelado líquido"
      />

      <AcoesDaInscricao d={d} />
    </div>
  );
}

interface LinhaOrigem {
  readonly rotulo: string;
  readonly valor: string;
  readonly dinheiro?: boolean;
}
const COLUNAS_ORIGEM: readonly ColunaTabela<LinhaOrigem>[] = [
  { chave: "rotulo", cabecalho: "Campo", celula: (l) => l.rotulo },
  {
    chave: "valor",
    cabecalho: "Valor",
    celula: (l) => (l.dinheiro === true ? <ValorMonetario valor={l.valor} /> : l.valor),
  },
];

interface LinhaComposicao {
  readonly rotulo: string;
  readonly valor: string;
  readonly destaque: boolean;
}
const COLUNAS_COMPOSICAO: readonly ColunaTabela<LinhaComposicao>[] = [
  { chave: "rotulo", cabecalho: "Composição", celula: (l) => l.rotulo },
  { chave: "valor", cabecalho: "Valor", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valor} /> },
];

/**
 * AS OPERAÇÕES DESTA INSCRIÇÃO (V15).
 *
 * ⚠️ O QUE ESTE BLOCO SUBSTITUIU. Até a V14 aqui havia um aviso dizendo que as ações "ainda não
 * estão disponíveis" porque a contabilização precisava ser configurada — e era verdade: não havia
 * onde configurá-la. Agora há, e o aviso só permanece para a operação que SEGUE sem contas, com o
 * caminho para resolvê-la.
 *
 * ⚠️ ELEGIBILIDADE PELO DADO, PROTEÇÃO NO SERVIDOR. Liquidar só aparece em resto NÃO processado;
 * anular só aparece onde há ato a anular. Mas cada ação cobra a sua permissão no servidor e o
 * domínio cobra o saldo dentro da transação — o que a tela decide é o que faz sentido oferecer,
 * nunca quem pode fazer.
 */
async function AcoesDaInscricao({
  d,
}: {
  readonly d: RestoAPagarDetalhe;
}): Promise<React.ReactElement> {
  const [atos, configurados, contas] = await Promise.all([
    atosDoResto(d.inscricaoId),
    eventosConfigurados(),
    lerContasBancarias(),
  ]);

  // Operação ausente da configuração conta como NÃO configurada — fail-closed também na leitura
  // da tela, para não avisar que algo está pronto quando a operação vai ser recusada.
  const configurado = (evento: string): boolean => configurados.includes(evento);

  const eventoDoCancelamento =
    d.tipo === "PROCESSADO" ? "CANCELAMENTO_PROCESSADO" : "CANCELAMENTO_NAO_PROCESSADO";

  const pendentes = [
    d.tipo === "NAO_PROCESSADO" && !configurado("LIQUIDACAO_NAO_PROCESSADO") ? "liquidação" : null,
    !configurado("PAGAMENTO") ? "pagamento" : null,
    !configurado(eventoDoCancelamento) ? "cancelamento" : null,
  ].filter((x): x is string => x !== null);

  const pagamentosAnulaveis = atos.pagamentos.filter((a) => !a.ehAnulacao && !a.anulado);
  const cancelamentosAnulaveis = atos.cancelamentos.filter((a) => !a.ehAnulacao && !a.anulado);

  return (
    <div className="mt-8 grid gap-4">
      <h2 className="text-base font-semibold text-[color:var(--color-ink)]">Operações</h2>

      {pendentes.length > 0 ? (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {pendentes.length === 1
            ? `A ${pendentes[0]} ainda não tem contas informadas e será recusada.`
            : `Estas operações ainda não têm contas informadas e serão recusadas: ${pendentes.join(", ")}.`}{" "}
          <Link className="underline hover:no-underline" href="/contabilidade/roteiros-de-restos-a-pagar">
            Informar as contas das operações de restos a pagar
          </Link>
          .
        </p>
      ) : null}

      {d.tipo === "NAO_PROCESSADO" ? (
        <FormLiquidar empenhoId={d.empenhoId} inscricaoId={d.inscricaoId} />
      ) : null}

      <FormPagar
        contas={contas.map((c) => ({
          codigo: c.codigo,
          descricao: c.descricao,
          fonteId: c.fonteId,
          fonteCodigo: c.fonteCodigo,
        }))}
        inscricaoId={d.inscricaoId}
        liquidacoes={atos.liquidacoes.map((l) => ({ id: l.id, numero: l.numero, valor: l.valor }))}
      />

      <FormCancelar inscricaoId={d.inscricaoId} />

      {pagamentosAnulaveis.length > 0 ? (
        <FormAnularPagamento
          atos={pagamentosAnulaveis.map((a) => ({ id: a.id, rotulo: a.rotulo, valor: a.valor }))}
          inscricaoId={d.inscricaoId}
        />
      ) : null}

      {cancelamentosAnulaveis.length > 0 ? (
        <FormAnularCancelamento
          atos={cancelamentosAnulaveis.map((a) => ({ id: a.id, rotulo: a.rotulo, valor: a.valor }))}
          inscricaoId={d.inscricaoId}
        />
      ) : null}
    </div>
  );
}
