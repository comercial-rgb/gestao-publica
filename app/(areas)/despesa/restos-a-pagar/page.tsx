import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  lerApuracoesFeitas,
  listarRestosAPagar,
  PortaSemBancoError,
  type ApuracaoFeitaParaTela,
  type RestoAPagarNaLista,
} from "../../../../lib/portas/restos-a-pagar";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { FiltroDosRestos } from "./FiltroDosRestos";
import { FormApuracaoDoResultado, FormEncerramentoDoExercicio, FormEstornarApuracao } from "./FormEncerramento";
import { dataBr } from "../../../../lib/recorte";
import { listarEmpenhosDaExecucao } from "../../../../lib/portas/empenho";
import { formatarDocumento } from "../../../../packages/documento/index";
import { FormAnular } from "../FormAnular";
import { EXERCICIO_PADRAO } from "../../../../lib/recorte";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/** RESTOS A PAGAR — posição por inscrição. Server Component, força-dinâmica. */
export const dynamic = "force-dynamic";

const ROTULO_DO_TIPO: Record<RestoAPagarNaLista["tipo"], string> = {
  PROCESSADO: "Processado",
  NAO_PROCESSADO: "Não processado",
};

const ROTULO_DA_SITUACAO: Record<RestoAPagarNaLista["situacao"], string> = {
  "A PAGAR": "A pagar",
  QUITADO: "Quitado",
  CANCELADO: "Cancelado",
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
      subtitulo="Despesas inscritas de exercícios anteriores: inscrito, pago, cancelado e saldo"
      acoes={<FiltroDosRestos exercicio={exercicio === undefined ? "" : String(exercicio)} tipo={tipo ?? ""} />}
    />
  );

  let linhas: readonly RestoAPagarNaLista[];
  let apuracoes: readonly ApuracaoFeitaParaTela[];
  let permitidas: ReadonlySet<string>;
  try {
    [linhas, apuracoes, permitidas] = await Promise.all([
      listarRestosAPagar({ exercicioOrigem: exercicio, tipo }),
      lerApuracoesFeitas(),
      acoesPermitidas(["ENCERRAR_EXERCICIO", "APURAR_RESULTADO", "ESTORNAR_APURACAO", "ANULAR_EMPENHO_PARCIAL"]),
    ]);
  } catch (erro) {
    return (
      <div>
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Serviço indisponível" : "Não foi possível consultar os restos a pagar"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Nenhum resto a pagar encontrado"
          descricao="Os restos a pagar são inscritos no encerramento do exercício. Não há inscrição para o exercício e o tipo selecionados."
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
        <AtosDoEncerramento exercicio={exercicio ?? EXERCICIO_PADRAO} apuracoes={apuracoes} permitidas={permitidas} />
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
        legenda="Valores em R$ · pago e cancelado já descontam os estornos · saldo = inscrito − pago − cancelado"
      />
      <AvisoDasAcoes />
      <AtosDoEncerramento exercicio={exercicio ?? EXERCICIO_PADRAO} apuracoes={apuracoes} permitidas={permitidas} />
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
      titulo="Operações por inscrição"
      descricao="A liquidação, o pagamento, o cancelamento e o estorno de restos a pagar são registrados na página de cada inscrição, acessada pelo número do empenho. As contas contábeis dessas operações devem estar parametrizadas."
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
  { chave: "situacao", cabecalho: "Situação", celula: (l) => <Badge status={STATUS_DA_SITUACAO[l.situacao]}>{ROTULO_DA_SITUACAO[l.situacao]}</Badge> },
  { chave: "valorInscrito", cabecalho: "Inscrito", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.valorInscrito} /> },
  { chave: "pagoLiquido", cabecalho: "Pago", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.pagoLiquido} /> },
  { chave: "canceladoLiquido", cabecalho: "Cancelado", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.canceladoLiquido} /> },
  { chave: "saldo", cabecalho: "Saldo", alinhamento: "direita", celula: (l) => <ValorMonetario valor={l.saldo} /> },
];

/** O painel do estorno existe enquanto houver QUALQUER apuração — ver `FormEstornarApuracao`. */
/**
 * V33 — OS ATOS DO ENCERRAMENTO SÓ PARA QUEM PODE PRATICÁ-LOS. O servidor já recusava quem não tem a ação; o que
 * a tela fazia era oferecer ao contador, que lê e fecha o mês mas não encerra o exercício, um botão que sempre
 * falha. Quem não pode vê quem pode, em vez do botão. A recusa do servidor continua sendo a proteção.
 */
