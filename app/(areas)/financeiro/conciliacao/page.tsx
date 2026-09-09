import Link from "next/link";
import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../components/ui/ValorMonetario";
import { lerPainelConciliacao, PortaSemBancoError, type PainelConciliacao } from "../../../../lib/portas/conciliacao";
import { dataBr, recorteDe } from "../../../../lib/recorte";

/**
 * CONCILIAÇÃO BANCÁRIA (M09 bloco 3 + M17-a) — SÓ LEITURA.
 *
 * ═══ POR QUE ESTA TELA MORA EM /financeiro E NÃO EM /integracoes ═══
 * A Central de Integrações responde "o canal está de pé, e em que modo?"; esta tela responde "o
 * banco e o razão contam a mesma história?". A segunda pergunta é de TESOURARIA — quem a faz é o
 * tesoureiro fechando o mês, não quem cuida do canal. Por isso ela é `/financeiro/conciliacao`, e
 * a Central apenas APONTA para cá (o card do BB ganhou ação). O hub do Financeiro, que antes
 * mandava o usuário para a Central e a Central para lugar nenhum, agora aponta direto para o
 * número — o anel se fechou no lugar certo.
 *
 * ⚠️ HONESTIDADE (DIRETIVA §4/§7): a massa é FIXTURE POC (modo MOCK). NENHUMA chamada financeira
 * real foi feita — nem para consultar, muito menos para movimentar. Isso está dito no topo da
 * tela, em destaque, e não em nota de rodapé.
 */
export const dynamic = "force-dynamic";

/** dd/mm/aaaa hh:mm (UTC) — o carimbo do vínculo/import, que é evento, não data de fato. */
function carimbo(d: Date): string {
  return `${dataBr(d)} ${d.toISOString().slice(11, 16)}`;
}

