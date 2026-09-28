import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  listarRestosAPagar,
  PortaSemBancoError,
  type RestoAPagarNaLista,
} from "../../../../lib/portas/restos-a-pagar";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { FiltroDosRestos } from "./FiltroDosRestos";
import { FormEncerramentoDoExercicio } from "./FormEncerramento";
import { EXERCICIO_PADRAO } from "../../../../lib/recorte";

/** RESTOS A PAGAR — posição por inscrição. Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

const ROTULO_DO_TIPO: Record<RestoAPagarNaLista["tipo"], string> = {
  PROCESSADO: "Processado",
  NAO_PROCESSADO: "Não processado",
};

const STATUS_DA_SITUACAO: Record<RestoAPagarNaLista["situacao"], "ok" | "alerta" | "neutro"> = {
  "A PAGAR": "alerta",
  QUITADO: "ok",
  CANCELADO: "neutro",
};

export default async function RestosAPagarPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_DESPESA");
  const sp = await searchParams;

  const exBruto = Array.isArray(sp["exercicio"]) ? sp["exercicio"][0] : sp["exercicio"];
  const exercicio = exBruto !== undefined && /^\d{4}$/.test(exBruto) ? Number(exBruto) : undefined;
  const tBruto = Array.isArray(sp["tipo"]) ? sp["tipo"][0] : sp["tipo"];
  const tipo = tBruto === "PROCESSADO" || tBruto === "NAO_PROCESSADO" ? tBruto : undefined;

  const cabecalho = (
    <PageHeader
      titulo="Restos a Pagar"
      subtitulo="Despesa inscrita de exercícios anteriores: inscrito, pago, cancelado e saldo por inscrição"
      acoes={<FiltroDosRestos exercicio={exercicio === undefined ? "" : String(exercicio)} tipo={tipo ?? ""} />}
    />
  );

  let linhas: readonly RestoAPagarNaLista[];
  try {
    linhas = await listarRestosAPagar({ exercicioOrigem: exercicio, tipo });
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível consultar os restos a pagar"}
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum resto a pagar no recorte"
          descricao="Restos a pagar são inscritos no encerramento do exercício. Não há inscrição para o exercício e o tipo selecionados."
        />
        {/* ⚠️ A LIMITAÇÃO APARECE AQUI TAMBÉM, e a primeira versão só a mostrava quando havia
            linha. Quem abrisse a tela sem inscrição nenhuma — que é o estado mais comum antes do
            primeiro encerramento — não ficava sabendo que as ações não estão disponíveis, nem o
            que pedir para habilitá-las. O percurso pegou isso. */}
        <AvisoDasAcoes />
        {/*
          ⚠️ O ENCERRAMENTO APARECE JUSTAMENTE NO VAZIO, e é aqui que ele é mais útil: antes do
          primeiro encerramento não existe inscrição nenhuma, e era exatamente essa a tela em que
          o operador não tinha como produzir a primeira. O serviço existia e só script o chamava.
        */}
        <FormEncerramentoDoExercicio exercicio={exercicio ?? EXERCICIO_PADRAO} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}
      <TabelaDeDados
        colunas={COLUNAS}
        linhas={linhas}
        keyDe={(l) => l.inscricaoId}
        legenda="Valores em R$ · pago e cancelado são líquidos de estorno · saldo = inscrito − pago − cancelado"
      />
      <AvisoDasAcoes />
      <FormEncerramentoDoExercicio exercicio={exercicio ?? EXERCICIO_PADRAO} />
    </div>
  );
}

/**
 * ⚠️ A LIMITAÇÃO DITA EM LINGUAGEM DE OPERAÇÃO, e não escondida nem disfarçada de botão.
 *
 * Liquidar, pagar, cancelar e estornar existem no domínio do M08 e já têm ação de autorização
 * própria no censo. O que falta é a CONTABILIZAÇÃO delas estar configurada — e sem ela a operação
 * não pode nascer. Oferecer o botão e falhar depois seria pior; omitir a frase seria pior ainda,
 * porque o operador não saberia o que pedir.
 */
function AvisoDasAcoes(): React.ReactElement {
  return (
    <EstadoVazio
      titulo="Ações desta tela ainda não disponíveis"
      descricao="Liquidar, pagar, cancelar e estornar restos a pagar dependem da contabilização destas operações estar configurada. Configure a contabilização dos restos a pagar para habilitá-las."
    />
  );
}

const COLUNAS: readonly ColunaTabela<RestoAPagarNaLista>[] = [
  {
    chave: "empenho",
    cabecalho: "Empenho",
    celula: (l) => (
      <Link className="underline hover:no-underline" href={`/despesa/restos-a-pagar/${l.inscricaoId}`}>
        {l.empenhoNumero}
      </Link>
    ),
  },
  { chave: "exercicioOrigem", cabecalho: "Exercício de origem", celula: (l) => String(l.exercicioOrigem) },
  { chave: "tipo", cabecalho: "Tipo", celula: (l) => ROTULO_DO_TIPO[l.tipo] },
  // O nome quando o credor está no cadastro; o documento quando não está. Nunca vazio calado.
  { chave: "credor", cabecalho: "Credor", celula: (l) => l.credorNome ?? l.credorCpfCnpj },
  { chave: "fonte", cabecalho: "Fonte", celula: (l) => `${l.fonteCodigo} — ${l.fonteDescricao}` },
  { chave: "situacao", cabecalho: "Situação", celula: (l) => <Badge status={STATUS_DA_SITUACAO[l.situacao]}>{l.situacao}</Badge> },
  { chave: "valorInscrito", cabecalho: "Inscrito", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valorInscrito} /> },
  { chave: "pagoLiquido", cabecalho: "Pago", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.pagoLiquido} /> },
  { chave: "canceladoLiquido", cabecalho: "Cancelado", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.canceladoLiquido} /> },
  { chave: "saldo", cabecalho: "Saldo", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];