function AtosDoEncerramento({
  exercicio,
  apuracoes,
  permitidas,
}: {
  readonly exercicio: number;
  readonly apuracoes: readonly ApuracaoFeitaParaTela[];
  readonly permitidas: ReadonlySet<string>;
}): React.ReactElement {
  const nenhum = !permitidas.has("ENCERRAR_EXERCICIO") && !permitidas.has("APURAR_RESULTADO") && !permitidas.has("ESTORNAR_APURACAO");
  return (
    <>
      {permitidas.has("ENCERRAR_EXERCICIO") ? (
        <>
          <AntesDeEncerrar exercicio={exercicio} podeAnular={permitidas.has("ANULAR_EMPENHO_PARCIAL")} />
          <FormEncerramentoDoExercicio exercicio={exercicio} />
        </>
      ) : null}
      {permitidas.has("APURAR_RESULTADO") ? <FormApuracaoDoResultado exercicio={exercicio} /> : null}
      {permitidas.has("ESTORNAR_APURACAO") ? <PainelDoEstorno apuracoes={apuracoes} /> : null}
      {nenhum ? (
        <p className="text-xs text-[color:var(--color-ink-2)]" data-atos-do-encerramento="sem-permissao">
          O encerramento do exercício, a apuração do resultado e o estorno da apuração são feitos por quem tem a permissão
          de encerrar o exercício. O seu perfil consulta os restos a pagar.
        </p>
      ) : null}
    </>
  );
}

function PainelDoEstorno({
  apuracoes,
}: {
  readonly apuracoes: readonly ApuracaoFeitaParaTela[];
}): React.ReactElement | null {
  if (apuracoes.length === 0) return null;
  return (
    <FormEstornarApuracao
      apuracoes={apuracoes
        .filter((a) => !a.estornada)
        .map((a) => ({
          operacaoId: a.operacaoId,
          rotulo: `Resultado de ${String(a.ano)} — apurado em ${dataBr(a.data)} por ${a.criadoPor}`,
        }))}
    />
  );
}

/**
 * V36 — ANTES DE ENCERRAR: a conferência anual e os ESTIMATIVOS com saldo a liquidar.
 *
 * O encerramento inscreve em restos tudo o que ficou empenhado e não liquidado, sem olhar o tipo — e é certo que
 * seja assim: a inscrição é do saldo, não da intenção. Mas o estimativo costuma sobrar por estimativa, não por
 * obrigação, e inscrevê-lo leva para o ano seguinte uma despesa que não vai acontecer. A decisão é de quem
 * encerra; o que faltava era ver a lista e poder anular o saldo aqui, com a mesma anulação parcial da central
 * (motivo obrigatório, ato novo, original intacto). Quem não anular continua inscrito, como antes.
 */
async function AntesDeEncerrar({ exercicio, podeAnular }: { readonly exercicio: number; readonly podeAnular: boolean }): Promise<React.ReactElement> {
  const estimativos = (await listarEmpenhosDaExecucao({ exercicio, tipoDoEmpenho: "ESTIMATIVO" })).filter(
    (e) => !e.anulado && e.saldoALiquidar !== "0.00"
  );
  return (
    <section
      className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5 shadow-[var(--shadow-card)]"
      data-painel="antes-de-encerrar"
    >
      <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">Antes de encerrar {exercicio}</h2>
      <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
        Confira o balancete, o balanço e as demais identidades do ano em{" "}
        <Link className="text-[color:var(--color-primary)] underline" href={`/relatorios/consistencia?escopo=ANUAL&exercicio=${exercicio}`}>
          Relatórios · Consistência (anual)
        </Link>
        . Uma divergência ali vai para o encerramento junto.
      </p>
      <h3 className="mt-4 text-xs font-semibold text-[color:var(--color-ink)]">Empenhos estimativos com saldo a liquidar</h3>
      {estimativos.length === 0 ? (
        <p className="mt-1 text-xs text-[color:var(--color-ink-2)]" data-estimativos="nenhum">
          Nenhum empenho estimativo de {exercicio} tem saldo a liquidar.
        </p>
      ) : (
        <>
          <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
            O saldo destes empenhos será inscrito em restos a pagar não processados. Se a despesa não vai acontecer,
            anule o saldo antes de encerrar.
          </p>
          <table className="mt-2 w-full text-left text-xs" data-lista="estimativos-com-saldo">
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-1.5 pr-3">Empenho</th>
                <th scope="col" className="py-1.5 pr-3">Credor</th>
                <th scope="col" className="py-1.5 pr-3 text-right">Empenhado</th>
                <th scope="col" className="py-1.5 pr-3 text-right">A liquidar</th>
                <th scope="col" className="py-1.5">Anular o saldo</th>
              </tr>
            </thead>
            <tbody>
              {estimativos.map((e) => (
                <tr key={e.id} className="border-t border-[color:var(--color-border)] align-top" data-empenho={e.numero}>
                  <th scope="row" className="py-1.5 pr-3 font-normal">
                    <Link className="text-[color:var(--color-primary)] underline" href={`/despesa/empenhos/${e.id}`}>{e.numero}</Link>
                  </th>
                  <td className="py-1.5 pr-3">{e.credorNome ?? formatarDocumento(e.credorCpfCnpj)}</td>
                  <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={e.empenhadoLiquido} /></td>
                  <td className="py-1.5 pr-3 text-right"><ValorMonetario valor={e.saldoALiquidar} /></td>
                  <td className="py-1.5">
                    {podeAnular ? (
                      <FormAnular tipo="empenho" id={e.id} anulavelSaldo={e.saldoALiquidar} estornavel={e.liquidado === "0.00"} objeto={`Empenho estimativo ${e.numero}`} />
                    ) : (
                      <span className="text-[color:var(--color-ink-2)]">quem anula empenho decide</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
