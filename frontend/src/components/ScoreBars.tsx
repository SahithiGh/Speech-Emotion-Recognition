import { label, pct } from "../format";

/** Bar chart of the six model scores. Every bar has a text label and value; the highest is also tagged in words. */
export default function ScoreBars({ scores }: { scores: Record<string, number> }) {
  const rows = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <ul className="scores" aria-hidden="true">
        {rows.map(([name, value], i) => (
          <li key={name} className={i === 0 ? "lead-row" : ""}>
            <span className="s-name">{i === 0 && <span className="s-tag">Highest</span>}{label(name)}</span>
            <span className="s-track"><span className={`s-fill emo-bar-${name.toLowerCase()}${i === 0 ? " top" : ""}`} style={{ width: `${Math.max(value * 100, 0.8)}%` }} /></span>
            <span className="s-val">{pct(value)}</span>
          </li>
        ))}
      </ul>
      <div className="sr-only"><table>
        <caption>Model score for each of the six emotions, highest first</caption>
        <thead><tr><th scope="col">Emotion</th><th scope="col">Score</th></tr></thead>
        <tbody>{rows.map(([name, value]) => <tr key={name}><th scope="row">{label(name)}</th><td>{pct(value)}</td></tr>)}</tbody>
      </table></div>
    </>
  );
}
