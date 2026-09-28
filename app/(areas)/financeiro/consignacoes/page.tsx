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
        <PageHeader titulo="Consignações" subtitulo="Tipos de consignação e contas de passivo das retenções na fonte" />
        <EstadoVazio
          titulo="Não foi possível carregar as consignações"
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const semConta = tipos.filter((t) => t.ativo && t.contaCodigo === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Consignações" subtitulo="Tipos de consignação e contas de passivo das retenções na fonte" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        A retenção na fonte é uma <strong>obrigação</strong> com o consignatário (INSS, Receita Federal,
        município do ISS, beneficiário de pensão). A conta de passivo de cada tipo é{" "}
        <strong>definida pelo ente</strong> e registrada com o responsável, a data e a justificativa.
        As consignações sem conta definida <strong>não são oferecidas no pagamento</strong>.
      </div>

      <FormCadastrar contas={contas} />

      {semConta.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs"
          data-teste="consignacoes-sem-conta"
        >
          <strong>
            {semConta.length} consignação(ões) sem conta definida: {semConta.map((t) => t.codigo).join(", ")}
          </strong>
          . Elas não são oferecidas no pagamento. Defina a conta de cada uma para permitir a retenção.
        </div>
      ) : null}

      {tipos.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma consignação cadastrada"
          descricao="Sem consignação com conta definida, o pagamento não oferece retenção. Cadastre a primeira no painel acima."
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
                  <tr
                    key={t.id}
                    className="border-b border-[color:var(--color-border)] align-top"
                    data-teste={`consignacao-${t.codigo}`}
                    /* ⚠️ O ESTADO DA LINHA COMO DADO, E NÃO COMO PROSA (V11 V8.16). O percurso da
                       cadeia da despesa já errou duas vezes lendo texto desta tela — casou a
                       própria explicação da página procurando "inss", e escolheu conta por nome.
                       Quem precisa saber se a conta foi DECIDIDA lê um atributo; a frase fica para
                       quem lê a tela. */
                    data-decisao={t.semDecisao ? "herdada" : "do-ente"}
                    data-conta={t.contaCodigo ?? ""}
                  >
                    <td className="py-1.5 pr-4">
                      <strong>{t.codigo}</strong>
                      <span className="block text-xs text-[color:var(--color-ink-3)]">{t.descricao}</span>
                    </td>
                    <td className="py-1.5 pr-4">
                      {t.contaCodigo === null ? (
                        <span className="text-xs text-[color:var(--color-status-erro-fg)]">
                          sem conta: não é oferecida no pagamento
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
                        <em>Conta da carga inicial, ainda não confirmada pelo ente.</em>
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
