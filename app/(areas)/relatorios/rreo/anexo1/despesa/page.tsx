import { BotaoCsvDasTabelas } from "../../../../../../components/ui/BotaoCsvDasTabelas";
import { EstadoVazio } from "../../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../../../components/ui/ValorMonetario";
import { telaExigeLeituraDoEnte } from "../../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../../lib/portas/mensagem-do-erro";
import { lerDocumentosDaDespesaDoAnexo1, PortaSemBancoError, type DocumentoDaDespesaRreo } from "../../../../../../lib/portas/rreo";
import { formatarDocumento } from "../../../../../../packages/documento/index";
import { diaCivilBr } from "../../../../../../packages/datas/index";

/**
 * V37 — A DESPESA DO ANEXO 1 ATÉ OS DOCUMENTOS: os empenhos (ou as liquidações) de uma linha da despesa no recorte da
 * coluna clicada, cada um com o que soma na célula. O total da lista é o valor do Anexo (mesma ficha, mesma janela, a
 * anulação só conta dentro do recorte). Só leitura.
 */
export const dynamic = "force-dynamic";

const GRUPOS: Record<string, string> = {
  "1": "Pessoal e encargos sociais",
  "2": "Juros e encargos da dívida",
  "3": "Outras despesas correntes",
  "4": "Investimentos",
  "5": "Inversões financeiras",
  "6": "Amortização da dívida",
  "9": "Reserva de contingência",
};
const CATEGORIAS: Record<string, string> = { "3": "Despesas correntes", "4": "Despesas de capital", "9": "Reserva de contingência" };

const um = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function DespesaDoAnexo1Page({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_RELATORIOS");
  const sp = await searchParams;
  const exercicio = Number.parseInt(um(sp["exercicio"]), 10);
  const b = Number.parseInt(um(sp["bimestre"]), 10);
  const categoria = um(sp["categoria"]);
  const grupoBruto = um(sp["grupo"]);
  const estagio = um(sp["estagio"]);
  const recorte = um(sp["recorte"]);
  const voltar = `/relatorios/rreo/anexo1?exercicio=${String(exercicio)}&bimestre=${String(b)}`;
  const cabecalho = <PageHeader titulo="RREO — Anexo 1 · Documentos da despesa" subtitulo="Os empenhos e as liquidações que compõem o valor do Anexo" acoes={<BotaoCsvDasTabelas nomeArquivo="rreo-anexo1-despesa.csv" />} />;

  const valido =
    Number.isInteger(exercicio) && exercicio >= 2000 && exercicio <= 2100 &&
    [1, 2, 3, 4, 5, 6].includes(b) && /^[0-9]$/.test(categoria) && (grupoBruto === "" || /^[0-9]$/.test(grupoBruto)) &&
    (estagio === "empenhada" || estagio === "liquidada") && (recorte === "bimestre" || recorte === "ate");
  if (!valido) {
    return <div>{cabecalho}<EstadoVazio titulo="Recorte inválido" descricao="Abra esta lista a partir de um valor da despesa no Anexo 1." /></div>;
  }
  const grupo = grupoBruto === "" ? null : grupoBruto;
  const bimestre = b as 1 | 2 | 3 | 4 | 5 | 6;

  let r: { readonly documentos: readonly DocumentoDaDespesaRreo[]; readonly total: string };
  try {
    r = await lerDocumentosDaDespesaDoAnexo1({ exercicio, bimestre, categoria, grupo, estagio, recorte });
  } catch (erro) {
    return <div>{cabecalho}<EstadoVazio titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível ler os documentos"} descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} /></div>;
  }

  const linha = grupo === null ? (CATEGORIAS[categoria] ?? `Categoria ${categoria}`) : `${CATEGORIAS[categoria] ?? `Categoria ${categoria}`}, ${GRUPOS[grupo] ?? `grupo ${grupo}`}`;
  const periodo = recorte === "bimestre" ? `no ${String(bimestre)}º bimestre de ${String(exercicio)}` : `de janeiro até o fim do ${String(bimestre)}º bimestre de ${String(exercicio)}`;
  const liquidacao = estagio === "liquidada";

  const colunas: readonly ColunaTabela<DocumentoDaDespesaRreo>[] = [
    { chave: "doc", cabecalho: liquidacao ? "Liquidação" : "Empenho", alinhamento: "esquerda", celula: (d) => (d.id === "" ? "Total" : <a href={`/despesa/empenhos/${d.empenhoId}`} className="underline decoration-dotted underline-offset-2">{d.numero}</a>) },
    ...(liquidacao ? [{ chave: "ne", cabecalho: "Empenho", alinhamento: "esquerda" as const, celula: (d: DocumentoDaDespesaRreo) => d.numeroDoEmpenho }] : []),
    { chave: "data", cabecalho: "Data", alinhamento: "esquerda", largura: "7rem", celula: (d) => (d.id === "" ? "" : diaCivilBr(d.data)) },
    { chave: "nat", cabecalho: "Natureza", alinhamento: "esquerda", largura: "6rem", celula: (d) => d.naturezaCodigo },
    { chave: "credor", cabecalho: "Credor", alinhamento: "esquerda", celula: (d) => (d.credorCpfCnpj === "" ? "" : formatarDocumento(d.credorCpfCnpj)) },
    { chave: "valor", cabecalho: "Valor do documento", alinhamento: "direita", largura: "9rem", celula: (d) => (d.id === "" ? "" : <ValorMonetario valor={d.valor} />) },
    { chave: "anulado", cabecalho: "Anulado no período", alinhamento: "direita", largura: "9rem", celula: (d) => (d.id === "" ? "" : <ValorMonetario valor={d.anulado} />) },
    { chave: "liquido", cabecalho: "Soma no Anexo", alinhamento: "direita", largura: "9rem", celula: (d) => <ValorMonetario valor={d.liquido} /> },
  ];
  const total: DocumentoDaDespesaRreo = { id: "", empenhoId: "", numero: "", numeroDoEmpenho: "", data: new Date(0), credorCpfCnpj: "", naturezaCodigo: "", valor: "", anulado: "", liquido: r.total };

  return (
    <div className="space-y-4">
      {cabecalho}
      <p data-recorte-da-lista className="text-sm text-[color:var(--color-ink-2)]">
        {liquidacao ? "Despesa liquidada" : "Despesa empenhada"} de {linha}, {periodo}. Uma anulação só reduz o documento quando acontece no mesmo período.{" "}
        <a href={voltar} className="font-medium text-[color:var(--color-primary)] hover:underline">Voltar ao Anexo 1</a>
      </p>
      {r.documentos.length === 0 ? (
        <EstadoVazio titulo="Nenhum documento no período" descricao="O valor desta célula no Anexo é zero." />
      ) : (
        <TabelaDeDados<DocumentoDaDespesaRreo>
          colunas={colunas}
          linhas={[...r.documentos, total]}
          keyDe={(d, i) => `${d.id}-${String(i)}`}
          ehTotal={(d) => d.id === ""}
          legenda={`${String(r.documentos.length)} documento(s). O total é o valor da célula do Anexo 1.`}
        />
      )}
    </div>
  );
}
