import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerFarmacias } from "../../../../lib/portas/frota";
import { FormCadastrarFarmacia, FormEstoque, FormVersaoDaFarmacia } from "./Forms";

/**
 * V27 — AS FARMÁCIAS PÚBLICAS da unidade gestora e o estoque de medicamentos do mês, que a prestação de contas
 * mensal ao Tribunal pede.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

const TITULO = "Farmácias públicas";
const SUBTITULO = "Farmácias, responsável técnico e estoque do mês";

export default async function FarmaciasPage(): Promise<React.ReactElement> {
  let dados: Awaited<ReturnType<typeof lerFarmacias>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PATRIMONIO");
    dados = await lerFarmacias();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? erro.message : "Erro desconhecido."} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo={TITULO} subtitulo={SUBTITULO} />
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Todo mês o Tribunal recebe as farmácias públicas em funcionamento e o estoque de medicamentos de cada uma, na unidade
        usada na dispensação. Sem o estoque do mês de uma farmácia, só o arquivo do estoque fica de fora da remessa, com o
        nome da farmácia. Informar de novo o mesmo mês substitui a posição anterior; a anterior fica guardada.
      </div>
      {dados.ugs.length === 0 ? (
        <EstadoVazio titulo="Nenhuma unidade gestora escriturada aqui" descricao="Cadastre a unidade gestora em Contabilidade › Unidades gestoras antes de cadastrar farmácias." />
      ) : (
        <FormCadastrarFarmacia ugs={dados.ugs} />
      )}
      <Card>
        <h2 className="mb-2 text-sm font-semibold text-[color:var(--color-ink)]">Farmácias cadastradas</h2>
        {dados.farmacias.length === 0 ? (
          <p className="text-xs text-[color:var(--color-ink-3)]" data-teste="sem-farmacia">Nenhuma farmácia pública cadastrada.</p>
        ) : (
          <ul className="space-y-3" data-lista="farmacias">
            {dados.farmacias.map((f) => (
              <li key={f.id} className="border-b border-[color:var(--color-border)] pb-3" data-farmacia={f.codigo}>
                <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                  <strong className="font-mono">{f.codigo}</strong>
                  <span>{f.descricao}</span>
                  <span className="text-xs text-[color:var(--color-ink-3)]">{f.ug} · versão {f.versao}{f.ativa ? "" : " · encerrada"}</span>
                </div>
                <p className="text-xs text-[color:var(--color-ink-2)]">{f.endereco} · responsável: {f.responsavel}</p>
                {f.ativa ? (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    <FormEstoque farmaciaId={f.id} codigo={f.codigo} />
                    <FormVersaoDaFarmacia farmaciaId={f.id} codigo={f.codigo} dados={f.dados} />
                  </div>
                ) : null}
                <div className="mt-2 text-xs">
                  <span className="font-semibold">Estoques informados</span>
                  {f.informes.length === 0 ? <p className="text-[color:var(--color-ink-3)]">Nenhum.</p> : null}
                  <ul data-lista="informes-de-estoque">
                    {f.informes.map((i, k) => (
                      <li key={k} className={i.vale ? "" : "text-[color:var(--color-ink-3)] line-through"}>
                        {i.mes} — {i.itens} produto(s), {i.origem}, em {i.quando}{i.vale ? "" : " (substituído)"}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
