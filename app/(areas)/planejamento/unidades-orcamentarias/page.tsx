import { Badge } from "../../../../components/ui/Badge";
import { EstadoVazio } from "../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../components/ui/PageHeader";
import { SincronizarContexto } from "../../../../components/ui/SincronizarContexto";
import { TabelaDeDados, type ColunaTabela } from "../../../../components/ui/TabelaDeDados";
import {
  lerUnidadesOrcamentarias,
  PortaSemBancoError,
  type UnidadeComDeclaracao,
} from "../../../../lib/portas/unidades-orcamentarias";
import { telaExigeLeituraEmAlgumEscopo } from "../../../../lib/portas/leitura";
import { dataBr } from "../../../../lib/recorte";
import { FormDeclaracao } from "./FormDeclaracao";
import { ATOS, NATUREZAS, rotuloDe } from "./rotulos";

import { mensagemDoErro } from "../../../../lib/portas/mensagem-do-erro";
/**
 * UNIDADES ORÇAMENTÁRIAS (M02 V21) — o que a prestação de contas pede de cada unidade: a natureza
 * jurídica, o secretário responsável e o ato que o nomeou. A declaração é versionada: a tabela mostra
 * a vigente hoje, e o arquivo de um mês passado sai com a que valia naquele mês.
 */
export const dynamic = "force-dynamic";

function cpfFormatado(cpf: string): string {
  return cpf.length === 11 ? `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}` : cpf;
}

const COLUNAS: readonly ColunaTabela<UnidadeComDeclaracao>[] = [
  { chave: "codigo", cabecalho: "Unidade", alinhamento: "esquerda", largura: "6rem", celula: (u) => <strong>{u.codigo}</strong> },
  { chave: "descricao", cabecalho: "Descrição", alinhamento: "esquerda", celula: (u) => u.descricao },
  { chave: "orgao", cabecalho: "Órgão", alinhamento: "esquerda", largura: "5rem", celula: (u) => u.orgaoCodigo },
  {
    chave: "natureza",
    cabecalho: "Natureza jurídica",
    alinhamento: "esquerda",
    celula: (u) => (u.vigente === null ? <Badge status="alerta">Não declarada</Badge> : rotuloDe(NATUREZAS, u.vigente.naturezaJuridica)),
  },
  {
    chave: "secretario",
    cabecalho: "Secretário responsável",
    alinhamento: "esquerda",
    celula: (u) =>
      u.vigente === null ? (
        "—"
      ) : (
        <span>
          {u.vigente.nomeSecretario}
          <span className="block text-xs text-[color:var(--color-ink-3)]">
            CPF {cpfFormatado(u.vigente.cpfSecretario)} · {rotuloDe(ATOS, u.vigente.atoDeNomeacao)} · desde {dataBr(u.vigente.vigenteDesde)}
          </span>
        </span>
      ),
  },
  {
    chave: "historico",
    cabecalho: "Declarações",
    alinhamento: "direita",
    largura: "7rem",
    celula: (u) => String(u.declaracoes),
  },
];

export default async function UnidadesOrcamentariasPage(): Promise<React.ReactElement> {
  // A política de leitura declarada NA TELA (a porta repete o gate): sem CONSULTAR_PLANEJAMENTO em
  // algum escopo, a página nem abre.
  await telaExigeLeituraEmAlgumEscopo("CONSULTAR_PLANEJAMENTO");
  const cabecalho = (
    <PageHeader
      titulo="Unidades orçamentárias"
      subtitulo="Natureza jurídica, secretário responsável e o ato de nomeação — o que a prestação de contas pede de cada unidade"
    />
  );
  let unidades: readonly UnidadeComDeclaracao[];
  try {
    unidades = await lerUnidadesOrcamentarias();
  } catch (erro) {
    return (
      <div className="space-y-4">
        <SincronizarContexto />
        {cabecalho}
        <EstadoVazio
          titulo={erro instanceof PortaSemBancoError ? "Banco de dados não configurado" : "Não foi possível ler as unidades"}
          descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Erro desconhecido."}
        />
      </div>
    );
  }
  const semDados = unidades.filter((u) => u.vigente === null).length;
  return (
    <div className="space-y-4">
      <SincronizarContexto />
      {cabecalho}
      <div className="rounded-[var(--radius-md)] border border-[color:var(--color-border)] bg-[color:var(--color-surface-2)] p-3 text-xs leading-relaxed text-[color:var(--color-ink-2)]">
        Estes dados vão ao Tribunal de Contas junto com o orçamento, todo mês. Quando o secretário muda,
        declare de novo com a data da posse: a declaração anterior <strong>não é apagada</strong>, e o
        arquivo de cada mês sai com quem estava no cargo naquele mês.{" "}
        {semDados > 0 ? (
          <strong data-unidades-sem-dados={String(semDados)}>
            {String(semDados)} unidade(s) ainda sem dados — enquanto faltarem, o arquivo das unidades fica fora
            do pacote mensal.
          </strong>
        ) : null}
      </div>
      {unidades.length === 0 ? (
        <EstadoVazio titulo="Nenhuma unidade orçamentária cadastrada" descricao="As unidades vêm da instalação do orçamento." />
      ) : (
        <TabelaDeDados colunas={COLUNAS} linhas={unidades} keyDe={(u) => u.id} legenda={`${String(unidades.length)} unidade(s)`} />
      )}
      <FormDeclaracao unidades={unidades.map((u) => ({ id: u.id, rotulo: `${u.codigo} — ${u.descricao}` }))} />
    </div>
  );
}
