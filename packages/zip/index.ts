import { deflateRawSync, inflateRawSync } from "node:zlib";

/**
 * O CONTÊINER ZIP — N arquivos, sem dependência de terceiros.
 *
 * ═══ ⚠️ POR QUE ELE MORA AQUI, E NÃO NO M14 ═══
 * Este código nasceu dentro do M14 para zipar UM CSV destinado ao SICONFI. Quando o
 * download em lote de anexos (M22) precisou de um zip com VÁRIOS arquivos BINÁRIOS, havia
 * três caminhos:
 *
 *   · trazer uma lib de zip — uma dependência de terceiros, com o seu ciclo de CVE, num
 *     sistema que envia dado fiscal à União, para gerar 100 linhas de estrutura que a
 *     APPNOTE.TXT da PKWARE publica há trinta anos;
 *   · escrever um SEGUNDO contêiner no M22 — dois formatadores do mesmo formato binário,
 *     e o dia em que um ganhasse uma correção o outro continuaria errado;
 *   · extrair o que já existia e funcionava, generalizando para N entradas.
 *
 * É o terceiro. O `zipar` do M14 passou a ser uma chamada de UMA entrada, e o teste dele —
 * que compara BYTE A BYTE e exige que duas execuções produzam o mesmo arquivo — é a prova
 * de que a extração não mudou o artefato fiscal.
 *
 * ⚠️ SEM ZIP64, SEM CRIPTOGRAFIA. Os campos de tamanho do formato clássico são de 32 bits:
 * o contêiner suporta até 4 GB. O limite é COBRADO abaixo, com nome — um zip que estoura
 * silenciosamente os 4 GB produz um arquivo que abre corrompido, e quem baixou só descobre
 * isso depois.
 */

const LIMITE_DO_FORMATO = 0xffffffff;

