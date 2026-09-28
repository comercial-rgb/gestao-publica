import "dotenv/config";
import { criarPrismaClient } from "../modules/m01-core-contabil/adapter-prisma.js";
import { cadastrarEntidadeContabil } from "../modules/m01-core-contabil/entidade-contabil.js";
import { criarM02Deps } from "../modules/m02-planejamento/adapter-prisma.js";
import { criarFicha, criarReceitaPrevista } from "../modules/m02-planejamento/servico.js";

/**
 * ═══ O VOCABULÁRIO DA OPERAÇÃO ENTRE UNIDADES DO MESMO ENTE (V17/C07) ═══
 *
 * O banco de percursos tem o plano de contas OFICIAL inteiro (7.864 contas, 2.524 âncoras de nível
 * de consolidação), e NENHUM fato intragovernamental: zero natureza de receita de categoria 7/8,
 * zero natureza de despesa de modalidade 91, zero entidade contábil cadastrada. Então o
 * demonstrativo de eliminações responde, corretamente, "nada a eliminar" — e um percurso sobre
 * isso provaria só que a tela abre.
 *
 * Cada peça daqui existe por um motivo:
 *
 *   · DUAS naturezas de receita de CATEGORIA 7 (receita corrente INTRA-orçamentária). ⚠️ DUAS, e
 *     não uma: com uma só, o total do par de eliminação passaria por vacuidade — qualquer leitura
 *     que ignorasse a segunda guia acertaria o número.
 *   · UMA natureza de despesa de MODALIDADE 91 (aplicação direta decorrente de operação entre
 *     órgãos, fundos e entidades do mesmo ente) com ELEMENTO 39, que é um dos elementos com
 *     roteiro de liquidação neste sistema. Sem isso a liquidação recusa, nomeando o elemento — e
 *     a recusa seria do roteiro, não do que se quer medir.
 *   · UMA FICHA nessa natureza, com dotação, para o empenho ter crédito.
 *   · A PREVISÃO da LOA nas duas naturezas intra — sem ela o Anexo 1 não tem quadro intra de
 *     receita, e o par não tem lado esquerdo.
 *   · UMA ENTIDADE CONTÁBIL com CNPJ — é contra ele que a contraparte do empenho é reconhecida.
 *     O percurso empenha para DOIS credores: o CNPJ dela e um estranho, para que "contraparte não
 *     identificada" seja um estado medido e não uma frase.
 *
 * ⚠️ O QUE ENTRA POR COMANDO DE DOMÍNIO: a ficha (`criarFicha`), a previsão
 * (`criarReceitaPrevista`) e a entidade (`cadastrarEntidadeContabil`, com ato e autorização).
 *
 * ⚠️ O QUE ENTRA POR `create`, E A AUSÊNCIA FICA NOMEADA: natureza de receita e natureza de
 * despesa não têm serviço de cadastro em módulo nenhum — são tabela de classificação da STN, e o
 * sistema as recebe por seed. A ausência fica dita aqui em vez de virar um INSERT sem explicação.
 *
 * ⚠️ OS CÓDIGOS DE CLASSIFICAÇÃO SÃO DERIVADOS DOS QUE O BANCO JÁ TEM, trocando SÓ o dígito que
 * os torna intra: a natureza de receita do banco com a categoria 1 virando 7, e a natureza de
 * despesa com a modalidade 90 virando 91. Nada de código inventado do zero.
 *
 * Uso:  DATABASE_URL=<clone dos percursos> npx tsx scripts/preparar-eliminacoes-intra-de-percursos.ts
 */

const POR = process.env["SEED_IDENTIDADE"] ?? "admin@cg.pb.gov.br";
const ANO = new Date().getFullYear();

