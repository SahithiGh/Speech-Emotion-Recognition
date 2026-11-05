export function Logo({
  size = 38,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={`ser-brand-logo-wrap ${className}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        flexShrink: 0,
        lineHeight: 0,
      }}
      aria-hidden="true"
    >
      <img
        src="/logo-black.png"
        alt=""
        width={size}
        height={size}
        className="ser-logo-img ser-logo-light"
      />
      <img
        src="/logo-white.png"
        alt=""
        width={size}
        height={size}
        className="ser-logo-img ser-logo-dark"
      />
    </span>
  );
}
