import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerDescontosDaFolha } from "../../../../lib/portas/descontos-da-folha";
import { DescontosDoEnte, FormDesconto } from "./FormDesconto";

/**
 * OS DESCONTOS DA FOLHA RETIDOS NO PAGAMENTO (M33, V28) — a quem cada desconto do contracheque é devido.
 *
 * ⚠️ POR QUE ESTA TELA EXISTE. O pagamento da folha só retinha o IR; a previdência do servidor, a pensão
 * e o consignado iam para o servidor junto com o líquido. Aqui o ente declara a consignação de cada
 * rubrica de desconto, e o pagamento passa a retê-la — e recusa enquanto houver rubrica sem declaração.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function DescontosRetidosPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerDescontosDaFolha>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FOLHA");
    dados = await lerDescontosDaFolha();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Descontos retidos no pagamento" subtitulo="A quem cada desconto do contracheque é devido" />
        <EstadoVazio titulo="Não foi possível ler as rubricas" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  const pendentes = dados.rubricas.filter((r) => r.fora === null && r.versao === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Descontos retidos no pagamento" subtitulo="A quem cada desconto do contracheque é devido" />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        No pagamento da folha, cada desconto do contracheque é retido como consignação e repassado a quem é devido; o
        servidor recebe o líquido. <strong>O pagamento da folha não é aceito enquanto houver desconto sem retenção declarada.</strong>{" "}
        Uma nova declaração cria outra versão, sem alterar os pagamentos já feitos.
      </div>
      {pendentes.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="descontos-sem-retencao">
          <strong>{pendentes.length} desconto(s) sem retenção declarada: {pendentes.map((r) => r.codigo).join(", ")}</strong>. O pagamento da folha que os contenha não é aceito até a declaração.
        </div>
      ) : null}
      {dados.tipos.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs">
          Nenhum tipo de consignação ativo com conta de passivo. Cadastre-os em Financeiro &gt; Consignações.
        </div>
      ) : null}
      <Card>
        <DescontosDoEnte tipos={dados.tipos}>
          {dados.rubricas.length === 0 ? (
            <EstadoVazio titulo="Nenhuma rubrica de desconto" descricao="Cadastre as rubricas da folha para declarar a retenção de cada desconto." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Rubricas de desconto e a consignação que retém cada uma no pagamento</caption>
                <thead>
                  <tr className="text-[color:var(--color-ink-3)]">
                    <th scope="col" className="py-2 pr-3">Rubrica</th>
                    <th scope="col" className="py-2 pr-3">Retenção</th>
                    <th scope="col" className="py-2 pr-3">Devido a</th>
                    <th scope="col" className="py-2 pr-3">Fundamento</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.rubricas.map((r) => (
                    <tr key={r.id} data-rubrica={r.codigo} className="border-t border-[color:var(--color-border)] align-top">
                      <th scope="row" className="py-2 pr-3 font-normal">
                        {r.codigo} — {r.descricao}
                        {r.fora === null ? <FormDesconto rubricaId={r.id} rubricaRotulo={`${r.codigo} — ${r.descricao}`} declarada={r.versao !== null} /> : null}
                      </th>
                      <td className="py-2 pr-3" data-papel="retencao">
                        {r.fora !== null ? (
                          <span className="text-[color:var(--color-ink-2)]">Não é consignação: {r.fora}.</span>
                        ) : r.tipoRotulo === null ? (
                          <Badge status="alerta">Não declarada</Badge>
                        ) : (
                          <>
                            {r.tipoRotulo}
                            <span className="ml-2 text-[color:var(--color-ink-3)]">versão {String(r.versao)}</span>
                          </>
                        )}
                      </td>
                      <td className="py-2 pr-3">{r.credor ?? "—"}</td>
                      <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">{r.fundamento ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DescontosDoEnte>
      </Card>
    </div>
  );
}
