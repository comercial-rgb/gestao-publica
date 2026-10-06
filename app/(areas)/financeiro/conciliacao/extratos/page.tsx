import Link from "next/link";
import { Badge } from "../../../../../components/ui/Badge";
import { BotaoPdf } from "../../../../../components/ui/BotaoPdf";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../../components/ui/SincronizarContexto";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { listarExtratosImportados, lerExtratoParaImpressao, type ExtratoDaLista, type ExtratoParaImpressao } from "../../../../../lib/portas/conciliacao";
import { SITUACAO_DA_LINHA } from "../../../../../lib/pdf/extrato-importado";
import { dataBr, exercicioAutorizado } from "../../../../../lib/recorte";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";

/**
 * V36 — OS EXTRATOS IMPORTADOS (TR 5.10.2.44, "permitir a impressão do extrato importado"). A lista do exercício,
 * de todas as contas; escolhido um extrato (`?id=`), as linhas como o banco as mandou, a situação de cada uma na
 * conciliação e a impressão em PDF. Leitura do ente: conta bancária não pertence a unidade gestora.
 */
export const dynamic = "force-dynamic";

const CELULA = "py-1.5 pr-3";

function primeiro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? (v[0] ?? "") : (v ?? "")).trim();
}

export default async function ExtratosImportadosPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
  const sp = await searchParams;
  const id = primeiro(sp["id"]);
  let exercicio: number;
  let lista: readonly ExtratoDaLista[];
  let escolhido: ExtratoParaImpressao | null = null;
  try {
    exercicio = exercicioAutorizado(sp);
    lista = await listarExtratosImportados({ exercicio });
    if (id !== "") escolhido = await lerExtratoParaImpressao(id);
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Extratos importados" subtitulo="Os extratos bancários como o banco os mandou" />
        <EstadoVazio titulo="Não foi possível ler os extratos" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Extratos importados" subtitulo={`Exercício ${exercicio}: os extratos bancários como o banco os mandou, para consulta e impressão`} />
      <p className="text-sm">
        <Link href={`/financeiro/conciliacao?exercicio=${exercicio}`} className="text-[color:var(--color-primary)] underline">
          Voltar à conciliação bancária
        </Link>
      </p>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Extratos do exercício ({lista.length})</h2>
        {lista.length === 0 ? (
          <p className="text-sm text-[color:var(--color-ink-3)]">Nenhum extrato importado com período terminando em {exercicio}. A importação é feita na tela da conciliação.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-lista="extratos">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-3)]">
                  <th className={CELULA}>Conta</th>
                  <th className={CELULA}>Período</th>
                  <th className={CELULA}>Origem</th>
                  <th className={`${CELULA} text-right`}>Lançamentos</th>
                  <th className={CELULA}>Importado por</th>
                  <th className={CELULA}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => (
                  <tr key={e.id} className="border-t border-[color:var(--color-border)]" data-extrato={e.id}>
                    <td className={CELULA}>
                      {e.conta.codigo} · {e.conta.descricao}
                      <div className="text-xs text-[color:var(--color-ink-3)]">agência {e.conta.agenciaMascarada} · conta {e.conta.contaMascarada}</div>
                    </td>
                    <td className={`${CELULA} whitespace-nowrap`}>{dataBr(e.periodoInicio)} a {dataBr(e.periodoFim)}</td>
                    <td className={CELULA}>{e.origem === "API_BB" ? "API do Banco do Brasil" : "arquivo OFX"}</td>
                    <td className={`${CELULA} text-right tabular`}>{e.quantidadeLinhas}</td>
                    <td className={CELULA}>{e.importadoPor} · {dataBr(e.importadoEm)}</td>
                    <td className={`${CELULA} whitespace-nowrap`}>
                      <Link href={`/financeiro/conciliacao/extratos?exercicio=${exercicio}&id=${encodeURIComponent(e.id)}`} className="font-semibold text-[color:var(--color-primary)] underline">
                        Ver lançamentos
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {id !== "" && escolhido === null ? <EstadoVazio titulo="Extrato não encontrado" descricao="O extrato pedido não existe. Escolha um da lista acima." /> : null}

      {escolhido !== null ? (
        <Card>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold" data-extrato-escolhido={escolhido.id}>
              Conta {escolhido.conta.codigo} · {dataBr(escolhido.periodoInicio)} a {dataBr(escolhido.periodoFim)}
            </h2>
            <BotaoPdf href={`/financeiro/conciliacao/extratos/pdf?id=${encodeURIComponent(escolhido.id)}`} rotulo="Imprimir o extrato" />
          </div>
          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-[color:var(--color-ink-3)]">Créditos do arquivo</p>
              <p className="font-semibold" data-total="creditos"><ValorMonetario valor={escolhido.totalCreditos} /></p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-ink-3)]">Débitos do arquivo</p>
              <p className="font-semibold" data-total="debitos"><ValorMonetario valor={escolhido.totalDebitos} /></p>
            </div>
            <div>
              <p className="text-xs text-[color:var(--color-ink-3)]">Movimento do período</p>
              <p className="font-semibold" data-total="movimento"><ValorMonetario valor={escolhido.movimentoLiquido} /></p>
            </div>
          </div>
          <p className="mb-2 text-xs text-[color:var(--color-ink-3)]">
            Os totais são do movimento do arquivo, não o saldo da conta: o extrato gravado não guarda o saldo inicial.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-lista="linhas-do-extrato">
              <thead>
                <tr className="text-left text-xs text-[color:var(--color-ink-3)]">
                  <th className={CELULA}>Data</th>
                  <th className={CELULA}>Documento</th>
                  <th className={CELULA}>Histórico</th>
                  <th className={CELULA}>Identificador no banco</th>
                  <th className={`${CELULA} text-right`}>Crédito</th>
                  <th className={`${CELULA} text-right`}>Débito</th>
                  <th className={CELULA}>Na conciliação</th>
                </tr>
              </thead>
              <tbody>
                {escolhido.linhas.map((l) => (
                  <tr key={l.fitid} className="border-t border-[color:var(--color-border)]">
                    <td className={`${CELULA} whitespace-nowrap`}>{dataBr(l.data)}</td>
                    <td className={CELULA}>{l.documento ?? ""}</td>
                    <td className={CELULA}>{l.memo}</td>
                    <td className={`${CELULA} font-mono text-xs`}>{l.fitid}</td>
                    <td className={`${CELULA} text-right`}>{l.natureza === "CREDITO" ? <ValorMonetario valor={l.valor} /> : null}</td>
                    <td className={`${CELULA} text-right`}>{l.natureza === "DEBITO" ? <ValorMonetario valor={l.valor} /> : null}</td>
                    <td className={CELULA}>
                      <Badge status={l.situacao === "CONCILIADA" ? "ok" : l.situacao === "PARCIAL" ? "alerta" : "neutro"}>{SITUACAO_DA_LINHA[l.situacao]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
