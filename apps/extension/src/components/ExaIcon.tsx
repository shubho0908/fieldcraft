import { BrandIcon } from "./BrandIcon";

const SVG = `<svg viewBox="89.8 186.1 127.6 127.6" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .exa-st0 { fill: #fbfdfc; }
      .exa-st1 { fill: #19181a; }
    </style>
  </defs>
  <rect class="exa-st1" x="89.8" y="186.1" width="127.6" height="127.6" rx="8.5" ry="8.5"/>
  <g>
    <path class="exa-st0" d="M128,242.7h51c1.6,0,2.8,1.3,2.8,2.8v8.5c0,1.6-1.3,2.8-2.8,2.8h-51c-1.6,0-2.8-1.3-2.8-2.8v-8.5c0-1.6,1.3-2.8,2.8-2.8Z"/>
    <path class="exa-st0" d="M193.2,207.3h-79.4c-1.6,0-2.8,1.3-2.8,2.8v15.6c0,1.6,1.3,2.8,2.8,2.8h8.5c1.6,0,2.8-1.3,2.8-2.8v-4.3h56.7v4.3c0,1.6,1.3,2.8,2.8,2.8h8.5c1.6,0,2.8-1.3,2.8-2.8v-15.6c0-1.6-1.3-2.8-2.8-2.8Z"/>
    <path class="exa-st0" d="M193.2,271.1h-8.5c-1.6,0-2.8,1.3-2.8,2.8v4.3h-56.7v-4.3c0-1.6-1.3-2.8-2.8-2.8h-8.5c-1.6,0-2.8,1.3-2.8,2.8v15.6c0,1.6,1.3,2.8,2.8,2.8h79.4c1.6,0,2.8-1.3,2.8-2.8v-15.6c0-1.6-1.3-2.8-2.8-2.8Z"/>
  </g>
</svg>`;

interface ExaIconProps {
  size?: number;
  className?: string;
}

export function ExaIcon({ size = 14, className }: ExaIconProps) {
  return <BrandIcon svg={SVG} size={size} className={className} />;
}
