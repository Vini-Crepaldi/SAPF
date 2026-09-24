// GET /api/transferencias/[id]/preview — itens da transferência e a nota que
// iria para o Tiny. Só LEITURA: não grava nada, nem no Supabase.

import { obterTransferenciaCompleta, paraGidTransferencia } from '@/lib/integrations/shopifyTransferencias';
import { montarNotaTransferencia } from '@/lib/fiscal/montarNotaTransferencia';
import { totalDaNota } from '@/lib/fiscal/montarNota';
import { jaProcessado, lojasFiscaisPorLocal } from '@/lib/db';
import { erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const { id } = await params;

  try {
    const transferencia = await obterTransferenciaCompleta(id);
    const origemId = transferencia.origin?.location?.id ?? null;
    const destinoId = transferencia.destination?.location?.id ?? null;

    const cadastro = await lojasFiscaisPorLocal([origemId, destinoId]);
    const alertas = [];
    if (!cadastro.ok) {
      alertas.push(`Não foi possível ler o cadastro fiscal das lojas no Supabase: ${cadastro.erro}`);
    }

    const { payload, alertas: alertasNota } = montarNotaTransferencia(transferencia, {
      origem: cadastro.lojas[origemId] ?? null,
      destino: cadastro.lojas[destinoId] ?? null,
    });
    alertas.push(...alertasNota);

    if (transferencia.status === 'DRAFT') {
      alertas.push('Esta transferência ainda é rascunho no Shopify — os itens podem mudar.');
    }
    if (transferencia.status === 'CANCELED') {
      alertas.push('Esta transferência foi cancelada no Shopify.');
    }

    const processado = await jaProcessado(paraGidTransferencia(id));
    if (processado.processado) {
      alertas.push(`Esta transferência já gerou o rascunho ${processado.tinyNotaId} no Tiny.`);
    }

    return Response.json({
      transferencia: {
        id: transferencia.id,
        name: transferencia.name,
        status: transferencia.status,
        origem: transferencia.origin?.name,
        destino: transferencia.destination?.name,
        destinoId,
      },
      // Regras de preço da loja de destino, para a tela explicar de onde veio o valor.
      regrasDestino: cadastro.lojas[destinoId]
        ? {
            baseValor: cadastro.lojas[destinoId].base_valor ?? 'custo',
            descontoPercentual: Number(cadastro.lojas[destinoId].desconto_percentual ?? 0),
          }
        : null,
      payload,
      totalNota: totalDaNota(payload),
      alertas,
      // Sem cadastro do destino a nota vai sem CNPJ — o Tiny recusaria.
      podeCriar: !!cadastro.lojas[destinoId] && payload.nota_fiscal.itens.length > 0,
      jaProcessado: processado.processado,
      tinyNotaId: processado.tinyNotaId ?? null,
    });
  } catch (erro) {
    return erroJson(`Não foi possível montar a nota da transferência ${id}: ${erro.message}`);
  }
}
