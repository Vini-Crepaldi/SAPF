// GET /api/pedidos/[id]/preview — monta tudo o que a tela de conferência
// precisa. Só faz LEITURA: nada é gravado no Tiny aqui.

import { obterPedidoCompleto } from '@/lib/integrations/shopify';
import { classificarPedido, extrairCnpj } from '@/lib/fiscal/classificacao';
import { montarNotaAtacado, totalDaNota } from '@/lib/fiscal/montarNota';
import { registrarPreview, jaProcessado } from '@/lib/db';
import { erroJson, paraGid } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {

  const { id } = await params;

  try {
    // 1. Pedido completo — a leitura pagina até o fim; item faltando é erro grave.
    const pedido = await obterPedidoCompleto(id);
    const classificacao = await classificarPedido(pedido);
    const { cnpj, origem } = extrairCnpj(pedido);

    const alertas = [];
    if (classificacao === 'outro') {
      alertas.push(
        'Este pedido não foi identificado como atacado nem franquia (nenhum CNPJ encontrado). ' +
          'Confira o cadastro no Shopify antes de continuar.'
      );
    }

    // 2. Nota montada a partir do pedido.
    const { payload, alertas: alertasNota } = montarNotaAtacado(pedido, classificacao);
    alertas.push(...alertasNota);

    // 3. Já existe rascunho para este pedido?
    const processado = await jaProcessado(paraGid(id));
    if (processado.processado) {
      alertas.push(
        `Este pedido já gerou o rascunho ${processado.tinyNotaId} no Tiny. ` +
          'Criar outro geraria nota duplicada.'
      );
    }

    async function fetchOrderMetafields(orderId) {
      const STORE = process.env.SHOPIFY_STORE_DOMAIN;
      const TOKEN = process.env.SHOPIFY_API_TOKEN;

      const res = await fetch(
        `https://${STORE}/admin/api/2026-07/orders/${orderId}/metafields.json`,
        {
          headers: { "X-Shopify-Access-Token": TOKEN || "" },
          cache: "no-store",
        },
      );

      if (!res.ok) return [];
      const data = await res.json();
      return data.metafields ?? [];
    }

    const metafields = await fetchOrderMetafields(id);
    const noteAttributes = pedido.noteAttributes ?? [];

    const getMetafield = (key) =>
      metafields.find((m) => m.namespace === "custom" && m.key === key)?.value ??
      noteAttributes.find((attr) => attr.key === key)?.value ??
      "";

    const metodoPagamento = getMetafield("metodo_pagamento") || "Não informado";
    const volumePedido = getMetafield("volume_pedido") || "Não informado";

    // 4. Histórico (não bloqueia se o Supabase não estiver configurado).
    const registro = await registrarPreview({
      orderId: pedido.id,
      orderName: pedido.name,
      classificacao,
      payload,
    });
    if (!registro.ok) {
      console.error(`[preview] Falha ao registrar o preview do pedido ${pedido.id} no Supabase:`, registro.erro);
    }

    return Response.json({
      pedido: {
        id: pedido.id,
        name: pedido.name,
        createdAt: pedido.createdAt,
        note: pedido.note,
        cliente: pedido.customer,
        billingAddress: pedido.billingAddress,
        shippingAddress: pedido.shippingAddress,
        descontos: pedido.discountApplications?.nodes ?? [],
        itens: pedido.lineItems,
        totalItens: pedido.lineItems.length,
        paginasLidas: pedido.paginasLidas,
        valorFrete: Number(pedido.currentShippingPriceSet?.shopMoney?.amount ?? 0),
        cnpj,
        origemCnpj: origem,
        metodoPagamento: metodoPagamento,
        volumePedido: volumePedido

      },
      classificacao,
      payload,
      totalNota: totalDaNota(payload),
      alertas,
      jaProcessado: processado.processado,
      tinyNotaId: processado.tinyNotaId ?? null,
    });
  } catch (erro) {
    return erroJson(`Não foi possível montar o preview do pedido ${id}: ${erro.message}`);
  }
}
