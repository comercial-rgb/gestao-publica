import Link from "next/link";
import { EstadoVazio } from "../../../../../components/ui/EstadoVazio";
import { PageHeader } from "../../../../../components/ui/PageHeader";
import { telaExigeLeituraDoEnte } from "../../../../../lib/portas/leitura";
import { mensagemDoErro } from "../../../../../lib/portas/mensagem-do-erro";
import { documentoNoCadastro, type DocumentoNoCadastro } from "../../../../../lib/portas/pessoas";
import { retornoSeguro } from "../../../../../lib/retorno-seguro";
import { voltaComCredor } from "../../../../../lib/atalho-de-cadastro";
import { diaCivil } from "../../../../../packages/datas/index";
import { cadastrarPeloAvisoAction } from "../actions";
import { FormPessoa } from "../FormPessoa";
import { CamposDoPapel } from "./CamposDoPapel";
import { FormConcederPeloAviso } from "./FormConcederPeloAviso";

/**
 * /CADASTROS/PESSOAS/NOVA — O CADASTRO A PARTIR DO AVISO (V37).
 *
 * A tela que não achou um documento ("este documento não está no cadastro de credores") manda para cá
 * com `documento`, `papel` e `retorno`. O formulário já vem com o documento; ao gravar, a pessoa é
 * cadastrada (ou, se já existia, só recebe o papel) e o operador volta à tela de origem com o documento
 * escolhido. Sem parâmetros, é o mesmo cadastro da lista.
 */
const ROTULO_DO_PAPEL: Readonly<Record<string, string>> = {
  CREDOR: "Credor",
  CONSIGNATARIO: "Consignatário",
  SERVIDOR: "Servidor",
  REPRESENTANTE: "Representante",
};

function primeiro(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? "";
}

export default async function CadastroPeloAvisoPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<React.ReactElement> {
  await telaExigeLeituraDoEnte("CONSULTAR_CADASTROS");
  const sp = await searchParams;
  const documento = primeiro(sp["documento"]).replace(/\D/g, "");
  const papelBruto = primeiro(sp["papel"]);
  const papel = ROTULO_DO_PAPEL[papelBruto] !== undefined ? papelBruto : "";
  const rotuloDoPapel = papel !== "" ? ROTULO_DO_PAPEL[papel]! : "";
  const retorno = retornoSeguro(primeiro(sp["retorno"]), "/cadastros/pessoas");
  const hoje = diaCivil(new Date());

  const cabecalho = (
    <PageHeader
      titulo={papel !== "" ? `Cadastrar ${rotuloDoPapel.toLowerCase()}` : "Cadastrar pessoa"}
      subtitulo="Ao gravar, você volta para a tela de onde veio, com o cadastro já escolhido"
    />
  );

  let existente: DocumentoNoCadastro | null;
  try {
    existente = await documentoNoCadastro(documento);
  } catch (erro) {
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio titulo="Não foi possível consultar o cadastro" descricao={erro instanceof Error ? mensagemDoErro(erro, "") : "Tente novamente."} />
      </div>
    );
  }

  const voltar = (
    <Link href={retorno} className="text-sm font-medium text-[color:var(--color-primary)] hover:underline" data-voltar>
      Voltar sem cadastrar
    </Link>
  );
  const camposDoPapel =
    papel !== "" ? <CamposDoPapel papel={papel} rotuloDoPapel={rotuloDoPapel} retorno={retorno} hoje={hoje} /> : <input type="hidden" name="retorno" value={retorno} />;

  if (existente !== null && papel !== "" && existente.papeisVigentes.includes(papel as DocumentoNoCadastro["papeisVigentes"][number])) {
    const volta = papel === "CREDOR" ? voltaComCredor(retorno, documento) : retorno;
    return (
      <div className="space-y-4">
        {cabecalho}
        <EstadoVazio
          titulo={`${existente.nome} já é ${rotuloDoPapel.toLowerCase()}`}
          descricao={`O documento ${existente.documentoFormatado} já está no cadastro com o papel vigente. Volte e escolha-o na lista.`}
        />
        <Link href={volta} className="text-sm font-medium text-[color:var(--color-primary)] hover:underline" data-voltar-escolhido>
          Voltar com o cadastro escolhido
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cabecalho}
      {existente !== null ? (
        <FormConcederPeloAviso documento={documento} nome={existente.nome} rotuloDoPapel={rotuloDoPapel || "pessoa"}>
          {camposDoPapel}
        </FormConcederPeloAviso>
      ) : (
        <FormPessoa
          acao={cadastrarPeloAvisoAction}
          documentoInicial={documento}
          titulo={papel !== "" ? `Cadastrar ${rotuloDoPapel.toLowerCase()}` : "Cadastrar pessoa"}
          rotuloDoBotao="Cadastrar e voltar"
        >
          {camposDoPapel}
        </FormPessoa>
      )}
      {voltar}
    </div>
  );
}
