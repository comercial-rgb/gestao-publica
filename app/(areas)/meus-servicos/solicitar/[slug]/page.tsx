import Link from "next/link";
import { notFound } from "next/navigation";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { acoesPermitidas } from "../../../../../lib/portas/molde";
import { lerServicoPublicado, quemPedePara } from "../../../../../lib/portas/carta-de-servicos";
import { FormSolicitar } from "../../FormulariosDoRequerente";

/**
 * PEDIR UM SERVIÇO (V6.2 P3): o formulário da versão PUBLICADA, e em nome de quem a sessão pode pedir hoje.
 *
 * ⚠️ O QUE A TELA NÃO OFERECE, ELA DIZ POR QUÊ: conta sem pessoa vinculada, conta sem a permissão de
 * solicitar e complemento de fornecedor sem representação vigente aparecem como motivo, não como um
 * formulário que seria recusado. Quem recusa de verdade é o caso de uso.
 */
export const dynamic = "force-dynamic";

export default async function Pagina({ params }: { readonly params: Promise<{ readonly slug: string }> }): Promise<React.ReactElement> {
  const sessao = await telaExigeLeituraDoEnte("CONSULTAR_MEUS_SERVICOS");
  const { slug } = await params;
  const [servico, quem, permitidas] = await Promise.all([lerServicoPublicado(slug), quemPedePara(sessao), acoesPermitidas(["SOLICITAR_SERVICO"])]);
  if (servico === null) notFound();
  const titulares = servico.representacaoObrigatoria ? quem.titulares.filter((t) => t.via === "REPRESENTACAO") : quem.titulares;
  const motivo =
    !permitidas.has("SOLICITAR_SERVICO") ? { titulo: "Sua conta não pode protocolar solicitações", descricao: "O perfil da sua conta não tem permissão para solicitar serviços. Procure o atendimento." }
    : quem.pessoa === null ? { titulo: "Sua conta ainda não está vinculada ao seu cadastro", descricao: "Para fazer solicitações, sua conta precisa estar vinculada ao seu cadastro pelo CPF. Solicite o vínculo ao atendimento." }
    : titulares.length === 0 ? { titulo: "Não há representação de empresa vigente para sua conta", descricao: "Este serviço é solicitado em nome de uma empresa, por quem possui representação registrada e vigente. O registro da representação é feito pelo atendimento, mediante apresentação do documento correspondente." }
    : null;
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Pedir: ${servico.titulo}`} subtitulo={`Versão ${servico.versao} do formulário · prazo: ${servico.prazo ?? "não informado"}`} acoes={<Link href={`/servicos/${servico.slug}`} className="text-sm text-[color:var(--color-primary)] underline">Ver requisitos e documentos</Link>} />
      {motivo !== null ? <EstadoVazio titulo={motivo.titulo} descricao={motivo.descricao} /> : <FormSolicitar slug={servico.slug} campos={servico.campos} titulares={titulares} termoDeAceite={servico.termoDeAceite} />}
    </div>
  );
}
