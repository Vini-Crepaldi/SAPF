/** Cabeçalho fixo do app: marca e navegação principal. */
export default function SiteHeader() {
  return (
    <header className="topo">
      <div className="marca-app">
        <span className="marca-app-icone" aria-hidden="true" />
        <h1>Notas de atacado</h1>
      </div>
      <nav>
        <a href="/">Início</a>
        <a href="/pedidos">Pedidos</a>
        <a href="/rascunhos">Rascunhos</a>
      </nav>
    </header>
  );
}