const TABELA_CRC32 = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = TABELA_CRC32[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface EntradaDoZip {
  /**
   * O caminho DENTRO do zip. Quem monta a partir de texto do usuário passa por
   * `nomeSeguroNoZip` — ver o comentário de lá.
   */
  readonly nome: string;
  readonly conteudo: Uint8Array;
}

/**
 * ⚠️ DATA FIXA (1º de janeiro de 1980, o zero do formato MS-DOS), e é uma decisão.
 *
 * Um timestamp real faria o MESMO conteúdo gerar bytes DIFERENTES a cada execução. Para o
 * pacote fiscal do M14 isso é inaceitável: quem auditar amanhã precisa gerar o mesmo byte.
 * Para o lote de anexos é apenas correto — dois downloads do mesmo processo, sem movimento
 * nenhum entre eles, devem ser o mesmo arquivo.
 */
const HORA_MS_DOS = 0;
const DATA_MS_DOS = 0x0021;

/**
 * MONTA O .ZIP. Estrutura: [header local + nome + dados]* + [central + nome]* + EOCD.
 *
 * ⚠️ NOMES REPETIDOS SÃO RECUSADOS. O formato os aceita — e o extrator resolve o empate
 * como quiser, normalmente sobrescrevendo. Num lote de anexos isso significaria abrir o zip
 * e encontrar MENOS arquivos do que a tela prometeu, sem aviso nenhum. Quem monta o lote é
 * que desambigua (ver `nomeSeguroNoZip`).
 */
export function ziparEntradas(entradas: readonly EntradaDoZip[]): Buffer {
  if (entradas.length === 0) {
    throw new Error("Um zip precisa de ao menos um arquivo. Nada foi gerado.");
  }

  const vistos = new Set<string>();
  for (const e of entradas) {
    if (vistos.has(e.nome)) {
      throw new Error(
        `Nome repetido dentro do zip: "${e.nome}". O formato aceita, mas o extrator ` +
          `sobrescreve em silêncio — e quem baixa acaba com menos arquivos do que pediu.`
      );
    }
    vistos.add(e.nome);
  }

  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;
  let totalDescomprimido = 0;

  for (const entrada of entradas) {
    const nome = Buffer.from(entrada.nome, "utf8");
    const cru = Buffer.from(
      entrada.conteudo.buffer,
      entrada.conteudo.byteOffset,
      entrada.conteudo.byteLength
    );
    const comprimido = deflateRawSync(cru);
    const crc = crc32(cru);
    totalDescomprimido += cru.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // assinatura
    local.writeUInt16LE(20, 4); // versão mínima
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // método: deflate
    local.writeUInt16LE(HORA_MS_DOS, 10);
    local.writeUInt16LE(DATA_MS_DOS, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comprimido.length, 18);
    local.writeUInt32LE(cru.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28); // extra

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4); // versão de quem escreveu
    central.writeUInt16LE(20, 6); // versão mínima
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(HORA_MS_DOS, 12);
    central.writeUInt16LE(DATA_MS_DOS, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    // ⚠️ O OFFSET É DESTA ENTRADA, não zero. Era o único campo que a versão de um arquivo
    // só podia ter constante — e um zip com a segunda entrada apontando para o começo do
    // arquivo abre mostrando o primeiro documento duas vezes.
    central.writeUInt32LE(offset, 42);

    locais.push(local, nome, comprimido);
    centrais.push(central, nome);
    offset += local.length + nome.length + comprimido.length;

    if (offset > LIMITE_DO_FORMATO || totalDescomprimido > LIMITE_DO_FORMATO) {
      throw new Error(
        `O zip passou de 4 GB, que é o limite do formato clássico (sem ZIP64). Nada foi ` +
          `gerado — um contêiner que estoura esse limite em silêncio produz um arquivo ` +
          `que só se descobre corrompido depois de baixado.`
      );
    }
  }

  const inicioDoCentral = offset;
  const tamanhoDoCentral = centrais.reduce((s, b) => s + b.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disco
  eocd.writeUInt16LE(0, 6); // disco do início do central
  eocd.writeUInt16LE(entradas.length, 8); // entradas neste disco
  eocd.writeUInt16LE(entradas.length, 10); // entradas no total
  eocd.writeUInt32LE(tamanhoDoCentral, 12);
  eocd.writeUInt32LE(inicioDoCentral, 16);
  eocd.writeUInt16LE(0, 20); // comentário

  return Buffer.concat([...locais, ...centrais, eocd]);
}

/** Os caracteres que não podem viajar num nome dentro do zip: controle, barras e aspas. */
const PROIBIDOS_NO_NOME = /[\u0000-\u001f\u007f"]/g;

/**
 * O NOME DE UM ARQUIVO DENTRO DO ZIP, a partir de texto que veio do usuário.
 *
 * ⚠️ ZIP SLIP. O nome dentro do contêiner é um CAMINHO, e um extrator ingênuo que receba
 * `../../.ssh/authorized_keys` escreve exatamente ali. O nome original de um anexo é
 * digitado por quem faz o upload — inclusive, no protocolo, por um requerente externo.
 * Aqui ele vira um nome plano: sem barra, sem `..`, sem caractere de controle.
 *
 * ⚠️ E O PREFIXO NUMÉRICO NÃO É ENFEITE. Dois anexos chamados "documento.pdf" no mesmo
 * processo são comuns (o requerente enviou, o setor reenviou corrigido). Sem o prefixo,
 * `ziparEntradas` recusaria o lote inteiro — e o usuário ficaria sem download por causa de
 * uma coincidência de nomes que não é erro de ninguém.
 */
export function nomeSeguroNoZip(ordem: number, nomeOriginal: string): string {
  // ⚠️ A ORDEM DESTAS LINHAS É O PONTO TODO, e a primeira versão a errou.
  //
  // Ela removia os pontos iniciais ANTES de trocar as barras. Para
  // `../../.ssh/authorized_keys` isso apagava só o primeiro `..`, e o resto virava
  // `-..-.ssh-authorized_keys` — com um `..` VIVO no meio do nome. Nada estourava, e o
  // teste que pegou isso só existe porque ele compara o nome inteiro em vez de perguntar
  // "contém barra?".
  //
  // Agora: achata o caminho PRIMEIRO (barras viram hífen), e só então elimina os `..`, que
  // a essa altura são texto e não estrutura.
  const semControle = nomeOriginal.replace(PROIBIDOS_NO_NOME, "");
  const achatado = semControle.replace(/[\\/]/g, "-");

  let semTravessia = achatado;
  // O laço, e não um `replace` único: `....` vira `..` numa passagem só, e sobreviveria.
  while (semTravessia.includes("..")) semTravessia = semTravessia.replace(/\.\./g, "");

  const limpo = semTravessia
    .replace(/-{2,}/g, "-")
    .replace(/^[-.\s]+/, "")
    .trim();

  const seguro = limpo === "" ? "arquivo" : limpo.slice(0, 120);
  return `${String(ordem).padStart(3, "0")}-${seguro}`;
}

// ════════════════════════════════════════════════════════════════════════════════
// LEITURA — o caminho inverso, para abrir o que o TCE publica
// ════════════════════════════════════════════════════════════════════════════════

/**
 * ═══ LER UM .ZIP — e a razão de estar NESTE arquivo ═══
 *
 * ⚠️ O QUE PEDIU ISTO. O corpus oficial do TCE-PB chega em `.xlsx`, e um `.xlsx` É UM ZIP
 * de XML. Sem leitura de zip, o plano de contas oficial — 7.864 contas com procedência —
 * não entra no sistema, e a alternativa é digitar código de conta à mão: exatamente a
 * fabricação que o smoke do ENT03c se recusou a fazer.
 *
 * A escolha de casa é a mesma que trouxe a ESCRITA para cá: um formato, um lugar. Um
 * leitor de zip dentro do seed e um escritor dentro do pacote seriam duas leituras da
 * mesma APPNOTE, e o dia em que uma ganhasse correção a outra continuaria errada.
 *
 * ⚠️ LÊ PELO DIRETÓRIO CENTRAL, NÃO VARRENDO HEADERS LOCAIS. Varrer do começo procurando
 * `PK\x03\x04` parece mais simples e é errado: a assinatura pode aparecer DENTRO dos dados
 * comprimidos, e um arquivo removido continua com o header local no lugar. O diretório
 * central é a única lista autoritativa do que o contêiner contém — é por ele que todo
 * extrator sério anda.
 *
 * ⚠️ SEM ZIP64 (o mesmo limite da escrita) E SEM CRIPTOGRAFIA. Os dois são RECUSADOS com
 * nome, em vez de devolver bytes truncados que o chamador leria como dado válido.
 */

const ASSINATURA_EOCD = 0x06054b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_LOCAL = 0x04034b50;
/** O EOCD tem 22 bytes fixos + até 65.535 de comentário. */
const MAX_COMENTARIO_EOCD = 0xffff;

function acharEocd(buf: Buffer): number {
  const minimo = Math.max(0, buf.length - MAX_COMENTARIO_EOCD - 22);
  for (let i = buf.length - 22; i >= minimo; i--) {
    if (buf.readUInt32LE(i) === ASSINATURA_EOCD) return i;
  }
  throw new Error(
    "Não é um arquivo .zip válido: o diretório central (EOCD) não foi encontrado. " +
      "Um .xlsx é um zip — se este não é, o download veio truncado ou é outra coisa."
  );
}

/** O conteúdo de cada arquivo dentro do contêiner, por nome. */
export function lerEntradasDoZip(buf: Buffer): ReadonlyMap<string, Buffer> {
  const eocd = acharEocd(buf);
  const quantas = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  const saida = new Map<string, Buffer>();
  for (let i = 0; i < quantas; i++) {
    if (buf.readUInt32LE(p) !== ASSINATURA_CENTRAL) {
      throw new Error(
        `Diretório central corrompido na entrada ${i + 1} de ${quantas}: assinatura ` +
          `inesperada em ${p}.`
      );
    }
    const bandeira = buf.readUInt16LE(p + 8);
    const metodo = buf.readUInt16LE(p + 10);
    const tamComprimido = buf.readUInt32LE(p + 20);
    const tamNome = buf.readUInt16LE(p + 28);
    const tamExtra = buf.readUInt16LE(p + 30);
    const tamComentario = buf.readUInt16LE(p + 32);
    const deslocLocal = buf.readUInt32LE(p + 42);
    const nome = buf.toString("utf8", p + 46, p + 46 + tamNome);

    // ⚠️ BIT 0 DA BANDEIRA = CRIPTOGRAFADO. Sem isto, o inflate devolveria lixo e o
    // chamador leria lixo como se fosse XML.
    if ((bandeira & 0x1) !== 0) {
      throw new Error(`A entrada "${nome}" está criptografada; não há suporte.`);
    }

    if (buf.readUInt32LE(deslocLocal) !== ASSINATURA_LOCAL) {
      throw new Error(`Header local ausente para "${nome}".`);
    }
    // ⚠️ OS TAMANHOS DE NOME E EXTRA DO HEADER LOCAL PODEM DIFERIR DOS DO CENTRAL — e
    // usar os do central para calcular o início dos dados é um erro clássico que desloca
    // a leitura em alguns bytes.
    const tamNomeLocal = buf.readUInt16LE(deslocLocal + 26);
    const tamExtraLocal = buf.readUInt16LE(deslocLocal + 28);
    const inicio = deslocLocal + 30 + tamNomeLocal + tamExtraLocal;
    const bruto = buf.subarray(inicio, inicio + tamComprimido);

    if (metodo === 0) saida.set(nome, Buffer.from(bruto));
    else if (metodo === 8) saida.set(nome, inflateRawSync(bruto));
    else {
      throw new Error(
        `A entrada "${nome}" usa o método de compressão ${metodo}; só há suporte a ` +
          `armazenado (0) e deflate (8).`
      );
    }

    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return saida;
}
