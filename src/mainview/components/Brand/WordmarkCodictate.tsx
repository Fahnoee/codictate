const trayIconUrl = new URL(
  "../../../assets/images/MacTrayIcon.svg",
  import.meta.url,
).href;

type WordmarkCodictateProps = {
  className?: string;
  as?: "span" | "h1";
  showMark?: boolean;
};

export function WordmarkCodictate({
  className = "",
  as: Tag = "span",
  showMark = false,
}: WordmarkCodictateProps) {
  return (
    <Tag
      className={`inline-flex items-center gap-2 whitespace-nowrap ${className}`.trim()}
    >
      {showMark ? (
        <img
          src={trayIconUrl}
          alt=""
          width={26}
          height={26}
          className="shrink-0 opacity-90"
          aria-hidden
        />
      ) : null}
      <span className="inline whitespace-nowrap">
        <span className="font-brand">C</span>
        <span className="font-sans">odictate</span>
      </span>
    </Tag>
  );
}
