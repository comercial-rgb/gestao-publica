import { z } from "zod";
import type { PrismaClient } from "../../prisma/generated/client/client.js";
import { documentoTemDigitoValido, normalizarDocumento, tipoDeDocumento } from "../../packages/documento/index.js";
import { motivoDeTextoInvalidoNoManad } from "../m14-exports-federais/manad/responsaveis.js";
import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import { autorizarNo } from "../m16-travamento/escopo.js";
import { ID_DO_ENTE_UNICO } from "./contexto-do-ente.js";

/**
 * ═══ M01 — OS RESPONSÁVEIS TÉCNICOS DOS ARQUIVOS FEDERAIS (MANAD, registros 0000/0050/0100) ═══
 *
 * O MANAD recusa sair sem três dados que ninguém gravava: o CONTABILISTA responsável (0050), a
 * EMPRESA ou TÉCNICO que gera o arquivo (0100) e o indicador de CENTRALIZAÇÃO da escrituração
 * (0000, IND_CENTR). As tabelas existiam (`prisma/schema/m14-exports-federais.prisma`); faltava
 * quem as escrevesse.
 *
 * ═══ POR QUE MORA NO M01, E NÃO NO M14 ═══
 * O M14 é LEITURA PURA, e o `t7` de `m14-msc.test.ts` roda o grep de escrita sobre o módulo
 * inteiro: um export fiscal que grava pode corromper o que envia. Quem diz QUEM responde pela
 * contabilidade do ente é o cadastro do ente — o mesmo lugar de `entidade-contabil.ts`. O M14
 * contribui só com a parte pura (`manad/responsaveis.ts`): a vigência derivada e a conferência de
 * texto contra o leiaute.
 *
 * ═══ A AÇÃO: `CADASTRAR_ENTIDADE_CONTABIL`, NO ENTE ═══
 * Não há ação própria para os responsáveis do MANAD, e nenhuma foi criada. A mais próxima é a de
 * "dizer quem a entidade é" (CNPJ, tipo no leiaute do MANAD, ato de criação): declarar quem assina
 * a escrituração dela perante a Receita é a MESMA autoridade. `CONFIGURAR_APRESENTACAO_DO_ENTE` foi
 * descartada — ela declara explicitamente que "não toca o EnteConfig fiscal". Se o ente precisar
 * separar os dois poderes, é ação nova, e decisão de quem administra o censo.
 *
 * ═══ SÓ INSERT — E O QUE ISSO DECIDE ═══
 * O papel da aplicação (`prisma/papel-runtime.ts`) tem SELECT e INSERT nas duas tabelas, e nenhum
 * UPDATE. Trocar de contabilista é INSERIR o sucessor; o antecessor aberto termina na véspera do
 * início dele, por derivação (`vigenciasEfetivas`). Para a derivação ser inequívoca, o registro
 * novo tem de começar DEPOIS de todos os anteriores e fora de qualquer período já fechado.
 */

type Tx = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

/** Recusa de cadastro com mensagem de tela. A porta a devolve como está. */
export class CadastroDeResponsavelInvalidoError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "CadastroDeResponsavelInvalidoError";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AS PEÇAS DA VALIDAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

const DIA = /^(\d{4})-(\d{2})-(\d{2})$/u;

/**
 * "AAAA-MM-DD" -> meia-noite UTC daquele dia.
 *
 * ⚠️ UTC DE PROPÓSITO: é o FORMATO EXTERNO do leiaute (o gerador lê DT_INI/DT_FIN por `getUTC*`).
 * A data não participa de comparação com o relógio do ente — só com outras datas deste cadastro.
 */
function diaDoLeiaute(valor: string, rotulo: string): Date {
  const m = DIA.exec(valor.trim());
  if (m === null) throw new CadastroDeResponsavelInvalidoError(`${rotulo}: informe a data no formato dia/mês/ano.`);
  const [ano, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia || ano < 1900) {
    throw new CadastroDeResponsavelInvalidoError(`${rotulo}: a data informada não existe.`);
  }
  return d;
}

