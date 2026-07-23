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
      .replace(/\bwidth="[^"]*"/, `width="${size}"`)
      .replace(/\bheight="[^"]*"/, `height="${size}"`)
      .replace(/\bid="/g, `id="${prefix}`)
      .replace(/url\(#/g, `url(#${prefix}`);

    if (!sanitized.includes('fill="')) {
      sanitized = sanitized.replace(/<svg\b/, `<svg fill="#1c1b20"`);
    }

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
