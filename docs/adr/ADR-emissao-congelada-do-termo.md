# ADR — A emissão congelada do termo patrimonial, a posição atual e o termo assinado

**Situação:** aceita, 2026-09-13 (sessão noturna V4, seção 5; achado A06 da auditoria de 77cbcc9).

## Contexto

`termo-documento.ts` compunha o PDF na impressão com o nome do responsável, o valor contábil e
a localização ATUAIS sob a data do termo antigo. O rodapé avisava, mas o resultado não era uma
segunda via: era a posição de hoje associada ao termo. O termo assinado não tinha caminho pela
tela (`TERMO-ASSINADO-NAO-ANEXAVEL-PELA-TELA`), e o desenho deixava para um futuro upload a
responsabilidade de congelar a emissão.

## Decisão

1. **A emissão é composta e congelada na mesma transação que cria o termo.** `comporTermo`
   lê o acervo de agora a partir dos DADOS do termo (antes de a linha existir — o papel de
   runtime só insere nesta tabela) e o resultado é gravado em `TermoPatrimonial.emissao`
   (JSON), com `modeloDaEmissao` (`termo-patrimonial/1`), `emitidoEm` e `emissaoSha256`.
2. **O sha256 é do JSON CANÔNICO** (chaves ordenadas recursivamente, arrays na ordem em que
   vieram): o JSONB do Postgres reordena chaves ao gravar, e sem a canonização a leitura nunca
   bateria com a gravação. A integridade é conferida a cada leitura; emissão adulterada não
   vira segunda via (`EMISSÃO ADULTERADA`).
3. **A segunda via é a emissão.** `documentoDoTermo(via = "EMITIDO")` devolve o congelado. O
   bem mudou de sala, foi reavaliado, a pessoa mudou de nome: o documento emitido não muda.
4. **A posição patrimonial atual é OUTRO documento** (`via = "ATUAL"`, rota `?via=atual`):
   título próprio, data própria e a nota de que não é o termo nem uma segunda via.
5. **Termos anteriores à V4** (sem emissão) são compostos agora e marcados `SEM_EMISSAO`, com
   a nota dizendo isso; nunca fingem segunda via.
6. **O termo assinado é um `Anexo` do termo** (`Anexo.termoPatrimonialId`, escopo do ente),
   anexado pela aba de anexos do detalhe, listado com o sha256 e entregue conferido pelo M22.
7. **O recorte** (individual, setorial, por responsável) é dito no documento.
8. **A rota do PDF** responde `x-documento-via`, `x-documento-sha256` e `x-documento-modelo`;
   o percurso lê o TEXTO do PDF com o pdf.js (leitor independente do gerador) e confere o
   tombamento, o responsável e a declaração — não só o status e o tamanho.

## Consequências

- `emitirTermoPatrimonial` passa a exigir o nome do ente (`ente`), que encabeça a emissão.
- O modelo do documento é versionado pelo nome (`modeloDaEmissao`); mudar o modelo é criar
  `termo-patrimonial/2`, e as emissões antigas continuam legíveis com o modelo que usaram.
- Pendência `TERMO-ASSINADO-NAO-ANEXAVEL-PELA-TELA` fecha. Pendência nova:
  `ASSINATURA-QUALIFICADA-DO-TERMO` — o termo assinado é digitalização; a fila de assinatura
  do M22 sobre a emissão congelada é um passo seguinte.

## Provas

`modules/m10-patrimonial/m10-termo-documento.test.ts` (t4 segunda via estável e posição atual;
t5 adulteração recusada e termo antigo declarado; t6 recortes; t7 termo assinado anexado,
listado, entregue e dono único), `m22-documentos.test.ts`, `scripts/smoke-pacote2.ts` (o texto
do PDF emitido e da posição atual).
