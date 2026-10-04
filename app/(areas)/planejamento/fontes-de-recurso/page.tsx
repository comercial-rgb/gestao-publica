import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { lerCadastroDeFontes } from "../../../../lib/portas/fontes-de-recurso";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { FormCarga } from "./FormCarga";

/**
 * AS FONTES DE RECURSO (V35, onda A1) — o cadastro que não tinha lugar. A fonte é classificação da STN: a tela
 * carrega a tabela oficial e mostra o que está no cadastro, com a natureza de cada fonte.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const ROTULO_DA_NATUREZA: Readonly<Record<string, string>> = {
  ORDINARIOS: "Ordinário",
  VINCULADOS: "Vinculado",
  EXTRAORCAMENTARIOS: "Extraorçamentário",
  COMPENSACAO_FINANCEIRA: "Compensação financeira",
  OUTROS: "Outros",
};

export default async function FontesDeRecursoPage(): Promise<React.ReactElement> {
  const titulo = (
    <PageHeader titulo="Fontes de recurso" subtitulo="Fontes e códigos de acompanhamento da tabela oficial da Secretaria do Tesouro Nacional" />
  );
  let cadastro: Awaited<ReturnType<typeof lerCadastroDeFontes>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PLANEJAMENTO");
    cadastro = await lerCadastroDeFontes();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {titulo}
        <EstadoVazio titulo="Não foi possível ler as fontes" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  const semNatureza = cadastro.fontes.filter((f) => f.natureza === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {titulo}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        As fontes seguem a classificação padronizada da STN para estados e municípios (tabela de 2026), a mesma que o
        Tribunal de Contas recebe. A carga só acrescenta: fonte que já está no cadastro não muda de nome, e a natureza
        já declarada pelo ente prevalece. A natureza das fontes novas segue o bloco da tabela oficial (livres,
        vinculados, extraorçamentários) e pode ser reclassificada em{" "}
        <a className="underline" href="/contabilidade/natureza-das-fontes">Natureza das fontes</a>.
      </div>

      <Card>
        <FormCarga vazio={cadastro.fontes.length === 0} />
      </Card>

      {semNatureza.length > 0 ? (
        <p className="text-xs" data-teste="fontes-sem-natureza">
          <strong>{semNatureza.length} fonte(s) sem natureza declarada:</strong> {semNatureza.map((f) => f.codigo).join(", ")}. A
          arrecadação dessas fontes não é aceita até a natureza ser declarada.
        </p>
      ) : null}

      <Card>
        {cadastro.fontes.length === 0 ? (
          <EstadoVazio titulo="Nenhuma fonte de recurso cadastrada" descricao="Carregue a tabela oficial para cadastrar as fontes e os códigos de acompanhamento." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">Fontes de recurso do cadastro e a natureza de cada uma</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Fonte</th>
                  <th scope="col" className="py-2 pr-3">Descrição</th>
                  <th scope="col" className="py-2 pr-3">Natureza</th>
                </tr>
              </thead>
              <tbody>
                {cadastro.fontes.map((f) => (
                  <tr key={f.codigo} data-fonte={f.codigo} className="border-t border-[color:var(--color-border)] align-top">
                    <th scope="row" className="py-2 pr-3 font-normal">{f.codigo}</th>
                    <td className="py-2 pr-3">{f.descricao}</td>
                    <td className="py-2 pr-3">{f.natureza === null ? "não declarada" : (ROTULO_DA_NATUREZA[f.natureza] ?? f.natureza)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {cadastro.cos.length > 0 ? (
        <Card>
          <details>
            <summary className="cursor-pointer text-sm">Códigos de acompanhamento da execução ({cadastro.cos.length})</summary>
            <table className="mt-2 w-full text-left text-xs">
              <caption className="sr-only">Códigos de acompanhamento da execução orçamentária</caption>
              <thead>
                <tr className="text-[color:var(--color-ink-3)]">
                  <th scope="col" className="py-2 pr-3">Código</th>
                  <th scope="col" className="py-2 pr-3">Descrição</th>
                </tr>
              </thead>
              <tbody>
                {cadastro.cos.map((c) => (
                  <tr key={c.codigo} className="border-t border-[color:var(--color-border)]">
                    <th scope="row" className="py-2 pr-3 font-normal">{c.codigo}</th>
                    <td className="py-2 pr-3">{c.descricao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </Card>
      ) : null}
    </div>
  );
}
