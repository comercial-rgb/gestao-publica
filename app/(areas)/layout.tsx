import { Suspense } from "react";
import { cookies } from "next/headers";
import { Footer } from "../../components/ui/Footer";
import { Header } from "../../components/ui/Header";
import { PanoDoMenu, ShellProvider } from "../../components/ui/Shell";
import { Sidebar } from "../../components/ui/Sidebar";
import { VigiaDeEdicao } from "../../components/ui/VigiaDeEdicao";
import { VigiaDaVersao } from "../../components/ui/VigiaDaVersao";
import { CabecalhoDeImpressao } from "../../components/ui/CabecalhoDeImpressao";
import { ContextoNaNavegacao } from "../../components/ui/ContextoNaNavegacao";
import { carregarContextoDoUsuario } from "../../lib/portas/contexto";
import { identidadePublica, nomeDoEnteParaDocumentos, paraATela } from "../../lib/portas/identidade";
import { exigirSessao } from "../../lib/portas/sessao";
import { COOKIE_EXERCICIO, COOKIE_UG, UiContextProvider } from "../../lib/ui-context";
import { areasVisiveis } from "../../lib/portas/navegacao-permissoes";
import { permitidos } from "../../lib/portas/busca-global";
import { sairAction } from "./actions";

/**
 * O SHELL AUTENTICADO — este layout é a FRONTEIRA de sessão. Todo `/(areas)/**` passa por aqui, e
 * `exigirSessao()` REDIRECIONA para /login se não houver sessão válida (request-scoped, Prisma pela
 * borda). O usuário real vai para o rodapé da sidebar.
 *
 * ⚠️ O ESTADO COLAPSADO DA SIDEBAR VEM DO COOKIE (sem flash — o primeiro HTML já sai certo).
 * ⚠️ A IDENTIDADE (produto + ente + ambiente) é lida AQUI, no servidor, pela porta — e passada
 * como dado às ilhas. O tema vigente vira `data-tema` no contêiner: configuração, não CSS livre.
 */
export default async function AreasLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.ReactElement> {
  const ident = await exigirSessao();
  const jarra = await cookies();
  const colapsada = jarra.get("sidebar_colapsada")?.value === "1";
  // A PREFERÊNCIA de exercício e unidade (cookie) — só preferência: a porta a revalida contra os
  // exercícios existentes e o provider contra as unidades permitidas.
  const preferido = Number(jarra.get(COOKIE_EXERCICIO)?.value ?? "");
  const ugPreferida = jarra.get(COOKIE_UG)?.value ?? null;
  // ⚠️ LIDO NO SERVIDOR, injetado por PROPS. O provider é client e só guarda a SELEÇÃO — quem
  // decide QUAIS unidades ele pode oferecer é a porta, contra as permissões reais do usuário.
  // V33 — o papel diz o ente pela MESMA fonte dos PDFs (apresentação; sem ela, o nome oficial do ente).
  const [contexto, identidade, enteDoPapel] = await Promise.all([
    carregarContextoDoUsuario(Number.isInteger(preferido) && preferido > 0 ? preferido : null),
    identidadePublica(),
    nomeDoEnteParaDocumentos(),
  ]);
  const tela = paraATela(identidade);

  // ⚠️ O RECORTE DA BUSCA É FEITO AQUI, NO SERVIDOR, e pela MESMA regra da barra lateral:
  // destino com ação exige a ação; destino de leitura herda a visibilidade da área.
  const visiveis = areasVisiveis(contexto.acoes);
  const podeAgir = new Set(contexto.acoes);
  const podeVer = new Set<string>(visiveis);
  const destinosDaBusca = permitidos({ acoes: podeAgir, areas: podeVer });

  return (
    <UiContextProvider
      exercicios={contexto.exercicios}
      ugs={contexto.ugs}
      podeConsolidado={contexto.podeConsolidado}
      exercicioInicial={contexto.exercicioInicial}
      ugPreferida={ugPreferida === null ? null : decodeURIComponent(ugPreferida)}
      anoCivil={contexto.anoCivil}
      mesCivil={contexto.mesCivil}
      competenciaAtual={contexto.competenciaAtual}
    >
      <ShellProvider>
        <VigiaDeEdicao />
        <VigiaDaVersao versao={tela.versao} />
        <Suspense fallback={null}>
          <ContextoNaNavegacao />
        </Suspense>
        <div className="flex h-screen overflow-hidden" data-tema={tela.tema} data-moldura-da-aplicacao>
          <PanoDoMenu />
          <Sidebar
            colapsadaInicial={colapsada}
            usuario={ident.identificador}
            sairAction={sairAction}
            areasVisiveis={visiveis}
            identidade={tela}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header destinosDaBusca={destinosDaBusca} identidade={tela} />
            {/* V37 — `relative`: o elemento `absolute` sem ancestral posicionado (o texto `sr-only` das caixas de seleção da
                tabela) se posicionava pelo DOCUMENTO, escapava da rolagem do `main` e esticava a janela: o casco subia e sobrava
                uma faixa branca abaixo do rodapé. Com o `main` posicionado, ele rola e é recortado aqui dentro. */}
            <main className="relative flex-1 overflow-y-auto p-4 md:p-8">
              <CabecalhoDeImpressao ente={enteDoPapel} rotuloDoAmbiente={tela.rotuloDoAmbiente} />
              {children}
            </main>
            <Footer identidade={tela} />
          </div>
        </div>
      </ShellProvider>
    </UiContextProvider>
  );
}
