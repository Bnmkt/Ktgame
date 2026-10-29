import "./stat-value.css";

export function StatValue({ value }) {
  if (typeof value !== "string") return value ?? null;
  return value.split("/").flatMap((part, index) => index ? [<span className="stat-value-slash" key={index}>/</span>, part] : [part]);
}
