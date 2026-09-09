# Fixtures da POC — importadores (M20)

⚠️ **DADOS SINTÉTICOS.** Nenhuma matrícula, nome, guia ou valor corresponde a pessoa, servidor
ou contribuinte real. São arquivos de demonstração do importador parametrizável (TR 7.10–7.11).

## `folha-poc-2026-11.csv`
5 servidores sintéticos, com INSS e ISS retidos na fonte. Colunas conforme o **mapa
`MAPA_FOLHA_POC`** (`modules/m20-importador/dominio.ts`): `matricula;nome;ficha;fonte;bruto;inss;iss`.

⚠️ **O layout é PARAMETRIZÁVEL.** Não existe layout oficial de folha do município — o arquivo é
insumo do ente. Trocar de folha é trocar o **mapa de colunas** (configuração), não o código. O mapa
oficial do ente é aplicado na implantação.

## `tributos-poc-2026-11.csv`
3 guias de arrecadação. Colunas conforme `MAPA_TRIBUTOS_POC`: `guia;natureza;fonte;co;valor;data`.
Aceita data em `dd/mm/aaaa` ou `aaaa-mm-dd`, e valor em formato BR (`1.500,00`) ou simples.
