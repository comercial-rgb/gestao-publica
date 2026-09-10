import { Card, CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { AREAS } from "../../../lib/navegacao";

/**
 * SUPORTE — os canais de atendimento e os PRAZOS CONTRATADOS (TR 4.20.9).
 *
 * ⚠️ ESTA TELA PUBLICA O QUE O CONTRATO PROMETE — os canais e os prazos por classe de chamado.
 * Ela continua sem inventar número: nada de "chamados abertos" ou "tempo médio de resposta" que
 * dado nenhum sustente.
 *
 * ═══ ⚠️ O QUE MUDOU NO ENT02, E POR QUE ESTE COMENTÁRIO FOI REESCRITO ═══
 * Até o ENT01 esta tela dizia, em voz alta, que o sistema NÃO abria nem acompanhava chamado —
 * e era verdade: o helpdesk era ferramenta externa. Com o M27 isso deixou de ser verdade: existe
 * chamado com número único, fila por severidade, histórico e pesquisa de satisfação, em
 * `/suporte/chamados`.
 *
 * Deixar a frase antiga aqui seria pior do que nunca tê-la escrito: uma afirmação que o próprio
 * repositório desmente é exatamente o tipo de comentário que faz a próxima pessoa desconfiar de
 * todos os outros.
 *
 * Os canais EXTERNOS continuam existindo e continuam listados — WhatsApp e e-mail são o primeiro
 * contato, e a triagem por eles não deixa de valer porque agora há uma fila interna.
 *
 * ⚠️ Imports RELATIVOS na UI (ver components/ui/MODULO-UI.md).
 */

/** Um prazo do TR, com a classe de chamado que o dispara. */
interface Sla {
  readonly classe: string;
  readonly prazo: string;
  readonly descricao: string;
}

/**
 * OS PRAZOS DO PRÓPRIO TR (4.20.9) — transcritos, não negociados aqui. A ordem é a da urgência
 * decrescente, que é como quem abre o chamado procura o seu caso.
 */
const SLAS: readonly Sla[] = [
  { classe: "Dúvida de operação", prazo: "Imediato", descricao: "Como se faz alguma coisa no sistema. Resolvido no próprio canal, sem abrir chamado formal." },
  { classe: "Análise", prazo: "12 horas", descricao: "Situação que exige conferir dado, lançamento ou configuração antes de responder." },
  { classe: "Correção de defeito", prazo: "24 horas", descricao: "O sistema se comporta de forma diferente da especificada. Prazo para a correção, não para o primeiro contato." },
  { classe: "Ajustes de dados", prazo: "5 dias úteis", descricao: "Correção de dado registrado, sempre com registro na auditoria de quem pediu e de quem executou." },
  { classe: "Novas funcionalidades", prazo: "5 a 45 dias", descricao: "Por complexidade, acordada com o ente antes do início. O prazo é da entrega, não da análise." },
];

/** Os canais. `detalhe` é o que o ente precisa saber para usar o canal, não um enfeite. */
interface Canal {
  readonly nome: string;
  readonly detalhe: string;
  readonly quando: string;
}

const CANAIS: readonly Canal[] = [
  { nome: "WhatsApp Business", detalhe: "Canal de primeira linha, em horário comercial.", quando: "Dúvida de operação e triagem — o caminho mais rápido para uma resposta." },
  { nome: "E-mail de suporte", detalhe: "Gera protocolo e deixa rastro escrito do pedido.", quando: "Análise, correção de defeito e ajuste de dados — tudo que precisa de histórico." },
  { nome: "Ferramenta de helpdesk", detalhe: "Fila e histórico dos chamados do ente, com o estado de cada um.", quando: "Acompanhar o que já foi aberto e consultar o que foi resolvido." },
];

export default function SuportePage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "suporte")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />

      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs text-[color:var(--color-ink-2)]">
        Esta tela publica os <strong>canais e os prazos contratados</strong>. Para abrir e
        acompanhar um chamado <strong>dentro do sistema</strong>, use{" "}
        <a href="/suporte/chamados" className="text-[color:var(--color-primary)] hover:underline">
          Chamados
        </a>
        . Os canais externos abaixo continuam valendo para o primeiro contato e para a triagem.
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Atendimento no sistema</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <CardNavegacao
            href="/suporte/chamados"
            rotulo="Chamados"
            titulo="Abrir e acompanhar chamado"
            descricao="Número único no produto inteiro, severidade cadastrada pela entidade, histórico e pesquisa de satisfação."
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">Canais de atendimento</h2>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CANAIS.map((c) => (
            <Card key={c.nome} className="h-full">
              <h3 className="text-base font-semibold text-[color:var(--color-ink)]">{c.nome}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[color:var(--color-ink-2)]">{c.detalhe}</p>
              <p className="mt-3 text-xs leading-relaxed text-[color:var(--color-ink-3)]">
                <span className="font-semibold uppercase tracking-wide">Use quando</span> — {c.quando}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-ink-2)]">
          Prazos de resposta por classe de chamado
        </h2>
        <Card>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-border)] text-left text-xs uppercase tracking-wide text-[color:var(--color-ink-3)]">
                <th className="pb-2 font-semibold">Classe</th>
                <th className="pb-2 font-semibold" style={{ width: "8rem" }}>Prazo</th>
                <th className="pb-2 font-semibold">O que entra nesta classe</th>
              </tr>
            </thead>
            <tbody>
              {SLAS.map((s) => (
                <tr key={s.classe} className="border-b border-[color:var(--color-border)] last:border-0">
                  <td className="py-2 pr-4 font-medium text-[color:var(--color-ink)]">{s.classe}</td>
                  <td className="py-2 pr-4 font-semibold text-[color:var(--color-primary)]">{s.prazo}</td>
                  <td className="py-2 leading-relaxed text-[color:var(--color-ink-2)]">{s.descricao}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="mt-3 text-xs leading-relaxed text-[color:var(--color-ink-3)]">
          Os prazos correm em dias úteis a partir da abertura do chamado no canal apropriado. Pedidos
          de <strong>ajuste de dados</strong> alteram registro já lançado e por isso ficam na trilha de
          auditoria, com o solicitante e o executor nomeados — consultável em{" "}
          <a href="/administracao/auditoria" className="text-[color:var(--color-primary)] hover:underline">Administração · Auditoria</a>.
        </p>
      </section>
    </div>
  );
}
