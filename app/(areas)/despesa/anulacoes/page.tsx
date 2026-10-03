import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { listarAnulacoesDoExercicio, listarPagamentosDaExecucao, type AnulacaoRegistrada, type PagamentoDaTela } from "../../../../lib/portas/anulacao";
import { EscopoDeLeituraError, ExercicioIlegivelError, recorteDePagina } from "../../../../lib/portas/contexto";
import { listarEmpenhosDaExecucao, PortaSemBancoError, type EmpenhoDaTela } from "../../../../lib/portas/empenho";
import { listarLiquidacoesDaExecucao, type LiquidacaoDaTela } from "../../../../lib/portas/liquidacao";
import { acoesPermitidas } from "../../../../lib/portas/molde";
import { dataBr, descreverRecorte, type RecorteDaPagina } from "../../../../lib/recorte";
import { formatarDocumento } from "../../../../packages/documento/index";
import { FormAnular } from "../FormAnular";

/**
 * CENTRAL DE ANULAÇÕES E ESTORNOS DA DESPESA (V33).
 *
 * ⚠️ NÃO É UM COMANDO GENÉRICO. Cada linha anula pelo serviço do PRÓPRIO fato (empenho, liquidação, pagamento —
 * integral ou parcial), com as regras e as cascatas dele; a recusa do domínio sobe como veio. O que esta tela
 * acrescenta é o lugar único: o que ainda se pode anular, a conferência antes (objeto, valor, motivo, efeito), e as
 * anulações já registradas com o original, o lançamento e o saldo que ficou. As anulações de outras áreas
 * continuam onde vivem, com as regras delas, e aqui só há o caminho até elas.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const LINK = "text-[color:var(--color-primary)] underline";
type Tipo = "empenho" | "liquidacao" | "pagamento";
const ABAS: readonly { readonly tipo: Tipo; readonly rotulo: string }[] = [
  { tipo: "empenho", rotulo: "Empenhos" },
  { tipo: "liquidacao", rotulo: "Liquidações" },
  { tipo: "pagamento", rotulo: "Pagamentos" },
];
const ROTULO_DO_TIPO: Readonly<Record<Tipo, string>> = { empenho: "Empenho", liquidacao: "Liquidação", pagamento: "Pagamento" };
const ACOES: Readonly<Record<Tipo, readonly [string, string]>> = {
  empenho: ["ANULAR_EMPENHO", "ANULAR_EMPENHO_PARCIAL"],
  liquidacao: ["ANULAR_LIQUIDACAO", "ANULAR_LIQUIDACAO_PARCIAL"],
  pagamento: ["ANULAR_PAGAMENTO", "ANULAR_PAGAMENTO_PARCIAL"],
};
const OUTRAS: readonly { readonly href: string; readonly rotulo: string }[] = [
  { href: "/despesa/restos-a-pagar", rotulo: "Restos a pagar: cancelamento e estorno de pagamento" },
  { href: "/receita/arrecadacoes", rotulo: "Arrecadação: anulação da receita" },
  { href: "/financeiro/extraorcamentario", rotulo: "Extraorçamentário: estorno de ingresso e de dispêndio" },
  { href: "/contabilidade/lancamentos", rotulo: "Lançamento manual: estorno" },
];

interface Anulavel {
  readonly id: string;
  readonly numero: string;
  readonly data: Date;
  readonly credor: string;
  readonly origem: string;
  readonly origemHref: string;
  readonly saldo: string;
  readonly estornavel: boolean;
}

function anulaveis(tipo: Tipo, e: readonly EmpenhoDaTela[], l: readonly LiquidacaoDaTela[], p: readonly PagamentoDaTela[]): readonly Anulavel[] {
  if (tipo === "empenho") {
    return e
      .filter((x) => !x.anulado && x.saldoALiquidar !== "0.00")
      .map((x) => ({ id: x.id, numero: x.numero, data: x.data, credor: x.credorNome ?? formatarDocumento(x.credorCpfCnpj), origem: "", origemHref: `/despesa/empenhos/${x.id}`, saldo: x.saldoALiquidar, estornavel: x.liquidado === "0.00" }));
  }
  if (tipo === "liquidacao") {
    return l
      .filter((x) => !x.anulado && x.saldoAPagar !== "0.00")
      .map((x) => ({ id: x.id, numero: x.numero, data: x.data, credor: formatarDocumento(x.credorCpfCnpj), origem: `empenho ${x.empenhoNumero}`, origemHref: `/despesa/empenhos/${x.empenhoId}#liquidacao-${x.id}`, saldo: x.saldoAPagar, estornavel: x.pago === "0.00" }));
  }
  return p
    .filter((x) => !x.anulado && x.pagoLiquido !== "0.00")
    .map((x) => ({ id: x.id, numero: x.numero, data: x.data, credor: formatarDocumento(x.credorCpfCnpj), origem: `liquidação ${x.liquidacaoNumero} · empenho ${x.empenhoNumero}`, origemHref: `/despesa/documento/PAGAMENTO/${x.id}`, saldo: x.pagoLiquido, estornavel: true }));
}

const umString = (v: string | string[] | undefined): string => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));

export default async function AnulacoesPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const pedido = umString(sp["tipo"]);
  const tipo: Tipo = pedido === "liquidacao" || pedido === "pagamento" ? pedido : "empenho";
  let recorte: RecorteDaPagina;
  let empenhos: readonly EmpenhoDaTela[];
  let liquidacoes: readonly LiquidacaoDaTela[];
  let pagamentos: readonly PagamentoDaTela[];
  let registradas: readonly AnulacaoRegistrada[];
  let permitidas: ReadonlySet<string>;
  try {
    recorte = await recorteDePagina(sp, "CONSULTAR_DESPESA");
    const r = { exercicio: recorte.exercicio, unidadeCodigo: recorte.unidadeCodigo };
    [empenhos, liquidacoes, pagamentos, registradas, permitidas] = await Promise.all([
      listarEmpenhosDaExecucao(r),
      listarLiquidacoesDaExecucao(r),
      listarPagamentosDaExecucao(r),
      listarAnulacoesDoExercicio(r),
      acoesPermitidas(Object.values(ACOES).flat()),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Anulações e estornos" subtitulo="Despesa" />
        <EstadoVazio
          titulo={
            erro instanceof EscopoDeLeituraError
              ? "Esta unidade não está no seu acesso"
              : erro instanceof ExercicioIlegivelError
                ? "O exercício pedido não é um ano"
                : erro instanceof PortaSemBancoError
                  ? "Serviço indisponível"
                  : "Não foi possível carregar as anulações"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const linhas = anulaveis(tipo, empenhos, liquidacoes, pagamentos);
  const podeAnular = ACOES[tipo].some((a) => permitidas.has(a));
  // O saldo atual de cada original, para a coluna "depois" das registradas.
  const saldoAtual = new Map<string, string>([
    ...empenhos.map((e) => [e.id, `a liquidar ${e.saldoALiquidar}`] as const),
    ...liquidacoes.map((l) => [l.id, `a pagar ${l.saldoAPagar}`] as const),
    ...pagamentos.map((p) => [p.id, `pago ${p.pagoLiquido}`] as const),
  ]);
  const sufixo = `exercicio=${String(recorte.exercicio)}${recorte.unidadeCodigo !== undefined ? `&ug=${recorte.unidadeCodigo}` : ""}`;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Anulações e estornos" subtitulo={`${descreverRecorte(recorte)}: o que ainda se pode anular, e o que já foi anulado`} />

      <nav className="flex gap-2 text-xs" aria-label="Tipo de documento" data-chrome>
        {ABAS.map((a) => (
          <Link
            key={a.tipo}
            href={`/despesa/anulacoes?tipo=${a.tipo}&${sufixo}`}
            aria-current={a.tipo === tipo ? "page" : undefined}
            className={`rounded-[var(--radius-md)] border px-3 py-1.5 ${a.tipo === tipo ? "border-[color:var(--color-primary)] font-semibold" : "border-[color:var(--color-border)]"}`}
          >
            {a.rotulo}
          </Link>
        ))}
      </nav>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">{ABAS.find((a) => a.tipo === tipo)?.rotulo} com saldo anulável</h2>
        {!podeAnular ? (
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]" data-sem-acao-de-anular>Anular {ROTULO_DO_TIPO[tipo].toLowerCase()} não está no seu acesso; a lista fica para consulta.</p>
        ) : null}
        {linhas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nada a anular neste recorte.</p>
        ) : (
          <table className="w-full text-left text-xs" data-lista={`anulaveis-${tipo}`}>
            <caption className="sr-only">Documentos com saldo anulável; valores em reais</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-1.5 pr-2">Número</th>
                <th scope="col" className="py-1.5 pr-2">Data</th>
                <th scope="col" className="py-1.5 pr-2">Credor</th>
                <th scope="col" className="py-1.5 pr-2">Origem</th>
                <th scope="col" className="py-1.5 pr-2 text-right">Saldo anulável</th>
                <th scope="col" className="py-1.5"><span className="sr-only">Anular</span></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((x) => (
                <tr key={x.id} className="border-t border-[color:var(--color-border)] align-top" data-anulavel={x.id}>
                  <td className="py-1.5 pr-2"><Link className={LINK} href={x.origemHref}>{x.numero}</Link></td>
                  <td className="py-1.5 pr-2">{dataBr(x.data)}</td>
                  <td className="py-1.5 pr-2">{x.credor}</td>
                  <td className="py-1.5 pr-2">{x.origem}</td>
                  <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={x.saldo} /></td>
                  <td className="py-1.5">
                    {podeAnular ? <FormAnular tipo={tipo} id={x.id} anulavelSaldo={x.saldo} estornavel={x.estornavel} objeto={`${ROTULO_DO_TIPO[tipo]} ${x.numero} · ${x.credor}`} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Anulações registradas no exercício ({registradas.length})</h2>
        {registradas.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]">Nenhuma anulação registrada neste recorte.</p>
        ) : (
          <table className="w-full text-left text-xs" data-lista="anulacoes-registradas">
            <caption className="sr-only">Anulações registradas, com o original, o lançamento e o saldo atual do original</caption>
            <thead>
              <tr className="text-[color:var(--color-ink-3)]">
                <th scope="col" className="py-1.5 pr-2">Data</th>
                <th scope="col" className="py-1.5 pr-2">Tipo</th>
                <th scope="col" className="py-1.5 pr-2">Anulação</th>
                <th scope="col" className="py-1.5 pr-2 text-right">Valor</th>
                <th scope="col" className="py-1.5 pr-2">Motivo</th>
                <th scope="col" className="py-1.5 pr-2">Original</th>
                <th scope="col" className="py-1.5 pr-2">Saldo do original agora</th>
                <th scope="col" className="py-1.5">Lançamento</th>
              </tr>
            </thead>
            <tbody>
              {registradas.map((a) => (
                <tr key={`${a.tipo}-${a.id}`} className="border-t border-[color:var(--color-border)] align-top" data-anulacao-registrada={a.id}>
                  <td className="py-1.5 pr-2">{dataBr(a.data)}</td>
                  <td className="py-1.5 pr-2">{ROTULO_DO_TIPO[a.tipo]} <Badge status="neutro">{a.integral ? "integral" : "parcial"}</Badge></td>
                  <td className="py-1.5 pr-2 font-mono">{a.numero}</td>
                  <td className="py-1.5 pr-2 text-right"><ValorMonetario valor={a.valor} /></td>
                  <td className="py-1.5 pr-2">{a.motivo}<span className="block text-[color:var(--color-ink-3)]">por {a.criadoPor}</span></td>
                  <td className="py-1.5 pr-2"><Link className={LINK} href={a.originalHref}>{a.originalNumero}</Link></td>
                  <td className="py-1.5 pr-2">{saldoAtual.get(a.originalId)?.replace(/(\d+)\.(\d{2})$/, (_m, i: string, c: string) => `R$ ${Number(i).toLocaleString("pt-BR")},${c}`) ?? "—"}</td>
                  <td className="py-1.5"><Link className={LINK} href={`/contabilidade/lancamentos/${a.lancamentoId}`}>abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Anulações e estornos de outras áreas</h2>
        <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">Cada uma segue as regras da própria área e é feita na tela dela.</p>
        <ul className="space-y-1 text-xs">
          {OUTRAS.map((o) => (
            <li key={o.href}><Link className={LINK} href={`${o.href}?exercicio=${String(recorte.exercicio)}`}>{o.rotulo}</Link></li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
