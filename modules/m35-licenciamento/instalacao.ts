import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { diaCivil } from "../../packages/datas/index.js";
import type { AcaoDoSistema } from "../m16-travamento/acoes.js";
import { moduloDoCatalogo, MODULO_DA_ACAO, type ModuloComercial } from "./modulos.js";

/**
 * M35 — A INSTALAÇÃO DO LICENCIAMENTO (V10 T1 · N6.1).
 *
 * ═══ ⚠️ O PROBLEMA QUE ESTE ARQUIVO EXISTE PARA NÃO CAUSAR ═══
 * O gate é fail-closed: sem contrato, nenhum módulo licenciável opera. Numa instalação que
 * JÁ EXISTE e já tem gente trabalhando, subir a versão com o gate ligado e sem contrato
 * TRANCARIA TODO MUNDO — o município perderia o sistema por uma mudança nossa.
 *
 * A ordem V10 nomeia as duas saídas erradas e proíbe as duas:
 *   · deixar todos sem acesso após atualizar — é o que aconteceria sem este arquivo;
 *   · adotar "liberação silenciosa quando falta configuração" — o fallback que esvazia o
 *     contrato: bastaria apagar a tabela para ter tudo de graça, para sempre, sem aviso.
 *
 * A saída certa é a TERCEIRA: a atualização INSTALA um contrato explícito, derivado do que a
 * instalação de fato usa, com autor, data e a marca de demonstração quando for o caso. Quem
 * pular este passo encontra o sistema fechado com uma mensagem que diz exatamente qual
 * comando rodar — fechado e ACIONÁVEL, que não é a mesma coisa que fechado em silêncio.
 *
 * ⚠️ NÃO CHAMA `autorizar`. É ato de INSTALAÇÃO, como o bootstrap do primeiro usuário: roda
 * fora da aplicação, por quem opera o servidor, e é recusado quando já existe contrato. Está
 * declarado em `FORA_DO_CENSO` com esta razão.
 */

/**
 * OS MÓDULOS QUE ESTA INSTALAÇÃO DE FATO USA — derivados das permissões já concedidas.
 *
 * ⚠️ A PERGUNTA É "o que este ente opera?", e a resposta honesta está em `PermissaoDePerfil`:
 * um perfil com `EMPENHAR` prova que alguém empenha. Derivar de tabelas de fato (existe
 * empenho?) daria falso-negativo numa implantação recém-instalada que ainda não lançou nada,
 * e o município acordaria sem o módulo que acabou de contratar.
 *
 * ⚠️ AS DEPENDÊNCIAS ENTRAM JUNTO, e não é cascata clandestina: aqui não se está habilitando
 * o que ninguém contratou — está-se lendo um contrato que já vigorava de fato (o sistema
 * inteiro estava aberto) e escrevendo-o. Habilitar "Compras" sem o núcleo produziria um
 * contrato que o próprio validador recusa.
 */
export function modulosEmUso(acoesConcedidas: readonly string[]): readonly ModuloComercial[] {
  const diretos = new Set<ModuloComercial>();
  for (const a of acoesConcedidas) {
    const m = MODULO_DA_ACAO[a as AcaoDoSistema];
    if (m === undefined) continue; // permissão fora do censo: o detector de deriva cuida dela.
    if (!moduloDoCatalogo(m).licenciavel) continue;
    diretos.add(m);
  }
  const comDependencias = new Set<ModuloComercial>(diretos);
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const m of [...comDependencias]) {
      for (const d of moduloDoCatalogo(m).depende) {
        if (!comDependencias.has(d)) {
          comDependencias.add(d);
          mudou = true;
        }
      }
    }
  }
  return [...comDependencias].sort();
}

export interface ResultadoDaInstalacao {
  readonly instalado: boolean;
  readonly contratoId: string | null;
  readonly numero: string | null;
  readonly modulos: readonly ModuloComercial[];
  readonly detalhe: string;
}

export interface InstalarLicenciamentoInput {
  readonly enteId: string;
  readonly numero: string;
  readonly cliente: string;
  readonly criadoPor: string;
  /** `true` marca o contrato como de DEMONSTRAÇÃO — o ambiente de avaliação. */
  readonly demonstracao: boolean;
  /**
   * Os módulos do contrato. Omitido, são os derivados das permissões já concedidas — o
   * caminho da ATUALIZAÇÃO de uma instalação que já existe.
   */
  readonly modulos?: readonly ModuloComercial[];
  readonly agora?: Date;
}

