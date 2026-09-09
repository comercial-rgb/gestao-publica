import { CardNavegacao } from "../../../components/ui/Card";
import { PageHeader } from "../../../components/ui/PageHeader";
import { AREAS, CADASTROS } from "../../../lib/navegacao";

/**
 * Landing dos CADASTROS BASE.
 *
 * ⚠️ SEPARADA DA ADMINISTRAÇÃO, e é decisão. "Administração" é a segurança do sistema —
 * usuários, perfis, permissões, auditoria. Um credor não é usuário do sistema, e um
 * servidor cadastrado aqui não ganha acesso a nada. Misturar as duas faria quem administra
 * fornecedores parecer administrador do sistema.
 */
export default function CadastrosPage(): React.ReactElement {
  const area = AREAS.find((a) => a.slug === "cadastros")!;
  return (
    <div className="space-y-6">
      <PageHeader titulo={area.rotulo} subtitulo={area.descricao} />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {CADASTROS.map((item) => (
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
