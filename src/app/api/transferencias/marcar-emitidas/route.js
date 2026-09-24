// POST /api/transferencias/marcar-emitidas — "Marcar todas como emitidas".
//
// Para o histórico de transferências cujas notas foram emitidas antes deste
// sistema existir. Não chama o Tiny. Transferências com rascunho aberto no
// Tiny ficam de fora de propósito: marcá-las esconderia uma nota que ainda
// precisa ser emitida (ou cancelada) lá.

import { paraGidTransferencia } from '@/lib/integrations/shopifyTransferencias';
import { registrarNumeroNf, statusPorPedido } from '@/lib/db';
import { erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroJson('Corpo da requisição inválido: era esperado um JSON.', 400);
  }

  const itens = Array.isArray(corpo?.transferencias) ? corpo.transferencias : [];
  if (corpo?.confirmacao !== true || itens.length === 0) {
    return erroJson('Nada a marcar, ou confirmação ausente.', 400);
  }

  const gids = itens.map((t) => paraGidTransferencia(t.id));
  const situacoes = await statusPorPedido(gids);

  const marcadas = [];
  const ignoradas = [];
  for (const [indice, gid] of gids.entries()) {
    const situacao = situacoes[gid];
    if (situacao?.nota_emitida) continue;
    if (situacao?.status === 'rascunho_criado') {
      ignoradas.push(itens[indice].nome ?? gid);
      continue;
    }
    const registro = await registrarNumeroNf({
      orderId: gid,
      orderName: String(itens[indice].nome ?? ''),
      classificacao: 'transferencia',
    });
    if (!registro.ok) return erroJson(`Falhou em ${itens[indice].nome ?? gid}: ${registro.erro}`, 502, { marcadas });
    marcadas.push(itens[indice].id);
  }

  return Response.json({ ok: true, marcadas, ignoradas });
}
