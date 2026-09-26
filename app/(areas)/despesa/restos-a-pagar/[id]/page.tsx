import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  lerRestoAPagar,
  PortaSemBancoError,
  type RestoAPagarDetalhe,
} from "../../../../../lib/portas/restos-a-pagar";
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

      <EstadoVazio
        titulo="Ações desta inscrição ainda não disponíveis"
        descricao="Liquidar, pagar, cancelar e estornar dependem da contabilização destas operações estar configurada. Configure a contabilização dos restos a pagar para habilitá-las."
      />
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
