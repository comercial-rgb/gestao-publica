import Link from "next/link";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { meusBens, PortaSemBancoError, type MeuBem } from "../../../../lib/portas/recursos/meus-bens-dados";

/**
 * MEUS BENS — os bens sob a responsabilidade de quem está na sessão (V3, pacote 2).
 *
 * Sem vínculo usuário↔pessoa, a tela diz que o vínculo está PENDENTE e quem resolve — ela
 * não adivinha a pessoa pelo nome do usuário. Com vínculo e sem bens, diz isso. Nada aqui
 * é contador estático: a lista é derivada do último movimento de responsável de cada bem.
 */
export const dynamic = "force-dynamic";

const COLUNAS: readonly ColunaTabela<MeuBem>[] = [
  { chave: "tomb", cabecalho: "Tombamento", alinhamento: "esquerda", celula: (b) => <Link className="underline underline-offset-2" href={`/patrimonio/bens-patrimoniais/${b.id}`}>{b.numeroTombamento}</Link> },
  { chave: "desc", cabecalho: "Descrição", alinhamento: "esquerda", celula: (b) => b.descricao },
  { chave: "classe", cabecalho: "Classe", alinhamento: "esquerda", celula: (b) => b.classe },
  { chave: "loc", cabecalho: "Localização", alinhamento: "esquerda", celula: (b) => b.localizacao },
  { chave: "sit", cabecalho: "Situação", alinhamento: "esquerda", celula: (b) => b.situacao },
  { chave: "est", cabecalho: "Estado", alinhamento: "esquerda", celula: (b) => b.estado },
];

export default async function MeusBensPage(): Promise<React.ReactElement> {
  await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PATRIMONIO");
  const cabecalho = (
    <PageHeader titulo="Bens sob minha responsabilidade" subtitulo="Os bens pelos quais você responde hoje, pelo último termo ou movimento de responsável de cada um." />
  );

  let dados: Awaited<ReturnType<typeof meusBens>>;
  try {
    dados = await meusBens();
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler os seus bens"}
          descricao={erro instanceof Error ? erro.message : "Erro."}
        />
      </div>
    );
  }

  if (dados.pessoa === null) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo="Vínculo com o cadastro de pessoas pendente"
          descricao="O seu usuário ainda não está vinculado a uma pessoa do cadastro, e a responsabilidade por um bem é de uma PESSOA. O sistema não associa pelo nome: peça ao administrador para vincular o seu usuário ao seu CPF em Administração > Usuários."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}
      <p className="text-xs text-[color:var(--color-ink-2)]" data-pessoa={dados.pessoa.documento}>
        Você é <strong>{dados.pessoa.nome}</strong> ({dados.pessoa.documento}) no cadastro.
      </p>
      {dados.bens.length === 0 ? (
        <EstadoVazio titulo="Nenhum bem sob a sua responsabilidade" descricao="Nenhum bem tem você como responsável no último movimento de responsabilidade. Quando um termo de responsabilidade for emitido em seu nome, ele aparece aqui." />
      ) : (
        <TabelaDeDados colunas={COLUNAS} linhas={dados.bens} keyDe={(b) => b.id} legenda={`${dados.bens.length} bem(ns) sob a sua responsabilidade`} />
      )}
    </div>
  );
}
