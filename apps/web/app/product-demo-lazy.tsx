"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ProductDemo = dynamic(() => import("./product-demo").then((m) => m.default), {
  ssr: false,
  loading: () => <div className="product-demo-placeholder" aria-hidden="true" />,
});

const DESKTOP_BREAKPOINT = 900;

export default function ProductDemoLazy() {
  const [isDesktop, setIsDesktop] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const update = () => setIsDesktop(window.innerWidth >= DESKTOP_BREAKPOINT);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    const node = ref.current;
    if (!node || !isDesktop) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setIsVisible(true);
      },
      { rootMargin: "200px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [isDesktop]);

  if (!isDesktop) return null;

  return (
    <div ref={ref}>
      {isVisible ? <ProductDemo /> : <div className="product-demo-placeholder" aria-hidden="true" />}
    </div>
  );
}
