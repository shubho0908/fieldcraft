"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ProductDemo = dynamic(() => import("./product-demo").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="product-demo-placeholder" aria-hidden="true" />,
});

const DESKTOP_BREAKPOINT = 900;

export default function ProductDemoLazy() {
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!isDesktop) return null;

  return <ProductDemo />;
}
