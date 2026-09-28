import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { telaExigeLeituraDoEnte } from "../../../../lib/portas/leitura";
import {
  lerContasComTitular,
  lerEntidadesContabeis,
  TIPOS_DE_ATO_NA_TELA,
} from "../../../../lib/portas/entidades-contabeis";
import { lerTodasAsFontes } from "../../../../lib/portas/arrecadacao";
import { FormRolDeFontes } from "./FormRolDeFontes";
import { FormTitular } from "./FormTitular";

/**
 * AS CONTAS BANCÁRIAS E DE QUEM ELAS SÃO (V11 V9).
 *
 * ⚠️ É AQUI QUE A ARRECADAÇÃO GANHA TITULAR. A guia declara a conta em que o dinheiro entrou; a
 * conta diz de quem ela é; e o carimbo da entidade sai daí — o único vínculo inequívoco que este
 * sistema tem, porque uma conta bancária tem exatamente um titular jurídico.
 *
 * ⚠️ A CONTA SEM TITULAR **APARECE NA MESMA LISTA**, com a consequência ao lado. Separá-la numa
 * aba de pendências faria a maioria das instalações abrir a tela e ver uma lista vazia, como se
 * não houvesse nada a fazer.
 *
 * ⚠️ `force-dynamic`: depende de SESSÃO.
 */
export const dynamic = "force-dynamic";

export default async function ContasBancariasPage(): Promise<React.ReactElement> {
  let contas: Awaited<ReturnType<typeof lerContasComTitular>>;
  let entidades: Awaited<ReturnType<typeof lerEntidadesContabeis>>;
  let fontes: Awaited<ReturnType<typeof lerTodasAsFontes>>;
  try {
    await telaExigeLeituraDoEnte("CONSULTAR_FINANCEIRO");
    contas = await lerContasComTitular();
    entidades = await lerEntidadesContabeis();
    // O rol da conta escolhe entre as fontes CADASTRADAS — o mesmo rol que a arrecadação oferece.
    fontes = await lerTodasAsFontes();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        <PageHeader titulo="Contas bancárias" subtitulo="Titularidade e fontes de recursos das contas bancárias do ente" />
        <EstadoVazio
          titulo="Não foi possível carregar as contas"
          descricao={erro instanceof Error ? erro.message : "Erro desconhecido."}
        />
      </div>
    );
  }

  const opcoes = entidades.map((e) => ({ id: e.id, codigo: e.codigo, nome: e.nome }));
  const semTitular = contas.filter((c) => c.titularNome === null);

  return (
    <div className="space-y-4">
      <SincronizarContexto />
      <PageHeader titulo="Contas bancárias" subtitulo="Titularidade e fontes de recursos das contas bancárias do ente" />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        O titular da conta identifica a <strong>entidade</strong> a que pertencem os valores
        arrecadados nela. A alteração do titular <strong>não modifica as guias já registradas</strong>,
        que mantêm o titular vigente na data da arrecadação.
      </div>

      {semTitular.length > 0 ? (
        <div
          className="rounded-[var(--radius-md)] border border-[color:var(--color-status-alerta-fg)] p-3 text-xs"
          data-teste="contas-sem-titular"
        >
          {/* ⚠️ A MENSAGEM NOMEIA A CONSEQUÊNCIA, não o estado. "Sem titular" é um rótulo; "as
              guias entram como não atribuídas" é o que muda para quem opera. */}
          <strong>
            {semTitular.length === 1
              ? "Uma conta ainda não tem titular declarado"
              : `${String(semTitular.length)} contas ainda não têm titular declarado`}
          </strong>
          . As guias recebidas em conta sem titular ficam <strong>não atribuídas</strong> na consulta da
          receita por entidade, sem impedir a arrecadação. Declare o titular somente com base em ato
          formal.
        </div>
      ) : null}

      {contas.length === 0 ? (
        <EstadoVazio
          titulo="Nenhuma conta bancária cadastrada"
          descricao="Cadastre as contas bancárias para declarar a titularidade e as fontes de recursos."
        />
      ) : (
        <ul className="space-y-2" data-papel="lista-de-contas">
          {contas.map((c) => (
            <li
              key={c.id}
              className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] p-3"
              data-conta={c.codigo}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{c.codigo}</span>
                <span>{c.descricao}</span>
                <span className="text-xs text-[color:var(--color-ink-2)]">
                  fonte {c.fonteCodigo}
                  {c.identificacaoBancaria === null ? "" : ` · ${c.identificacaoBancaria}`}
                </span>
              </div>
              <p className="mt-1 text-xs" data-papel={`titular-${c.codigo}`}>
                {c.titularNome === null ? (
                  <span className="text-[color:var(--color-status-alerta-fg)]">
                    Sem titular declarado: as guias desta conta ficam não atribuídas.
                  </span>
                ) : (
                  <>
                    Titular: <strong>{c.titularCodigo}</strong> {c.titularNome}
                    <span className="text-[color:var(--color-ink-2)]">
                      {" "}
                      · {c.ato}
                      {c.versao !== null && c.versao > 1 ? ` · versão ${String(c.versao)}` : ""}
                    </span>
                  </>
                )}
              </p>
              <FormTitular
                contaBancariaId={c.id}
                contaCodigo={c.codigo}
                entidades={opcoes}
                tiposDeAto={TIPOS_DE_ATO_NA_TELA}
                jaTemTitular={c.titularNome !== null}
                identificacaoBancaria={c.identificacaoBancaria}
              />
              {/* V16 (TR 5.10.2.6) — o ROL de fontes da conta. Sem este cadastro, a guia repartida
                  entre fontes era inalcançável: um depósito de duas fontes só entra numa conta que
                  comporte as duas, e o rol não tinha superfície (`ROL-DE-FONTES-UI`). */}
              <FormRolDeFontes
                contaCodigo={c.codigo}
                fontesDisponiveis={fontes}
                fontesDoRol={c.fontesDoRol}
                rolDeclarado={c.rolDeclarado}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
