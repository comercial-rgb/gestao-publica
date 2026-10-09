import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import {
  proporVersaoDeRoteiro,
  publicarVersaoDeRoteiro,
  versaoVigente,
  type FamiliaDeRoteiro,
} from "../../modules/m10-patrimonial/roteiros.js";

/**
 * OS ROTEIROS DE **DEMONSTRAÇÃO** DO ACERVO (orquestração V3, 4.4).
 *
 * ═══ O QUE ISTO É, E O QUE NÃO É ═══
 * É a configuração IDENTIFICADA do ambiente de demonstração e dos percursos de navegador:
 * um par de contas do PCASP por evento do bem, coerente com o NOME de cada conta no plano
 * (a fonte oficial) e VALIDADO pelo motor contábil na proposta. Cada versão nasce com o
 * motivo dizendo isso — e é o motivo que a tela mostra.
 *
 * NÃO É homologação contábil. Qual par cada evento debita e credita é decisão do contador
 * do ente (ver `ROTEIRO-PATRIMONIAL-NAO-PARAMETRIZADO` no ESTADO-EXECUCAO): uma instalação
 * de produção NÃO roda este seed. O que ele substitui é a parametrização INSTRUMENTAL que um
 * percurso deixou no banco ("as duas primeiras analíticas do seletor") — e a substitui pela
 * via normal: uma versão nova, proposta e publicada, com a anterior preservada.
 *
 * ⚠️ PASSA PELOS SERVIÇOS, com autor e permissão: `SEED_IDENTIDADE` precisa ter
 * PARAMETRIZAR_ROTEIRO_PATRIMONIAL e PUBLICAR_ROTEIRO_PATRIMONIAL (o admin do bootstrap tem;
 * numa instalação anterior, `npm run permissoes:atualizar -- 2`). Nada aqui escreve na
 * tabela por fora.
 *
 * ⚠️ IDEMPOTENTE POR RECUSA NOMEADA: se o par já é o vigente, o serviço recusa ("não há o
 * que versionar") e o seed relata — nada é gravado de novo.
 */

const ROTULO = "CONFIGURAÇÃO DE DEMONSTRAÇÃO — não é homologação contábil";

interface Par {
  /** V37 — o almoxarifado entrou na família, mas não passa pela proposta (é parametrizado direto, por versão). */
  readonly familia: Exclude<FamiliaDeRoteiro, "ALMOXARIFADO">;
  readonly chave: string;
  readonly debito: string;
  readonly credito: string;
  readonly porque: string;
}

const PARES: readonly Par[] = [
  {
    familia: "PATRIMONIAL",
    chave: "AQUISICAO",
    debito: "1.2.3.1.1.99.99", // OUTROS BENS MÓVEIS
    // ⚠️ DESCIDA PARA A ANALÍTICA (V11 V6.2). Era `2.1.3.1.1.00.00`, o nó de CONSOLIDAÇÃO,
    // que é SINTÉTICO no PCASP oficial — em instalação limpa este roteiro de demonstração
    // não gravava, e o preparador tolerava a quebra. O ramo se desdobra em fornecedores
    // (`.01`), contas a pagar (`.03`) e precatórios (`.05` a `.08`); a aquisição de bem
    // móvel de uma demonstração é fornecedor comum, não parcelado.
    // ⚠️ E isto é DEMONSTRAÇÃO, não norma: em produção o M05 recebe `obrigacaoAPagar` por
    // parâmetro, do roteiro que o ente configurou.
    credito: "2.1.3.1.1.01.01", // FORNECEDORES NÃO PARCELADOS A PAGAR
    porque: "a aquisição incorpora o bem ao imobilizado contra a obrigação com o fornecedor.",
  },
  {
    familia: "PATRIMONIAL",
    chave: "AVALIACAO_INICIAL",
    debito: "1.2.3.1.1.99.99", // OUTROS BENS MÓVEIS
    credito: "4.6.3.9.1.00.00", // OUTROS GANHOS COM INCORPORAÇÃO DE ATIVOS
    porque: "a avaliação inicial incorpora um bem que já existia sem custo contra a VPA de incorporação.",
  },
  {
    familia: "PATRIMONIAL",
    chave: "DEPRECIACAO",
    debito: "3.3.3.1.1.01.01", // DEPRECIAÇÃO DE BENS MÓVEIS
    credito: "1.2.3.8.1.01.99", // (-) DEPRECIAÇÃO ACUMULADA DE DEMAIS BENS MÓVEIS
    porque: "a depreciação reconhece a VPD do período contra a retificadora do ativo.",
  },
  {
    familia: "PATRIMONIAL",
    chave: "BAIXA_ALIENACAO",
    debito: "3.6.5.1.1.07.00", // DESINCORPORAÇÃO DE IMOBILIZADO
    credito: "1.2.3.1.1.99.99", // OUTROS BENS MÓVEIS
    porque: "a baixa retira o valor bruto do imobilizado contra a VPD de desincorporação.",
  },
  {
    familia: "PATRIMONIAL",
    chave: "BAIXA_DE_ATUALIZACAO_ACUMULADA",
    debito: "1.2.3.8.1.01.99", // (-) DEPRECIAÇÃO ACUMULADA DE DEMAIS BENS MÓVEIS
    credito: "3.6.5.1.1.07.00", // DESINCORPORAÇÃO DE IMOBILIZADO
    porque: "a baixa da depreciação acumulada zera a retificadora e reduz a desincorporação ao valor contábil líquido.",
  },
];

const url = process.env["DATABASE_URL"];
if (url === undefined || url === "") throw new Error("DATABASE_URL não configurada.");
const quem = (process.env["SEED_IDENTIDADE"] ?? "").trim();
if (quem === "") {
  throw new Error(
    "SEED_IDENTIDADE não definida. Parametrizar roteiro é um ATO — proposta e publicação " +
      "ficam com o nome de quem as fez. Nada foi gravado."
  );
}

const prisma = criarPrismaClient(url);
try {
  for (const p of PARES) {
    const [debito, credito] = await Promise.all([
      prisma.contaPcasp.findUnique({ where: { codigo: p.debito }, select: { id: true } }),
      prisma.contaPcasp.findUnique({ where: { codigo: p.credito }, select: { id: true } }),
    ]);
    if (debito === null || credito === null) {
      throw new Error(`${p.chave}: conta ${debito === null ? p.debito : p.credito} não existe no plano deste banco. Rode seed:pcasp antes. Nada foi gravado para este evento.`);
    }
    const motivo = `${ROTULO}. ${p.porque} Contas escolhidas pelo NOME no PCASP para os percursos de demonstração; a parametrização de produção é do contador do ente.`;
    try {
      const { versaoId, numero } = await proporVersaoDeRoteiro(prisma, {
        familia: p.familia, chave: p.chave, contaDebitoId: debito.id, contaCreditoId: credito.id, motivo, criadoPor: quem,
      });
      const r = await publicarVersaoDeRoteiro(prisma, { versaoId, criadoPor: quem });
      console.log(`  + ${p.chave}: versão ${numero} publicada (${p.debito} / ${p.credito})${r.substituiuNumero !== null ? ` — substitui a versão ${r.substituiuNumero}` : ""}`);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (m.includes("Não há o que versionar")) {
        const v = await versaoVigente(prisma, p.familia, p.chave);
        console.log(`  = ${p.chave}: já vigente (versão ${v?.numero ?? "?"}) — nada gravado`);
        continue;
      }
      throw e;
    }
  }
  console.log(`\n[roteiros-demo] ${ROTULO}. Autor: ${quem}.`);
} finally {
  await prisma.$disconnect();
}
