import Link from "next/link";
import { Card } from "../../../../../components/ui/Card";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { PortaSemBancoError } from "../../../../../lib/portas/cliente";
import { exigirLeitura } from "../../../../../lib/portas/molde";
import { painelDosPedidosDeAcesso } from "../../../../../lib/portas/pedido-de-acesso";
import { FormProtocolar } from "./FormsDoPedido";

/**
 * OS PEDIDOS DE ACESSO À INFORMAÇÃO (V11 V5.3).
 *
 * ⚠️ ESTA É A TELA INTERNA. O que o cidadão vê está na consulta pública, pelo número e pelo
 * código verificador do processo — e é outra projeção, montada por outra função.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do dia civil.
 */
export const dynamic = "force-dynamic";

const CLASSE_SITUACAO: Readonly<Record<string, string>> = {
  VENCIDO: "bg-[color:var(--color-status-erro-bg)] text-[color:var(--color-status-erro-fg)]",
  A_VENCER: "bg-[color:var(--color-status-alerta-bg)] text-[color:var(--color-status-alerta-fg)]",
};

export default async function Pagina(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PROTOCOLO");

  const cabecalho = (
    <PageHeader
      titulo="Pedidos de acesso à informação"
      subtitulo="O rito de cada pedido: para onde foi, qual é o prazo pela norma que valia quando ele entrou, e o que já foi respondido."
    />
  );

  let p: Awaited<ReturnType<typeof painelDosPedidosDeAcesso>>;
  try {
    p = await painelDosPedidosDeAcesso();
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <>
          {cabecalho}
          <EstadoVazio titulo="Sem banco configurado" descricao="Esta tela lê os pedidos protocolados e precisa do banco." />
        </>
      );
    }
    throw e;
  }

  return (
    <>
      {cabecalho}
      <div className="space-y-4">
        {p.podeProtocolar ? (
          <FormProtocolar assuntos={p.assuntos} setores={p.setores} exercicios={p.exercicios} />
        ) : (
          <Card>
            <p className="text-xs text-[color:var(--color-ink-2)]" data-sem-formulario>
              Seu perfil não tem a ação de protocolar pedido de acesso à informação. A lista abaixo continua visível.
            </p>
          </Card>
        )}

        <Card>
          {p.pedidos.length === 0 ? (
            <EstadoVazio titulo="Nenhum pedido protocolado" descricao="Quando o primeiro pedido entrar, ele aparece aqui com o prazo dele." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs" data-lista-de-pedidos>
                <caption className="sr-only">Pedidos de acesso à informação</caption>
                <thead>
                  <tr className="text-[color:var(--color-ink-2)]">
                    <th scope="col" className="py-2 pr-3">Protocolo</th>
                    <th scope="col" className="py-2 pr-3">Situação</th>
                    <th scope="col" className="py-2 pr-3">Prazo de resposta</th>
                    <th scope="col" className="py-2">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {p.pedidos.map((l) => (
                    <tr key={l.id} data-pedido={l.protocolo} className="border-t border-[color:var(--color-border)]">
                      <td className="py-2 pr-3 font-semibold">{l.protocolo}</td>
                      <td className="py-2 pr-3">{l.rotulo}</td>
                      <td className="py-2 pr-3">
                        {l.limite === null ? (
                          <span data-sem-prazo>sem data — o ente não publicou a configuração</span>
                        ) : (
                          <span className={`rounded-[var(--radius-sm)] px-1.5 py-0.5 ${CLASSE_SITUACAO[l.situacaoDoPrazo] ?? ""}`}>
                            {l.limite}
                          </span>
                        )}
                      </td>
                      <td className="py-2">
                        <Link
                          href={`/protocolo/acesso-a-informacao/pedidos/${l.id}`}
                          data-abrir-pedido={l.protocolo}
                          className="text-[color:var(--color-primary)] underline underline-offset-2"
                        >
                          abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
