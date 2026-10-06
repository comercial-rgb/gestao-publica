import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerContasDaReceita } from "../../../../lib/portas/contas-da-receita";
import { FormContaDaReceita } from "./FormContaDaReceita";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * AS CONTAS DA RECEITA POR NATUREZA — em que conta da DVP cada receita arrecadada entra (M04, V28).
 *
 * ⚠️ POR QUE ESTA TELA EXISTE. A guia da tela creditava uma conta fixa no código (no plano do TCE-PB, a VPA do
 * ITR) para toda natureza. Aqui a contabilidade declara a conta de cada natureza, por prefixo, e a guia passa
 * a lê-la — recusando a natureza sem declaração.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function ContasDaReceitaPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerContasDaReceita>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_CONTABILIDADE");
    dados = await lerContasDaReceita();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Contas da receita por natureza" subtitulo="Em que conta da variação patrimonial cada receita arrecadada entra" />
        <EstadoVazio titulo="Não foi possível ler as naturezas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const pendentes = dados.naturezas.filter((n) => n.contaVpa === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Contas da receita por natureza" subtitulo="Em que conta da variação patrimonial cada receita arrecadada entra" />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A declaração vale para todas as naturezas que começam pelos dígitos informados, e a mais específica prevalece
        (por exemplo, 1118 para os impostos sobre o patrimônio e 11180111 só para o IPTU).{" "}
        <strong>A guia de natureza sem conta declarada não é aceita.</strong> Uma nova declaração cria outra versão, sem
        alterar as guias já registradas.
      </div>
      {pendentes.length > 0 ? (
        <div className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs" data-teste="naturezas-sem-conta">
          <strong>{pendentes.length} natureza(s) em uso sem conta declarada: {pendentes.map((n) => n.codigo).join(", ")}</strong>. A guia dessas naturezas não é aceita até a declaração.
        </div>
      ) : null}
      <FormContaDaReceita {...(pendentes[0] !== undefined ? { prefixoInicial: pendentes[0].codigo } : {})} />
      <Card>
        {dados.naturezas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma natureza de receita em uso" descricao="As naturezas aparecem aqui quando forem previstas na lei orçamentária ou arrecadadas." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Naturezas de receita em uso e a conta da variação patrimonial de cada uma</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Natureza</th>
                  <th scope="col" className="py-2 pr-3">Conta</th>
                  <th scope="col" className="py-2 pr-3">Declaração que a cobre</th>
                </tr>
              </thead>
              <tbody>
                {dados.naturezas.map((n) => (
                  <tr key={n.codigo} data-natureza={n.codigo} className="border-t border-[color:var(--color-border)] align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {n.codigo} — {n.descricao}
                    </th>
                    <td className="py-2 pr-3" data-papel="conta">
                      {n.contaVpa === null ? <Badge status="alerta">Sem conta</Badge> : `${n.contaVpa}${n.contaNome !== null ? ` — ${n.contaNome}` : ""}`}
                    </td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">{n.prefixo === null ? "—" : `início ${n.prefixo}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {dados.declaracoes.length > 0 ? (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Declarações vigentes</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Início da natureza</th>
                  <th scope="col" className="py-2 pr-3">Conta</th>
                  <th scope="col" className="py-2 pr-3">Fundamento</th>
                </tr>
              </thead>
              <tbody>
                {dados.declaracoes.map((d) => (
                  <tr key={d.prefixo} data-prefixo={d.prefixo} className="border-t border-[color:var(--color-border)] align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">
                      {d.prefixo} <span className="text-[color:var(--color-ink-3)]">versão {String(d.versao)}</span>
                    </th>
                    <td className="py-2 pr-3">{`${d.contaVpa}${d.contaNome !== null ? ` — ${d.contaNome}` : ""}`}</td>
                    <td className="py-2 pr-3 text-[color:var(--color-ink-2)]">
                      {d.fundamento}
                      <span className="block text-[color:var(--color-ink-3)]">por {d.criadoPor}</span>
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
