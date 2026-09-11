'use client';

/** Paginação simples (anterior/próxima) usada nas tabelas de itens. */
export default function Paginacao({ pagina, totalPaginas, aoMudarPagina }) {
  if (totalPaginas <= 1) return null;

  return (
    <div className="paginacao">
      <button
        className="secundario"
        onClick={() => aoMudarPagina(Math.max(1, pagina - 1))}
        disabled={pagina === 1}
      >
        Anterior
      </button>
      <span>
        Página {pagina} de {totalPaginas}
      </span>
      <button
        className="secundario"
        onClick={() => aoMudarPagina(Math.min(totalPaginas, pagina + 1))}
        disabled={pagina === totalPaginas}
      >
        Próxima
      </button>
    </div>
  );
}