function diaBr(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${String(d.getUTCFullYear())}`;
}

/** Texto obrigatório que vai ao arquivo: não vazio, sem separador, em Latin-1. */
function textoObrigatorio(valor: string | undefined, rotulo: string): string {
  const v = (valor ?? "").trim();
  if (v === "") throw new CadastroDeResponsavelInvalidoError(`${rotulo}: campo obrigatório.`);
  const motivo = motivoDeTextoInvalidoNoManad(v, rotulo);
  if (motivo !== null) throw new CadastroDeResponsavelInvalidoError(motivo);
  return v;
}

/** Texto opcional: vazio vira `null` (uma forma só de dizer "não informado"). */
function textoOpcional(valor: string | undefined, rotulo: string): string | null {
  const v = (valor ?? "").trim();
  if (v === "") return null;
  const motivo = motivoDeTextoInvalidoNoManad(v, rotulo);
  if (motivo !== null) throw new CadastroDeResponsavelInvalidoError(motivo);
  return v;
}

function cpfObrigatorio(valor: string | undefined, rotulo: string): string {
  const d = normalizarDocumento(valor);
  if (d === "") throw new CadastroDeResponsavelInvalidoError(`${rotulo}: campo obrigatório.`);
  if (tipoDeDocumento(d) !== "CPF") {
    throw new CadastroDeResponsavelInvalidoError(`${rotulo}: o CPF tem 11 dígitos.`);
  }
  if (!documentoTemDigitoValido(d)) {
    throw new CadastroDeResponsavelInvalidoError(`${rotulo}: o dígito verificador não confere. Confira o número.`);
  }
  return d;
}

function cpfOpcional(valor: string | undefined, rotulo: string): string | null {
  return normalizarDocumento(valor) === "" ? null : cpfObrigatorio(valor, rotulo);
}

/**
 * CNPJ opcional, NUMÉRICO. O leiaute do MANAD (IN MPS/SRP 12/2006) declara o campo como N|014: um
 * CNPJ alfanumérico (Receita, desde julho de 2026) não cabe nele, e o gerador o recusaria. Recusar
 * aqui é dizer isso na hora certa.
 */
function cnpjOpcional(valor: string | undefined, rotulo: string): string | null {
  const d = normalizarDocumento(valor);
  if (d === "") return null;
  if (!/^\d{14}$/u.test(d)) {
    throw new CadastroDeResponsavelInvalidoError(
      `${rotulo}: o CNPJ tem 14 dígitos. O arquivo da Receita aceita apenas CNPJ numérico.`
    );
  }
  if (!documentoTemDigitoValido(d)) {
    throw new CadastroDeResponsavelInvalidoError(`${rotulo}: o dígito verificador não confere. Confira o número.`);
  }
  return d;
}

function cepOpcional(valor: string | undefined, rotulo: string): string | null {
  const d = (valor ?? "").replace(/\D+/gu, "");
  if (d === "") return null;
  if (d.length !== 8) throw new CadastroDeResponsavelInvalidoError(`${rotulo}: o CEP tem 8 dígitos.`);
  return d;
}

function ufOpcional(valor: string | undefined): string | null {
  const v = (valor ?? "").trim().toUpperCase();
  if (v === "") return null;
  if (!/^[A-Z]{2}$/u.test(v)) throw new CadastroDeResponsavelInvalidoError("UF: informe a sigla com 2 letras.");
  return v;
}

function emailOpcional(valor: string | undefined): string | null {
  const v = textoOpcional(valor, "E-mail");
  if (v === null) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(v)) {
    throw new CadastroDeResponsavelInvalidoError("E-mail: o endereço informado não é válido.");
  }
  return v;
}

/**
 * O CRC. O leiaute o declara alfanumérico (0050 campo 05) e a coluna tem 11 posições; o formato
 * do número varia por conselho regional, e nenhuma máscara foi inventada aqui. Confere-se o que é
 * certo: presente, cabe na coluna e cabe no arquivo.
 */
function crcObrigatorio(valor: string | undefined): string {
  const v = textoObrigatorio(valor, "CRC");
  if (v.length > 11) {
    throw new CadastroDeResponsavelInvalidoError(
      "CRC: o número de registro tem no máximo 11 caracteres (por exemplo, PB-012345/O)."
    );
  }
  return v;
}

/**
 * A VIGÊNCIA NOVA CABE NA LINHA DO TEMPO? — a regra que torna a derivação do fim inequívoca.
 *
 * ⚠️ PRÉ-CONDIÇÃO ANTES DE GRAVAR, dentro da transação. Um registro gravado e depois recusado
 * ficaria no banco para sempre (o papel não apaga nesta tabela).
 */
function conferirSucessao(
  existentes: readonly { readonly inicio: Date; readonly fim: Date | null }[],
  inicio: Date,
  oQue: string
): void {
  for (const e of existentes) {
    if (inicio <= e.inicio) {
      throw new CadastroDeResponsavelInvalidoError(
        `Já há ${oQue} cadastrado com início em ${diaBr(e.inicio)}. O novo registro precisa começar ` +
          `depois dele: o cadastro guarda o histórico, e cada registro novo sucede o anterior.`
      );
    }
    if (e.fim !== null && inicio <= e.fim) {
      throw new CadastroDeResponsavelInvalidoError(
        `O período informado começa dentro de um período já cadastrado (de ${diaBr(e.inicio)} a ` +
          `${diaBr(e.fim)}). Informe um início posterior a ${diaBr(e.fim)}.`
      );
    }
  }
}

function conferirPeriodo(inicio: Date, fim: Date | null): void {
  if (fim !== null && fim < inicio) {
    throw new CadastroDeResponsavelInvalidoError("O fim do período não pode ser anterior ao início.");
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 0050 — O CONTABILISTA
// ═══════════════════════════════════════════════════════════════════════════

const zTextoLivre = z.string().optional();

export const zRegistrarContabilistaInput = z.object({
  nome: z.string(),
  cpf: z.string(),
  crc: z.string(),
  cnpjEscritorio: zTextoLivre,
  /** "AAAA-MM-DD". */
  dtInicio: z.string(),
  /** "AAAA-MM-DD" ou vazio (aberto). */
  dtFim: zTextoLivre,
  endereco: zTextoLivre,
  numero: zTextoLivre,
  complemento: zTextoLivre,
  bairro: zTextoLivre,
  cep: zTextoLivre,
  uf: zTextoLivre,
  fone: zTextoLivre,
  email: zTextoLivre,
  criadoPor: z.string().min(1),
});
export type RegistrarContabilistaInput = z.input<typeof zRegistrarContabilistaInput>;

/**
 * REGISTRA O CONTABILISTA RESPONSÁVEL (MANAD 0050), com o período de responsabilidade.
 *
 * @param agora o instante do registro (vai para `conferidoEm`). Por parâmetro: a régua não lê o
 *   relógio por dentro.
 */
export async function registrarContabilistaDoManad(
  prisma: PrismaClient,
  input: RegistrarContabilistaInput,
  agora: Date
): Promise<{ readonly id: string }> {
  const d = zRegistrarContabilistaInput.parse(input);

  // Toda a validação que não depende do banco, ANTES da transação.
  const dados = {
    nome: textoObrigatorio(d.nome, "Nome"),
    cpf: cpfObrigatorio(d.cpf, "CPF"),
    crc: crcObrigatorio(d.crc),
    cnpjEscritorio: cnpjOpcional(d.cnpjEscritorio, "CNPJ do escritório"),
    dtInicio: diaDoLeiaute(d.dtInicio, "Início da responsabilidade"),
    dtFim: (d.dtFim ?? "").trim() === "" ? null : diaDoLeiaute(d.dtFim!, "Fim da responsabilidade"),
    endereco: textoOpcional(d.endereco, "Endereço"),
    numero: textoOpcional(d.numero, "Número"),
    complemento: textoOpcional(d.complemento, "Complemento"),
    bairro: textoOpcional(d.bairro, "Bairro"),
    cep: cepOpcional(d.cep, "CEP"),
    uf: ufOpcional(d.uf),
    fone: textoOpcional(d.fone, "Telefone"),
    email: emailOpcional(d.email),
  };
  conferirPeriodo(dados.dtInicio, dados.dtFim);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarContabilistaDoManad, "ENTE");

    const existentes = await tx.manadContabilista.findMany({ select: { dtInicio: true, dtFim: true } });
    conferirSucessao(
      existentes.map((e) => ({ inicio: e.dtInicio, fim: e.dtFim })),
      dados.dtInicio,
      "contabilista"
    );

    const criado = await tx.manadContabilista.create({
      data: { ...dados, conferidoPor: d.criadoPor, conferidoEm: agora },
      select: { id: true },
    });
    return { id: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 0100 — A EMPRESA OU O TÉCNICO GERADOR
// ═══════════════════════════════════════════════════════════════════════════

export const zRegistrarEmpresaGeradoraInput = z.object({
  empresaOuTecnico: z.string(),
  cargo: z.string(),
  cnpj: zTextoLivre,
  cpf: zTextoLivre,
  /** "AAAA-MM-DD". */
  dtInicioServico: z.string(),
  dtFimServico: zTextoLivre,
  fone: zTextoLivre,
  email: zTextoLivre,
  criadoPor: z.string().min(1),
});
export type RegistrarEmpresaGeradoraInput = z.input<typeof zRegistrarEmpresaGeradoraInput>;

/** REGISTRA A EMPRESA OU O TÉCNICO RESPONSÁVEL PELA GERAÇÃO DO ARQUIVO (MANAD 0100). */
export async function registrarEmpresaGeradoraDoManad(
  prisma: PrismaClient,
  input: RegistrarEmpresaGeradoraInput,
  agora: Date
): Promise<{ readonly id: string }> {
  const d = zRegistrarEmpresaGeradoraInput.parse(input);

  const dados = {
    empresaOuTecnico: textoObrigatorio(d.empresaOuTecnico, "Empresa ou técnico"),
    cargo: textoObrigatorio(d.cargo, "Cargo ou função"),
    cnpj: cnpjOpcional(d.cnpj, "CNPJ"),
    cpf: cpfOpcional(d.cpf, "CPF"),
    dtInicioServico: diaDoLeiaute(d.dtInicioServico, "Início do serviço"),
    dtFimServico:
      (d.dtFimServico ?? "").trim() === "" ? null : diaDoLeiaute(d.dtFimServico!, "Fim do serviço"),
    fone: textoOpcional(d.fone, "Telefone"),
    email: emailOpcional(d.email),
  };
  // O 0100 identifica QUEM gerou o arquivo: sem CNPJ nem CPF, é um nome sem documento.
  if (dados.cnpj === null && dados.cpf === null) {
    throw new CadastroDeResponsavelInvalidoError(
      "Informe o CNPJ da empresa ou o CPF do técnico responsável pela geração do arquivo."
    );
  }
  conferirPeriodo(dados.dtInicioServico, dados.dtFimServico);

  return prisma.$transaction(async (tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.registrarEmpresaGeradoraDoManad, "ENTE");

    const existentes = await tx.manadEmpresaGeradora.findMany({
      select: { dtInicioServico: true, dtFimServico: true },
    });
    conferirSucessao(
      existentes.map((e) => ({ inicio: e.dtInicioServico, fim: e.dtFimServico })),
      dados.dtInicioServico,
      "empresa ou técnico gerador"
    );

    const criado = await tx.manadEmpresaGeradora.create({
      data: { ...dados, conferidoPor: d.criadoPor, conferidoEm: agora },
      select: { id: true },
    });
    return { id: criado.id };
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// 0000 — O INDICADOR DE CENTRALIZAÇÃO DA ESCRITURAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/** IND_CENTR (0000, campo 12), como o leiaute o define. */
export const INDICADORES_DE_CENTRALIZACAO: Readonly<Record<"0" | "1" | "2", string>> = {
  "0": "Escrituração sem centralização",
  "1": "Estabelecimento centralizador da escrituração",
  "2": "Escrituração centralizada em outro estabelecimento",
};

export const zDeclararCentralizacaoInput = z.object({
  indicador: z.string(),
  criadoPor: z.string().min(1),
});
export type DeclararCentralizacaoInput = z.input<typeof zDeclararCentralizacaoInput>;

/**
 * DECLARA O INDICADOR DE CENTRALIZAÇÃO no `EnteConfig` (singleton).
 *
 * ═══ ⚠️ ESTE SERVIÇO NÃO É CHAMADO PELA APLICAÇÃO WEB — e o motivo é o banco ═══
 * `EnteConfig` é uma linha só (id "unico"): não há "registro novo" possível, declarar é UPDATE na
 * coluna. E o papel da aplicação NÃO tem UPDATE em `EnteConfig` — a tabela não está no censo
 * `ESCRITA_MUTAVEL_DO_RUNTIME`. Chamado pela tela, este serviço passaria na máquina de quem
 * desenvolve (que conecta como dono) e cairia com "permission denied" no município.
 *
 * Por isso ele é o passo de IMPLANTAÇÃO (`scripts/declarar-centralizacao-da-escrituracao.ts`),
 * executado com a credencial do dono — a mesma via por que o CNPJ, a UF e o código IBGE do ente
 * foram semeados. A autorização por ação nomeada continua valendo: quem executa informa a sua
 * identidade, e ela precisa ter `CADASTRAR_ENTIDADE_CONTABIL` no ente.
 *
 * Levar a declaração para a tela exige acrescentar `EnteConfig: { update: ["indCentralizacao"] }`
 * ao censo — decisão de quem administra o papel, não deste serviço.
 */
export async function declararCentralizacaoDaEscrituracao(
  prisma: PrismaClient,
  input: DeclararCentralizacaoInput
): Promise<{ readonly anterior: string | null; readonly atual: string }> {
  const d = zDeclararCentralizacaoInput.parse(input);
  const indicador = d.indicador.trim();
  if (!Object.hasOwn(INDICADORES_DE_CENTRALIZACAO, indicador)) {
    throw new CadastroDeResponsavelInvalidoError(
      "Indicador de centralização inválido: use 0 (sem centralização), 1 (centralizador) ou 2 (centralizada)."
    );
  }

  return prisma.$transaction(async (tx: Tx) => {
    await autorizarNo(tx, d.criadoPor, ACAO_DO_SERVICO.declararCentralizacaoDaEscrituracao, "ENTE");
    const ente = await tx.enteConfig.findUnique({
      where: { id: ID_DO_ENTE_UNICO },
      select: { indCentralizacao: true },
    });
    if (ente === null) {
      throw new CadastroDeResponsavelInvalidoError(
        "O cadastro do ente (nome, CNPJ, UF e código IBGE) ainda não foi feito. Ele vem antes do indicador."
      );
    }
    await tx.enteConfig.update({
      where: { id: ID_DO_ENTE_UNICO },
      data: { indCentralizacao: indicador },
    });
    return { anterior: ente.indCentralizacao, atual: indicador };
  });
}
