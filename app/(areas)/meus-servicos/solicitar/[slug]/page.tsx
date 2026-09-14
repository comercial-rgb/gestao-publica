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
    !permitidas.has("SOLICITAR_SERVICO") ? { titulo: "Sua conta não pode protocolar solicitações", descricao: "O perfil da sua conta não tem a permissão de solicitar serviços. Procure o atendimento do ente." }
    : quem.pessoa === null ? { titulo: "A sua conta ainda não está ligada ao seu cadastro de pessoa", descricao: "O pedido é feito em nome de uma pessoa do cadastro. O vínculo é feito pelo atendimento, pelo CPF." }
    : titulares.length === 0 ? { titulo: "Você não tem representação vigente de uma empresa", descricao: "Este serviço é pedido em nome da empresa, por quem tem representação registrada e vigente dela. A representação é registrada pelo ente, com o documento que a fundamenta." }
    : null;
  return (
    <div className="space-y-4">
      <PageHeader titulo={`Pedir: ${servico.titulo}`} subtitulo={`Versão ${servico.versao} do formulário · prazo: ${servico.prazo ?? "não declarado"}`} acoes={<Link href={`/servicos/${servico.slug}`} className="text-sm text-[color:var(--color-primary)] underline">Ver requisitos e documentos</Link>} />
      {motivo !== null ? <EstadoVazio titulo={motivo.titulo} descricao={motivo.descricao} /> : <FormSolicitar slug={servico.slug} campos={servico.campos} titulares={titulares} termoDeAceite={servico.termoDeAceite} />}
    </div>
  );
}
