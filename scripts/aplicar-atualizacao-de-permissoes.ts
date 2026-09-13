import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import {
  aplicarAtualizacaoDePermissoes,
  situacaoDasAtualizacoes,
} from "../modules/m16-travamento/atualizacoes-de-permissoes.js";
import { AREA_DA_ACAO } from "../lib/portas/navegacao-permissoes.js";

/**
 * APLICAR UMA ATUALIZAÇÃO VERSIONADA DE PERMISSÕES — pelo shell (orquestração V3, 4.2).
 *
 * É o MESMO caso de uso da tela Administração > Perfis > Atualizações: exige que quem
 * aplica (SEED_IDENTIDADE) exista, esteja ativo e tenha CONCEDER_ACAO_A_PERFIL; grava o
 * autor em cada permissão; recusa reaplicar. A diferença é só o operador: aqui é quem
 * tem terminal na atualização de versão; lá é o administrador municipal.
 *
 * Uso:
 *   npm run permissoes:atualizar -- 1        aplica a versão 1
 *   npm run permissoes:atualizar             só mostra a situação (nada grava)
 */
const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não configurada.");

const versaoBruta = process.argv[2];
const prisma = criarPrismaClient(url);
try {
  const situacao = await situacaoDasAtualizacoes(prisma, AREA_DA_ACAO);
  console.log("Atualizações de permissões conhecidas:");
  for (const s of situacao) {
    console.log(
      `  v${s.versao} ${s.nome} — ` +
        (s.aplicadaEm === null
          ? `PENDENTE (prévia: ${s.previa} concessão(ões))`
          : `aplicada por ${s.aplicadaPor} em ${s.aplicadaEm.toISOString()} (${s.concessoes} concessão(ões))`)
    );
  }
  if (versaoBruta !== undefined) {
    const versao = Number.parseInt(versaoBruta, 10);
    if (!Number.isInteger(versao)) throw new Error(`Versão ilegível: "${versaoBruta}".`);
    const quem = (process.env["SEED_IDENTIDADE"] ?? "").trim();
    if (quem === "") {
      throw new Error(
        "SEED_IDENTIDADE não definida. Aplicar uma atualização é um ATO administrativo e " +
          "precisa de autor — a permissão fica gravada com o nome de quem a concedeu. Nada foi gravado."
      );
    }
    const r = await aplicarAtualizacaoDePermissoes(prisma, { versao, criadoPor: quem, areaDaAcao: AREA_DA_ACAO });
    console.log(`\nv${versao} APLICADA por ${quem}: ${r.concessoes} concessão(ões) em ${r.perfisAlcancados} perfil(is).`);
  }
} finally {
  await prisma.$disconnect();
}
