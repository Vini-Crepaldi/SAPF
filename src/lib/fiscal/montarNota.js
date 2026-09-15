// montarNota.js — transforma um pedido do Shopify no JSON que o endpoint
// nota.fiscal.incluir do Tiny espera.
//
// Esta função é pura de propósito: entra um pedido, sai um objeto. Nenhuma
// chamada de rede, nenhum process.env além da natureza da operação. Assim dá
// para testar a transformação sozinha, com exemplos/pedido-exemplo.json.

import { dataBr, separarLogradouro, somenteDigitos, valorMonetario } from '../utils.js';
import { extrairCnpj } from './classificacao.js';

/**
 * @param {object} pedidoShopify pedido já completo (com todos os lineItems)
 * @param {"atacado"|"franquia"} classificacao
 * @returns {{ payload: object, alertas: string[] }}
 */

const DESCONTO_ATACADO = 0.5;
const DESCONTO_FRANQUIA = 0.5454;

/**
 * O checkout desta loja grava o endereço já separado em campos (rua, número,
 * complemento, bairro, cidade, UF) como customAttributes, com chaves em
 * inglês: `${prefixo}_street_name`, `_street_number`, `_street_complement`,
 * `_neighborhood`, `_city`, `_province` — confirmado direto em pedidos reais.
 * Isso é mais confiável que separar `address1` na unha, e é a única fonte de
 * bairro (o Shopify não tem esse campo estruturado). Devolve null quando o
 * pedido não tem esses atributos (pedidos antigos, ou o outro lado do
 * endereço) — nesse caso quem chama cai para `separarLogradouro`.
 */
function enderecoDosAtributos(customAttributes, prefixo) {
  const mapa = Object.fromEntries((customAttributes ?? []).map((a) => [a.key, a.value ?? '']));
  const logradouro = mapa[`${prefixo}_street_name`];
  if (!logradouro) return null;
  return {
    logradouro,
    numero: mapa[`${prefixo}_street_number`] ?? '',
    complemento: mapa[`${prefixo}_street_complement`] ?? '',
    bairro: mapa[`${prefixo}_neighborhood`] ?? '',
    cidade: mapa[`${prefixo}_city`] ?? '',
    uf: mapa[`${prefixo}_province`] ?? '',
  };
}

export function montarNotaAtacado(pedidoShopify, classificacao) {
  const alertas = [];

  if (classificacao === 'atacado') {
    alertas.push(`Desconto adicional de ${DESCONTO_ATACADO * 100}% aplicado nos itens por ser atacado.`);
  }else if (classificacao === 'franquia') {
    alertas.push(`Desconto adicional de ${DESCONTO_FRANQUIA * 100}% aplicado nos itens por ser franquia.`);
  }

  const usaCobranca = !!pedidoShopify.billingAddress;
  const endereco = pedidoShopify.billingAddress ?? pedidoShopify.shippingAddress ?? {};
  if (!usaCobranca && pedidoShopify.shippingAddress) {
    alertas.push('Pedido sem endereço de cobrança — usando o endereço de entrega. Confira antes de emitir.');
  }

  const atributosEndereco = enderecoDosAtributos(
    pedidoShopify.customAttributes,
    usaCobranca ? 'billing' : 'shipping'
  );

  let logradouro, numero, bairro, complemento, cidade, uf;
  if (atributosEndereco) {
    ({ logradouro, numero, bairro, complemento, cidade, uf } = atributosEndereco);
    if (!numero) {
      alertas.push('Número do endereço veio em branco nos dados do checkout. Preencha o campo à mão.');
    }
  } else {
    ({ logradouro, numero } = separarLogradouro(endereco.address1));
    bairro = '';
    complemento = endereco.address2 ?? '';
    cidade = endereco.city ?? '';
    uf = endereco.provinceCode ?? '';
    if (logradouro && !numero) {
      alertas.push(`Não foi possível separar o número de "${endereco.address1}". Preencha o campo à mão.`);
    }
  }

  const { cnpj } = extrairCnpj(pedidoShopify); // isso aqui não é aqui nao ein
  if (!cnpj) {
    alertas.push('CNPJ não localizado no pedido. A nota não pode ser criada sem ele.');
  }
  const itens = (pedidoShopify.lineItems ?? []).map((linha) => {
    if (!linha.sku) {
      alertas.push(`Item "${linha.title}" está sem SKU no Shopify.`);
    }


    let valorUnitario; 
    switch (classificacao) {
      case 'atacado':
        valorUnitario = Number(linha.originalUnitPriceSet?.shopMoney?.amount ?? 0) * (1 - DESCONTO_ATACADO );
        break;
      case 'franquia':
        valorUnitario = Number(linha.originalUnitPriceSet?.shopMoney?.amount ?? 0) * (1 - DESCONTO_FRANQUIA);
        break;

      default:
        valorUnitario = Number(linha.originalUnitPriceSet?.shopMoney?.amount ?? 0);  
    } 

    return {
      item: {
        codigo: linha.sku ?? '',
        descricao: linha.title ?? '',
        unidade: 'UN',
        quantidade: Number(linha.quantity ?? 0),
        valor_unitario: valorMonetario(valorUnitario),
        tipo: 'P',
        gtin_ean: 'SEM GTIN',
        gtin_ean_embalagem: 'SEM GTIN',
      },
    };
  });

  if (itens.length === 0) {
    alertas.push('Pedido sem itens. Verifique se a leitura do Shopify foi completa.');
  }

  const payload =
   {

    nota_fiscal: 
    {
      tipo: 'S', // S = saída
      natureza_operacao: `Venda para contribuinte`,
      frete_por_conta: 'D',
      data_emissao: dataBr(pedidoShopify.createdAt),
      numero_pedido_ecommerce: String(pedidoShopify.name ?? '').replace('#', ''),
      obs: `Pedido vindo do Shopify: ${String(pedidoShopify.name ?? '').replace('#', '')}`,
      cliente: 
      {
        nome: pedidoShopify.customer?.displayName ?? endereco.company ?? '',
        tipo_pessoa: 'J', 
        cpf_cnpj: cnpj,
        endereco: logradouro,
        numero: numero,
        complemento: complemento,
        bairro: bairro,
        cep: somenteDigitos(endereco.zip),
        cidade: cidade,
        uf: uf,
        pais: 'BRASIL',
        atualizar_cliente: 'N',
      },

      itens,
    },
  };

  return { payload, alertas };
}

/** Soma dos itens da nota, para conferência visual na tela do rascunho. */
export function totalDaNota(payload) {
  const itens = payload?.nota_fiscal?.itens ?? [];
  const total = itens.reduce(
    (soma, i) => soma + Number(i.item.valor_unitario) * Number(i.item.quantidade),
    0
  );
  return Number(total.toFixed(2));
}
