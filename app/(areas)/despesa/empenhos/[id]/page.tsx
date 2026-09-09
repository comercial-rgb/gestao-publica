import Link from "next/link";
import { Badge, type StatusBadge } from "../../../../../components/ui/Badge";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import {
  lerDossieDoEmpenho,
  PortaSemBancoError,
  type DossieDaTela,
  type FatoDaCadeiaDaTela,
  type LancamentoDaTela,
  type LiquidacaoDoDossieDaTela,
  type PagamentoDoDossieDaTela,
} from "../../../../../lib/portas/empenho";
import { formatarDocumento } from "../../../../../packages/documento";

/**
 * DETALHE DO EMPENHO — origem, liquidações, retenções, pagamentos, anulações,
 * lançamentos e histórico no MESMO contexto.
 *
 * ═══ POR QUE ESTA TELA EXISTE ═══
 * As listas respondem "o que aconteceu no exercício". Nenhuma delas responde "o que
 * aconteceu com ESTE empenho" — e é essa a pergunta de quem confere. Hoje ela se
 * respondia abrindo quatro telas e casando números na cabeça, que é como se erra.
 *
 * ═══ ⚠️ O QUE ESTA TELA SE RECUSA A FAZER ═══
 * **Ela não soma nada.** Cada número vem pronto de `modules/m05-despesa/dossie.ts`. Uma
 * conta feita aqui — mesmo uma subtração — seria a segunda verdade sobre o mesmo empenho,
 * e a tela de conferência é o pior lugar possível para ter duas.
 *
 * ═══ ⚠️ O BRUTO E O CAIXA SÃO NÚMEROS DIFERENTES, E OS DOIS APARECEM ═══
 * Pagar 1.000 retendo 100 extingue 1.000 de obrigação com o fornecedor e tira 900 do
 * banco. Uma tela que mostrasse só "pago: 1.000" faria o operador procurar 100 reais que
 * nunca saíram; uma que mostrasse só 900 deixaria 100 de dívida que já não existe. Por
 * isso as duas linhas convivem, lado a lado, com o retido no meio explicando a diferença.
 *
 * ═══ A ABA DE HISTÓRICO CHAMA-SE HISTÓRICO ═══
 * Sem rótulo de conformidade em lugar nenhum desta tela. Quem confere um empenho procura
 * "histórico", "anulações", "lançamentos" — o vocabulário do trabalho dele.
 */
export const dynamic = "force-dynamic";

