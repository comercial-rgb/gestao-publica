/**
 * O DESTINO DO PERCURSO (V39-002) — a quem um percurso de navegador pode se conectar, antes de digitar a senha.
 *
 * ⚠️ POR QUE ISTO EXISTE. Até a V38 a única proteção era a marca "(base fictícia)" na tela, conferida DEPOIS do login
 * e só nos percursos que lembravam de conferir. Duas regras, agora no `entrar` comum a todos os percursos:
 *
 *   1. DESTINO: a máquina local passa; um destino remoto só passa quando `PERCURSO_DESTINO_AUTORIZADO` traz
 *      exatamente a mesma origem (esquema, host e porta). Nenhum host remoto é padrão implícito, e a senha não é
 *      digitada num destino que não passou.
 *   2. NATUREZA: o servidor responde, em `/natureza-da-base`, o que o BANCO declara. Só DEMONSTRACAO e ENSAIO passam.
 *      A marca na tela deixou de ser a garantia: uma base oficial com "(base fictícia)" no nome continua recusada.
 */

const LOCAIS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export interface DecisaoDoDestino {
  readonly autorizado: boolean;
  readonly motivo: string;
}

/** Puro: o destino `base` pode receber o percurso, dado o valor de `PERCURSO_DESTINO_AUTORIZADO`? */
export function destinoDoPercurso(base: string, autorizado: string | undefined): DecisaoDoDestino {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return { autorizado: false, motivo: `BASE "${base}" não é um endereço válido.` };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { autorizado: false, motivo: `BASE "${base}" não é http nem https.` };
  if (LOCAIS.has(url.hostname)) return { autorizado: true, motivo: "máquina local" };
  const declarado = (autorizado ?? "").trim();
  if (declarado === "") {
    return { autorizado: false, motivo: `Destino remoto ${url.origin} sem PERCURSO_DESTINO_AUTORIZADO. Declare a origem exata para autorizar.` };
  }
  let origemDeclarada: string;
  try {
    origemDeclarada = new URL(declarado).origin;
  } catch {
    return { autorizado: false, motivo: `PERCURSO_DESTINO_AUTORIZADO "${declarado}" não é um endereço válido.` };
  }
  if (origemDeclarada !== url.origin) {
    return { autorizado: false, motivo: `PERCURSO_DESTINO_AUTORIZADO (${origemDeclarada}) não é o destino ${url.origin}.` };
  }
  return { autorizado: true, motivo: `destino remoto declarado (${url.origin})` };
}

/** Puro: a resposta de `/natureza-da-base` admite o percurso? */
export function naturezaAdmitePercurso(status: number, corpo: unknown): DecisaoDoDestino {
  const natureza = typeof corpo === "object" && corpo !== null && "natureza" in corpo ? String((corpo as { natureza: unknown }).natureza) : "";
  if (status !== 200) return { autorizado: false, motivo: `O servidor não respondeu a natureza da base (HTTP ${String(status)}, "${natureza}").` };
  if (natureza === "DEMONSTRACAO" || natureza === "ENSAIO") return { autorizado: true, motivo: `base declarada ${natureza}` };
  return { autorizado: false, motivo: `A base está declarada "${natureza === "" ? "sem resposta" : natureza}". Percurso só roda em base declarada DEMONSTRACAO ou ENSAIO.` };
}

/** Confere as duas regras contra o servidor. Lança com o motivo; não devolve nada quando passa. */
export async function exigirDestinoDoPercurso(base: string, autorizado: string | undefined = process.env["PERCURSO_DESTINO_AUTORIZADO"]): Promise<string> {
  const d = destinoDoPercurso(base, autorizado);
  if (!d.autorizado) throw new Error(`Recusado: ${d.motivo}`);
  let status = 0;
  let corpo: unknown = null;
  try {
    const r = await fetch(new URL("/natureza-da-base", base), { headers: { accept: "application/json" } });
    status = r.status;
    corpo = await r.json().catch(() => null);
  } catch (e) {
    throw new Error(`Recusado: não foi possível perguntar a natureza da base a ${base} (${e instanceof Error ? e.message : String(e)}).`);
  }
  const n = naturezaAdmitePercurso(status, corpo);
  if (!n.autorizado) throw new Error(`Recusado: ${n.motivo}`);
  return `${d.motivo}; ${n.motivo}`;
}
