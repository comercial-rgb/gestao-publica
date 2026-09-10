import { NextResponse } from "next/server";
import { entregarAnexo } from "../../../../../lib/portas/documentos";

/**
 * DOWNLOAD DE UM ANEXO — e a autorização é a DO REGISTRO DONO, resolvida no servidor.
 *
 * ═══ ⚠️ ESTA ROTA É A FECHADURA, E A PASTA NÃO É SERVIDA ═══
 * Os arquivos moram em `var/anexos`, fora de `public/`. Não há rota estática apontando
 * para lá — de propósito: uma pasta pública entrega o anexo de um processo sigiloso a
 * quem tiver a URL, sem sequer estar logado.
 *
 * Aqui todo download passa por `baixarAnexo`, que pergunta ao processo, ao comunicado ou
 * à pessoa dona se ESTE usuário pode. A mesma pergunta que a tela faz.
 *
 * ═══ ⚠️ 404 PARA "NÃO EXISTE" E PARA "NÃO PODE" ═══
 * A porta devolve `null` nos dois casos, e a rota não os distingue. Um 403 confirmaria a
 * existência do anexo — e quem varre identificadores ao acaso aprenderia, pela diferença
 * entre 403 e 404, exatamente quais processos existem. O conteúdo continua protegido e o
 * catálogo vaza.
 *
 * ═══ ⚠️ `Content-Disposition: attachment`, E ELE NÃO É ESTÉTICA ═══
 * `inline` faria o browser RENDERIZAR o arquivo na origem da aplicação. Um "anexo" HTML ou
 * SVG enviado por um requerente externo viraria script rodando com o cookie de sessão de
 * quem abriu (o rol de MIMEs não aceita esses tipos hoje — mas a defesa não pode depender
 * de o rol nunca mudar). `attachment` manda salvar, e nada executa.
 *
 * O `X-Content-Type-Options: nosniff` fecha a outra metade: sem ele o browser adivinha o
 * tipo pelo conteúdo e pode executar um arquivo declarado como imagem.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ⚠️ ASPAS E CONTROLE FORA DO CABEÇALHO — ver `nomeSeguroNoZip`, mesma família de defeito. */
function nomeNoCabecalho(nome: string): string {
  return nome.replace(/["\\\r\n]/g, "_");
}

export async function GET(
  _req: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> }
): Promise<NextResponse> {
  const { id } = await params;

  let anexo: Awaited<ReturnType<typeof entregarAnexo>>;
  try {
    anexo = await entregarAnexo(id);
  } catch (e) {
    // ⚠️ A FALHA DE INTEGRIDADE CHEGA AQUI. `lerArquivo` estoura quando o hash do disco não
    // confere com o registrado — e essa mensagem TEM de ser mostrada, não engolida num 404
    // genérico: ela é a diferença entre "não achei" e "o arquivo foi trocado depois de
    // anexado". A segunda é um incidente, e alguém precisa saber dele.
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : "Falha ao ler o anexo." },
      { status: 500 }
    );
  }

  if (anexo === null) {
    return NextResponse.json(
      { erro: "Anexo não encontrado." },
      { status: 404, headers: { "cache-control": "no-store" } }
    );
  }

  return new NextResponse(new Uint8Array(anexo.conteudo), {
    status: 200,
    headers: {
      "content-type": anexo.mimeType,
      "content-disposition": `attachment; filename="${nomeNoCabecalho(anexo.nomeOriginal)}"`,
      "content-length": String(anexo.tamanhoBytes),
      "x-content-type-options": "nosniff",
      // O hash viaja no cabeçalho: quem baixa pode conferir o arquivo sem abrir o sistema.
      "x-anexo-sha256": anexo.sha256,
      // ⚠️ `no-store`: o conteúdo é autorizado por REGISTRO e por USUÁRIO. Um cache
      // compartilhado (um proxy da rede da prefeitura, por exemplo) que guardasse a
      // resposta a entregaria ao próximo que pedisse a mesma URL — sem passar por aqui.
      "cache-control": "no-store, private",
    },
  });
}
