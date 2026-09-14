import Link from "next/link";
import { Card } from "../../../components/ui/Card";
import { EstadoVazio } from "../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../lib/portas/leitura";
import { minhasSolicitacoesPara, PortaSemBancoError, quemPedePara } from "../../../lib/portas/carta-de-servicos";

/**
 * MEUS SERVIÇOS (V6.2 P3): as solicitações da pessoa da sessão e das pessoas que ela representa HOJE.
 *
 * ⚠️ NÃO HÁ ID DE PESSOA NA ENTRADA. A porta resolve pela sessão; sem vínculo, a tela diz que ele está
 * pendente e quem resolve. Representação revogada tira as solicitações da empresa desta lista.
 * ⚠️ Imports RELATIVOS na UI. `force-dynamic`: tudo depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function Pagina(): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_MEUS_SERVICOS");
  try {
    const [quem, solicitacoes] = await Promise.all([quemPedePara(sessao), minhasSolicitacoesPara(sessao)]);
    return (
      <div className="space-y-4">
        <PageHeader
          titulo="Minhas solicitações"
          subtitulo={quem.pessoa === null ? "Sua conta ainda não está ligada ao cadastro de pessoa." : `${quem.pessoa.nome} · ${quem.pessoa.documento}${quem.titulares.length > 1 ? ` · representa ${quem.titulares.length - 1} pessoa(s)` : ""}`}
          acoes={<Link href="/servicos" className="text-sm text-[color:var(--color-primary)] underline">Carta de serviços</Link>}
        />
        {quem.pessoa === null ? (
          <EstadoVazio
            titulo="A sua conta ainda não está ligada ao seu cadastro de pessoa"
            descricao="Os pedidos são feitos em nome de uma pessoa do cadastro, e para isso o sistema precisa saber quem você é. Esse vínculo é feito pelo atendimento, pelo CPF — nunca pelo nome."
          />
        ) : solicitacoes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma solicitação ainda" descricao="Escolha um serviço na carta para fazer o seu primeiro pedido." />
        ) : (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-sm" data-minhas-solicitacoes>
                <caption className="sr-only">Solicitações que você pode acompanhar</caption>
                <thead>
                  <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                    <th scope="col" className="py-2">Protocolo</th>
                    <th scope="col">Serviço</th>
                    <th scope="col">Em nome de</th>
                    <th scope="col">Situação</th>
                    <th scope="col">Protocolada em</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitacoes.map((s) => (
                    <tr key={s.id} data-solicitacao={s.protocolo} className="border-b border-[color:var(--color-border)]">
                      <td className="py-2"><Link href={`/meus-servicos/${s.id}`} className="text-[color:var(--color-primary)] underline">{s.protocolo}</Link></td>
                      <td>{s.servico}</td>
                      <td>{s.titular}{s.viaRepresentacao ? " (representação)" : ""}</td>
                      <td data-situacao={s.situacao}>{s.rotuloDaSituacao}</td>
                      <td>{s.protocoladaEm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    );
  } catch (e) {
    if (e instanceof PortaSemBancoError) return <EstadoVazio titulo="Banco de dados indisponível" descricao="Esta tela lê as suas solicitações. Sem banco, não tem o que mostrar — e não vai fingir que tem." />;
    throw e;
  }
}
