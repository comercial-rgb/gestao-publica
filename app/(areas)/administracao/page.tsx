import { CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ADMINISTRACAO, AREAS } from "../../../lib/navegacao";

/** Landing da ADMINISTRAÇÃO — usuários, perfis, auditoria e a troca da própria senha. */
export default function AdministracaoPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "administracao")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {ADMINISTRACAO.map((item) => (
          <CardNavegacao
            key={item.href}
            href={item.href}
            rotulo={item.numero}
            titulo={item.rotulo}
            descricao={item.descricao}
          />
        ))}
      </div>
    </div>
  );
}
