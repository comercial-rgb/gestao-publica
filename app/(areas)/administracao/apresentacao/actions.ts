"use server";

import { revalidatePath } from "next/cache";
import { TEMAS, configurarApresentacaoAdmin, type Tema } from "../../../../lib/portas/identidade";
import { comComandoDoFormulario } from "../../../../lib/portas/comando";
import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";

/**
 * A ESCRITA DA APRESENTAÇÃO DO ENTE (V6 P0.1). Uma versão nova por envio, com o autor da sessão.
 * A imagem chega como arquivo do formulário e é validada pelos BYTES no domínio; o tema é um
 * conjunto fechado. A mensagem do domínio sobe como veio.
 */
export interface EstadoApresentacao {
  readonly erro?: string;
  readonly sucesso?: string;
}

const ROTAS_AFETADAS = ["/administracao/apresentacao", "/login", "/", "/transparencia/demonstrativos"];

function texto(formData: FormData, nome: string): string | undefined {
  const v = String(formData.get(nome) ?? "").trim();
  return v === "" ? undefined : v;
}

export async function configurarApresentacaoAction(_prev: EstadoApresentacao, formData: FormData): Promise<EstadoApresentacao> {
  return comComandoDoFormulario(formData, async () => {
    const temaBruto = String(formData.get("tema") ?? "PADRAO");
    const tema: Tema = (TEMAS as readonly string[]).includes(temaBruto) ? (temaBruto as Tema) : "PADRAO";
    const arquivo = formData.get("imagem");
    let imagem: Uint8Array | undefined;
    if (arquivo instanceof File && arquivo.size > 0) {
      imagem = new Uint8Array(await arquivo.arrayBuffer());
    }
    try {
      const r = await configurarApresentacaoAdmin({
        nomeDeExibicao: String(formData.get("nomeDeExibicao") ?? "").trim(),
        orgao: texto(formData, "orgao"),
        assinaturaDoFornecedor: texto(formData, "assinaturaDoFornecedor"),
        contatoEmail: texto(formData, "contatoEmail"),
        contatoTelefone: texto(formData, "contatoTelefone"),
        horarioDeAtendimento: texto(formData, "horarioDeAtendimento"),
        sitio: texto(formData, "sitio"),
        tema,
        ...(imagem !== undefined ? { imagem } : {}),
        manterImagem: formData.get("manterImagem") === "on",
        canalTransparencia: formData.get("canalTransparencia") === "on",
        canalConsultaPublica: formData.get("canalConsultaPublica") === "on",
      });
      for (const rota of ROTAS_AFETADAS) revalidatePath(rota);
      revalidatePath("/", "layout");
      return { sucesso: `Apresentação gravada como versão ${r.numero}. A entrada, o cabeçalho e os documentos novos passam a usá-la; os documentos já emitidos não mudam.` };
    } catch (e) {
      return { erro: mensagemDoErro(e, "Não foi possível gravar a apresentação.") };
    }
  });
}
