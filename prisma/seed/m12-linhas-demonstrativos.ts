import "dotenv/config";
import { criarPrismaClient } from "../../modules/m01-core-contabil/adapter-prisma.js";
import type { PrismaClient } from "../generated/client/client.js";
import type { GrupoBalanco } from "../generated/client/enums.js";

/**
 * ═══ SEED DO MAPEAMENTO LINHA -> CONTA DOS ANEXOS 14 E 15 ═══
 *
 * Sem estas linhas, o Balanço Patrimonial e a DVP não têm de-para e saem — corretamente — como
 * "mapeamento não configurado". Os dois motores leem `LinhaDemonstrativo` + `PrefixoDaLinha`: o
 * relatório não sabe, e não deve saber, que "Caixa e Equivalentes" é a 1.1.1. É INSERT, não código.
 *
 * ═══ ⚠️ DE ONDE VEM A ESTRUTURA, E POR QUE ELA NÃO É DIGITADA AQUI ═══
 *
 * As linhas NÃO estão escritas neste arquivo. Elas são DERIVADAS do plano de contas oficial já
 * carregado no banco — o `Pcasp_2025.xlsx` publicado pelo TCE-PB, conferido por `sha256` contra o
 * `MANIFEST.json` pelo `seed:pcasp-oficial`. O que este seed faz é ler as contas de NÍVEL 2 das
 * classes 1 a 4 e virar cada uma numa linha do anexo correspondente:
 *
 *   · o RÓTULO da linha é o NOME OFICIAL da conta, verbatim (não reescrito, não abreviado);
 *   · o PREFIXO da linha é o CÓDIGO OFICIAL da conta, nos seus dois primeiros segmentos;
 *   · o GRUPO vem da estrutura de classes do MCASP, que é o que o `GrupoBalanco` já modela.
 *
 * Nada de conta, nome ou fórmula inventado. Se amanhã o TCE publicar um plano com uma conta de
 * nível 2 nova, ela entra sozinha — e se ela for de classe 1 ou 2, onde o grupo é mais fino que a
 * classe, o seed PARA nomeando (ver `GRUPO_DO_ANEXO_14`), em vez de agrupá-la por palpite.
 *
 * ═══ ⚠️ CLASSES 3 E 4 NÃO PRECISAM DE CORRESPONDÊNCIA NOMEADA, E ISSO NÃO É PREGUIÇA ═══
 * Na DVP o grupo É a classe: toda conta de classe 3 é variação DIMINUTIVA e toda de classe 4 é
 * AUMENTATIVA. Então a cobertura ali é completa por construção — não há o que enumerar e não há
 * como esquecer uma. No Anexo 14 o grupo é mais fino que a classe (a classe 2 se reparte em
 * passivo circulante, não circulante e patrimônio líquido), e é só por isso que ali existe uma
 * correspondência explícita — conferida contra o NOME oficial, não assumida pelo código.
 *
 * ═══ ⚠️ O QUE ESTE SEED NÃO FAZ ═══
 * Não grava lançamento nenhum. Mapeamento é CONFIGURAÇÃO do ente (o de-para conta -> linha), e é
 * por isso que ele entra com `criadoPor: "SEED"` como os outros seeds de configuração, e não com
 * `SEED_IDENTIDADE` — que os seeds de FATO exigem, porque fato do razão precisa de autor.
 *
 * Idempotente: reexecutar não duplica (a linha é reaproveitada por `(anexo, codigoLinha)` e os
 * prefixos dela são substituídos).
 *
 * Uso:  npx tsx prisma/seed/m12-linhas-demonstrativos.ts
 */

const POR = "SEED";

/**
 * A repartição das classes 1 e 2 nos cinco grupos do Anexo 14, com o TERMO que o nome oficial da
 * conta tem de conter. O termo é a rede: ele transforma "o plano mudou de estrutura" em recusa
 * nomeada, em vez de um balanço que agrupa o passivo como patrimônio líquido e ainda fecha.
 */
