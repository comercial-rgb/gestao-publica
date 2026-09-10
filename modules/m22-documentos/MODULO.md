# M22 — Anexos e assinatura eletrônica

Seções 2.4 e 2.5 do prompt do ENT02. Capacidades transversais, entregues **em corte
vertical**: cada uma é consumida por um caso de uso real do produto (o processo digital
do M21) e coberta por teste que exercita esse consumo. Um serviço de anexos sem tela que
anexa não conta.

---

## 1. A autorização do anexo é a do registro dono. Nenhuma regra nova.

"Quem pode ver este arquivo?" não tem resposta no arquivo: tem resposta no **processo**,
no **comunicado** ou na **pessoa** a que ele pertence. Por isso `baixarAnexo` chama
`podeVerProcesso` (M21) em vez de reimplementar a regra.

Reimplementar criaria a segunda verdade sobre o acesso, e a divergência interessante é
sempre a mesma: **o processo sigiloso some da listagem e o anexo dele continua baixável
por quem tiver o link.**

O `t6` prova a ponta que importa: um usuário da mesma unidade gestora, lotado num setor
por onde o processo não passou, **não baixa** o anexo de um processo sigiloso.
O `t7` prova a outra: o setor de **origem** continua baixando depois de tramitar — quem
instruiu o processo tem de poder consultar o que instruiu.

### `null`, não exceção

`baixarAnexo` devolve `null` tanto para "não existe" quanto para "não pode". Distingui-los
transformaria a rota num oráculo: quem tentasse identificadores ao acaso descobriria
quais existem pela diferença entre as duas respostas.

---

## 2. O arquivo não mora em `public/`

O diretório default é `var/anexos` (fora do git, fora do build). Um arquivo em `public/`
é servido pelo Next **sem passar por autorização nenhuma** — quem tivesse a URL leria o
anexo de um processo sigiloso sem sequer estar logado.

| Defesa | Onde | Por quê |
|---|---|---|
| Nome no disco é o **id**, nunca o nome enviado | `caminhoDoAnexo` | `../../etc/passwd` como nome de arquivo é o path traversal clássico; e dois "documento.pdf" se sobrescreveriam |
| Caminho conferido **depois de resolvido** | `caminhoDoAnexo` | Montar com o id e confiar é o mesmo erro com um passo a mais |
| MIME e tamanho validados **no servidor** | `recusaDoArquivo` | O `accept` do input é conveniência de tela, e conveniência não protege |
| SHA-256 conferido **na entrega** | `lerArquivo` | Sem ele, "o arquivo é o mesmo" é afirmação sem prova — o `t8` troca o arquivo no disco e a leitura recusa |
| `Uint8Array` de verdade, não `Buffer` | `lerArquivo` | `Buffer` serializa como `{type:"Buffer",data:[...]}` no primeiro `JSON.stringify` e atravessaria a fronteira da UI com outra forma. A conversão é uma *view*: não copia bytes |

---

## 3. Exatamente um dono — e o grep que o schema não consegue dar

Quatro FKs anuláveis com a regra "uma e só uma" precisariam de um `CHECK`, que o Prisma
não gera. A regra é cobrada em **dois** lugares:

1. `zAnexar` — o caso de uso recusa zero donos e recusa dois (`t4`);
2. `t15` — um **grep** que varre o repositório e falha se alguém escrever
   `prisma.anexo.create()` fora de `anexarArquivo`.

O segundo existe pela mesma lição do funil do razão (M01) e do papel de runtime (ENT00):
**o caso de uso só protege quem passa por ele.** Um `create` avulso num seed ou num
script gravaria uma linha sem tipo validado, sem hash e sem arquivo no disco — e nada
acusaria.

---

## 4. Assinatura: os três modos da Lei 14.063/2020 não são intercambiáveis

| Modo | Estado | O que é |
|---|---|---|
| `SIMPLES` | funciona | identidade + instante + hash do conteúdo |
| `AVANCADA` | funciona | idem, com o rastro de autenticação do M16 por trás |
| `QUALIFICADA` | **indisponível, e o código recusa** | exige certificado ICP-Brasil e custódia de chave |

`estadoDaAssinaturaQualificada()` devolve `disponivel: false` **literal**, não `boolean`
— o mesmo desenho do envio ao banco do T07. Com o tipo assim, ninguém acrescenta um
`if (estado.disponivel) assinar()` sem antes apagar o tipo, e apagar um tipo é uma
decisão visível na revisão.

O `t9` prova as duas metades: a chamada é recusada com motivo explícito **e**
`assinaturaDeDocumento.count()` continua zero. Uma assinatura fabricada aparece na tela
exatamente como a verdadeira — é por isso que a recusa é do caso de uso.

> **Guardar a chave A1 no banco e chamar isso de HSM seria pior que não ter custódia:
> pareceria custódia.** Pendência declarada: `ASSINATURA-ICP-HSM`.

### O que se assina é o hash do conteúdo

Assinar "o documento 42" não prova nada: o documento 42 pode ter mudado. `hashConteudo`
guarda o SHA-256 do que a pessoa viu — e é isso que torna a assinatura **verificável em
separado**, sem confiar no banco (`t11`).

