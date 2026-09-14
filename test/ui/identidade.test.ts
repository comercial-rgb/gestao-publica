import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * ═══ A IDENTIDADE NÃO É ESCRITA NO CÓDIGO (V6 P0.1) ═══
 * A entrada, o shell, os PDFs e os portais mostravam "SIAFIC", "Campina Grande/PB" e
 * "Prefeitura Municipal de Campina Grande — SEFIN" como literais. A instituição agora vem do
 * cadastro (`VersaoDaApresentacaoDoEnte` + `EnteConfig`) pela porta de identidade; o produto
 * é `lib/identidade/produto.ts`; o ambiente é do build.
 *
 * ⚠️ NÃO É UM REPLACE GLOBAL — e o teste diz onde a regra vale: a SUPERFÍCIE (app/,
 * components/, lib/pdf/, lib/navegacao). Fixtures, seeds, documentos históricos, nomes de
 * banco, cookies e migrations continuam identificando a entidade que identificam. `SIAFIC`
 * continua legítimo como nome do domínio contábil (a Central de Integrações o usa assim).
 */

const RAIZ = fileURLToPath(new URL("../..", import.meta.url));
const SUPERFICIE = ["app", "components", "lib/pdf", "lib/navegacao.ts", "lib/identidade"];
/** Os literais que identificam UMA entidade — nunca podem estar na superfície. */
const LITERAIS_DE_ENTIDADE = ["Campina Grande", "cg.pb.gov.br", "SEFIN"];

function arquivos(dir: string, achados: string[]): void {
  const st = statSync(dir);
  if (st.isFile()) {
    achados.push(dir);
    return;
  }
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      arquivos(p, achados);
      continue;
    }
    if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) achados.push(p);
  }
}

/** Sem comentários: o que importa é o que renderiza, não a prosa que explica. */
const semComentarios = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("identidade — nenhum literal de entidade na superfície", () => {
  it("t1: 'Campina Grande', 'cg.pb.gov.br' e 'SEFIN' não aparecem no código renderizado da superfície", () => {
    const lista: string[] = [];
    for (const s of SUPERFICIE) arquivos(join(RAIZ, s), lista);
    const violacoes: string[] = [];
    for (const abs of lista) {
      const codigo = semComentarios(readFileSync(abs, "utf8"));
      for (const literal of LITERAIS_DE_ENTIDADE) {
        if (codigo.includes(literal)) violacoes.push(`${abs.slice(RAIZ.length)}: "${literal}"`);
      }
    }
    expect(violacoes, violacoes.join("\n")).toEqual([]);
  });

  it("t2: o produto se chama Gestão Pública, e o ente NÃO tem valor padrão no código (identidade neutra sem cadastro)", async () => {
    const { PRODUTO, identidadeNeutra } = await import("../../lib/identidade/produto.js");
    expect(PRODUTO.nome).toBe("Gestão Pública");
    const neutra = identidadeNeutra();
    expect(neutra.enteNome).toBeNull();
    expect(neutra.imagemHref).toBeNull();
  });

  it("t3: o rodapé comum não recebe o SHA completo — a versão legível tem sete caracteres, e fora de build é nula", async () => {
    const { versaoLegivel } = await import("../../lib/identidade/produto.js");
    expect(versaoLegivel("2e0817b0bbab0b491b37534d707fd1992e58979b")).toBe("2e0817b");
    expect(versaoLegivel("dev")).toBeNull();
    expect(versaoLegivel(undefined)).toBeNull();
    expect(versaoLegivel("")).toBeNull();
  });

  it("t4: um canal só existe com rota — os que ainda não existem têm href nulo, e nenhum menu vazio os promete", async () => {
    const { CANAIS } = await import("../../lib/identidade/produto.js");
    const semRota = CANAIS.filter((c) => c.href === null).map((c) => c.id);
    // ⚠️ ENCOLHE, NUNCA CRESCE SEM CÓDIGO: o portal do servidor saiu daqui em V6 P2.4, quando a
    // rota passou a existir (`/portal-do-servidor`). Um canal que voltasse a ter `href` sem tela
    // seria promessa na entrada — e é isto que este teste impede. A carta de serviços e o canal do
    // fornecedor saíram em V6.2 P3, com `/servicos` e o acompanhamento em `/meus-servicos`.
    expect(semRota).toEqual([]);
    for (const c of CANAIS) if (c.href !== null) expect(c.href.startsWith("/")).toBe(true);
  });
});
