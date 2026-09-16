// inscricaoEstadual.js — acha a inscrição estadual (IE) do cliente dentro do
// pedido do Shopify.
//
// Diferente do CNPJ, a IE não tem campo nenhum no checkout: quem atende
// escreve à mão na observação do pedido (`note`). Os formatos encontrados em
// pedidos reais desta loja são todos variações de rótulo + número:
//
//   "CNPJ:40.400.311/0001-62\nIE:54822700"
//   "CNPJ: 54846201/0001-33\nIE: 201424274"
//   "Inscrição Estadual (IE):205871801\nCNPJ:43.628.138/0001-42"
//   "CNPJ:41.608.371/0001-38\n\nIE:\t225.376.567.113"
//
// Só lemos o que vem com rótulo. A mesma observação também é usada para
// recados de separação e valor de frete ("Frete Sedex 31,27"), então pescar
// "o primeiro número da nota" traria lixo para dentro da nota fiscal — na
// dúvida devolvemos vazio e a pessoa preenche o campo na tela do rascunho.

import { somenteDigitos } from '../utils.js';

// O rótulo pode vir como "IE", "I.E.", "Inscrição/Inscricao Estadual" ou
// "Inscrição Estadual (IE)" — neste último o casamento acontece no "IE" de
// dentro dos parênteses, porque os parênteses não são separador válido.
// Depois do rótulo aceitamos qualquer pontuação/espaço (":", "-", tab) até o
// número, que pode vir com ponto, barra ou hífen. "ISENTO" é resposta válida
// para quem não tem IE.
const PADRAO_IE = /(?:inscri[cç][aã]o\s+estadual|\bi\.?\s?e\.?)[^0-9A-Za-z\n]*(\d[\d.\/-]*|isent[oa])/i;

function lerIe(texto) {
  const achado = String(texto ?? '').match(PADRAO_IE);
  if (!achado) return '';

  const valor = achado[1];
  if (/^isent/i.test(valor)) return 'ISENTO';

  // Mesma normalização do CNPJ e do CEP: o Tiny recebe só dígitos.
  return somenteDigitos(valor);
}

/**
 * @param {object} pedido pedido do Shopify
 * @returns {{ ie: string, origem: string|null }} ie vazia quando não achamos
 */
export function extrairIe(pedido) {
  if (!pedido) return { ie: '', origem: null };

  // 1. customAttributes, caso algum dia o checkout passe a mandar a IE pronta.
  for (const attr of pedido?.customAttributes ?? []) {
    if (/^(ie|inscricao_estadual|inscrição_estadual|state_registration)$/i.test(attr.key ?? '')) {
      const ie = lerIe(`IE:${attr.value ?? ''}`);
      if (ie) return { ie, origem: `customAttributes.${attr.key}` };
    }
  }

  // 2. Observação do pedido — é onde a IE realmente está hoje.
  const ie = lerIe(pedido?.note);
  if (ie) return { ie, origem: 'note' };

  return { ie: '', origem: null };
}