function dataBr(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function instante(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const ROTULO_STATUS: Record<string, string> = {
  EMPENHADO: "Empenhado",
  PARCIAL_LIQUIDADO: "Liquidado em parte",
  LIQUIDADO: "Liquidado",
  PARCIAL_PAGO: "Pago em parte",
  PAGO: "Pago",
  ANULADO: "Anulado",
};

function tomDoStatus(status: string): StatusBadge {
  if (status === "ANULADO") return "erro";
  if (status === "PAGO") return "ok";
  if (status === "EMPENHADO") return "neutro";
  return "alerta";
}

/**
 * ⚠️ AS QUATRO NATUREZAS, EM PORTUGUÊS — e elas NÃO são graus da mesma coisa.
 * A anulação total NEGA o fato; a parcial o REDUZ. Traduzir as duas por "anulação" seria
 * apagar exatamente a distinção que faz o saldo do empenho ser o que é.
 */
const ROTULO_NATUREZA: Record<string, string> = {
  ORIGINAL: "Documento original",
  ANULACAO_TOTAL: "Anulação total",
  ANULACAO_PARCIAL: "Anulação parcial",
  ESTORNO_DE_ANULACAO_PARCIAL: "Estorno da anulação parcial",
};

const ROTULO_CATEGORIA: Record<string, string> = {
  FORNECIMENTO_BENS: "Fornecimento de bens",
  LOCACAO: "Locação",
  PRESTACAO_SERVICOS: "Prestação de serviços",
  REALIZACAO_OBRAS: "Realização de obras",
};

const ROTULO_TIPO: Record<string, string> = {
  ORDINARIO: "Ordinário",
  GLOBAL: "Global",
  ESTIMATIVO: "Estimativo",
};

const ROTULO_MOVIMENTO_EXTRA: Record<string, string> = {
  INGRESSO: "Retido",
  ESTORNO_INGRESSO: "Retenção estornada",
  DISPENDIO: "Repassado",
  ESTORNO_DISPENDIO: "Repasse estornado",
};

export default async function DetalheDoEmpenhoPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}): Promise<React.ReactElement> {
  const { id } = await params;

  let resultado: Awaited<ReturnType<typeof lerDossieDoEmpenho>>;
  try {
    resultado = await lerDossieDoEmpenho(id);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Empenho" subtitulo={id} />
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível montar o dossiê deste empenho"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  if (resultado.tipo === "inexistente") {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Empenho não encontrado" subtitulo={id} />
        <EstadoVazio
          titulo="Este empenho não existe"
          descricao="O identificador não corresponde a nenhum empenho. Volte à lista e escolha pelo número."
        />
      </div>
    );
  }

  // ⚠️ ABRIR UMA ANULAÇÃO COMO SE FOSSE UM EMPENHO mostraria um documento com valor
  // positivo, ficha e credor sentinela — a cara de um empenho novo. Em vez de fingir, a
  // tela diz o que o id é e leva ao original.
  if (resultado.tipo === "anulacao") {
    return (
      <div className="space-y-4">
        <PageHeader titulo="Este documento é uma anulação" subtitulo={id} />
        <EstadoVazio
          titulo="A anulação não tem dossiê próprio"
          descricao="Ela existe dentro da história do empenho que anula — é lá que o valor, o saldo e os lançamentos fazem sentido."
        />
        <Card>
          <Link
            href={`/despesa/empenhos/${resultado.empenhoOriginalId}`}
            className="text-sm font-medium text-[color:var(--color-primary)] hover:underline"
          >
            Abrir o empenho de origem
          </Link>
        </Card>
      </div>
    );
  }

  const d = resultado.dossie;

  return (
    <div className="space-y-4">
      <PageHeader
        titulo={`Empenho ${d.numero}`}
        subtitulo={`${dataBr(d.data)} · ${ROTULO_TIPO[d.tipo] ?? d.tipo} · ficha ${d.origem.fichaNumero} · exercício ${d.origem.exercicio}`}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge status={tomDoStatus(d.status)}>
          {ROTULO_STATUS[d.status] ?? d.status}
        </Badge>
        <Badge status="neutro">
          {ROTULO_CATEGORIA[d.categoriaOrdemCronologica] ?? d.categoriaOrdemCronologica}
        </Badge>
        <Link
          href="/despesa/empenhos"
          className="ml-auto text-xs text-[color:var(--color-primary)] hover:underline"
        >
          Voltar à lista de empenhos
        </Link>
      </div>

      <Origem dossie={d} />
      <Valores dossie={d} />
      <Liquidacoes dossie={d} />
      <Anulacoes dossie={d} />
      <Lancamentos dossie={d} />
      <Historico dossie={d} />
    </div>
  );
}

