import Link from "next/link";
import { identidadePublica } from "../../../lib/portas/identidade";

/**
 * O PORTAL DA TRANSPARÊNCIA — PÚBLICO (V9 N1/N2).
 *
 * ⚠️ ESTE ENDEREÇO ESTAVA OCUPADO PELA LANDING INTERNA. `/transparencia` é o que um município
 * divulga e o que um órgão de controle abre sem conta; até aqui ele levava à tela de login,
 * enquanto as páginas públicas de verdade viviam em `/transparencia/contratos` e
 * `/transparencia/demonstrativos`, sob outra árvore de layout. A landing interna passou a
 * `/administracao/transparencia`.
 *
 * ⚠️ E ESTA PÁGINA NÃO ANUNCIA O QUE NÃO ABRE. Seis cartões apontando para páginas vazias são
 * pior que três apontando para consultas de verdade: quem clica e não encontra aprende a não
 * confiar no menu. As famílias ainda não construídas aparecem numa lista SEPARADA, dizendo que
 * ainda não estão publicadas — não como cartão clicável.
 */
export const dynamic = "force-dynamic";

interface Familia {
  readonly titulo: string;
  readonly descricao: string;
  readonly href: string;
}

const ABERTAS: readonly Familia[] = [
  {
    titulo: "Bens patrimoniais",
    descricao:
      "O acervo do município, bem a bem: tombamento, classe, data de aquisição, situação e estado. Filtros por ano, espécie e situação; exportação em CSV do mesmo recorte da tela.",
    href: "/transparencia/bens",
  },
  {
    titulo: "Contratos",
    descricao:
      "Os contratos do ente, com objeto, contratado, vigência, valores, aditivos e a execução física já aprovada.",
    href: "/transparencia/contratos",
  },
  {
    titulo: "Demonstrativos fiscais",
    descricao:
      "RREO e RGF publicados, em PDF e CSV, abertos sem cadastro (LC 131/2009).",
    href: "/transparencia/demonstrativos",
  },
  {
    titulo: "Carta de serviços",
    descricao:
      "O que o ente oferece, com requisitos, documentos, prazo e custo — e quais pedidos podem ser feitos pela internet.",
    href: "/servicos",
  },
  {
    titulo: "Ouvidoria",
    descricao:
      "Registrar reclamação, denúncia, sugestão, elogio ou pedido de informação, e acompanhar pelo código do protocolo.",
    href: "/ouvidoria",
  },
  {
    titulo: "Consulta por protocolo",
    descricao:
      "Conferir um processo ou documento pelo número e pelo código verificador, sem entrar com conta.",
    href: "/consulta",
  },
];

/**
 * ⚠️ O QUE FALTA, DITO EM VOZ ALTA. A ordem V9 pede seis famílias de consulta; três delas
 * dependem de projeção pública que ainda não existe no servidor. Declarar a lacuna é o mesmo
 * princípio do catálogo do repositório: "marcar ausência vale tanto quanto marcar presença".
 */
const AINDA_NAO_PUBLICADAS: readonly { readonly titulo: string; readonly falta: string }[] = [
  {
    titulo: "Despesas (empenho, liquidação e pagamento)",
    falta:
      "A execução está registrada no sistema; falta a projeção pública que separe valor original, anulado e vigente sem somar as fases como despesas distintas.",
  },
  {
    titulo: "Receitas e contas públicas",
    falta:
      "Previsto e arrecadado por exercício, natureza e fonte. Os demonstrativos fiscais já publicados cobrem parte disso; a consulta detalhada ainda não existe.",
  },
  {
    titulo: "Pessoal",
    falta:
      "Vínculo, cargo, lotação e remuneração por competência dependem de uma regra de publicação explícita do ente — sem ela, a projeção exporia colunas que não podem ser abertas.",
  },
];

export default async function PortalDaTransparenciaPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--color-ink)]">Transparência</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} — consultas abertas, sem cadastro e sem
          identificação. Os filtros ficam no endereço da página: a consulta que você montou pode ser
          copiada e enviada como link.
        </p>
      </header>

      <section aria-labelledby="consultas">
        <h2 id="consultas" data-ancora className="sr-only">
          Consultas disponíveis
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {ABERTAS.map((f) => (
            <li key={f.href}>
              <Link
                href={f.href}
                data-familia-publica={f.href}
                className="block h-full rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4 hover:border-[color:var(--color-primary)] hover:shadow-sm"
              >
                <span className="block text-sm font-semibold text-[color:var(--color-primary)]">{f.titulo}</span>
                <span className="mt-1 block text-xs text-[color:var(--color-ink-2)]">{f.descricao}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="pendentes" className="mt-8">
        <h2 id="pendentes" data-ancora className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          Ainda não publicadas
        </h2>
        <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
          Estas consultas estão previstas e ainda não abriram. Ficam listadas aqui, sem link, em vez de
          aparecerem como página vazia.
        </p>
        <ul className="mt-3 space-y-2">
          {AINDA_NAO_PUBLICADAS.map((f) => (
            <li
              key={f.titulo}
              data-familia-pendente
              className="rounded-[var(--radius-md)] border border-dashed border-[color:var(--color-border-strong)] p-3"
            >
              <span className="block text-sm font-medium text-[color:var(--color-ink-2)]">{f.titulo}</span>
              <span className="mt-0.5 block text-xs text-[color:var(--color-ink-3)]">{f.falta}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
