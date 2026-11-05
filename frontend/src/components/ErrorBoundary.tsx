import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: Error) { console.error("Page error:", error.message); }
  componentDidUpdate(prevProps: { resetKey?: string }) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="wrap section narrow" role="alert">
        <h1>Something went wrong</h1>
        <p>This page hit an unexpected error. Reload the page; if it keeps happening, restart the app with stop_project.bat and run_project.bat.</p>
        <button className="btn primary" onClick={() => window.location.reload()}>Reload page</button>
      </section>
    );
  }
}
