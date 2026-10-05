import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { lerApuracoesDoAjusteDePerdas, type ApuracaoNaLista } from "../../../../../lib/portas/ajuste-de-perdas";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { anoCivil, diaCivil } from "../../../../../packages/datas/index";
import { FormApuracao, FormPercentual } from "./Formularios";

/**
 * V35 — AJUSTE PARA PERDAS DA DÍVIDA ATIVA (MCASP 11ª ed., Parte III, 5.2.5). O ente declara o percentual de perda
 * esperada e a metodologia; a apuração lança só a diferença para o saldo da conta redutora. Server Component.
 */
export const dynamic = "force-dynamic";

const COLUNAS: readonly ColunaTabela<ApuracaoNaLista>[] = [
  { chave: "corte", cabecalho: "Corte", celula: (l) => l.corte.split("-").reverse().join("/") },
  { chave: "origem", cabecalho: "Origem", celula: (l) => (l.origem === "TRIBUTARIA" ? "Tributária" : "Não tributária") },
  { chave: "saldo", cabecalho: "Saldo da dívida ativa", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldoDaDividaAtiva} /> },
  { chave: "percentual", cabecalho: "Perda esperada", alinhamento: "direita", celula: (l) => `${l.percentual.replace(/0+$/, "").replace(/\.$/, "").replace(".", ",")}%` },
  { chave: "esperado", cabecalho: "Ajuste esperado", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.ajusteEsperado} /> },
  { chave: "anterior", cabecalho: "Saldo anterior da conta", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldoAnterior} /> },
  { chave: "diferenca", cabecalho: "Lançado", alinhamento: "direita", celula: (l) => (l.lancou ? <ValorMonetario valor={l.diferenca} /> : "nada a lançar") },
  { chave: "metodologia", cabecalho: "Metodologia", celula: (l) => l.metodologia },
];

export default async function AjusteDePerdasPage(): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_DIVIDA");
  const [apuracoes, permitidas] = await Promise.all([lerApuracoesDoAjusteDePerdas(), acoesPermitidas(["ATUALIZAR_DIVIDA_ATIVA"])]);
  const hoje = new Date();
  const podeEscrever = permitidas.has("ATUALIZAR_DIVIDA_ATIVA");
  return (
    <div className="space-y-4">
      <PageHeader
        titulo="Ajuste para perdas da dívida ativa"
        subtitulo="Perda esperada declarada pelo município, com a metodologia; a apuração lança a diferença para o saldo da conta redutora"
      />
      {podeEscrever ? (
        <>
          <section aria-label="Percentual de perda esperada" className="space-y-2">
            <h2 className="text-sm font-semibold">Percentual de perda esperada</h2>
            <FormPercentual exercicio={anoCivil(hoje)} />
          </section>
          <section aria-label="Apuração" className="space-y-2">
            <h2 className="text-sm font-semibold">Apuração</h2>
            <FormApuracao corte={diaCivil(hoje)} />
          </section>
        </>
      ) : null}
      {apuracoes.length === 0 ? (
        <EstadoVazio titulo="Nenhuma apuração" descricao="O ajuste ainda não foi apurado. Declare o percentual do exercício e o roteiro em Contabilidade, Roteiros patrimoniais." />
      ) : (
        <TabelaDeDados colunas={COLUNAS} linhas={apuracoes} keyDe={(l) => l.id} legenda="Apurações — valores em R$" />
      )}
    </div>
  );
}
