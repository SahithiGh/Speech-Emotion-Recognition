import { Link } from "react-router-dom";
import { usePageMeta } from "../meta";

export default function NotFound() {
  usePageMeta("Page not found", "The page you asked for does not exist.", "/404");
  return (
    <section className="wrap section narrow">
      <p className="eyebrow">Error 404</p>
      <h1>Page not found</h1>
      <p>The address you opened does not match any page of this project. It may have been mistyped or moved.</p>
      <div className="actions">
        <Link className="btn primary" to="/">Back to home</Link>
        <Link className="btn" to="/analyze">Analyze audio</Link>
      </div>
    </section>
  );
}
