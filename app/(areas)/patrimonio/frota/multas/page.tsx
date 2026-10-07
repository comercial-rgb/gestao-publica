import Link from "next/link";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { ValorMonetario } from "../../../../../components/ui/ValorMonetario";
import { formatarMoeda } from "../../../../../lib/format/moeda";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { lerMultasDeTransito, ROTULO_DA_BAIXA, TIPOS_DE_BAIXA_DA_MULTA, type TelaDasMultas } from "../../../../../lib/portas/multas-de-transito";
import { FormBaixarMulta, FormRegistrarMulta } from "./FormsDaMulta";

/**
 * V36 — AS MULTAS DE TRÂNSITO dos veículos da frota. A regra é do M36 (`modules/m36-frota/multas.ts`). Leitura:
 * CONSULTAR_PATRIMONIO no ente; registrar e baixar: CADASTRAR_FROTA (o servidor confere de novo).
 */
export const dynamic = "force-dynamic";

const celula = "border-b border-[color:var(--color-border)] px-2 py-1.5 align-top";
const br = (dia: string): string => dia.split("-").reverse().join("/");

export default async function MultasDeTransitoPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<React.ReactElement> {
  const sp = await searchParams;
  const soEmAberto = sp["situacao"] === "abertas";
  const cabecalho = <PageHeader titulo="Multas de trânsito" subtitulo="As multas dos veículos da frota: auto, infração, valor, infrator e baixa" />;
  let dados: TelaDasMultas;
  let pode: boolean;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_PATRIMONIO");
    const [d, permitidas] = await Promise.all([lerMultasDeTransito({ soEmAberto }), acoesPermitidas(["CADASTRAR_FROTA"])]);
    dados = d;
    pode = permitidas.has("CADASTRAR_FROTA");
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio titulo="Não foi possível ler as multas" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."} />
      </div>
    );
  }
  const abertas = dados.multas.filter((m) => m.baixa === null);
  return (
    <div className="space-y-4">
      {cabecalho}
      <div className="flex flex-wrap items-center gap-4 text-sm" data-resumo-multas>
        <span>
          Em aberto: <strong data-em-aberto>{dados.emAberto.quantidade}</strong> multa(s), <ValorMonetario valor={dados.emAberto.valor} />
        </span>
        <nav aria-label="Situação" className="ml-auto flex gap-3 text-xs" data-chrome>
          {soEmAberto ? <Link className="underline" href="/patrimonio/frota/multas">Todas</Link> : <strong>Todas</strong>}
          {soEmAberto ? <strong>Só as em aberto</strong> : <Link className="underline" href="/patrimonio/frota/multas?situacao=abertas">Só as em aberto</Link>}
          <Link className="underline" href="/patrimonio/frota">Voltar à frota</Link>
        </nav>
      </div>

      {dados.porInfrator.length > 0 ? (
        <section aria-label="Em aberto por infrator" className="text-sm">
          <h2 className="mb-2 text-sm font-semibold">Em aberto por infrator</h2>
          <ul className="space-y-1" data-por-infrator>
            {dados.porInfrator.map((i) => (
              <li key={i.infrator}>
                {i.infrator}: {i.quantidade} multa(s), R$ {formatarMoeda(i.valor).texto}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {dados.multas.length === 0 ? (
        <EstadoVazio titulo={soEmAberto ? "Nenhuma multa em aberto" : "Nenhuma multa registrada"} descricao="As multas dos veículos da frota aparecem aqui depois de registradas." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" data-tabela-multas>
            <thead>
              <tr className="text-xs uppercase tracking-wide text-[color:var(--color-ink-2)]">
                <th scope="col" className={celula}>Veículo</th>
                <th scope="col" className={celula}>Auto</th>
                <th scope="col" className={celula}>Infração</th>
                <th scope="col" className={celula}>Datas</th>
                <th scope="col" className={celula}>Infrator</th>
                <th scope="col" className={`${celula} text-right`}>Valor</th>
                <th scope="col" className={celula}>Situação</th>
              </tr>
            </thead>
            <tbody>
              {dados.multas.map((m) => (
                <tr key={m.id} data-multa={m.auto}>
                  <td className={celula}>{m.placa}</td>
                  <td className={celula}>{m.auto}</td>
                  <td className={celula}>{m.infracao}<span className="block text-xs text-[color:var(--color-ink-3)]">{m.local}</span></td>
                  <td className={`${celula} text-xs`}>
                    infração {br(m.diaDaInfracao)}<br />notificação {br(m.diaDaNotificacao)}
                    {m.diaDoVencimento !== null ? <><br />vencimento {br(m.diaDoVencimento)}</> : null}
                  </td>
                  <td className={celula}>{m.infrator}</td>
                  <td className={`${celula} text-right tabular-nums`}><ValorMonetario valor={m.valor} /></td>
                  <td className={celula} data-situacao>
                    {m.baixa === null ? "Em aberto" : `${m.baixa.rotulo} em ${br(m.baixa.dia)}`}
                    {m.baixa !== null ? <span className="block text-xs text-[color:var(--color-ink-3)]">{m.baixa.observacao}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pode ? (
        <div className="grid gap-4 xl:grid-cols-2" data-chrome>
          {dados.veiculos.length > 0 ? <FormRegistrarMulta veiculos={dados.veiculos} /> : <EstadoVazio titulo="Nenhum veículo na frota" descricao="Cadastre os veículos em Patrimônio > Frota antes de registrar multas." />}
          {abertas.length > 0 ? (
            <FormBaixarMulta
              multas={abertas.map((m) => ({ id: m.id, rotulo: `${m.placa} · auto ${m.auto} · R$ ${formatarMoeda(m.valor).texto}` }))}
              tipos={TIPOS_DE_BAIXA_DA_MULTA.map((t) => ({ valor: t, rotulo: ROTULO_DA_BAIXA[t] }))}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
