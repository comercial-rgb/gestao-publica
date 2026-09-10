import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

/**
 * M22 — O ARMAZENAMENTO DOS ANEXOS.
 *
 * ═══ ⚠️ FORA DE QUALQUER PASTA SERVIDA ESTATICAMENTE ═══
 * O diretório default é `var/anexos`, na raiz do repositório, e ele NÃO é `public/`.
 * Um arquivo em `public/` é servido pelo Next SEM passar por autorização nenhuma: quem
 * tivesse a URL leria o anexo de um processo sigiloso sem sequer estar logado.
 *
 * ⚠️ O NOME NO DISCO É O ID, NUNCA O NOME QUE O USUÁRIO MANDOU. Duas razões, e as duas
 * já morderam projetos reais:
 *   · `../../etc/passwd` como nome de arquivo é o path traversal clássico;
 *   · dois usuários que enviam "documento.pdf" sobrescreveriam um ao outro.
 *
 * ⚠️ E O CAMINHO É CONFERIDO DEPOIS DE RESOLVIDO. Montar o caminho com o id e confiar
 * é o mesmo erro com um passo a mais: a conferência abaixo recusa qualquer resultado
 * que escape da raiz, mesmo que a montagem tenha sido burlada.
 */

/** O rol de formatos aceitos (5.42.29). Validado NO SERVIDOR — o `accept` do input é conveniência. */
export const MIMES_ACEITOS: Readonly<Record<string, string>> = {
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.oasis.opendocument.text": "odt",
  "image/jpeg": "jpg",
  "image/png": "png",
};

/**
 * OS FORMATOS QUE O PRÓPRIO SISTEMA GERA — e por que eles são um rol SEPARADO.
 *
 * ⚠️ A DISTINÇÃO NÃO É UM BURACO NO ROL; É O RECONHECIMENTO DE QUE OS DOIS RISCOS SÃO
 * DIFERENTES.
 *
 * `MIMES_ACEITOS` protege contra o que entra DE FORA: um requerente externo enviando um
 * arquivo pelo protocolo. Ali o rol é curto de propósito — nada de HTML, nada de SVG,
 * nada de executável renomeado.
 *
 * Um borderô, um comprovante ou um relatório GERADO PELO SISTEMA não corre esse risco: o
 * conteúdo foi montado por nós, byte a byte, a partir de dados do banco. Recusá-lo pelo
 * rol de upload obrigaria a inventar um PDF só para caber numa regra que não foi escrita
 * para ele — ou, pior, a afrouxar o rol de upload, que é o que protege o caso perigoso.
 *
 * ⚠️ E A DEFESA DO DOWNLOAD CONTINUA VALENDO PARA OS DOIS. A rota responde `attachment` +
 * `nosniff`: nada é renderizado na origem da aplicação, venha de onde vier. Este rol
 * decide o que se PODE gerar, não afrouxa como se entrega.
 *
 * ⚠️ ELE SÓ VALE COM `origem: "SISTEMA"`. Um upload que se declarasse `text/plain` continua
 * recusado — e a origem não é escolha do formulário: quem a passa é o caso de uso.
 */
export const MIMES_GERADOS_PELO_SISTEMA: Readonly<Record<string, string>> = {
  ...MIMES_ACEITOS,
  "text/plain": "txt",
  "text/csv": "csv",
};

/** 25 MB. Limite do SERVIDOR: o do formulário é sugestão, e sugestão não protege. */
export const TAMANHO_MAXIMO_BYTES = 25 * 1024 * 1024;

export function raizDosAnexos(env: NodeJS.ProcessEnv = process.env): string {
  const configurada = env["ANEXOS_DIR"]?.trim();
  return resolve(
    configurada !== undefined && configurada !== "" ? configurada : "var/anexos"
  );
}

/**
 * O caminho do arquivo de um anexo. Sharding por dois caracteres do id: um diretório
 * com cem mil entradas é lento para listar em qualquer sistema de arquivos.
 */
