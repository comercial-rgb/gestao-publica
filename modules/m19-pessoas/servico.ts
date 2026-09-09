import { ACAO_DO_SERVICO } from "../m16-travamento/acoes.js";
import {
  tipoPeloDocumento,
  zAlterarPessoa,
  zCadastrarPessoa,
  zMoverPapel,
  type AlterarPessoaInput,
  type CadastrarPessoaInput,
  type MoverPapelInput,
} from "./dominio.js";
import type { M19Deps } from "./ports.js";

/**
 * M19 — os CASOS DE USO. Sem Prisma, sem transação: a persistência é das ports.
 *
 * ⚠️ ATO DO ENTE, NÃO DA UNIDADE GESTORA. O escopo das três ações é `"ENTE"`, e isso é
 * decisão, não descuido: o cadastro de pessoas é COMPARTILHADO. O mesmo fornecedor é
 * credor da Educação e da Saúde, e um cadastro por unidade produziria o que o M19 existe
 * para acabar — o mesmo CNPJ em dois cadastros, cada um com metade do histórico. Segregar
 * por UG o CADASTRO segregaria a identidade; quem é segregado é o GASTO, e isso o M05 já
 * faz. Só a permissão GLOBAL autoriza, como no contrato e na obra (M11).
 */

/**
 * Cadastra uma pessoa com a sua primeira versão.
 *
 * ⚠️ RECUSA DOCUMENTO JÁ CADASTRADO, e nomeia quem é. A alternativa — criar em silêncio o
 * segundo cadastro — é exatamente o defeito que o cadastro compartilhado vem resolver.
 * Quem quer alterar o cadastro existente chama `alterarPessoa`.
 */
export async function cadastrarPessoa(
  input: CadastrarPessoaInput,
  deps: M19Deps
): Promise<{ readonly pessoaId: string; readonly versaoId: string }> {
  const dados = zCadastrarPessoa.parse(input);

  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.cadastrarPessoa, "ENTE");

  const tipo = tipoPeloDocumento(dados.documento);
  if (tipo === null) {
    // Inalcançável pelo Zod acima; fica como defesa em profundidade, porque quem
    // decide o tipo é o documento e um `tipo` inferido errado criaria uma PJ sem CNPJ.
    throw new Error(`Documento "${dados.documento}" não é CPF nem CNPJ.`);
  }

  const jaExiste = await deps.pessoas.buscarPorDocumento(dados.documento);
  if (jaExiste !== null) {
    throw new Error(
      `Documento já cadastrado para "${jaExiste.nome}" (${jaExiste.id}). ` +
        "Um documento identifica UMA pessoa: para corrigir os dados dela, altere o " +
        "cadastro existente em vez de criar um segundo."
    );
  }

  return deps.pessoas.cadastrar({
    documento: dados.documento,
    tipo,
    dados: {
      nome: dados.nome,
      nomeFantasia: dados.nomeFantasia,
      email: dados.email,
      telefone: dados.telefone,
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      municipio: dados.municipio,
      uf: dados.uf,
      cep: dados.cep,
      // Nasce ativa. Desativar é uma VERSÃO nova, com motivo e autor.
      ativa: true,
    },
    criadoPor: dados.criadoPor,
  });
}

/**
 * Altera o cadastro — o que significa acrescentar uma VERSÃO, nunca reescrever a anterior.
 *
 * ⚠️ O DOCUMENTO NÃO ENTRA. Corrigir um CPF digitado errado não é "atualizar a pessoa": é
 * dizer que aquela pessoa era outra — e os fatos já gravados com o documento antigo
 * (empenhos, pagamentos) continuariam apontando para ele. O certo é desativar o cadastro
 * errado e criar o certo, e o histórico mostra os dois, que é o que de fato aconteceu.
 */
export async function alterarPessoa(
  input: AlterarPessoaInput,
  deps: M19Deps
): Promise<{ readonly versaoId: string }> {
  const dados = zAlterarPessoa.parse(input);

  await deps.autz.exigir(dados.criadoPor, ACAO_DO_SERVICO.alterarPessoa, "ENTE");

  const pessoa = await deps.pessoas.buscarPorId(dados.pessoaId);
  if (pessoa === null) {
    throw new Error(`Pessoa ${dados.pessoaId} não encontrada.`);
  }

  return deps.pessoas.versionar({
    pessoaId: dados.pessoaId,
    dados: {
      nome: dados.nome,
      nomeFantasia: dados.nomeFantasia,
      email: dados.email,
      telefone: dados.telefone,
      logradouro: dados.logradouro,
      numero: dados.numero,
      complemento: dados.complemento,
      bairro: dados.bairro,
      municipio: dados.municipio,
      uf: dados.uf,
      cep: dados.cep,
      ativa: dados.ativa,
    },
    motivo: dados.motivo,
    criadoPor: dados.criadoPor,
  });
}

/**
 * Concede ou encerra um papel. Append-only: encerrar é um movimento NOVO.
 *
 * ⚠️ RECUSA O MOVIMENTO REDUNDANTE — conceder um papel que já está vigente, ou encerrar um
 * que já está encerrado. Não é rigor decorativo: sem isso, a timeline enche de "CONCEDIDO"
 * repetidos que não aconteceram, e a pergunta "desde quando ele é credor?" passa a ter
 * várias respostas.
 */
export async function moverPapelDePessoa(
  input: MoverPapelInput,
  deps: M19Deps
): Promise<{ readonly movimentoId: string }> {
  const dados = zMoverPapel.parse(input);

  await deps.autz.exigir(
    dados.criadoPor,
    ACAO_DO_SERVICO.moverPapelDePessoa,
    "ENTE"
  );

  const pessoa = await deps.pessoas.buscarPorId(dados.pessoaId);
  if (pessoa === null) {
    throw new Error(`Pessoa ${dados.pessoaId} não encontrada.`);
  }

  const vigente = pessoa.papeis.includes(dados.papel);
  if (dados.movimento === "CONCEDIDO" && vigente) {
    throw new Error(
      `A pessoa ${pessoa.nome} já exerce o papel ${dados.papel}. ` +
        "Conceder de novo não muda nada e sujaria o histórico."
    );
  }
  if (dados.movimento === "ENCERRADO" && !vigente) {
    throw new Error(
      `A pessoa ${pessoa.nome} não exerce o papel ${dados.papel} — não há o que encerrar.`
    );
  }

  return deps.pessoas.moverPapel({
    pessoaId: dados.pessoaId,
    papel: dados.papel,
    movimento: dados.movimento,
    data: dados.data,
    motivo: dados.motivo,
    criadoPor: dados.criadoPor,
  });
}