/** ORIGEM — de onde este empenho saiu: a dotação inteira, e o que ele executa. */
function Origem({ dossie: d }: { readonly dossie: DossieDaTela }): React.ReactElement {
  const o = d.origem;
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Origem</h2>

      <dl className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
        <Campo rotulo="Órgão">{`${o.orgaoCodigo} — ${o.orgaoNome}`}</Campo>
        <Campo rotulo="Unidade orçamentária">{`${o.unidadeCodigo} — ${o.unidadeNome}`}</Campo>
        <Campo rotulo="Ficha">{`nº ${o.fichaNumero} · exercício ${o.exercicio}`}</Campo>
        <Campo rotulo="Função / subfunção">
          {`${o.funcaoCodigo} ${o.funcaoDescricao} / ${o.subfuncaoCodigo} ${o.subfuncaoDescricao}`}
        </Campo>
        <Campo rotulo="Programa / ação">
          {`${o.programaCodigo} ${o.programaDescricao} / ${o.acaoCodigo} ${o.acaoDescricao}`}
        </Campo>
        <Campo rotulo="Natureza da despesa">{`${o.naturezaCodigo} — ${o.naturezaDescricao}`}</Campo>
        <Campo rotulo="Fonte de recursos">{`${o.fonteCodigo} — ${o.fonteDescricao}`}</Campo>
        <Campo rotulo="Credor">
          {/*
            ⚠️ O EMPENHO GUARDA O DOCUMENTO DO ATO, não uma FK para o cadastro. É de
            propósito: uma FK faria este empenho mudar de credor quando alguém corrigisse
            o cadastro anos depois. O link é uma PONTE — pode não haver ninguém do outro
            lado, e a tela não promete que haja.
          */}
          <Link
            href={`/cadastros/pessoas?busca=${encodeURIComponent(d.credorCpfCnpj)}`}
            className="text-[color:var(--color-primary)] hover:underline"
          >
            {formatarDocumento(d.credorCpfCnpj)}
          </Link>
        </Campo>
        <Campo rotulo="Contrato">
          {o.contratoNumero === null
            ? "— (empenho sem contrato)"
            : `${o.contratoNumero}${o.contratadoNome === null ? "" : ` — ${o.contratadoNome}`}`}
        </Campo>
        {o.obraDescricao === null ? null : (
          <Campo rotulo="Obra">{o.obraDescricao}</Campo>
        )}
      </dl>

      <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">
        Histórico: <span className="text-[color:var(--color-ink)]">{d.historico}</span>
      </p>

      {/*
        ⚠️ O SALDO DA FICHA É O DE HOJE, NÃO O DA DATA DO EMPENHO. Ele muda a cada
        empenho novo, a cada crédito adicional e a cada anulação. Dizer isto na tela é o
        que impede alguém de ler este número como "o que sobrava quando isto foi
        empenhado" — que é outra pergunta, e tem outra resposta.
      */}
      <p className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
        Disponível na ficha <strong>agora</strong>:{" "}
        <ValorMonetario valor={o.saldoDisponivelHoje} comSimbolo />. É o saldo de hoje, e
        não o que havia quando este empenho foi emitido — a dotação anda com os créditos
        adicionais, os outros empenhos e as anulações.
      </p>
    </Card>
  );
}

/** VALORES — o quadro que separa o bruto do que saiu do caixa. */
function Valores({ dossie: d }: { readonly dossie: DossieDaTela }): React.ReactElement {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Valores</h2>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-xs">
          <tbody>
            <Linha rotulo="Empenhado (valor da nota)" valor={d.valor} />
            <Linha rotulo="Anulações" valor={d.anulacoes} />
            <Linha rotulo="Empenhado líquido" valor={d.empenhadoLiquido} destaque />
            <Linha rotulo="Liquidado" valor={d.liquidado} />
            <Linha rotulo="A liquidar" valor={d.saldoALiquidar} />
            <Linha
              rotulo="Pago (bruto — o que extinguiu a obrigação)"
              valor={d.pago}
            />
            <Linha rotulo="Retido de terceiros" valor={d.totalRetido} />
            <Linha
              rotulo="Saída de caixa (bruto − retido)"
              valor={d.saidaDeCaixa}
              destaque
            />
            <Linha rotulo="A pagar" valor={d.saldoAPagar} />
          </tbody>
        </table>
      </div>

      {d.totalRetido === "0.00" ? null : (
        <p className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
          Este empenho teve <strong>retenção na fonte</strong>. O que se deve ao
          fornecedor foi extinto pelo <strong>bruto</strong>; o dinheiro retido não saiu do
          caixa — ele virou <strong>dívida com o consignatário</strong>. Por isso os dois
          números são diferentes, e os dois estão certos.
        </p>
      )}
    </Card>
  );
}

function Linha({
  rotulo,
  valor,
  destaque = false,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly destaque?: boolean;
}): React.ReactElement {
  return (
    <tr className="border-b border-[color:var(--color-border)] last:border-0">
      <th
        scope="row"
        className={`py-1.5 pr-4 text-left font-normal ${destaque ? "font-semibold text-[color:var(--color-ink)]" : "text-[color:var(--color-ink-2)]"}`}
      >
        {rotulo}
      </th>
      <td className={`py-1.5 text-right ${destaque ? "font-semibold" : ""}`}>
        <ValorMonetario valor={valor} />
      </td>
    </tr>
  );
}

