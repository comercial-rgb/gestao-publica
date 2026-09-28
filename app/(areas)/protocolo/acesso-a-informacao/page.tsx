import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { exigirLeitura } from "../../../../lib/portas/molde";
import { PortaSemBancoError } from "../../../../lib/portas/cliente";
import { painelDoAcessoAInformacao } from "../../../../lib/portas/acesso-a-informacao";
import { FormConfiguracao } from "./FormConfiguracao";

/**
 * A CONFIGURAÇÃO DO ACESSO À INFORMAÇÃO (V11 V5.1).
 *
 * ⚠️ O QUE O INVENTÁRIO DESTA FRENTE ACHOU. O lote manda "não reutilizar cegamente prazo da
 * ouvidoria". Não havia prazo de ouvidoria a reutilizar: os três modelos dela têm só `criadoEm`, e
 * o prazo que ela aparenta ter é o da ETAPA do roteiro do assunto — interno, do setor, contado do
 * recebimento, sem fundamento legal. O prazo de um pedido de acesso à informação é do PEDIDO, nasce
 * de lei, e admite prorrogação e recurso. É outra coisa, e passou a ter tabela própria.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO e do dia civil.
 */
export const dynamic = "force-dynamic";

export default async function Pagina(): Promise<React.ReactElement> {
  await exigirLeitura("CONSULTAR_PROTOCOLO");

  const cabecalho = (
    <PageHeader
      titulo="Acesso à informação"
      subtitulo="Prazos de resposta a pedidos de informação, normas aplicáveis e histórico de versões."
    />
  );

  let p: Awaited<ReturnType<typeof painelDoAcessoAInformacao>>;
  try {
    p = await painelDoAcessoAInformacao();
  } catch (e) {
    if (e instanceof PortaSemBancoError) {
      return (
        <>
          {cabecalho}
          <EstadoVazio titulo="Dados indisponíveis" descricao="Não foi possível acessar a base de dados deste ambiente." />
        </>
      );
    }
    throw e;
  }

  return (
    <>
      {cabecalho}

      {p.pendencias.map((x) => (
        <Card key={x.codigo}>
          <p
            role={x.bloqueia ? "alert" : "status"}
            className="text-sm text-[color:var(--color-ink)]"
            data-papel="pendencia-da-configuracao"
            data-codigo={x.codigo}
            data-bloqueia={x.bloqueia ? "sim" : "nao"}
          >
            {x.mensagem}
          </p>
        </Card>
      ))}

      {p.vigente !== null ? (
        <Card>
          <p className="text-xs text-[color:var(--color-ink-2)]">Configuração vigente em {p.hoje}</p>
          <p className="text-sm text-[color:var(--color-ink)]" data-papel="configuracao-vigente">
            Versão <strong>{p.vigente.versao}</strong>, valendo desde {p.vigente.vigenciaInicio}.
            Prazo de resposta de {p.vigente.prazoDeRespostaEmDias} dias corridos, contados do protocolo.
          </p>
          <p className="mt-1 text-xs text-[color:var(--color-ink-2)]">
            Norma federal: {p.vigente.normaFederal}
            {p.vigente.regulamentacaoLocal === null ? "" : ` · Regulamentação local: ${p.vigente.regulamentacaoLocal}`}
          </p>
          {p.exemploDeLimite !== null ? (
            <p className="mt-2 text-xs text-[color:var(--color-ink-3)]" data-papel="exemplo-de-limite">
              Um pedido protocolado hoje vence em <strong>{p.exemploDeLimite}</strong>, sem considerar
              prorrogações.
            </p>
          ) : null}
        </Card>
      ) : null}

      {p.versoes.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma configuração publicada"
          descricao="Publique a primeira versão com o prazo de resposta e a norma que o estabelece."
        />
      ) : (
        <div className="my-4 overflow-x-auto">
          <table className="w-full text-sm" data-papel="tabela-de-versoes">
            <caption className="sr-only">
              Versões publicadas da configuração do acesso à informação, da mais recente para a mais antiga
            </caption>
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-xs text-[color:var(--color-ink-2)]">
                <th scope="col" className="px-3 py-2">Versão</th>
                <th scope="col" className="px-3 py-2">Vale desde</th>
                <th scope="col" className="px-3 py-2">Resposta</th>
                <th scope="col" className="px-3 py-2">Prorrogação</th>
                <th scope="col" className="px-3 py-2">Recurso</th>
                <th scope="col" className="px-3 py-2">Normas</th>
              </tr>
            </thead>
            <tbody>
              {p.versoes.map((v) => (
                <tr
                  key={v.versao}
                  className="border-b border-[color:var(--color-border)] align-top"
                  data-versao={v.versao}
                  data-vigente={v.vigente ? "sim" : "nao"}
                >
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    <span className="font-semibold">{v.versao}</span>
                    {v.vigente ? <span className="mt-1 block text-xs text-[color:var(--color-ink-2)]">vigente hoje</span> : null}
                  </th>
                  <td className="px-3 py-2 tabular-nums">{v.vigenciaInicio}</td>
                  <td className="px-3 py-2 tabular-nums">{v.prazoDeRespostaEmDias} dias</td>
                  <td className="px-3 py-2 tabular-nums">
                    {v.prorrogacoesPermitidas === 0
                      ? "não admitida"
                      : `${v.prorrogacoesPermitidas} de ${v.prazoDeProrrogacaoEmDias} dias`}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {v.instanciasDeRecurso === 0
                      ? "sem instância"
                      : `${v.instanciasDeRecurso} instância(s), ${v.prazoDeRecursoEmDias} dias`}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="block">{v.normaFederal} · publicada em {v.normaFederalPublicadaEm}</span>
                    <span className="block text-[color:var(--color-ink-3)]">
                      {v.regulamentacaoLocal === null
                        ? "Regulamentação local não declarada"
                        : `${v.regulamentacaoLocal} · publicada em ${v.regulamentacaoLocalPublicadaEm}`}
                    </span>
                    {v.observacao === null ? null : (
                      <span className="mt-1 block text-[color:var(--color-ink-3)]">{v.observacao}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {p.podePublicar ? (
        <FormConfiguracao />
      ) : (
        <Card>
          <p className="text-sm text-[color:var(--color-ink-3)]">
            Seu perfil permite consultar esta configuração, mas não publicá-la.
          </p>
        </Card>
      )}
    </>
  );
}
