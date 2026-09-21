import { Badge } from "../../../../components/ui/Badge";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerContasDePassivo, lerTiposDeConsignacao } from "../../../../lib/portas/consignacoes";
import { AtosDaConsignacao, AtosDoTipo, FormCadastrar } from "./FormsDaConsignacao";

/**
 * AS CONSIGNAÇÕES — ONDE O ENTE DIZ EM QUE CONTA A RETENÇÃO VIRA DÍVIDA (M07, V11 V8.3).
 *
 * ═══ ⚠️ POR QUE ESTA TELA EXISTE ═══
 * A pendência `CONSIGNACAO-CONTA-SINTETICA` dizia — e continua dizendo — que escolher entre as
 * trinta analíticas sob "CONSIGNAÇÕES" é classificação contábil do ente, e que o produto não pode
 * escolher por ele. Tudo certo. O que estava errado era outra coisa: **não havia onde o ente
 * escolher**. `TipoConsignacao` só nascia por seed e por teste, e em instalação limpa a retenção
 * simplesmente não aparecia no pagamento — sem que nada na tela dissesse por quê.
 *
 * ⚠️ E A AUSÊNCIA CONTINUA APARECENDO, agora com nome: um tipo sem conta decidida é mostrado como
 * NÃO OFERECIDO na retenção, com o motivo ao lado. É a diferença entre "o sistema não faz" e "o
 * ente ainda não decidiu" — e só a segunda é uma pendência que alguém pode fechar.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function ConsignacoesPage(): Promise<React.ReactElement> {
  let tipos: Awaited<ReturnType<typeof lerTiposDeConsignacao>>;
  let contas: Awaited<ReturnType<typeof lerContasDePassivo>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
    tipos = await lerTiposDeConsignacao();
    contas = await lerContasDePassivo();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Consignações" subtitulo="Onde a retenção na fonte vira dívida com o consignatário" />
        <EstadoVazio
          titulo="Não foi possível ler as consignações"
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const semConta = tipos.filter((t) => t.ativo && t.contaCodigo === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Consignações" subtitulo="Onde a retenção na fonte vira dívida com o consignatário" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Uma retenção na fonte não é despesa: é <strong>dívida</strong> com quem vai receber — o
        INSS, a Receita, o município do ISS, quem tem a pensão. Em que conta do plano essa dívida
        nasce é <strong>decisão contábil do ente</strong>, e o sistema não a escolhe: ele a exige, e
        guarda quem decidiu, quando e por quê. Enquanto uma consignação não tiver conta,{" "}
        <strong>ela não é oferecida no pagamento</strong> — e é isso, e não um erro no meio da
        retenção, que a tela mostra.
      </div>

      <FormCadastrar contas={contas} />

      {semConta.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs"
          data-teste="consignacoes-sem-conta"
        >
          <strong>
            {semConta.length} consignação(ões) sem conta decidida — {semConta.map((t) => t.codigo).join(", ")}
          </strong>
          . Elas não aparecem na tela de pagamento. Escolha a conta de cada uma para que a retenção
          volte a ser possível.
        </div>
      ) : null}

      {tipos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma consignação cadastrada"
          descricao="Enquanto não houver consignação com conta decidida, a tela de pagamento não oferece retenção. Cadastre a primeira no painel acima."
        />
      ) : (
        <Card>
          <AtosDaConsignacao contas={contas}>
            <table className="w-full text-sm" data-teste="consignacoes">
              <thead>
                <tr className="border-b border-[color:var(--color-border)] text-left text-[color:var(--color-ink-2)]">
                  <th className="py-1.5 pr-4">Código</th>
                  <th className="py-1.5 pr-4">Conta do passivo</th>
                  <th className="py-1.5 pr-4">Situação</th>
                  <th className="py-1.5">Decisão</th>
                </tr>
              </thead>
              <tbody>
                {tipos.map((t) => (
                  <tr key={t.id} className="border-b border-[color:var(--color-border)] align-top" data-teste={`consignacao-${t.codigo}`}>
                    <td className="py-1.5 pr-4">
                      <strong>{t.codigo}</strong>
                      <span className="block text-xs text-[color:var(--color-ink-3)]">{t.descricao}</span>
                    </td>
                    <td className="py-1.5 pr-4">
                      {t.contaCodigo === null ? (
                        <span className="text-xs text-[color:var(--color-status-erro-fg)]">
                          sem conta — não é oferecida no pagamento
                        </span>
                      ) : (
                        <>
                          <span className="font-mono">{t.contaCodigo}</span>
                          <span className="block text-xs text-[color:var(--color-ink-3)]">{t.contaNome}</span>
                        </>
                      )}
                    </td>
                    <td className="py-1.5 pr-4">
                      <Badge status={t.ativo ? "neutro" : "alerta"}>{t.ativo ? "Ativa" : "Desativada"}</Badge>
                      {t.movimentos > 0 ? (
                        <span className="block text-xs text-[color:var(--color-ink-3)]">{t.movimentos} movimento(s)</span>
                      ) : null}
                    </td>
                    <td className="py-1.5 text-xs text-[color:var(--color-ink-2)]">
                      {/* ⚠️ O TIPO SEM DECISÃO É NOMEADO COMO TAL. Ele veio do seed, funciona pela
                          coluna antiga, e a diferença importa: ninguém do ente escolheu aquela
                          conta, e quem olhar precisa saber disso antes de confiar nela. */}
                      {t.semDecisao ? (
                        <em>Anterior ao cadastro — ninguém do ente decidiu esta conta ainda.</em>
                      ) : (
                        <>
                          {t.fundamento}
                          <span className="block text-[color:var(--color-ink-3)]">por {t.decididoPor}</span>
                        </>
                      )}
                      {t.ativo ? <AtosDoTipo tipoId={t.id} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </AtosDaConsignacao>
        </Card>
      )}
    </div>
  );
}
