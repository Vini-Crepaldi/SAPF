// Entrada de rota da edição do rascunho de uma transferência — mesma tela da
// edição de pedido, apontada para a API de transferências.

import EditarRascunho from '@/features/rascunhos/components/EditarRascunho';

export default function Pagina({ params }) {
  return <EditarRascunho params={params} tipo="transferencia" />;
}
