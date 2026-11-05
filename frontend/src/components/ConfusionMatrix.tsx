import { label } from "../format";

export default function ConfusionMatrix({ labels, matrix }: { labels: string[]; matrix: number[][] }) {
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label="Confusion matrix, scrollable">
      <table className="cm">
        <caption>Rows are the true emotion and columns are what the model predicted. Cell shading shows the share of each row.</caption>
        <thead>
          <tr><th scope="col" className="corner">True \ Predicted</th>{labels.map((l) => <th key={l} scope="col">{label(l)}</th>)}</tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => {
            const total = row.reduce((a, b) => a + b, 0) || 1;
            return (
              <tr key={labels[i]}>
                <th scope="row">{label(labels[i])}</th>
                {row.map((n, j) => {
                  const share = n / total;
                  return (
                    <td key={j} className={i === j ? "diag" : ""} style={{ ["--share" as string]: share.toFixed(3) }}>
                      <b>{n}</b><small>{Math.round(share * 100)}%</small>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