const GRUPO_DO_ANEXO_14: Record<string, { readonly grupo: GrupoBalanco; readonly termo: string }> = {
  "1.1": { grupo: "ATIVO_CIRCULANTE", termo: "ATIVO CIRCULANTE" },
  "1.2": { grupo: "ATIVO_NAO_CIRCULANTE", termo: "ATIVO NAO CIRCULANTE" },
  "2.1": { grupo: "PASSIVO_CIRCULANTE", termo: "PASSIVO CIRCULANTE" },
  "2.2": { grupo: "PASSIVO_NAO_CIRCULANTE", termo: "PASSIVO NAO CIRCULANTE" },
  "2.3": { grupo: "PATRIMONIO_LIQUIDO", termo: "PATRIMONIO LIQUIDO" },
};

/**
 * Comparação de nome INSENSÍVEL a acento e a hífen. Medido no arquivo oficial: a 2.2 se chama
 * "PASSIVO NAO-CIRCULANTE" (sem cedilha e COM hífen) enquanto a 1.2 é "ATIVO NÃO CIRCULANTE"
 * (com til e sem hífen). Uma comparação literal reprovaria o plano oficial por causa da
 * pontuação dele.
 */
function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .trim();
}

interface LinhaAMontar {
  readonly anexo: "ANEXO_14" | "ANEXO_15";
  readonly codigoLinha: string;
  readonly rotulo: string;
  readonly grupo: GrupoBalanco;
  readonly ordem: number;
  readonly prefixo: string;
}

