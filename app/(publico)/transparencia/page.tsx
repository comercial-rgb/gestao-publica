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
      "Bens patrimoniais, com tombamento, classe, data de aquisição, situação e estado de conservação. Permite filtrar por ano, espécie e situação e exportar em CSV.",
    href: "/transparencia/bens",
  },
  {
    titulo: "Despesas",
    descricao:
      "Empenhos, com credor, histórico, contrato vinculado e valores empenhado, anulado, liquidado e pago.",
    href: "/transparencia/despesas",
  },
  {
    titulo: "Receitas",
    descricao:
      "Guias de arrecadação, com natureza, fonte e valores arrecadado, anulado e líquido, além da previsão da LOA, dos ajustes e da execução da receita no exercício.",
    href: "/transparencia/receitas",
  },
  {
    titulo: "Pessoal",
    descricao:
      "Totais da folha de pagamento por lotação e regime e, quando houver política de divulgação aprovada, valores por servidor. Apenas folhas fechadas, sem dados de dependentes, plano de saúde, pensão ou imposto individual.",
    href: "/transparencia/pessoal",
  },
  {
    titulo: "Diárias",
    descricao:
      "Diárias concedidas, com o beneficiário, cargo, destino, finalidade, período, quantidade, valor, norma que autorizou e a situação da prestação de contas.",
    href: "/transparencia/diarias",
  },
  {
    titulo: "Contratos",
    descricao:
      "Contratos, com objeto, contratado, vigência, valores, aditivos e execução física aprovada.",
    href: "/transparencia/contratos",
  },
  {
    titulo: "Obras",
    descricao:
      "Obras publicadas pelo município, com o cadastro, o valor da obra, o contratado, o empenhado, o percentual executado e os documentos.",
    href: "/transparencia/obras",
  },
  {
    titulo: "Planejamento e orçamento",
    descricao:
      "Plano Plurianual, Lei de Diretrizes Orçamentárias com seus anexos e Lei Orçamentária Anual aprovada, com receita prevista, despesa fixada e os anexos da Lei 4.320/1964.",
    href: "/transparencia/planejamento",
  },
  {
    titulo: "Demonstrativos fiscais",
    descricao:
      "Relatório Resumido da Execução Orçamentária (RREO) e Relatório de Gestão Fiscal (RGF), em PDF (LC 131/2009).",
    href: "/transparencia/demonstrativos",
  },
  {
    titulo: "Carta de serviços",
    descricao:
      "Serviços oferecidos, com requisitos, documentos, prazo e custo, e quais podem ser solicitados pela internet.",
    href: "/servicos",
  },
  {
    titulo: "Ouvidoria",
    descricao:
      "Registre reclamação, denúncia, sugestão, elogio ou pedido de informação e acompanhe a resposta pelo protocolo.",
    href: "/ouvidoria",
  },
  {
    titulo: "Consulta por protocolo",
    descricao:
      "Acompanhe um processo pelo número e pelo código verificador, sem necessidade de cadastro.",
    href: "/consulta",
  },
];

/**
 * ⚠️ O QUE FALTA, DITO EM VOZ ALTA. Declarar a lacuna é o mesmo princípio do catálogo do
 * repositório: "marcar ausência vale tanto quanto marcar presença".
 *
 * ⚠️ RECEITAS SAIU DAQUI NO V11 V4, quando a consulta passou a existir de verdade — com guia,
 * natureza, fonte, líquido, previsão e execução. Uma família que continuasse listada como
 * ausente depois de publicada faria o portal mentir na direção oposta: subestimando o que ele
 * já entrega. Pessoal continua aqui, e o motivo é o mesmo de sempre.
 */
const AINDA_NAO_PUBLICADAS: readonly { readonly titulo: string; readonly falta: string }[] = [];

export default async function PortalDaTransparenciaPage(): Promise<React.ReactElement> {
  const id = await identidadePublica();
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-[color:var(--color-ink)]">Transparência</h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--color-ink-2)]">
          {id.ente?.nomeDeExibicao ?? "Ente não configurado"} · consultas de acesso livre, sem cadastro
          e sem identificação. Os resultados filtrados podem ser compartilhados copiando o endereço da
          página.
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

      {/* ⚠️ A SEÇÃO SOME QUANDO NÃO HÁ PENDÊNCIA. Um título "Ainda não publicadas" seguido de
          nada é pior que a ausência dele: quem lê fica procurando o que faltou. Ela volta sozinha
          no dia em que uma família nova for declarada e ainda não existir. */}
      {AINDA_NAO_PUBLICADAS.length === 0 ? null : (
      <section aria-labelledby="pendentes" className="mt-8">
        <h2 id="pendentes" data-ancora className="text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          Ainda não publicadas
        </h2>
        <p className="mt-1 text-xs text-[color:var(--color-ink-3)]">
          Estas consultas estão previstas e serão disponibilizadas em breve.
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
      )}
    </main>
  );
}