export function caminhoDoAnexo(
  anexoId: string,
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!/^[a-z0-9]{6,64}$/i.test(anexoId)) {
    throw new Error(
      `Identificador de anexo inválido: "${anexoId}". O nome no disco vem do id, e um ` +
        `id com barras ou pontos seria um caminho, não um nome.`
    );
  }
  const raiz = raizDosAnexos(env);
  const caminho = resolve(join(raiz, anexoId.slice(0, 2), anexoId));

  // ⚠️ A CONFERÊNCIA DEPOIS DE RESOLVER — ver o cabeçalho.
  if (!caminho.startsWith(raiz + "/") && caminho !== raiz) {
    throw new Error(
      `Caminho de anexo escaparia da raiz de armazenamento. Nada foi lido nem gravado.`
    );
  }
  return caminho;
}

export function sha256(conteudo: Uint8Array): string {
  return createHash("sha256").update(conteudo).digest("hex");
}

/**
 * VALIDA O QUE VAI SER GRAVADO — tipo, tamanho e conteúdo não vazio.
 *
 * ⚠️ ELE DEVOLVE A MENSAGEM, e não um booleano. Quem recebe "arquivo inválido" abre
 * chamado; quem recebe "PDF, DOC, DOCX, XLS, XLSX, JPG, PNG ou ODT" troca o arquivo.
 */
export function recusaDoArquivo(
  mimeType: string,
  tamanhoBytes: number,
  origem: "UPLOAD" | "DIGITALIZACAO" | "CAMERA" | "SISTEMA" = "UPLOAD"
): string | null {
  // ⚠️ O ROL DEPENDE DA ORIGEM — ver `MIMES_GERADOS_PELO_SISTEMA`. O default é o
  // RESTRITIVO: quem não disser nada é tratado como upload de fora.
  const rol = origem === "SISTEMA" ? MIMES_GERADOS_PELO_SISTEMA : MIMES_ACEITOS;

  if (!(mimeType in rol)) {
    return (
      `Formato não aceito: "${mimeType}". Os formatos aceitos são PDF, DOC, DOCX, XLS, ` +
      `XLSX, JPG, PNG e ODT. A conferência é do SERVIDOR — o filtro da tela é ` +
      `conveniência, e conveniência não protege.`
    );
  }
  if (tamanhoBytes <= 0) {
    return "Arquivo vazio: nada a anexar.";
  }
  if (tamanhoBytes > TAMANHO_MAXIMO_BYTES) {
    const mb = (tamanhoBytes / 1024 / 1024).toFixed(1);
    return `Arquivo de ${mb} MB excede o limite de 25 MB.`;
  }
  return null;
}

export async function gravarArquivo(
  anexoId: string,
  conteudo: Uint8Array,
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const caminho = caminhoDoAnexo(anexoId, env);
  await mkdir(join(caminho, ".."), { recursive: true });
  await writeFile(caminho, conteudo);
}

/**
 * LÊ E CONFERE A INTEGRIDADE. O hash não é decoração: sem ele, "o arquivo é o mesmo"
 * é uma afirmação sem prova, e um arquivo trocado no disco passaria por original.
 */
export async function lerArquivo(
  anexoId: string,
  sha256Esperado: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<Uint8Array> {
  const lido = await readFile(caminhoDoAnexo(anexoId, env));
  // ⚠️ `readFile` DEVOLVE UM `Buffer`, e a assinatura desta função promete `Uint8Array`.
  // `Buffer` É um `Uint8Array`, então o compilador não reclama — mas ele carrega métodos
  // do Node e serializa como `{type:"Buffer",data:[...]}` no primeiro `JSON.stringify`,
  // o que faria um anexo atravessar a fronteira da UI com outra forma. A VIEW abaixo não
  // copia bytes: é o mesmo buffer, com o tipo que a porta declara.
  const conteudo = new Uint8Array(lido.buffer, lido.byteOffset, lido.byteLength);
  const atual = sha256(conteudo);
  if (atual !== sha256Esperado) {
    throw new Error(
      `INTEGRIDADE: o anexo ${anexoId} no disco não confere com o hash registrado ` +
        `(esperado ${sha256Esperado.slice(0, 12)}…, encontrado ${atual.slice(0, 12)}…). ` +
        `O arquivo foi trocado ou corrompido depois de anexado. Nada foi entregue.`
    );
  }
  return conteudo;
}