async function montar(prisma: PrismaClient): Promise<readonly LinhaAMontar[]> {
  // Nível 2 das classes 1 a 4. O `nivel` vem do próprio seed oficial, derivado do código.
  const contas = await prisma.contaPcasp.findMany({
    where: { nivel: 2, OR: [1, 2, 3, 4].map((c) => ({ codigo: { startsWith: `${c}.` } })) },
    select: { codigo: true, nome: true },
    orderBy: { codigo: "asc" },
  });

  // FAIL-CLOSED: sem o plano oficial carregado não há o que derivar, e inventar as linhas seria
  // exatamente o que este arquivo existe para não fazer.
  if (contas.length === 0) {
    throw new Error(
      "Nenhuma conta de nível 2 nas classes 1 a 4. O plano de contas OFICIAL não está carregado " +
        "neste banco — rode `npm run seed:pcasp-oficial` antes. Nada foi feito."
    );
  }

  const linhas: LinhaAMontar[] = [];
  for (const c of contas) {
    // "1.1.0.0.0.00.00" -> "1.1"
    const curto = c.codigo.split(".").slice(0, 2).join(".");
    const classe = curto[0] ?? "";
    // A ordem do anexo é a ordem do próprio código: 11, 12, 21, 22, 23 / 31..39 / 41..49.
    const ordem = Number(curto.replace(".", ""));
    if (!Number.isInteger(ordem)) {
      throw new Error(`Código de nível 2 inesperado: "${c.codigo}". Nada foi feito.`);
    }
    // O prefixo leva o PONTO final: "1.1." nunca casa com uma hipotética "1.10.x".
    const prefixo = `${curto}.`;

    if (classe === "1" || classe === "2") {
      const esperado = GRUPO_DO_ANEXO_14[curto];
      if (esperado === undefined) {
        throw new Error(
          `CONTA DE NÍVEL 2 SEM GRUPO NO ANEXO 14: ${c.codigo} "${c.nome}". No Anexo 14 o grupo é ` +
            `mais fino que a classe, então uma conta nova de classe 1 ou 2 não pode ser agrupada ` +
            `por palpite — o saldo dela iria para o lado errado do balanço, que ainda fecharia. ` +
            `Declare o grupo dela em GRUPO_DO_ANEXO_14. Nada foi feito.`
        );
      }
      if (!normalizar(c.nome).includes(normalizar(esperado.termo))) {
        throw new Error(
          `O PLANO OFICIAL MUDOU DE ESTRUTURA: esperava que ${curto} fosse ` +
            `"${esperado.termo}" e o plano diz "${c.nome}". Agrupar assim poria o saldo dessa ` +
            `conta no grupo errado do balanço. Confira o plano antes de seguir. Nada foi feito.`
        );
      }
      linhas.push({ anexo: "ANEXO_14", codigoLinha: curto, rotulo: c.nome, grupo: esperado.grupo, ordem, prefixo });
      continue;
    }

    // Classes 3 e 4: o grupo É a classe. Cobertura completa por construção.
    linhas.push({
      anexo: "ANEXO_15",
      codigoLinha: curto,
      rotulo: c.nome,
      grupo: classe === "3" ? "VPD" : "VPA",
      ordem,
      prefixo,
    });
  }

  // ═══ A CONFERÊNCIA DE SOBREPOSIÇÃO, aqui e não só no cadastro ═══
  // O cadastro (`cadastrarLinhaDemonstrativo`) barra prefixo sobreposto, e este seed escreve
  // direto. Então a propriedade se afirma aqui também: duas linhas do MESMO anexo cujos prefixos
  // se cobrem contariam o mesmo dinheiro duas vezes, e o motor do Anexo 14 acusa isso (A3) só
  // depois, na emissão.
  for (const anexo of ["ANEXO_14", "ANEXO_15"] as const) {
    const doAnexo = linhas.filter((l) => l.anexo === anexo);
    for (let i = 0; i < doAnexo.length; i += 1) {
      for (let j = i + 1; j < doAnexo.length; j += 1) {
        const a = doAnexo[i]!.prefixo;
        const b = doAnexo[j]!.prefixo;
        if (a.startsWith(b) || b.startsWith(a)) {
          throw new Error(
            `PREFIXOS SOBREPOSTOS em ${anexo}: "${a}" e "${b}" — a mesma conta entraria em duas ` +
              `linhas e o dinheiro seria contado duas vezes. Nada foi feito.`
          );
        }
      }
    }
  }

  return linhas;
}

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url === "") throw new Error("DATABASE_URL não definida. Nada foi feito.");
  const prisma = criarPrismaClient(url);

  try {
    const linhas = await montar(prisma);

    for (const l of linhas) {
      const existente = await prisma.linhaDemonstrativo.findUnique({
        where: { anexo_codigoLinha: { anexo: l.anexo, codigoLinha: l.codigoLinha } },
        select: { id: true },
      });

      const id =
        existente?.id ??
        (
          await prisma.linhaDemonstrativo.create({
            data: {
              anexo: l.anexo,
              codigoLinha: l.codigoLinha,
              rotulo: l.rotulo,
              grupo: l.grupo,
              ordem: l.ordem,
              criadoPor: POR,
            },
            select: { id: true },
          })
        ).id;

      if (existente !== null) {
        // Reexecução: o rótulo e o grupo acompanham o plano oficial, que é a fonte.
        await prisma.linhaDemonstrativo.update({
          where: { id },
          data: { rotulo: l.rotulo, grupo: l.grupo, ordem: l.ordem, ativa: true },
        });
        await prisma.prefixoDaLinha.deleteMany({ where: { linhaId: id } });
      }

      await prisma.prefixoDaLinha.create({
        data: { linhaId: id, prefixoConta: l.prefixo, criadoPor: POR },
      });
    }

    const a14 = linhas.filter((l) => l.anexo === "ANEXO_14").length;
    const a15 = linhas.filter((l) => l.anexo === "ANEXO_15").length;
    console.log(
      `[m12] mapeamento derivado do plano OFICIAL: ${a14} linhas no Anexo 14 (balanço ` +
        `patrimonial) e ${a15} no Anexo 15 (variações patrimoniais).`
    );
    for (const l of linhas) {
      console.log(`  ${l.anexo}  ${l.codigoLinha.padEnd(4)} ${l.grupo.padEnd(22)} ${l.prefixo.padEnd(6)} ${l.rotulo}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

await main();
