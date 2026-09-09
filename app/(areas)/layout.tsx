import { cookies } from "next/headers";
import { Footer } from "../../components/ui/Footer";
import { Header } from "../../components/ui/Header";
import { Sidebar } from "../../components/ui/Sidebar";
import { carregarContextoDoUsuario } from "../../lib/portas/contexto";
import { exigirSessao } from "../../lib/portas/sessao";
import { UiContextProvider } from "../../lib/ui-context";
import { sairAction } from "./actions";

/**
 * O SHELL AUTENTICADO — este layout é a FRONTEIRA de sessão. Todo `/(areas)/**` passa por aqui, e
 * `exigirSessao()` REDIRECIONA para /login se não houver sessão válida (request-scoped, Prisma pela
 * borda). O usuário real vai para o rodapé da sidebar (fim do mock "Não autenticado" do UI-0).
 *
 * ⚠️ O ESTADO COLAPSADO DA SIDEBAR VEM DO COOKIE (sem flash — o primeiro HTML já sai certo).
 */
export default async function AreasLayout({
  children,
}: {
  readonly children: React.ReactNode;
}): Promise<React.ReactElement> {
  const ident = await exigirSessao();
  const colapsada = (await cookies()).get("sidebar_colapsada")?.value === "1";
  // ⚠️ LIDO NO SERVIDOR, injetado por PROPS. O provider é client e só guarda a SELEÇÃO — quem
  // decide QUAIS unidades ele pode oferecer é a porta, contra as permissões reais do usuário.
  const contexto = await carregarContextoDoUsuario();

  return (
    <UiContextProvider
      exercicios={contexto.exercicios}
      ugs={contexto.ugs}
      podeConsolidado={contexto.podeConsolidado}
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar colapsadaInicial={colapsada} usuario={ident.identificador} sairAction={sairAction} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-y-auto p-8">{children}</main>
          <Footer />
        </div>
      </div>
    </UiContextProvider>
  );
}
