// POST /api/transferencias/[id]/numero-nf — grava à mão o número da NF de uma
// transferência cuja nota foi emitida fora deste sistema. Não chama o Tiny:
// só marca a transferência como emitida no Supabase, para sair da lista de
// pendentes.

import { paraGidTransferencia } from '@/lib/integrations/shopifyTransferencias';
import { registrarNumeroNf } from '@/lib/db';
import { erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const { id } = await params;

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroJson('Corpo da requisição inválido: era esperado um JSON.', 400);
  }

  const numeroNf = String(corpo?.numeroNf ?? '').trim();
  if (!/^\d{1,9}$/.test(numeroNf)) {
    return erroJson('Número da NF inválido: use só dígitos (até 9).', 400);
  }

  const registro = await registrarNumeroNf({
    orderId: paraGidTransferencia(id),
    orderName: String(corpo?.nome ?? ''),
    classificacao: 'transferencia',
    numeroNf,
  });
  if (!registro.ok) return erroJson(`Não foi possível salvar o número: ${registro.erro}`, 502);

  return Response.json({ ok: true, numeroNf });
}