export default async function ConciliacaoBancariaPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  const { exercicio } = recorteDe(await searchParams);

  const cabecalho = (
    <PageHeader
      titulo="Conciliação bancária"
      subtitulo={`Exercício ${exercicio} — o extrato do banco confrontado com o razão: o que já casou, o que ainda não, e a diferença toda nomeada.`}
    />
  );

  let painel: PainelConciliacao | null;
  try {
    painel = await lerPainelConciliacao({ exercicio });
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={
            erro instanceof PortaSemBancoError
              ? "Banco de dados não configurado"
              : "Não foi possível emitir a conciliação"
          }
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  // Sem extrato importado NÃO é "tudo conciliado" — é "não há o que conciliar". A diferença
  // importa: um zero mudo aqui faria a Comissão ler uma conta fechada onde não há conta nenhuma.
  if (painel === null) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={`Nenhum extrato bancário importado no exercício ${exercicio}`}
          descricao="Conciliar é confrontar um extrato com o razão — sem extrato não há confronto. A importação (arquivo OFX ou API do Banco do Brasil) é feita na Central de Integrações."
          acao={
            <Link href="/integracoes" className="text-sm font-semibold text-[color:var(--color-primary)] underline">
              Ir para a Central de Integrações
            </Link>
          }
        />
      </div>
    );
  }

  const { conta, extrato, resumo, modo } = painel;
  const fecha = resumo.diferenca === resumo.diferencaExplicada;

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}

      {/* ══ HONESTIDADE, NO TOPO — não é nota de rodapé (DIRETIVA §4/§7) ══ */}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] bg-[color:var(--color-status-alerta-bg)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        <strong className="text-[color:var(--color-ink)]">Origem dos dados: FIXTURE POC (modo MOCK).</strong>{" "}
        As linhas do extrato abaixo vieram de uma <strong>massa sintética</strong> no formato da API de
        Extratos do Banco do Brasil, normalizada e importada pelo caminho real do sistema.{" "}
        <strong>Nenhuma chamada financeira real foi feita</strong> — nem de consulta de saldo/extrato,
        nem, com muito mais razão, de movimentação. {modo.live} Agência e conta aparecem{" "}
        <strong>mascaradas</strong>: o número completo não sai do servidor.
      </div>

      {/* ══ A CONTA, A ORIGEM E O MODO ══ */}
      <Card>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-[color:var(--color-ink)]">
              {conta.codigo} — {conta.descricao}
            </h2>
            <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
              Conta contábil de contrapartida: <span className="font-mono">{conta.contaContabil}</span> — é
              contra ela que o extrato tem de fechar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge status="neutro">origem {extrato.origem}</Badge>
            <Badge status={modo.estado === "DISPONIVEL" ? "ok" : "alerta"}>modo {modo.modo}</Badge>
          </div>
        </div>

        <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Banco (FEBRABAN)</dt>
            <dd className="mt-0.5 font-mono text-[color:var(--color-ink)]">{conta.banco ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Agência (mascarada)</dt>
            <dd className="mt-0.5 font-mono text-[color:var(--color-ink)]">{conta.agenciaMascarada}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Conta (mascarada)</dt>
            <dd className="mt-0.5 font-mono text-[color:var(--color-ink)]">{conta.contaMascarada}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Competência do extrato</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">
              {dataBr(extrato.periodoInicio)} a {dataBr(extrato.periodoFim)}
            </dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Data de corte do relatório</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">{dataBr(painel.corte)}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Linhas importadas</dt>
            <dd className="mt-0.5 tabular text-[color:var(--color-ink)]">{extrato.quantidadeLinhas}</dd>
          </div>
          <div>
            <dt className="text-[color:var(--color-ink-3)]">Importado por / em</dt>
            <dd className="mt-0.5 text-[color:var(--color-ink)]">
              {extrato.importadoPor} · {carimbo(extrato.importadoEm)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[color:var(--color-ink-3)]">Hash da origem (SHA-256)</dt>
            <dd className="mt-0.5 truncate font-mono text-[color:var(--color-ink-2)]" title={extrato.hashOrigem}>
              {extrato.hashOrigem.slice(0, 24)}…
            </dd>
          </div>
        </dl>

        <p className="mt-3 text-xs text-[color:var(--color-ink-3)]">{modo.mensagem}</p>
      </Card>

      {/* ══ CORRESPONDÊNCIAS — os dois lados, lado a lado ══ */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
          Correspondências — lançamento do extrato × fato do sistema
        </h2>
        <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
          Cada linha é um vínculo VIVO (append-only: desfazer é um registro novo, nunca um DELETE).
          Correspondência parcial é legítima dos dois lados — por isso o valor conciliado aparece
          separado dos valores de cada lado.
        </p>
        {painel.correspondencias.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhuma linha do extrato foi conciliada até o corte.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Extrato — data</th>
                  <th className="py-1.5 pr-4">Extrato — histórico (FITID)</th>
                  <th className="py-1.5 pr-4 text-right">Extrato — valor</th>
                  <th className="py-1.5 pr-4">Interno — data</th>
                  <th className="py-1.5 pr-4">Interno — documento</th>
                  <th className="py-1.5 pr-4 text-right">Interno — valor</th>
                  <th className="py-1.5 text-right">Conciliado</th>
                </tr>
              </thead>
              <tbody>
                {painel.correspondencias.map((c) => (
                  <tr key={c.vinculoId} className="border-b border-[color:var(--color-border)] align-top">
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(c.extrato.data)}</td>
                    <td className="py-1.5 pr-4">
                      <span className="text-[color:var(--color-ink)]">{c.extrato.memo}</span>
                      <span className="ml-1 text-[color:var(--color-ink-3)]">({c.extrato.natureza})</span>
                      <div className="font-mono text-xs text-[color:var(--color-ink-3)]">FITID {c.extrato.fitid}</div>
                    </td>
                    <td className="py-1.5 pr-4 text-right whitespace-nowrap"><ValorMonetario valor={c.extrato.valor} /></td>
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(c.interno.data)}</td>
                    <td className="py-1.5 pr-4">
                      <span className="text-[color:var(--color-ink)]">{c.interno.rotulo}</span>
                      {c.interno.detalhe !== null ? (
                        <div className="text-xs text-[color:var(--color-ink-3)]">{c.interno.detalhe}</div>
                      ) : null}
                    </td>
                    <td className="py-1.5 pr-4 text-right whitespace-nowrap"><ValorMonetario valor={c.interno.valor} /></td>
                    <td className="py-1.5 text-right font-semibold whitespace-nowrap">
                      <ValorMonetario valor={c.valorConciliado} />
                      <div className="text-xs font-normal text-[color:var(--color-ink-3)]">
                        {carimbo(c.conciliadoEm)} · {c.conciliadoPor}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="py-2 pr-4 text-right text-[color:var(--color-ink-2)]">
                    Total conciliado
                  </td>
                  <td className="py-2 text-right font-semibold"><ValorMonetario valor={resumo.totalConciliado} /></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {/* ══ PENDÊNCIAS — os dois lados, cada um com o seu significado ══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
            No banco e não no razão
          </h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            Linhas do extrato sem fato interno correspondente: tarifa não contabilizada, crédito ainda
            não registrado. O sinal é do dinheiro — positivo entrou, negativo saiu.
          </p>
          {painel.pendenciasExtrato.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-3)]">Nada pendente deste lado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Data</th>
                  <th className="py-1.5 pr-4">Linha do extrato</th>
                  <th className="py-1.5 text-right">Residual</th>
                </tr>
              </thead>
              <tbody>
                {painel.pendenciasExtrato.map((l, i) => (
                  <tr key={i} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">{l.descricao}</td>
                    <td className="py-1.5 text-right whitespace-nowrap"><ValorMonetario valor={l.residual} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="py-2 pr-4 text-right text-[color:var(--color-ink-2)]">Soma</td>
                  <td className="py-2 text-right font-semibold"><ValorMonetario valor={resumo.totalPendenteExtrato} /></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>

        <Card>
          <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">
            No razão e não no banco
          </h2>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            Fatos do sistema que moveram esta conta e ainda não apareceram no extrato: cheque não
            compensado, depósito não creditado.
          </p>
          {painel.pendenciasInternas.length === 0 ? (
            <p className="text-sm text-[color:var(--color-ink-3)]">Nada pendente deste lado.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Data</th>
                  <th className="py-1.5 pr-4">Documento</th>
                  <th className="py-1.5 text-right">Residual</th>
                </tr>
              </thead>
              <tbody>
                {painel.pendenciasInternas.map((l, i) => (
                  <tr key={i} className="border-b border-[color:var(--color-border)]">
                    <td className="py-1.5 pr-4 whitespace-nowrap">{dataBr(l.data)}</td>
                    <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">
                      {l.descricao} <span className="text-[color:var(--color-ink-3)]">[{l.tipo}]</span>
                    </td>
                    <td className="py-1.5 text-right whitespace-nowrap"><ValorMonetario valor={l.residual} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2} className="py-2 pr-4 text-right text-[color:var(--color-ink-2)]">Soma</td>
                  <td className="py-2 text-right font-semibold"><ValorMonetario valor={resumo.totalPendenteInterno} /></td>
                </tr>
              </tfoot>
            </table>
          )}
        </Card>
      </div>

      {/* ══ O RESUMO QUE FECHA ══ */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-[color:var(--color-ink)]">Resumo — e a amarração</h2>
        <p className="mb-3 text-xs text-[color:var(--color-ink-3)]">
          A diferença entre os saldos tem de ser exatamente a soma das pendências dos dois lados. Ela é
          uma identidade: cada vínculo aparece nos dois lados com o mesmo valor e o mesmo sinal, então
          os vínculos se cancelam e sobra só o que não foi explicado. Se ela não fechasse, o
          relatório <strong>não sairia</strong> — o motor recusa emitir diferença sem nome.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">Saldo pelo extrato (banco), até o corte</td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.saldoExtrato} /></td>
              </tr>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">
                  Saldo pelo razão (conta <span className="font-mono">{conta.contaContabil}</span>), até o corte
                </td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.saldoContabil} /></td>
              </tr>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 font-semibold text-[color:var(--color-ink)]">Diferença (extrato − razão)</td>
                <td className="py-1.5 text-right font-semibold"><ValorMonetario valor={resumo.diferenca} /></td>
              </tr>
              <tr className="border-b border-[color:var(--color-border)]">
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">Pendente no banco (+) menos pendente no razão (−)</td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.diferencaExplicada} /></td>
              </tr>
              <tr>
                <td className="py-1.5 pr-4 text-[color:var(--color-ink-2)]">Total já conciliado (vínculos vivos)</td>
                <td className="py-1.5 text-right"><ValorMonetario valor={resumo.totalConciliado} /></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge status={fecha ? "ok" : "erro"}>{fecha ? "amarração fecha" : "amarração não fecha"}</Badge>
          <span className="text-xs text-[color:var(--color-ink-2)]">
            {fecha
              ? "A diferença está inteiramente explicada pelas pendências listadas acima — nenhum centavo sem nome."
              : "Sobrou diferença sem explicação: ou falta um fato no relatório, ou há vínculo cruzando a data de corte."}
          </span>
        </div>
      </Card>

      <p className="text-xs text-[color:var(--color-ink-3)]">
        Esta tela é <strong>consulta</strong>. Vincular e desvincular são atos do domínio (M09), com as
        travas de natureza, de conta/fonte e de capacidade aplicadas na gravação — e desvincular é um
        registro novo, nunca um apagamento. O <strong>formulário de vínculo</strong> fica nomeado como
        próxima fatia.
      </p>
    </div>
  );
}
