import { Badge, type StatusBadge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import {
  estadoDoEnvioAoBanco,
  lerLiquidacoesParaOrdem,
  lerOrdensDePagamento,
  PortaSemBancoError,
  type LiquidacaoParaOrdemDaTela,
  type OrdemDaTela,
} from "../../../../lib/portas/ordem-pagamento";
import { lerContasBancarias } from "../../../../lib/portas/pagamento";
import { dataBr, descreverRecorte, recorteDe } from "../../../../lib/recorte";
import { FormAutorizar, FormCancelar, FormOrdem } from "./FormOrdem";

/**
 * ORDENS DE PAGAMENTO — as QUATRO ETAPAS, cada uma com o seu estado real.
 *
 * ═══ ⚠️ POR QUE A TELA MOSTRA UMA ETAPA QUE NÃO EXISTE ═══
 * A etapa "enviar ao banco" aparece, cinza, dizendo que não está implementada. É
 * deliberado: escondê-la faria o operador concluir que registrar o pagamento aqui move
 * dinheiro — e ele não move. O pagamento registrado é ADMINISTRATIVO: produz o efeito
 * contábil e documental; a transferência é feita pelo canal do banco, por fora.
 *
 * O incremento é explícito sobre isso: *"sem configuração, o envio real deve ficar
 * indisponível com motivo; não substituir por retorno de sucesso local"*. Não há rota,
 * não há botão, e a porta devolve um tipo em que o caminho feliz nem compila.
 *
 * ═══ A ETAPA 4 NÃO É NOSSA ═══
 * "O banco confirmou?" se responde na conciliação (M09): existe um vínculo VIVO entre
 * este pagamento e uma linha do extrato. A tela lê o dono do dado — não guarda uma
 * segunda verdade sobre a mesma conciliação.
 */
export const dynamic = "force-dynamic";

const ROTULO_ESTADO: Record<string, string> = {
  PREPARADA: "Aguardando autorização",
  AUTORIZADA: "Autorizada",
  CANCELADA: "Cancelada",
  PAGA: "Paga",
};

function tomDoEstado(estado: string): StatusBadge {
  if (estado === "CANCELADA") return "erro";
  if (estado === "PAGA") return "ok";
  if (estado === "AUTORIZADA") return "alerta";
  return "neutro";
}

function instante(d: Date): string {
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function OrdensDePagamentoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const recorte = recorteDe(await searchParams);

  const cabecalho = (
    <PageHeader
      titulo="Ordens de pagamento"
      subtitulo={`${descreverRecorte(recorte)} — preparar, autorizar, registrar e conferir`}
    />
  );

  let ordens: readonly OrdemDaTela[];
  let liquidacoes: readonly LiquidacaoParaOrdemDaTela[];
  let contas: Awaited<ReturnType<typeof lerContasBancarias>>;
  try {
    [ordens, liquidacoes, contas] = await Promise.all([
      lerOrdensDePagamento({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
      lerLiquidacoesParaOrdem({
        exercicio: recorte.exercicio,
        unidadeCodigo: recorte.unidadeCodigo,
      }),
      lerContasBancarias(),
    ]);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível ler as ordens de pagamento"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const envio = estadoDoEnvioAoBanco();

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O pagamento é dividido em <strong>quatro etapas</strong>: preparar a ordem,
        autorizá-la, registrar o pagamento e conferir a confirmação do banco.{" "}
        <strong>Quem prepara não autoriza</strong> — são permissões distintas, e o sistema
        recusa a mesma pessoa nas duas pontas do mesmo documento.
      </div>

      <FormOrdem liquidacoes={liquidacoes} contas={contas} />

      {ordens.length === 0 ? (
        <EstadoVazio
          titulo="Sem ordens de pagamento"
          descricao={`Nenhuma ordem em ${descreverRecorte(recorte).toLowerCase()}. Prepare a primeira no formulário acima.`}
        />
      ) : (
        <ol className="space-y-3">
          {ordens.map((o) => (
            <li key={o.id}>
              <Card>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-[color:var(--color-ink)]">
                    Ordem {o.numero}
                    <span className="ml-2 font-normal text-[color:var(--color-ink-2)]">
                      liquidação {o.liquidacaoNumero} · empenho {o.empenhoNumero} ·{" "}
                      {o.credorCpfCnpj}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs">
                    <ValorMonetario valor={o.valor} comSimbolo />
                    <Badge status={tomDoEstado(o.estado)}>
                      {ROTULO_ESTADO[o.estado] ?? o.estado}
                    </Badge>
                  </span>
                </div>

                <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
                  Prevista para {dataBr(o.dataPrevista)} · conta {o.contaBancaria} · fonte{" "}
                  {o.fonteCodigo} · {o.historico}
                </p>

                <ol className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Etapa
                    n={1}
                    titulo="Preparada"
                    concluida
                    detalhe={`${instante(o.preparadaEm)} · ${o.preparadaPor}`}
                  />
                  <Etapa
                    n={2}
                    titulo="Autorizada"
                    concluida={o.autorizadaEm !== null}
                    detalhe={
                      o.canceladaPor !== null
                        ? `cancelada por ${o.canceladaPor}${o.motivoDoCancelamento === null ? "" : ` — ${o.motivoDoCancelamento}`}`
                        : o.autorizadaEm === null
                          ? "aguardando quem consente"
                          : `${instante(o.autorizadaEm)} · ${o.autorizadaPor}`
                    }
                  />
                  <Etapa
                    n={3}
                    titulo="Pagamento registrado"
                    concluida={o.pagamentoNumero !== null}
                    detalhe={
                      o.pagamentoNumero === null
                        ? "ainda não registrado"
                        : `${o.pagamentoNumero} em ${o.pagamentoEm === null ? "—" : dataBr(o.pagamentoEm)}`
                    }
                  />
                  <Etapa
                    n={4}
                    titulo="Confirmação do banco"
                    concluida={o.confirmacaoBancaria === "CONFIRMADO"}
                    detalhe={
                      o.confirmacaoBancaria === "CONFIRMADO"
                        ? "conciliada com o extrato"
                        : "sem conciliação com o extrato"
                    }
                  />
                </ol>

                {/*
                  ⚠️ A ETAPA QUE NÃO EXISTE APARECE ASSIM: cinza, com o motivo, e sem
                  botão. Esconder faria o operador concluir que registrar o pagamento
                  aqui move dinheiro.
                */}
                <p className="mt-3 rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] px-3 py-2 text-xs text-[color:var(--color-ink-2)]">
                  <strong className="text-[color:var(--color-ink)]">
                    Envio ao banco: indisponível
                  </strong>{" "}
                  — {envio.motivo}. {envio.detalhe}
                </p>

                {o.estado === "PREPARADA" ? (
                  <div className="mt-3 flex flex-wrap gap-4">
                    <FormAutorizar ordemId={o.id} />
                    <FormCancelar ordemId={o.id} />
                  </div>
                ) : o.estado === "AUTORIZADA" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                    <span className="text-[color:var(--color-ink-2)]">
                      Autorizada — registre o pagamento na{" "}
                      <a
                        href="/despesa/pagamentos"
                        className="text-[color:var(--color-primary)] hover:underline"
                      >
                        fila de pagamentos
                      </a>
                      .
                    </span>
                    <FormCancelar ordemId={o.id} />
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Etapa({
  n,
  titulo,
  concluida,
  detalhe,
}: {
  readonly n: number;
  readonly titulo: string;
  readonly concluida: boolean;
  readonly detalhe: string;
}): React.ReactElement {
  return (
    <li
      className={`rounded-[var(--radius-md)] border px-3 py-2 text-xs ${
        concluida
          ? "border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)]"
          : "border-dashed border-[color:var(--color-border)]"
      }`}
    >
      <div className="font-medium text-[color:var(--color-ink)]">
        {n}. {titulo}
      </div>
      <div className="mt-0.5 text-[color:var(--color-ink-2)]">{detalhe}</div>
    </li>
  );
}