### A FK aponta da assinatura para o movimento, e não o contrário

A primeira versão do schema tinha `MovimentoDoProcesso.assinaturaId`. Estava errada por
um motivo concreto: assinar depois de criar o movimento exigiria **UPDATE numa tabela
append-only**, e o papel de runtime teria de ganhar esse privilégio. Pior — um `UPDATE`
pode **trocar** a assinatura de um movimento por outra; o `@unique` impede duas, não
impede a substituição.

Com a FK do outro lado, assinar é um `INSERT`. O movimento nunca é reescrito.

### A fila

`SignatarioDaFila.ordem` decide quem assina quando, e `assinarNaFila` **recusa quem fura
a fila** — sem isso, "fila" seria uma lista, e o terceiro signatário poderia assinar
antes do primeiro, invertendo a hierarquia que a fila existe para representar.

**Só o próximo é notificado.** Avisar todos de uma vez faria três pessoas abrirem o
documento e duas descobrirem que não era a vez delas — e da terceira vez elas param de
abrir.

---

## 5. Pendências declaradas

| Pendência | O que falta | Por quê |
|---|---|---|
| `ASSINATURA-ICP-HSM` | assinatura qualificada e custódia A1 | Sem provedor. O modo existe no enum como destino declarado; o caso de uso recusa produzi-lo. |
| `ANEXO-DIGITALIZACAO-CAMERA` | origem por scanner e por câmera | O enum `OrigemDoAnexo` já distingue os quatro casos e o servidor os aceita; falta a captura na tela, que depende do aplicativo (5.40). |
| ~~`ANEXO-DOWNLOAD-EM-LOTE`~~ | **RESOLVIDA no fecho do ENT02.** `consultas.ts` monta o zip com os arquivos que `baixarAnexo` entregaria um a um — a mesma pergunta ao mesmo registro dono, nunca uma consulta direta à tabela. O contêiner é `packages/zip`, sem dependência de terceiros. |
| `ANEXO-ARMAZENAMENTO-REMOTO` | armazenamento fora do disco local | Hoje é sistema de arquivos local, atrás de `ANEXOS_DIR`. A porta já está isolada em `armazenamento.ts` — trocá-la é substituir quatro funções. |

---

## 5b. A superfície, e por que ela chegou depois

O M22 fechou o ENT02 com caso de uso, autorização por registro, hash, conferência de
integridade e quinze testes — e com **zero consumidores**. `anexarArquivo` e `baixarAnexo`
eram chamados só pelo próprio arquivo de teste: não havia porta, não havia rota, e o único
`input[type=file]` do produto era o do importador de CSV.

Na prática o produto tinha **um cofre sem porta**. Nada entrava pela interface, e o que
entrasse por um script não sairia. "Documentos preservados na tramitação, com download
individual e em lote" era uma promessa que nenhuma tela cumpria — e a tela do processo
chegava a LISTAR o nome dos anexos de cada movimento, sem link nenhum, que é a forma mais
silenciosa de prometer sem entregar.

Três decisões da superfície valem registro:

**A saída é uma rota HTTP, não uma Server Action.** Server Action devolve JSON serializado
pelo protocolo do React; um PDF de 20 MB atravessaria como array de bytes e o browser não
teria como salvá-lo. O download é `Content-Type` + `Content-Disposition`, e o navegador faz
o resto.

**A porta de download usa `sessaoAtual`, não `exigirSessao`.** `exigirSessao` REDIRECIONA
para `/login` — o certo numa página e um desastre silencioso numa rota de arquivo: o browser
seguiria o 307, receberia o HTML do login e salvaria isso com o nome do PDF. Sem sessão a
porta devolve `null` e a rota responde **404** — a mesma resposta de "não existe", porque um
401 confirmaria a existência do anexo a quem varre identificadores.

**`attachment` + `nosniff`, e não é estética.** `inline` faria o browser RENDERIZAR o
arquivo na origem da aplicação: um "anexo" HTML ou SVG enviado por um requerente externo
viraria script rodando com o cookie de sessão de quem o abriu. O rol de MIMEs não aceita
esses tipos hoje — mas a defesa não pode depender de o rol nunca mudar.

## 6. Onde olhar

| Arquivo | O que é |
|---|---|
| `prisma/schema/m22-documentos.prisma` | os modelos, e o porquê de cada direção de FK |
| `armazenamento.ts` | disco: caminho, validação, hash, integridade. Sem Prisma |
| `anexos.ts` | anexar e baixar, com a autorização vinda do registro dono |
| `assinatura.ts` | os três modos, o hash do conteúdo e a fila ordenada |
| `consultas.ts` | a lista e o lote — as leituras, sob a regra do registro dono |
| `lib/portas/documentos.ts` | a porta: entrada pelo formulário, saída pela rota |
| `app/(areas)/documentos/` | o `input[type=file]`, a rota de download e a de lote |
| `packages/zip/` | o contêiner ZIP de N arquivos, compartilhado com o M14 |
| `m22-documentos.test.ts` | 21 testes contra banco e disco de verdade |
