import { useId, useMemo } from "react";

interface BrandIconProps {
  svg: string;
  size?: number;
  className?: string;
}

export function BrandIcon({ svg, size = 14, className }: BrandIconProps) {
  const uid = useId();
  const prefix = `brand-${uid.replace(/[^a-zA-Z0-9]/g, "")}-`;

  const html = useMemo(() => {
    let sanitized = svg
      .replace(/\bid="/g, `id="${prefix}`)
      .replace(/url\(#/g, `url(#${prefix}`);

    const fullStyle = "width:100%;height:100%;display:block;";

    sanitized = sanitized.replace(/<svg\b([^>]*)>/, (match, attrs: string) => {
      let next = attrs;

      if (/\bwidth="/.test(next)) {
        next = next.replace(/\bwidth="[^"]*"/, `width="${size}"`);
      } else {
        next += ` width="${size}"`;
      }

      if (/\bheight="/.test(next)) {
        next = next.replace(/\bheight="[^"]*"/, `height="${size}"`);
      } else {
        next += ` height="${size}"`;
      }

      if (/\bstyle="/.test(next)) {
        next = next.replace(/\bstyle="([^"]*)"/, (_m, existing: string) => {
          const normalized = existing.endsWith(";") ? existing : `${existing};`;
          return `style="${normalized}${fullStyle}"`;
        });
      } else {
        next += ` style="${fullStyle}"`;
      }

      if (!next.includes('fill="') && !next.includes("fill:")) {
        next += ` fill="#1c1b20"`;
      }

      return `<svg${next}>`;
    });

    return sanitized;
  }, [svg, size, prefix]);

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        flex: "0 0 auto",
      }}
      dangerouslySetInnerHTML={{ __html: html }}
      aria-hidden="true"
    />
  );
}
