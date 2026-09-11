import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * ═══ A PROCEDÊNCIA É COBRADA NA HORA DE LER, NÃO PROMETIDA NUM COMENTÁRIO ═══
 *
 * ⚠️ O QUE ESTE ARQUIVO IMPEDE. O plano de contas, os subelementos e as fontes entram no
 * sistema a partir de arquivos publicados pelo TCE-PB e guardados em `docs/oficial/`. Um
 * comentário dizendo "extraído do arquivo oficial" vale enquanto ninguém edita o arquivo —
 * e `docs/oficial/tce-pb/LEIA-ME.md` já adverte, em letra maiúscula, **"Não editar
 * arquivos baixados"**. Uma advertência é disciplina; disciplina falha.
 *
 * Aqui a regra é executável: o `sha256` de cada arquivo é conferido contra o `MANIFEST.json`
 * ANTES de qualquer linha ser lida. Se não bater, o seed PARA e diz qual arquivo, qual hash
 * esperava e qual encontrou.
 *
 * ⚠️ E FALHA FECHADO. A tentação é avisar e seguir ("é só um aviso"). Para uma tabela que
 * vira LANÇAMENTO CONTÁBIL isso é o pior dos mundos: o número sai errado com a aparência
 * de ter procedência. Um seed que não roda é um problema visível; um seed que roda com
 * dado adulterado é um problema que aparece na prestação de contas.
 *
 * ⚠️ POR QUE O MANIFESTO, E NÃO UMA CONSTANTE AQUI. O `MANIFEST.json` é preenchido por
 * quem baixa o arquivo e carrega `url`, `versao`, `dataPublicacao` e `dataDownload`. Copiar
 * o hash para cá criaria a segunda verdade — e no dia em que divergissem, nenhuma das duas
 * seria autoridade.
 */

const RAIZ = fileURLToPath(new URL("../../../", import.meta.url));
export const PASTA_OFICIAL = join(RAIZ, "docs", "oficial", "tce-pb");
const MANIFESTO = join(PASTA_OFICIAL, "MANIFEST.json");

export interface ArquivoOficial {
  readonly arquivo: string;
  readonly fonte: string;
  readonly url: string;
  readonly versao: string;
  readonly dataPublicacao: string;
  readonly dataDownload: string;
  readonly sha256: string;
}

interface Manifesto {
  readonly arquivos: readonly ArquivoOficial[];
}

let cache: readonly ArquivoOficial[] | null = null;

export function manifesto(): readonly ArquivoOficial[] {
  if (cache === null) {
    cache = (JSON.parse(readFileSync(MANIFESTO, "utf8")) as Manifesto).arquivos;
  }
  return cache;
}

export function procedenciaDe(arquivo: string): ArquivoOficial {
  const achado = manifesto().find((a) => a.arquivo === arquivo);
  if (achado === undefined) {
    throw new Error(
      `"${arquivo}" não está em ${MANIFESTO}. Todo arquivo oficial precisa de procedência ` +
        `registrada (fonte, url, versão, data de publicação e sha256) antes de virar dado ` +
        `do sistema.`
    );
  }
  return achado;
}

/**
 * LÊ UM ARQUIVO OFICIAL, conferindo o hash primeiro. Devolve o conteúdo e a procedência —
 * juntos de propósito, para que o chamador possa registrar de onde o dado veio sem ter de
 * ir buscar em outro lugar.
 */
export function lerOficial(arquivo: string): {
  readonly conteudo: Buffer;
  readonly procedencia: ArquivoOficial;
} {
  const procedencia = procedenciaDe(arquivo);
  const caminho = join(PASTA_OFICIAL, arquivo);

  let conteudo: Buffer;
  try {
    conteudo = readFileSync(caminho);
  } catch {
    throw new Error(
      `O arquivo oficial "${arquivo}" não está em ${PASTA_OFICIAL}.\n` +
        `Origem declarada: ${procedencia.url}\n` +
        `Sem ele não há tabela real, e inventar os códigos não é alternativa.`
    );
  }

  const encontrado = createHash("sha256").update(conteudo).digest("hex");
  if (encontrado !== procedencia.sha256) {
    throw new Error(
      `\n\nO ARQUIVO OFICIAL "${arquivo}" NÃO CONFERE COM O MANIFESTO.\n\n` +
        `  esperado .. ${procedencia.sha256}\n` +
        `  encontrado  ${encontrado}\n\n` +
        `Este arquivo vira plano de contas e, por ele, LANÇAMENTO CONTÁBIL. Se o TCE ` +
        `publicou versão nova, ela entra como ARQUIVO NOVO com data no nome e entrada ` +
        `nova no MANIFEST.json — nunca sobrescrevendo, porque o que já foi semeado ` +
        `referencia a versão antiga (regra 1 de docs/oficial/tce-pb/LEIA-ME.md).\n`
    );
  }
  return { conteudo, procedencia };
}

/** Uma linha de crédito, para o log do seed e para o registro no banco. */
export function creditoDe(p: ArquivoOficial): string {
  return `${p.fonte} | ${p.arquivo} | versão ${p.versao} | publicado em ${p.dataPublicacao} | sha256 ${p.sha256.slice(0, 12)}…`;
}
