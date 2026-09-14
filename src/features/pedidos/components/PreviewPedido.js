// /pedidos/[id] — conferência da nota antes de gravar no Tiny.
//
// A tela toda é feita para uma coisa: deixar a pessoa ver o que vai ser enviado
// e corrigir o que estiver errado. Quem grava a nota é a tela seguinte
// (/pedidos/[id]/rascunho) — aqui só se revisa e edita.

'use client';

import Paginacao from '@/components/ui/Paginacao';
import { CAMPOS_CLIENTE } from '@/lib/fiscal/camposCliente';
import { formatarMoeda } from '@/lib/format';
import { usePreviewPedido } from '../hooks/usePreviewPedido';

// Só para o texto explicativo na tela — o desconto em si é aplicado no
// backend (lib/fiscal/montarNota.js::DESCONTO_ATACADO). Mantenha os dois iguais.
const DESCONTO_ATACADO_PCT = 50;

export default function PreviewPedido({ params }) {
  const { id } = params;

  const {
    dados,
    erro,
    cliente,
    pagina,
    setPagina,
    totalPaginas,
    itensDaPagina,
    atualizarCampo,
    irParaInclusao,
  } = usePreviewPedido(id);

  if (erro && !dados) {
    return (
      <div className="aviso">
        <strong>Não foi possível abrir este pedido.</strong>
        <p>{erro}</p>
        <p>
          <a href="/pedidos">Voltar para a lista</a>
        </p>
      </div>
    );
  }

  if (!dados) return <p className="fraco">Lendo o pedido e validando os SKUs no Tiny…</p>;

  return (
    <>
      <h2>
        Pedido {dados.pedido.name}{' '}
        <span className={`marca marca-${dados.classificacao}`}>{dados.classificacao}</span>
      </h2>
      <p className="fraco">
        {dados.pedido.totalItens} itens lidos em {dados.pedido.paginasLidas} página(s).
        {dados.pedido.origemCnpj && ` CNPJ encontrado em ${dados.pedido.origemCnpj}.`}
      </p>

      {dados.alertas.length > 0 && (
        <div className="aviso">
          <strong>Confira antes de continuar</strong>
          <ul>
            {dados.alertas.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      <h3>Dados do cliente na nota</h3>
      <p className="fraco">
        Os campos vêm do Shopify e podem ser corrigidos aqui. A correção vale só para esta nota — o
        cadastro do Shopify não é alterado.
      </p>
      <div className="cartao campos">
        {CAMPOS_CLIENTE.map(([campo, rotulo]) => (
          <div key={campo}>
            <label htmlFor={campo}>{rotulo}</label>
            <input
              id={campo}
              value={cliente?.[campo] ?? ''}
              onChange={(e) => atualizarCampo(campo, e.target.value)}
            />
          </div>
        ))}
      </div>

      <h3>Itens da nota</h3>
      <p className="fraco">
        "Valor na nota" é o valor unitário que realmente vai para o Tiny — já com o desconto do
        Shopify e, se o pedido for atacado, com o desconto adicional de {DESCONTO_ATACADO_PCT}%.
      </p>

      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Descrição</th>
            <th className="num">Qtd.</th>
            <th className="num">Preço original</th>
            <th className="num">Valor na nota</th>
            <th className="num">Total da linha</th>
          </tr>
        </thead>
        <tbody>
          {itensDaPagina.map((item, i) => (
            <tr key={`${item.sku}-${i}`}>
              <td className="mono">{item.sku || '— sem SKU —'}</td>
              <td>{item.title}</td>
              <td className="num">{item.quantity}</td>
              <td className="num">{formatarMoeda(item.originalUnitPriceSet?.shopMoney?.amount)}</td>
              <td className="num">{formatarMoeda(item.valorNaNota)}</td>
              <td className="num">{formatarMoeda(item.valorNaNota * item.quantity)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <Paginacao pagina={pagina} totalPaginas={totalPaginas} aoMudarPagina={setPagina} />

      <p style={{ marginTop: '1rem' }}>
        <strong>Total da nota: {formatarMoeda(dados.totalNota)}</strong>
      </p>


      <p>
        <strong> Frete: {formatarMoeda(dados.pedido.valorFrete)}</strong>
      </p>

      <p style={{ marginTop: '1rem' }}>
        <strong> Metodo de Pagamento: {dados.pedido.metodoPagamento}</strong>
      </p>
      <p style={{ marginTop: '1rem' }}>
        <weak> Quantidade de Volumes: {dados.pedido.volumePedido}</weak>
      </p>

      <p style={{ marginTop: '1.5rem' }}>      
        {dados.jaProcessado ? (
          <span className="fraco">Este pedido já tem rascunho {dados.tinyNotaId} no Tiny.</span>
        ) : (
          <a href={`/pedidos/${id}/rascunho`} onClick={irParaInclusao}>
            Prosseguir para inclusão do rascunho →
          </a>
        )}
      </p>

      <p style={{ marginTop: '2rem' }}>
        <a href="/pedidos">Voltar para a lista</a>
      </p>
    </>
  );
}
