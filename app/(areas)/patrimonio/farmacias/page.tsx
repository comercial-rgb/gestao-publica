import Link from "next/link";
import { Card } from "../../../../components/ui/Card";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import { lerFarmacias } from "../../../../lib/portas/frota";
import { FormCadastrarFarmacia, FormCalcularPosicao, FormCodigoNoInforme, FormEstoque, FormModoDoInforme, FormVersaoDaFarmacia } from "./Forms";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
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
        <EstadoVazio titulo="Não foi possível carregar" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
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
        nome da farmácia. Informar de novo o mesmo mês substitui a posição anterior; a anterior fica guardada. A posição de
        cada mês vem de uma fonte só: digitada ou importada, ou calculada dos movimentos do depósito da farmácia, conforme
        o modo adotado a partir de um mês.
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
                  <Link className="text-xs underline" data-operar-farmacia={f.codigo} href={`/patrimonio/farmacias/${f.id}`}>Estoque, dispensação e perdas</Link>
                </div>
                <p className="text-xs text-[color:var(--color-ink-2)]">{f.endereco} · responsável: {f.responsavel}</p>
                <p className="text-xs text-[color:var(--color-ink-2)]" data-modo-do-informe={f.codigo}>Posição do mês: {f.modoAtual}.</p>
                {f.ativa ? (
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {dados.podeInformar ? <FormEstoque farmaciaId={f.id} codigo={f.codigo} /> : null}
                    <FormVersaoDaFarmacia farmaciaId={f.id} codigo={f.codigo} dados={f.dados} />
                    {dados.podeInformar ? <FormModoDoInforme farmaciaId={f.id} codigo={f.codigo} /> : null}
                  </div>
                ) : null}
                {f.ativa && dados.podeInformar ? (
                  <details className="mt-2" data-calculo-da-posicao={f.codigo}>
                    <summary className="cursor-pointer text-xs text-[color:var(--color-primary)]">Posição calculada dos movimentos: códigos no informe e cálculo do mês</summary>
                    <div className="mt-2 grid gap-3">
                      <FormCalcularPosicao farmaciaId={f.id} codigo={f.codigo} />
                      <p className="text-xs text-[color:var(--color-ink-2)]">
                        O informe pede o código do produto (de preferência o GTIN da embalagem) e a descrição de cada medicamento.
                        O sistema não deduz esse código: declare-o para cada medicamento do depósito da farmácia.
                      </p>
                      {f.medicamentos.length === 0 ? <p className="text-xs text-[color:var(--color-ink-3)]">O depósito da farmácia ainda não tem movimento.</p> : null}
                      {f.totalDeMedicamentos > f.medicamentos.length ? <p className="text-xs text-[color:var(--color-status-erro-fg)]">Mostrando {f.medicamentos.length} de {f.totalDeMedicamentos} medicamentos, pelo código. Os demais não aparecem nesta lista.</p> : null}
                      <ul className="grid gap-2" data-lista="codigos-no-informe">
                        {f.medicamentos.map((m) => (
                          <li key={m.materialId} className="border-t border-[color:var(--color-border)] pt-2 text-xs" data-medicamento={m.codigo}>
                            <p><strong className="font-mono">{m.codigo}</strong> {m.nome} — {m.codigoNoInforme === null ? <span className="text-[color:var(--color-status-erro-fg)]">sem código no informe</span> : <span>no informe: {m.codigoNoInforme} · {m.descricaoNoInforme}</span>}</p>
                            <FormCodigoNoInforme materialId={m.materialId} codigo={m.codigo} nome={m.nome} atual={m.codigoNoInforme === null ? null : { codigoProduto: m.codigoNoInforme, descricao: m.descricaoNoInforme ?? "" }} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ) : null}
                <div className="mt-2 text-xs">
                  <span className="font-semibold">Estoques informados</span>
                  {f.informes.length === 0 ? <p className="text-[color:var(--color-ink-3)]">Nenhum.</p> : null}
                  <ul data-lista="informes-de-estoque">
                    {f.informes.map((i, k) => (
                      <li key={k} className={i.vale ? "" : "text-[color:var(--color-ink-3)] line-through"}>
                        {i.mes} — {i.itens} produto(s), {i.origem}, em {i.quando}{i.vale ? "" : " (não vale: substituído ou de outra fonte)"}
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
