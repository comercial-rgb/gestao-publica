import { cliente, PortaSemBancoError } from "./cliente";
import { comEscritaAutenticada, exigirSessao, sessaoAtual } from "./sessao";
import { anexarArquivo, baixarAnexo } from "../../modules/m22-documentos/anexos";
import {
  listarAnexosDaPessoa,
  listarAnexosDoComunicado,
  listarAnexosDoProcesso,
  loteDeAnexosDaPessoa,
  loteDeAnexosDoProcesso,
  type AnexoNaLista,
  type LoteDeAnexos,
} from "../../modules/m22-documentos/consultas";
import {
  MIMES_ACEITOS,
  TAMANHO_MAXIMO_BYTES,
} from "../../modules/m22-documentos/armazenamento";

/**
 * PORTA — ANEXOS (M22): a entrada pelo formulário e a saída pela rota.
 *
 * ═══ ⚠️ POR QUE ESTA PORTA EXISTIU TÃO TARDE, E O QUE ISSO CUSTAVA ═══
 * O M22 nasceu no ENT02 com caso de uso, autorização por registro, hash, conferência de
 * integridade e quinze testes. E com ZERO consumidores: `anexarArquivo` e `baixarAnexo`
 * eram chamados só pelo próprio arquivo de teste. Não havia porta, não havia rota, e o
 * único `<input type="file">` do produto era o do importador de CSV.
 *
 * Na prática o produto tinha um cofre sem porta: nada entrava pela interface, e o que
 * entrasse por um script não sairia. "Documentos preservados na tramitação, com download
 * individual e em lote" era uma promessa que nenhuma tela cumpria.
 *
 * ⚠️ E A SAÍDA É UMA ROTA, NÃO UMA SERVER ACTION. Server Action devolve JSON serializado
 * pelo protocolo do React — um PDF de 20 MB atravessaria como array de bytes e o browser
 * não teria como salvá-lo. O download é HTTP: `Content-Type`, `Content-Disposition`, e o
 * navegador faz o resto. Ver `app/(areas)/documentos/anexos/[id]/route.ts`.
 */

export { PortaSemBancoError };
export type { AnexoNaLista, LoteDeAnexos };

/** O rol aceito, para o `accept` do input. ⚠️ Conveniência de tela — quem valida é o servidor. */
export const EXTENSOES_ACEITAS = Object.values(MIMES_ACEITOS)
  .map((e) => `.${e}`)
  .join(",");

export { TAMANHO_MAXIMO_BYTES };

// ═══════════════════════════════════════════════════════════════════════════
// LEITURAS
// ═══════════════════════════════════════════════════════════════════════════

export async function lerAnexosDoProcesso(
  processoId: string
): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirSessao();
  return listarAnexosDoProcesso(cliente(), processoId, sessao.identificador);
}

export async function lerAnexosDaPessoa(
  pessoaId: string
): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirSessao();
  return listarAnexosDaPessoa(cliente(), pessoaId, sessao.identificador);
}

export async function lerAnexosDoComunicado(
  comunicadoId: string
): Promise<readonly AnexoNaLista[]> {
  const sessao = await exigirSessao();
  return listarAnexosDoComunicado(cliente(), comunicadoId, sessao.identificador);
}

/**
 * O ARQUIVO, para a rota de download.
 *
 * ⚠️ ELE USA `sessaoAtual`, NÃO `exigirSessao`, e a diferença importa AQUI. `exigirSessao`
 * REDIRECIONA para /login — o que numa página é o certo e numa rota de download é um
 * desastre silencioso: o browser seguiria o 307, receberia o HTML da tela de login e
 * salvaria isso como se fosse o PDF. O usuário abriria um "documento.pdf" com uma página
 * de login dentro.
 *
 * Sem sessão, `null`, e a rota responde 404 — a mesma resposta de "não existe" e de "não
 * pode", pelo motivo de sempre.
 */
export async function entregarAnexo(
  anexoId: string
): Promise<Awaited<ReturnType<typeof baixarAnexo>>> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  return baixarAnexo(cliente(), anexoId, sessao.identificador);
}

export async function entregarLoteDoProcesso(
  processoId: string
): Promise<LoteDeAnexos | null> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  return loteDeAnexosDoProcesso(cliente(), processoId, sessao.identificador);
}

export async function entregarLoteDaPessoa(
  pessoaId: string
): Promise<LoteDeAnexos | null> {
  const sessao = await sessaoAtual();
  if (sessao === null) return null;
  return loteDeAnexosDaPessoa(cliente(), pessoaId, sessao.identificador);
}

// ═══════════════════════════════════════════════════════════════════════════
// ESCRITA — o `criadoPor` vem da sessão, sempre
// ═══════════════════════════════════════════════════════════════════════════

export interface AnexarNaTela {
  readonly nomeOriginal: string;
  readonly mimeType: string;
  readonly conteudo: Uint8Array;
  readonly origem?: "UPLOAD" | "DIGITALIZACAO" | "CAMERA" | "SISTEMA" | undefined;
  readonly processoId?: string | undefined;
  readonly movimentoProcessoId?: string | undefined;
  readonly comunicadoId?: string | undefined;
  readonly pessoaId?: string | undefined;
}

export async function anexarNaTela(
  input: AnexarNaTela
): Promise<{ readonly anexoId: string; readonly sha256: string }> {
  return comEscritaAutenticada("ANEXAR_ARQUIVO", (criadoPor) =>
    anexarArquivo(cliente(), { ...input, criadoPor })
  );
}
