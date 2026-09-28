import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import puppeteer from "puppeteer";

/**
 * AS TELAS DO ROTEIRO DA APRESENTAÇÃO DA CONTABILIDADE (V22) — uma por requisito do termo de
 * referência, abertas no navegador com o administrador. Somente leitura: abre, mede e fotografa.
 *
 * Uso: `npx tsx scripts/demonstracao/conferir-telas-da-apresentacao.ts [base] [pasta]`.
 *
 * Uma tela conta como "abre" se: não redireciona para a entrada, não mostra a página de erro do
 * Next nem um estado de recusa/falha ("Não foi possível", "não está no seu acesso"), tem título
 * (h1) e tem conteúdo (tabela, formulário ou texto além do cabeçalho). Isso prova que a tela existe
 * e responde com dado deste banco — não prova que cada botão dela faz o que promete.
 */

const BASE = process.argv[2] ?? "http://localhost:3011";
const PASTA = process.argv[3] ?? "telas-da-apresentacao";
const SENHA = process.env["SEED_ADMIN_SENHA"] ?? "";
if (SENHA === "") throw new Error("SEED_ADMIN_SENHA ausente.");

const ROTEIRO: readonly (readonly [string, string])[] = [
  ["Registro contábil — lançamentos", "/contabilidade/lancamentos"],
  ["Centros de custo", "/contabilidade/custos"],
  ["Diário", "/relatorios/livros/diario"],
  ["Razão", "/relatorios/livros/razao"],
  ["Balancete", "/relatorios/livros/balancete"],
  ["Balanço orçamentário", "/relatorios/demonstracoes/balanco-orcamentario"],
  ["Balanço financeiro", "/relatorios/demonstracoes/balanco-financeiro"],
  ["Balanço patrimonial", "/relatorios/demonstracoes/balanco-patrimonial"],
  ["Variações patrimoniais", "/relatorios/demonstracoes/variacoes-patrimoniais"],
  ["RREO anexo 1", "/relatorios/rreo/anexo1"],
  ["RREO anexo 8 (MDE)", "/relatorios/rreo/anexo8"],
  ["RREO anexo 12 (saúde)", "/relatorios/rreo/anexo12"],
  ["RGF anexo 1 (pessoal)", "/relatorios/rgf/anexo1"],
  ["PPA", "/planejamento/ppa"],
  ["LDO", "/planejamento/ldo"],
  ["Fichas da LOA", "/planejamento/fichas"],
  ["QDD", "/planejamento/qdd"],
  ["Alterações de PPA/LDO", "/planejamento/alteracoes"],
  ["CMD e MBA", "/planejamento/cmd-mba"],
  ["Créditos adicionais", "/planejamento/creditos-adicionais"],
  ["Processos (reserva de dotação)", "/licitacoes/processos"],
  ["Solicitações de compra", "/licitacoes/solicitacoes"],
  ["Contratos", "/licitacoes/contratos"],
  ["Empenhos", "/despesa/empenhos"],
  ["Liquidações", "/despesa/liquidacoes"],
  ["Pagamentos", "/despesa/pagamentos"],
  ["Assinaturas", "/despesa/assinaturas"],
  ["Restos a pagar", "/despesa/restos-a-pagar"],
  ["Arrecadação", "/receita/arrecadacoes"],
  ["Extraorçamentário", "/financeiro/extraorcamentario"],
  ["Retenções a recolher", "/financeiro/extraorcamentario/recolher"],
  ["Convênios", "/transferencias/convenios"],
  ["Natureza das fontes", "/contabilidade/natureza-das-fontes"],
  ["Eliminações intragovernamentais", "/relatorios/eliminacoes-intra"],
];

const RECUSA = /Não foi possível|não está no seu acesso|Application error|Unhandled Runtime Error|This page could not be found|404/;

async function main(): Promise<void> {
  mkdirSync(PASTA, { recursive: true });
  const navegador = await puppeteer.launch({ headless: true, args: ["--lang=pt-BR"] });
  const linhas: string[] = [];
  let abre = 0;
  try {
    const p = await navegador.newPage();
    await p.setViewport({ width: 1440, height: 900 });
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 120000 });
    await p.type('input[name="identificador"]', "admin@cg.pb.gov.br");
    await p.type('input[name="senha"]', SENHA);
    await p.click('button[type="submit"]');
    await p.waitForFunction(() => !location.pathname.startsWith("/login"), { timeout: 120000 });

    for (const [nome, rota] of ROTEIRO) {
      const r = await p.goto(`${BASE}${rota}`, { waitUntil: "networkidle0", timeout: 180000 }).catch(() => null);
      const status = r?.status() ?? 0;
      const m = await p.evaluate(() => {
        const main = document.querySelector("main");
        return {
          url: location.pathname,
          h1: document.querySelector("main h1")?.textContent?.trim() ?? "",
          texto: main?.textContent ?? "",
          tabelas: main?.querySelectorAll("table").length ?? 0,
          formularios: main?.querySelectorAll("form").length ?? 0,
          botoes: main?.querySelectorAll("button, a[href]").length ?? 0,
        };
      });
      const recusa = RECUSA.exec(m.texto)?.[0] ?? null;
      const ok = status === 200 && !m.url.startsWith("/login") && recusa === null && m.h1 !== "" && (m.tabelas + m.formularios > 0 || m.texto.length > 400);
      if (ok) abre++;
      const arquivo = `${String(ROTEIRO.findIndex(([n]) => n === nome) + 1).padStart(2, "0")}-${rota.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}.png`;
      await p.screenshot({ path: `${PASTA}/${arquivo}`, fullPage: false });
      const linha = `${ok ? "abre " : "FALHA"} | ${nome} | ${rota} | HTTP ${status} | título "${m.h1}" | ${m.tabelas} tabela(s), ${m.formularios} formulário(s), ${m.botoes} ação(ões)${recusa !== null ? ` | recusa: "${recusa}"` : ""}`;
      console.log(linha);
      linhas.push(linha);
    }
  } finally {
    await navegador.close();
  }
  console.log(`\n${abre}/${ROTEIRO.length} telas abrem com conteúdo`);
  writeFileSync(`${PASTA}/resultado.txt`, `${linhas.join("\n")}\n\n${abre}/${ROTEIRO.length}\n`);
  if (abre < ROTEIRO.length) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