/**
 * INSTALA o contrato desta implantação. Idempotente por EXISTÊNCIA, não por upsert: se já há
 * contrato, não mexe em nada e diz qual é.
 *
 * ⚠️ IDEMPOTENTE, ao contrário do bootstrap de usuário — e a diferença tem razão. O bootstrap
 * é recusado num banco povoado porque um segundo bootstrap CRIARIA um administrador novo (um
 * poder). Aqui, a segunda execução não cria poder nenhum: ela encontra o contrato e sai. Um
 * `throw` faria a atualização de rotina falhar em toda instalação já atualizada, e o operador
 * aprenderia a ignorar o erro — que é como um erro real passa despercebido.
 */
export async function instalarLicenciamento(
  prisma: PrismaClient,
  input: InstalarLicenciamentoInput
): Promise<ResultadoDaInstalacao> {
  const existente = await prisma.contratoComercial.findFirst({
    where: { enteId: input.enteId },
    select: { id: true, numero: true, habilitacoes: { select: { modulo: true } } },
  });
  if (existente !== null) {
    return {
      instalado: false,
      contratoId: existente.id,
      numero: existente.numero,
      modulos: existente.habilitacoes.map((h) => h.modulo as ModuloComercial).sort(),
      detalhe:
        `Esta implantação já está sob o contrato "${existente.numero}" — a instalação não ` +
        `mexeu em nada. Mudanças de módulo se fazem pela tela do fornecedor, com motivo e ` +
        `histórico.`,
    };
  }

  const modulos =
    input.modulos ??
    modulosEmUso(
      (
        await prisma.permissaoDePerfil.findMany({ select: { acao: true }, distinct: ["acao"] })
      ).map((p) => String(p.acao))
    );

  const hoje = diaCivil(input.agora ?? new Date());

  return prisma.$transaction(async (tx) => {
    const contrato = await tx.contratoComercial.create({
      data: {
        enteId: input.enteId,
        numero: input.numero,
        cliente: input.cliente,
        situacao: "ATIVO",
        inicio: hoje,
        fim: null,
        observacao:
          `Contrato instalado pelo procedimento de ${input.modulos === undefined ? "atualização" : "instalação"} ` +
          `em ${hoje}, com os módulos ${input.modulos === undefined ? "derivados das permissões já concedidas" : "declarados na instalação"}.`,
        demonstracao: input.demonstracao,
        criadoPor: input.criadoPor,
      },
      select: { id: true },
    });

    await tx.eventoDeLicenciamento.create({
      data: {
        contratoId: contrato.id,
        modulo: null,
        tipo: "CONTRATO_REGISTRADO",
        motivo: "Instalação do licenciamento comercial desta implantação.",
        detalhe: `Contrato ${input.numero} — ${input.cliente}${input.demonstracao ? " (demonstração)" : ""}.`,
        vigenciaInicio: hoje,
        vigenciaFim: null,
        chave: `${input.enteId}:CONTRATO_REGISTRADO:${input.numero}:${hoje}:-`,
        criadoPor: input.criadoPor,
      },
    });

    for (const m of modulos) {
      await tx.habilitacaoDeModulo.create({
        data: {
          contratoId: contrato.id,
          modulo: m,
          ativa: true,
          inicio: hoje,
          fim: null,
          motivo: "Habilitado na instalação do licenciamento.",
          criadoPor: input.criadoPor,
          atualizadoPor: input.criadoPor,
        },
      });
      await tx.eventoDeLicenciamento.create({
        data: {
          contratoId: contrato.id,
          modulo: m,
          tipo: "MODULO_HABILITADO",
          motivo: "Habilitado na instalação do licenciamento.",
          detalhe: `${moduloDoCatalogo(m).nome} — vigência ${hoje} a sem termo.`,
          vigenciaInicio: hoje,
          vigenciaFim: null,
          chave: `${contrato.id}:MODULO_HABILITADO:${m}:${hoje}:-`,
          criadoPor: input.criadoPor,
        },
      });
    }

    return {
      instalado: true,
      contratoId: contrato.id,
      numero: input.numero,
      modulos: [...modulos].sort(),
      detalhe: `Contrato ${input.numero} instalado com ${modulos.length} módulo(s).`,
    };
  });
}
