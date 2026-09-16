// transporte.js — o bloco de transporte da nota, que hoje é sempre o mesmo:
// Correios, Sedex Contrato AG.
//
// Os nomes dos campos e os códigos vêm da documentação da API 2.0
// (nota.fiscal.incluir + tabela de forma de envio):
//
//   - `forma_envio`  'C' = Correios (tabela de forma de envio do Tiny).
//   - `forma_frete`  serviço contratado. A doc só diz "de acordo com o
//     cadastro na Olist", e o cadastro guarda o RÓTULO INTEIRO, com o código
//     entre parênteses — mandar só "03220" cai como "Não definida" na nota.
//     O valor abaixo foi lido de um pedido real desta conta
//     (pedido.obter.php devolve forma_envio/forma_frete; nota.fiscal.obter
//     não devolve nenhum dos dois, então é por lá que se confere).
//   - `transportador` só leva o nome de propósito: CNPJ, IE e endereço saem do
//     cadastro dos Correios dentro do Tiny. Mandar esses campos aqui
//     sobrescreveria o cadastro com dados nossos, que podem estar velhos. O
//     nome tem que bater LETRA POR LETRA com o cadastro, senão o Tiny não
//     encontra a transportadora — por isso a razão social inteira, em caixa
//     alta e sem acento, exatamente como está lá.
//   - `frete_por_conta` fica no montarNota.js, junto do resto da nota, porque
//     é dado da operação (quem paga) e não da transportadora.

/** Transportadora e serviço usados em toda nota de atacado/franquia hoje. */
export const TRANSPORTE_PADRAO = {
  forma_envio: 'C',
  forma_frete: 'SEDEX CONTRATO AG (03220)',
  transportador: { nome: 'EMPRESA BRASILEIRA DE CORREIOS E TELEGRAFOS' },
};

/** Rótulos para a tela de conferência — o que a pessoa vê tem que ser o que vai. */
export const ROTULO_TRANSPORTADORA = TRANSPORTE_PADRAO.transportador.nome;
export const ROTULO_FORMA_FRETE = TRANSPORTE_PADRAO.forma_frete;

/**
 * A quantidade de volumes vem do metafield `volume_pedido` do Shopify, que é
 * texto livre: pode chegar "3", "3 volumes" ou o nosso "Não informado". Pega o
 * primeiro número inteiro positivo; devolve null quando não dá para ler, para
 * quem chama avisar em vez de chutar.
 */
export function quantidadeDeVolumes(valor) {
  const numero = parseInt(String(valor ?? '').match(/\d+/)?.[0] ?? '', 10);
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}
