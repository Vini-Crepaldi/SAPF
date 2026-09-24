// POST /api/transferencias/[id]/rascunho — cria o rascunho da nota de
// transferência no Tiny.
//
// ESTE ENDPOINT ESCREVE EM PRODUÇÃO. Mesmas travas do rascunho de pedido:
// exige `confirmacaoTeste: true` e nunca cria dois rascunhos para a mesma
// transferência. Diferente do pedido, o payload NÃO vem do navegador: a tela
// de transferências não edita a nota, então ela é remontada aqui a partir do
// Shopify e do cadastro de lojas — o que vai para o Tiny é o que o preview mostrou.

import { incluirNotaRascunho, obterNota } from '@/lib/integrations/tiny';
import { obterTransferenciaCompleta, paraGidTransferencia } from '@/lib/integrations/shopifyTransferencias';
import { montarNotaTransferencia } from '@/lib/fiscal/montarNotaTransferencia';
import { lojasFiscaisPorLocal, registrarErro, registrarRascunhoCriado, statusPorPedido } from '@/lib/db';
import { erroJson } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CLASSIFICACAO = 'transferencia';

export async function POST(request, { params }) {
  const { id } = await params;
  const gid = paraGidTransferencia(id);

  let corpo;
  try {
    corpo = await request.json();
  } catch {
    return erroJson('Corpo da requisição inválido: era esperado um JSON.', 400);
  }

  if (corpo?.confirmacaoTeste !== true) {
    return erroJson(
      'Confirmação ausente: criar o rascunho grava uma nota real no Tiny de produção.',
      400
    );
  }

  // Trava contra duplicidade — vale também para nota emitida fora do sistema.
  const situacao = (await statusPorPedido([gid]))[gid];
  if (situacao?.status === 'rascunho_criado') {
    return erroJson(`Esta transferência já tem o rascunho ${situacao.tiny_nota_id} no Tiny.`, 409, {
      tinyNotaId: situacao.tiny_nota_id,
    });
  }
  if (situacao?.nota_emitida) {
    return erroJson(
      `Esta transferência já está marcada como emitida${situacao.numero_nf ? ` (NF ${situacao.numero_nf})` : ''}.`,
      409
    );
  }

  let transferencia, payload;
  try {
    transferencia = await obterTransferenciaCompleta(id);
    const origemId = transferencia.origin?.location?.id ?? null;
    const destinoId = transferencia.destination?.location?.id ?? null;
    const cadastro = await lojasFiscaisPorLocal([origemId, destinoId]);
    if (!cadastro.ok) return erroJson(`Não foi possível ler o cadastro de lojas: ${cadastro.erro}`, 502);
    if (!cadastro.lojas[destinoId]) {
      return erroJson(
        `A loja de destino "${transferencia.destination?.name}" não está cadastrada em lojas_fiscais — ` +
          'sem CNPJ do destinatário o Tiny recusa a nota.',
        422
      );
    }
    ({ payload } = montarNotaTransferencia(transferencia, {
      origem: cadastro.lojas[origemId] ?? null,
      destino: cadastro.lojas[destinoId],
    }));
  } catch (erro) {
    return erroJson(`Não foi possível montar a nota: ${erro.message}`, 502);
  }

  if (!payload.nota_fiscal.itens.length) {
    return erroJson('Transferência sem itens — nada para enviar ao Tiny.', 400);
  }

  try {
    const { idNota, retorno } = await incluirNotaRascunho(payload);
    const confirmacao = idNota ? await obterNota(idNota).catch((erro) => ({ aviso: erro.message })) : null;

    const registro = await registrarRascunhoCriado({
      orderId: gid,
      orderName: transferencia.name,
      classificacao: CLASSIFICACAO,
      payload,
      tinyNotaId: idNota,
      respostaTiny: retorno,
    });
    if (!registro.ok) {
      console.error(`[transferencia] Nota ${idNota} criada no Tiny, mas falhou ao registrar no Supabase:`, registro.erro);
    }

    return Response.json({
      ok: true,
      tinyNotaId: idNota,
      confirmacao,
      mensagem: `Rascunho ${idNota ?? ''} criado no Tiny para a transferência ${transferencia.name}.`,
    });
  } catch (erro) {
    console.error(`[transferencia] Tiny recusou a inclusão da transferência ${gid}:`, erro);
    await registrarErro({
      orderId: gid,
      orderName: transferencia.name,
      classificacao: CLASSIFICACAO,
      payload,
      mensagem: erro.message,
    });
    return erroJson(`O Tiny recusou a inclusão da nota: ${erro.message}`, 502);
  }
}