/** LIQUIDAÇÕES — e, dentro de cada uma, os pagamentos e as retenções deles. */
function Liquidacoes({
  dossie: d,
}: {
  readonly dossie: DossieDaTela;
}): React.ReactElement {
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Liquidações, pagamentos e retenções
      </h2>

      {d.liquidacoes.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">
          Nenhuma liquidação. O empenho reservou a dotação; a despesa ainda não foi
          reconhecida como devida.
        </p>
      ) : (
        <ol className="space-y-3">
          {d.liquidacoes.map((l) => (
            <li
              key={l.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
            >
              <BlocoLiquidacao liquidacao={l} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function BlocoLiquidacao({
  liquidacao: l,
}: {
  readonly liquidacao: LiquidacaoDoDossieDaTela;
}): React.ReactElement {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[color:var(--color-ink)]">
          Liquidação {l.numero} · {dataBr(l.data)}
          {l.anulado ? (
            <span className="ml-2">
              <Badge status="erro">Anulada</Badge>
            </span>
          ) : null}
        </span>
        <span className="text-[color:var(--color-ink-2)]">
          liquidado <ValorMonetario valor={l.liquidadoLiquido} /> · pago{" "}
          <ValorMonetario valor={l.pago} /> · a pagar{" "}
          <ValorMonetario valor={l.saldoAPagar} />
        </span>
      </div>

      <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
        Atesto: {l.responsavelAtesto}
        {l.notaFiscalNum === null
          ? " · sem nota fiscal informada"
          : ` · NF ${l.notaFiscalNum}${l.notaFiscalSerie === null ? "" : `/${l.notaFiscalSerie}`}${l.notaFiscalData === null ? "" : ` de ${dataBr(l.notaFiscalData)}`}`}
      </p>

      {l.cadeia.length > 1 ? <Cadeia fatos={l.cadeia} /> : null}

      {l.pagamentos.length === 0 ? (
        <p className="mt-2 text-xs text-[color:var(--color-ink-3)]">
          Sem pagamento. A obrigação está viva e a liquidação está na fila da ordem
          cronológica.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {l.pagamentos.map((p) => (
            <li
              key={p.id}
              className="rounded-[var(--radius-md)] bg-[color:var(--color-surface-2)] px-3 py-2"
            >
              <BlocoPagamento pagamento={p} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function BlocoPagamento({
  pagamento: p,
}: {
  readonly pagamento: PagamentoDoDossieDaTela;
}): React.ReactElement {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[color:var(--color-ink)]">
          Pagamento {p.numero} · {dataBr(p.data)} · conta {p.contaBancaria} · fonte{" "}
          {p.fonteCodigo}
          {p.anulado ? (
            <span className="ml-2">
              <Badge status="erro">Anulado</Badge>
            </span>
          ) : null}
        </span>
        <span className="text-[color:var(--color-ink-2)]">
          bruto <ValorMonetario valor={p.valor} />
          {p.totalRetido === "0.00" ? null : (
            <>
              {" "}
              · retido <ValorMonetario valor={p.totalRetido} /> ·{" "}
              <strong className="text-[color:var(--color-ink)]">
                saiu do caixa <ValorMonetario valor={p.saidaDeCaixa} />
              </strong>
            </>
          )}
        </span>
      </div>

      {p.retencoes.length === 0 ? null : (
        <ul className="mt-1.5 space-y-1 border-l-2 border-[color:var(--color-border-strong)] pl-3 text-xs">
          {p.retencoes.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-2">
              <span className="text-[color:var(--color-ink-2)]">
                {ROTULO_MOVIMENTO_EXTRA[r.movimento] ?? r.movimento}:
              </span>
              <span className="text-[color:var(--color-ink)]">
                {r.tipoCodigo} — {r.tipoDescricao}
              </span>
              <span className="text-[color:var(--color-ink-2)]">
                a favor de {r.credorConsignatario}
              </span>
              <ValorMonetario valor={r.valor} className="ml-auto" />
            </li>
          ))}
        </ul>
      )}

      {p.cadeia.length > 1 ? <Cadeia fatos={p.cadeia} /> : null}
    </>
  );
}

/** ANULAÇÕES E ESTORNOS do EMPENHO. Os dos níveis de baixo ficam junto de cada fato. */
function Anulacoes({
  dossie: d,
}: {
  readonly dossie: DossieDaTela;
}): React.ReactElement {
  const semOriginal = d.cadeia.filter((f) => f.natureza !== "ORIGINAL");
  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">
        Anulações e estornos
      </h2>
      {semOriginal.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">
          O empenho nunca foi anulado nem reduzido.
        </p>
      ) : (
        <>
          <Cadeia fatos={d.cadeia} />
          {/*
            ⚠️ A CORREÇÃO É UM REGISTRO NOVO, NUNCA UM APAGAMENTO. Nada aqui foi
            reescrito: o documento original continua na lista, com o valor que teve. É por
            isso que o "empenhado líquido" é uma CONTA, e não uma coluna.
          */}
          <p className="mt-2 text-xs text-[color:var(--color-ink-2)]">
            Nenhuma linha acima substituiu outra: corrigir aqui é <strong>acrescentar</strong>{" "}
            um registro. O documento original continua valendo o que valeu, e o saldo é a
            conta entre eles.
          </p>
        </>
      )}
    </Card>
  );
}

function Cadeia({
  fatos,
}: {
  readonly fatos: readonly FatoDaCadeiaDaTela[];
}): React.ReactElement {
  return (
    <ul className="mt-2 space-y-1 text-xs">
      {fatos.map((f) => (
        <li key={f.id} className="flex flex-wrap items-baseline gap-2">
          <Badge status={f.natureza === "ORIGINAL" ? "neutro" : "alerta"}>
            {ROTULO_NATUREZA[f.natureza] ?? f.natureza}
          </Badge>
          <span className="text-[color:var(--color-ink)]">
            {f.numero} · {dataBr(f.data)}
          </span>
          <ValorMonetario valor={f.valor} />
          <span className="ml-auto text-[color:var(--color-ink-3)]">
            {instante(f.criadoEm)} · {f.criadoPor}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** LANÇAMENTOS — o razão de toda a cadeia, perna por perna, com o total por subsistema. */
function Lancamentos({
  dossie: d,
}: {
  readonly dossie: DossieDaTela;
}): React.ReactElement {
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
        Lançamentos contábeis
      </h2>
      {/*
        ⚠️ O FECHAMENTO É POR SUBSISTEMA. Um lançamento com débitos e créditos iguais NO
        TOTAL pode ter o orçamentário aberto e o patrimonial compensando o furo — e aí o
        razão "fecha" com os dois subsistemas errados. Quem valida na gravação é o motor;
        aqui a conferência é MOSTRADA, para quem lê poder verificar o que o motor afirmou.
      */}
      <p className="mb-3 text-xs text-[color:var(--color-ink-2)]">
        Débitos e créditos fecham <strong>dentro de cada subsistema</strong>, não só no
        total. Um lançamento pode ter <strong>pernas de valores diferentes</strong> — é o
        caso do pagamento com retenção.
      </p>

      {d.lancamentos.length === 0 ? (
        <p className="text-xs text-[color:var(--color-ink-3)]">Nenhum lançamento.</p>
      ) : (
        <ol className="space-y-3">
          {d.lancamentos.map((l) => (
            <li
              key={l.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
            >
              <BlocoLancamento lancamento={l} />
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function BlocoLancamento({
  lancamento: l,
}: {
  readonly lancamento: LancamentoDaTela;
}): React.ReactElement {
  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-[color:var(--color-ink)]">
          {l.numeroControle} · {dataBr(l.dataTransacao)} · {l.origemTipo}
          {l.estornoDeId === null ? null : (
            <span className="ml-2">
              <Badge status="alerta">Estorno</Badge>
            </span>
          )}
        </span>
        <span className="text-[color:var(--color-ink-3)]">
          {instante(l.criadoEm)} · {l.criadoPor}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-[color:var(--color-ink-2)]">{l.historico}</p>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[36rem] text-xs">
          <thead>
            <tr className="border-b border-[color:var(--color-border)] text-[color:var(--color-ink-3)]">
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                Subsistema
              </th>
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                Conta
              </th>
              <th scope="col" className="py-1 pr-3 text-left font-medium">
                Ficha
              </th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">
                Débito
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Crédito
              </th>
            </tr>
          </thead>
          <tbody>
            {l.partidas.map((p, i) => (
              <tr
                key={`${l.id}-${i}`}
                className="border-b border-[color:var(--color-border)] last:border-0"
              >
                <td className="py-1 pr-3 text-[color:var(--color-ink-2)]">{p.subsistema}</td>
                <td className="py-1 pr-3">
                  <span className="tabular">{p.contaCodigo}</span>{" "}
                  <span className="text-[color:var(--color-ink-2)]">{p.contaTitulo}</span>
                </td>
                <td className="py-1 pr-3 text-[color:var(--color-ink-2)]">
                  {p.fichaNumero === null ? "—" : p.fichaNumero}
                </td>
                <td className="py-1 pr-3 text-right">
                  {p.tipo === "DEBITO" ? <ValorMonetario valor={p.valor} /> : null}
                </td>
                <td className="py-1 text-right">
                  {p.tipo === "CREDITO" ? <ValorMonetario valor={p.valor} /> : null}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {l.totais.map((t) => (
              <tr key={t.subsistema} className="border-t border-[color:var(--color-border-strong)]">
                <th scope="row" colSpan={3} className="py-1 pr-3 text-left font-medium">
                  Total {t.subsistema}
                  {t.fecha ? null : (
                    <span className="ml-2">
              <Badge status="erro">não fecha</Badge>
            </span>
                  )}
                </th>
                <td className="py-1 pr-3 text-right font-semibold">
                  <ValorMonetario valor={t.debito} />
                </td>
                <td className="py-1 text-right font-semibold">
                  <ValorMonetario valor={t.credito} />
                </td>
              </tr>
            ))}
          </tfoot>
        </table>
      </div>
    </>
  );
}

/** HISTÓRICO — quem fez o quê, quando. Em ordem de acontecimento. */
function Historico({
  dossie: d,
}: {
  readonly dossie: DossieDaTela;
}): React.ReactElement {
  /*
    ⚠️ O HISTÓRICO NÃO É UMA TABELA DE AUDITORIA PARALELA. Ele é a leitura dos próprios
    fatos: cada empenho, liquidação, pagamento, retenção e anulação carrega o autor e o
    instante em que nasceu. Uma tabela separada mente no dia em que alguém gravar sem
    escrevê-la — aqui não há como gravar sem aparecer.
  */
  const eventos: readonly {
    readonly chave: string;
    readonly quando: Date;
    readonly quem: string;
    readonly o_que: string;
    readonly valor: string;
  }[] = [
    ...d.cadeia.map((f) => ({
      chave: `e-${f.id}`,
      quando: f.criadoEm,
      quem: f.criadoPor,
      o_que: `${ROTULO_NATUREZA[f.natureza] ?? f.natureza} do empenho ${f.numero}`,
      valor: f.valor,
    })),
    ...d.liquidacoes.flatMap((l) => [
      ...l.cadeia.map((f) => ({
        chave: `l-${f.id}`,
        quando: f.criadoEm,
        quem: f.criadoPor,
        o_que: `${ROTULO_NATUREZA[f.natureza] ?? f.natureza} da liquidação ${f.numero}`,
        valor: f.valor,
      })),
      ...l.pagamentos.flatMap((p) => [
        ...p.cadeia.map((f) => ({
          chave: `p-${f.id}`,
          quando: f.criadoEm,
          quem: f.criadoPor,
          o_que: `${ROTULO_NATUREZA[f.natureza] ?? f.natureza} do pagamento ${f.numero}`,
          valor: f.valor,
        })),
        ...p.retencoes.map((r) => ({
          chave: `r-${r.id}`,
          quando: r.data,
          quem: r.criadoPor,
          o_que: `${ROTULO_MOVIMENTO_EXTRA[r.movimento] ?? r.movimento} — ${r.tipoDescricao} a favor de ${r.credorConsignatario}`,
          valor: r.valor,
        })),
      ]),
    ]),
  ]
    .slice()
    .sort((a, b) => a.quando.getTime() - b.quando.getTime());

  return (
    <Card>
      <h2 className="mb-3 text-sm font-semibold text-[color:var(--color-ink)]">Histórico</h2>
      <ol className="space-y-2">
        {eventos.map((e) => (
          <li
            key={e.chave}
            className="flex flex-wrap items-baseline gap-2 rounded-[var(--radius-md)] border border-[color:var(--color-border)] px-3 py-2 text-xs"
          >
            <span className="tabular text-[color:var(--color-ink-3)]">
              {instante(e.quando)}
            </span>
            <span className="text-[color:var(--color-ink)]">{e.o_que}</span>
            <ValorMonetario valor={e.valor} />
            <span className="ml-auto text-[color:var(--color-ink-2)]">{e.quem}</span>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-[color:var(--color-ink-2)]">
        Cada linha é um registro real — autor e instante saem do próprio fato, não de uma
        tabela de auditoria mantida à parte.
      </p>
    </Card>
  );
}

function Campo({
  rotulo,
  children,
}: {
  readonly rotulo: string;
  readonly children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <dt className="text-[color:var(--color-ink-3)]">{rotulo}</dt>
      <dd className="mt-0.5 text-[color:var(--color-ink)]">{children}</dd>
    </div>
  );
}
