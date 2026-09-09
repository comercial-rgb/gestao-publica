import { Alerta } from "../../components/ui/Alerta";
import { BarraFiltros } from "../../components/ui/BarraFiltros";
import { Botao } from "../../components/ui/Botao";
import { CampoNumero, CampoSelect, CampoTexto, CampoTextarea, CampoValor } from "../../components/ui/Campos";
import { CampoCpfCnpj } from "../../components/ui/Campos";
import { EstadoVazio } from "../../components/ui/EstadoVazio";
import { Paginacao } from "../../components/ui/Paginacao";
import { TabelaDeDados } from "../../components/ui/TabelaDeDados";
import { CLASSE_ROTULO } from "../../components/ui/Formulario";

/**
 * ⚠️ PÁGINA DE FUMAÇA — DESCARTÁVEL, e fora de `(areas)` de propósito.
 *
 * Teste unitário prova COMPORTAMENTO, não APARÊNCIA. Densidade errada, contraste ruim e grid
 * quebrando em 768px não aparecem em `npm test` — e o scaffold (5c) vai replicar por ~200 telas
 * o que estiver errado aqui. Esta página existe para ser OLHADA uma vez, antes disso.
 *
 * ⚠️ FORA DO GRUPO `(areas)` porque aquele layout exige sessão: uma página de inspeção visual que
 * precisa de login não é inspecionável sem banco semeado. Aqui não há dado, não há porta e não há
 * Prisma — só os componentes com valores fixos.
 *
 * ⚠️ APAGAR quando o 5c consumir os componentes de verdade. Ela não tem link na navegação; quem
 * chegar nela veio pela URL.
 */

interface LinhaFumaca {
  readonly numero: string;
  readonly credor: string;
  readonly valor: string;
  readonly total?: boolean;
}

const LINHAS: LinhaFumaca[] = [
  { numero: "2026/000045", credor: "FORNECEDOR MODELO LTDA", valor: "1.234.567,89" },
  { numero: "2026/000046", credor: "PRESTADORA DE SERVICOS SA", valor: "12.000,00" },
  { numero: "2026/000047", credor: "COMERCIO DE MATERIAIS ME", valor: "987,65" },
  { numero: "", credor: "TOTAL", valor: "1.247.555,54", total: true },
];

export default function PaginaFumaca(): React.ReactElement {
  return (
    <main className="mx-auto max-w-6xl space-y-8 bg-[color:var(--color-canvas)] p-8">
      <header>
        <h1 className="text-xl font-semibold text-[color:var(--color-ink)]">
          Fumaça — componentes base
        </h1>
        <p className="mt-1 text-sm text-[color:var(--color-ink-2)]">
          Página descartável. Densidade, contraste e o grid em 768px — o que o teste não vê.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className={CLASSE_ROTULO}>Alertas</h2>
        <Alerta status="neutro" titulo="Remessa gerada localmente">
          Formato oficial gerado e validado localmente. Nada foi transmitido ao Tribunal.
        </Alerta>
        <Alerta status="ok" titulo="Contrato cadastrado" />
        <Alerta status="alerta" titulo="Vence em 30 dias">
          O contrato 2026/000045 entra na janela de alerta configurada (90 dias).
        </Alerta>
        <Alerta status="erro" titulo="SIGA-E001 — conta sem de/para">
          A conta contábil 3.3.90.39 não tem correspondência cadastrada para o TCM-BA.
        </Alerta>
      </section>

      <section className="space-y-3">
        <h2 className={CLASSE_ROTULO}>Botões</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Botao variante="primario">Salvar contrato</Botao>
          <Botao variante="secundario">Cancelar</Botao>
          <Botao variante="perigo">Anular</Botao>
          <Botao variante="texto">Ver detalhes</Botao>
          <Botao carregando>Processando</Botao>
          <Botao desabilitado>Indisponível</Botao>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={CLASSE_ROTULO}>Barra de filtros (grid de 4 colunas)</h2>
        <BarraFiltros hrefLimpar="/fumaca">
          <CampoTexto name="numero" rotulo="Número" largura={1} placeholder="2026/000045" />
          <CampoSelect
            name="situacao"
            rotulo="Situação"
            largura={1}
            vazio="Todas"
            opcoes={[
              { valor: "vigente", rotulo: "Vigentes" },
              { valor: "vencido", rotulo: "Vencidos" },
            ]}
          />
          <CampoTexto name="credor" rotulo="Credor" largura={2} />
        </BarraFiltros>
      </section>

      <section className="space-y-3">
        <h2 className={CLASSE_ROTULO}>Formulário (larguras 1 / 2 / 4)</h2>
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <CampoTexto name="f_numero" rotulo="Número do contrato" largura={1} required />
            <div className="md:col-span-1">
              <label className={CLASSE_ROTULO} htmlFor="f_valor">Valor inicial</label>
              <CampoValor id="f_valor" name="f_valor" className="h-11 w-full rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-sm" defaultValue="1234567.89" />
            </div>
            <div className="md:col-span-2">
              <label className={CLASSE_ROTULO} htmlFor="f_cnpj">CNPJ do contratado</label>
              <CampoCpfCnpj id="f_cnpj" name="f_cnpj" className="h-11 w-full rounded-[var(--radius-md)] border border-[color:var(--color-border-strong)] px-3 text-sm" defaultValue="12345678000199" />
            </div>
            <CampoNumero name="f_dias" rotulo="Dias de alerta" largura={1} defaultValue="90" min={1} ajuda="Lei 14.133, art. 107" />
            <CampoSelect
              name="f_moeda"
              rotulo="Moeda"
              largura={1}
              opcoes={[{ valor: "BRL", rotulo: "Real (BRL)" }, { valor: "USD", rotulo: "Dólar (USD)" }]}
            />
            <CampoTexto
              name="f_erro"
              rotulo="Campo com erro"
              largura={2}
              erro="Já existe contrato com este número."
            />
            <CampoTextarea name="f_objeto" rotulo="Objeto" largura={4} linhas={3} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={CLASSE_ROTULO}>Tabela densa, ordenável, com coluna de valor</h2>
        <div className="rounded-[var(--radius-lg)] bg-[color:var(--color-surface)]">
          <TabelaDeDados
            legenda="Contratos do exercício"
            colunas={[
              { chave: "numero", cabecalho: "Número", celula: (l: LinhaFumaca) => l.numero, ordenavel: true },
              { chave: "credor", cabecalho: "Credor", celula: (l: LinhaFumaca) => l.credor, ordenavel: true },
              {
                chave: "valor",
                cabecalho: "Valor",
                alinhamento: "direita",
                largura: "12rem",
                celula: (l: LinhaFumaca) => l.valor,
                ordenavel: true,
              },
            ]}
            linhas={LINHAS}
            keyDe={(l, i) => `${l.numero}-${i}`}
            ehTotal={(l) => l.total === true}
            ordenacao={{ campo: "valor", direcao: "desc" }}
            hrefDeOrdenacao={(campo, dir) => `/fumaca?ordem=${campo}&dir=${dir}`}
          />
          <Paginacao
            pagina={2}
            tamanhoPagina={20}
            total={57}
            hrefDePagina={(p) => `/fumaca?pagina=${p}`}
            rotuloItens="contratos"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className={CLASSE_ROTULO}>Estado vazio</h2>
        <EstadoVazio titulo="Nenhum contrato encontrado" descricao="Ajuste os filtros ou cadastre o primeiro contrato do exercício." />
      </section>
    </main>
  );
}
