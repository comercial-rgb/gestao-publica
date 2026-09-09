import {
  createHash,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  senha: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * M16 — A CRIPTOGRAFIA DA CREDENCIAL. TR 4.55.
 *
 * ═══ ⚠️ ZERO DEPENDÊNCIA NOVA, E ISSO É UMA DECISÃO DE SEGURANÇA ═══
 * `scrypt` e `timingSafeEqual` são do `node:crypto` — do runtime, auditado, sem supply chain.
 * Uma biblioteca de hashing (bcrypt, argon2) traria binário nativo e uma árvore de dependências
 * novas para dentro do sistema que guarda a senha do tesoureiro do município. O `scrypt` do Node
 * é o mesmo algoritmo do RFC 7914, e ele já está aqui.
 *
 * ⚠️ QUALQUER PROPOSTA DE TROCAR ISTO POR UMA LIB **PARA E REPORTA**. Não é preciosismo: o
 * ganho seria marginal (argon2id é melhor, não indispensável) e o preço é uma dependência a
 * mais no caminho da autenticação — o lugar do repositório onde uma dependência comprometida
 * faz o estrago máximo.
 *
 * ═══ OS PARÂMETROS, E O QUE FOI MEDIDO ═══
 * N=2^15 · r=8 · p=1 · keylen=64. Medido nesta máquina: **~91 ms por hash**. É o alvo (a ordem
 * de 100 ms): caro o bastante para tornar a força bruta inviável, barato o bastante para o
 * servidor não cair sob login legítimo.
 *
 * ⚠️ E O `maxmem` **TEM** DE SER EXPLÍCITO — este é um achado, não uma linha de ritual.
 * A memória que o scrypt exige é `128 * N * r` = 128 · 32768 · 8 = **exatamente 32 MiB**, que é
 * o `maxmem` DEFAULT do Node. E ele falha: `ERR_CRYPTO_INVALID_SCRYPT_PARAMS`, porque o limite é
 * batido, não folgado. Sem os 64 MiB abaixo, o sistema inteiro não autentica ninguém — e
 * descobrir isso em produção, no primeiro login, seria descobrir tarde.
 */
const SCRYPT = {
  N: 2 ** 15,
  r: 8,
  p: 1,
  keylen: 64,
  /** 64 MiB. Ver o cabeçalho: 32 MiB (o default) NÃO basta para N=2^15, r=8. */
  maxmem: 64 * 1024 * 1024,
} as const;

const SALT_BYTES = 16;

/**
 * A POLÍTICA MÍNIMA: 12 caracteres.
 *
 * ⚠️ MÍNIMA de propósito. Regras de composição ("uma maiúscula, um símbolo") produzem
 * `Senha@123` — curta, previsível e péssima — enquanto proíbem uma passphrase longa e ótima. O
 * NIST abandonou a composição obrigatória exatamente por isso; o que protege é o COMPRIMENTO.
 *
 * Uma política maior (lista de senhas vazadas, entropia mínima) é PARÂMETRO DO ENTE e entra
 * como configuração — não como constante costurada aqui.
 */
export const COMPRIMENTO_MINIMO_DA_SENHA = 12;

export function exigirSenhaAceitavel(senha: string): void {
  if (senha.length < COMPRIMENTO_MINIMO_DA_SENHA) {
    throw new Error(
      `SENHA CURTA DEMAIS: são exigidos ao menos ${COMPRIMENTO_MINIMO_DA_SENHA} caracteres ` +
        `(a senha informada tem ${senha.length}). O que protege uma senha é o COMPRIMENTO — ` +
        `uma frase longa vale mais do que um "Senha@123". Nada foi gravado.`
    );
  }
}

/**
 * Gera o hash AUTODESCRITIVO: `scrypt$N$r$p$saltB64$hashB64`.
 *
 * ⚠️ OS PARÂMETROS VIAJAM COM O HASH — e é isso que torna o custo EVOLUÍVEL. Quando o hardware
 * melhorar e o N de hoje ficar fraco, sobe-se o N para as senhas NOVAS; as antigas continuam
 * verificáveis, porque cada hash carrega o custo com que nasceu. Ler os parâmetros de uma
 * constante global faria o oposto: mudar a constante invalidaria todos os hashes anteriores de
 * uma vez, e ninguém mais entraria.
 */
export async function gerarHashDeSenha(senha: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scrypt(senha, salt, SCRYPT.keylen, SCRYPT);
  return [
    "scrypt",
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join("$");
}

interface HashLido {
  readonly N: number;
  readonly r: number;
  readonly p: number;
  readonly salt: Buffer;
  readonly hash: Buffer;
}

function lerHash(hashString: string): HashLido {
  const partes = hashString.split("$");
  if (partes.length !== 6 || partes[0] !== "scrypt") {
    throw new Error(
      `HASH DE SENHA MALFORMADO: esperado \`scrypt$N$r$p$salt$hash\`. Um hash que não se ` +
        `descreve não pode ser verificado — e adivinhar os parâmetros seria pior do que falhar.`
    );
  }
  return {
    N: Number(partes[1]),
    r: Number(partes[2]),
    p: Number(partes[3]),
    salt: Buffer.from(partes[4]!, "base64"),
    hash: Buffer.from(partes[5]!, "base64"),
  };
}

/**
 * Confere a senha contra o hash. **Tempo constante** na comparação.
 *
 * ⚠️ `timingSafeEqual`, E NÃO `===`. Uma comparação normal de bytes sai no PRIMEIRO byte
 * diferente — e o tempo que ela leva vaza QUANTOS bytes iniciais estavam certos. Com medições
 * repetidas, isso permite descobrir o hash byte a byte. `timingSafeEqual` percorre tudo, sempre.
 *
 * ⚠️ E O `scrypt` RODA **ANTES** DE QUALQUER DECISÃO — inclusive contra o hash falso do usuário
 * inexistente (ver `HASH_INEXISTENTE`). É o que iguala os dois caminhos no relógio.
 */
export async function conferirSenha(
  senha: string,
  hashString: string
): Promise<boolean> {
  const lido = lerHash(hashString);

  const calculado = await scrypt(senha, lido.salt, lido.hash.length, {
    N: lido.N,
    r: lido.r,
    p: lido.p,
    maxmem: SCRYPT.maxmem,
  });

  // Comprimentos diferentes fariam o `timingSafeEqual` ESTOURAR (ele exige buffers do mesmo
  // tamanho) — e um throw aqui seria, ele próprio, um canal de tempo. Falha limpa.
  if (calculado.length !== lido.hash.length) return false;

  return timingSafeEqual(calculado, lido.hash);
}

/**
 * ⚠️ O HASH DO USUÁRIO QUE NÃO EXISTE — e ele é o coração da defesa contra ENUMERAÇÃO.
 *
 * ═══ O ATAQUE QUE ISTO FECHA ═══
 * Sem ele, `autenticar("fulano@cg.pb.gov.br", "x")` para um usuário inexistente responderia em
 * ~1 ms (não achou ninguém, retornou), enquanto para um usuário REAL com senha errada levaria
 * ~91 ms (rodou o scrypt). O atacante não precisa de mensagem nenhuma: **o relógio conta.** Ele
 * varre uma lista de e-mails do município e separa, com precisão, quem tem conta de quem não
 * tem — e aí concentra a força bruta só nos que existem.
 *
 * A cura é fazer o caminho "não existe" **trabalhar exatamente o mesmo tanto**: o scrypt roda
 * contra este hash, com os mesmos parâmetros, e o resultado é descartado (é sempre falso — o
 * hash-alvo é de 64 bytes zerados, que nenhuma senha produz).
 *
 * O salt é fixo e público: ele não guarda segredo nenhum, só faz o formato ser válido.
 */
export const HASH_INEXISTENTE: string = [
  "scrypt",
  SCRYPT.N,
  SCRYPT.r,
  SCRYPT.p,
  Buffer.alloc(SALT_BYTES, 0).toString("base64"),
  Buffer.alloc(SCRYPT.keylen, 0).toString("base64"),
].join("$");

// ═══════════════════════════════════════════════════════════════════════════
// O TOKEN DE SESSÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 32 bytes de entropia criptográfica. Não é senha: ninguém o escolhe, ninguém o decora, e não
 * há dicionário que o alcance — 2^256 é 2^256.
 */
export function gerarToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * O que VAI PARA O BANCO. SHA-256 puro basta AQUI, e a diferença para a senha é real: o token já
 * é aleatório de verdade, então não há o que "adivinhar" — o custo de memória do scrypt existe
 * para tornar cara a busca em dicionário, e aqui não há dicionário. Encarecer o hash do token só
 * tornaria LENTA cada requisição autenticada, sem comprar segurança nenhuma.
 */
export function hashDoToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