/** O CNPJ da entidade da fixture — e o credor "estranho" que o percurso usa para o contraste. */
export const CNPJ_DA_ENTIDADE = "11222333000144";
const NUMERO_DA_FICHA = 9101;

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (url.endsWith("/gestao_publica_percursos")) {
    throw new Error(
      "Esta fixture GRAVA cadastro, ficha e previsao. Aponte DATABASE_URL para um clone — o banco base serve outras frentes."
    );
  }
  const prisma = criarPrismaClient(url);
  try {
    // ── o modelo: a natureza de receita e a de despesa que o banco JÁ tem ──
    const modeloReceita = await prisma.naturezaReceita.findFirst({
      orderBy: { codigo: "asc" },
      select: { codigo: true, descricao: true },
    });
    if (modeloReceita === null) {
      throw new Error(
        "Este banco nao tem natureza de receita cadastrada. A fixture compoe sobre o preparador de percursos."
      );
    }
    const modeloFicha = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: ANO },
      orderBy: { numero: "asc" },
      select: {
        orgao: { select: { codigo: true } },
        unidadeOrc: { select: { codigo: true } },
        funcao: { select: { codigo: true } },
        subfuncao: { select: { codigo: true } },
        programa: { select: { codigo: true } },
        acao: { select: { codigo: true } },
        fonte: { select: { codigo: true } },
        naturezaDespesa: {
          select: { codCategoria: true, codNatureza: true, codModalidade: true, codElemento: true },
        },
      },
    });
    if (modeloFicha === null) {
      throw new Error(
        `Este banco nao tem ficha de ${String(ANO)} para servir de modelo de classificacao. ` +
          "A fixture compoe sobre o preparador de percursos."
      );
    }

    // ── 1. as DUAS naturezas de receita INTRA: a mesma, com a categoria 7 ──
    const intra = [
      { codigo: `7${modeloReceita.codigo.slice(1, 7)}1`, descricao: "Contribuicao patronal recebida de unidade do proprio ente" },
      { codigo: `7${modeloReceita.codigo.slice(1, 7)}2`, descricao: "Aporte recebido de unidade do proprio ente" },
    ];
    for (const nr of intra) {
      const ja = await prisma.naturezaReceita.findUnique({ where: { codigo: nr.codigo }, select: { codigo: true } });
      if (ja !== null) {
        console.log(`[fixture] natureza de receita ${nr.codigo} ja existe`);
        continue;
      }
      await prisma.naturezaReceita.create({ data: nr });
      console.log(`[fixture] natureza de receita INTRA ${nr.codigo} cadastrada — ${nr.descricao}`);
    }

    // ── 2. a natureza de DESPESA de modalidade 91, elemento com roteiro ──
    const nd = modeloFicha.naturezaDespesa;
    const codigoNd = `${nd.codCategoria}${nd.codNatureza}91${nd.codElemento}`;
    const jaNd = await prisma.naturezaDespesa.findUnique({ where: { codigoCompleto: codigoNd }, select: { codigoCompleto: true } });
    if (jaNd === null) {
      await prisma.naturezaDespesa.create({
        data: {
          codCategoria: nd.codCategoria,
          codNatureza: nd.codNatureza,
          codModalidade: "91",
          codElemento: nd.codElemento,
          codigoCompleto: codigoNd,
          descricao: "Aplicacao direta decorrente de operacao entre orgaos, fundos e entidades do mesmo ente",
        },
      });
      console.log(`[fixture] natureza de despesa INTRA ${codigoNd} cadastrada (modalidade 91)`);
    } else {
      console.log(`[fixture] natureza de despesa ${codigoNd} ja existe`);
    }

    const deps = criarM02Deps(prisma);

    // ── 3. a ficha na natureza intra, com dotacao ──
    const jaFicha = await prisma.fichaOrcamentaria.findFirst({
      where: { exercicio: ANO, numero: NUMERO_DA_FICHA },
      select: { id: true },
    });
    if (jaFicha === null) {
      await criarFicha(
        {
          exercicio: ANO,
          numero: NUMERO_DA_FICHA,
          classificacao: {
            orgao: modeloFicha.orgao.codigo,
            unidadeOrc: modeloFicha.unidadeOrc.codigo,
            funcao: modeloFicha.funcao.codigo,
            subfuncao: modeloFicha.subfuncao.codigo,
            programa: modeloFicha.programa.codigo,
            acao: modeloFicha.acao.codigo,
            naturezaDespesa: codigoNd,
            fonte: modeloFicha.fonte.codigo,
          },
          exercicioFonte: 1,
          valorDotado: "300000.00",
          criadoPor: POR,
        },
        deps
      );
      console.log(`[fixture] ficha ${String(NUMERO_DA_FICHA)} criada na natureza ${codigoNd}, dotada em 300.000,00`);
    } else {
      console.log(`[fixture] ficha ${String(NUMERO_DA_FICHA)} ja existe`);
    }

    // ── 4. a previsao da LOA nas duas naturezas intra ──
    for (const nr of intra) {
      const ja = await prisma.receitaPrevista.findFirst({
        where: { exercicio: ANO, naturezaReceita: { codigo: nr.codigo }, fonte: { codigo: modeloFicha.fonte.codigo } },
        select: { id: true },
      });
      if (ja !== null) {
        console.log(`[fixture] previsao ${nr.codigo} ja existe`);
        continue;
      }
      await criarReceitaPrevista(
        {
          exercicio: ANO,
          naturezaReceita: nr.codigo,
          fonte: modeloFicha.fonte.codigo,
          exercicioFonte: 1,
          tipoReceita: "INTRA_ORCAMENTARIA",
          valorPrevisto: "150000.00",
          criadoPor: POR,
        },
        deps
      );
      console.log(`[fixture] LOA ${String(ANO)}: ${nr.codigo} previsto em ${modeloFicha.fonte.codigo} = 150.000,00`);
    }

    // ── 5. a entidade contabil com CNPJ — a contraparte reconhecivel ──
    const jaEntidade = await prisma.entidadeContabil.findFirst({
      where: { versoes: { some: { cnpj: CNPJ_DA_ENTIDADE } } },
      select: { codigo: true },
    });
    if (jaEntidade === null) {
      const nome = "Fundo Previdenciario do Municipio";
      await cadastrarEntidadeContabil(
        prisma,
        {
          codigo: "0002",
          nome,
          cnpj: CNPJ_DA_ENTIDADE,
          // 07 = Autarquia (RPPS), do rol oficial do MANAD L400 campo 06.
          tipoManad: "07",
          atoTipo: "LEI",
          atoNumero: "1",
          atoAno: ANO - 1,
          atoDispositivo: "art. 1º",
          atoCitacao:
            `Fica instituido o ${nome}, inscrito no CNPJ ${CNPJ_DA_ENTIDADE}, ` +
            "com personalidade juridica propria e contabilidade distinta.",
          criadoPor: POR,
        },
        new Date()
      );
      console.log(`[fixture] entidade contabil 0002 cadastrada — ${nome} (CNPJ ${CNPJ_DA_ENTIDADE})`);
    } else {
      console.log(`[fixture] entidade com o CNPJ ${CNPJ_DA_ENTIDADE} ja existe (${jaEntidade.codigo})`);
    }

    console.log(
      `[fixture] pronta: naturezas intra ${intra.map((i) => i.codigo).join(" e ")}; ` +
        `ficha ${String(NUMERO_DA_FICHA)} na natureza ${codigoNd}; fonte ${modeloFicha.fonte.codigo}.`
    );
  } finally {
    await prisma.$disconnect();
  }
}

await main();
