"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type { Dispatch, RefObject, SetStateAction } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

export type ResultTab = "fit" | "answers" | "research";

type DemoRefs = {
  root: RefObject<HTMLDivElement | null>;
  stage: RefObject<HTMLDivElement | null>;
  browserBody: RefObject<HTMLDivElement | null>;
  jobPage: RefObject<HTMLElement | null>;
  panel: RefObject<HTMLDivElement | null>;
  ready: RefObject<HTMLElement | null>;
  loader: RefObject<HTMLElement | null>;
  results: RefObject<HTMLElement | null>;
  cursor: RefObject<HTMLSpanElement | null>;
  analyzeButton: RefObject<HTMLButtonElement | null>;
  answersTab: RefObject<HTMLButtonElement | null>;
  researchTab: RefObject<HTMLButtonElement | null>;
  fillButton: RefObject<HTMLButtonElement | null>;
  formFields: RefObject<Array<HTMLElement | null>>;
};

type DemoSetters = {
  setExampleIndex: Dispatch<SetStateAction<number>>;
  setFilledFields: Dispatch<SetStateAction<number>>;
  setFilling: Dispatch<SetStateAction<boolean>>;
  setResultTab: Dispatch<SetStateAction<ResultTab>>;
};

export function useProductDemoAnimation(refs: DemoRefs, setters: DemoSetters, exampleCount: number) {
  const {
    root,
    stage,
    browserBody,
    jobPage,
    panel,
    ready,
    loader,
    results,
    cursor,
    analyzeButton,
    answersTab,
    researchTab,
    fillButton,
    formFields,
  } = refs;
  const { setExampleIndex, setFilledFields, setFilling, setResultTab } = setters;

  useGSAP(
    () => {
      if (!root.current || !stage.current || !browserBody.current || !panel.current || !ready.current || !loader.current || !results.current || !cursor.current || !analyzeButton.current || !answersTab.current || !researchTab.current || !fillButton.current) return;

      const reduceMotion =
        window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
        window.matchMedia("(max-width: 900px)").matches;
      const screens = [ready.current, loader.current, results.current];
      const showOnly = (activeScreen: HTMLElement, display: "block" | "flex") => {
        gsap.set(screens, { autoAlpha: 0, display: "none" });
        gsap.set(activeScreen, { autoAlpha: 1, display });
        activeScreen.scrollTop = 0;
      };
      const revealReady = () => showOnly(ready.current!, "flex");
      const revealLoader = () => showOnly(loader.current!, "flex");
      const revealResults = () => showOnly(results.current!, "block");
      const browserBodyNode = browserBody.current;
      const panelNode = panel.current;
      const cursorNode = cursor.current;
      let activeFillTimeline: gsap.core.Timeline | null = null;

      if (reduceMotion) {
        gsap.set(browserBodyNode, { "--panel-space": `${panelNode.offsetWidth}px` });
        gsap.set(panelNode, { xPercent: 0, autoAlpha: 1 });
        gsap.set(ready.current, { autoAlpha: 0, display: "none" });
        gsap.set(loader.current, { autoAlpha: 0, display: "none" });
        revealResults();
        return;
      }

      const getPointerTarget = (target: HTMLElement) => {
        const stageBox = stage.current!.getBoundingClientRect();
        const targetBox = target.getBoundingClientRect();
        return {
          x: targetBox.left - stageBox.left + targetBox.width / 2 - 5,
          y: targetBox.top - stageBox.top + targetBox.height / 2 - 4,
        };
      };
      const getPointerStart = (target: HTMLElement, dx = 150, dy = 100) => {
        const pointer = getPointerTarget(target);
        return { x: pointer.x + dx, y: pointer.y + dy };
      };
      const resetCursor = (target: HTMLElement, dx = 150, dy = 100) => ({
        autoAlpha: 0,
        x: () => getPointerStart(target, dx, dy).x,
        y: () => getPointerStart(target, dx, dy).y,
        scale: 1,
      });
      const moveCursor = (target: HTMLElement) => ({
        x: () => getPointerTarget(target).x,
        y: () => getPointerTarget(target).y,
        duration: 0.66,
        ease: "power2.inOut",
      });
      const fillApplicationFields = () => {
        const activeFields = formFields.current.filter((field): field is HTMLElement => field !== null);
        const fillTimeline = gsap.timeline();
        activeFields.forEach((field, index) => {
          fillTimeline
            .call(() => setFilledFields(index + 1))
            .to(field, { borderColor: "#6557e8", backgroundColor: "#f4f1ff", duration: 0.18, ease: "power1.out" })
            .to(field, { boxShadow: "0 0 0 3px rgba(101,87,232,.12)", duration: 0.15, yoyo: true, repeat: 1 }, "<")
            .to({}, { duration: 0.38 });
        });
        fillTimeline.timeScale(Math.max(1, activeFields.length / 4));
        return fillTimeline;
      };

      gsap.set(panelNode, { xPercent: 108, autoAlpha: 0 });
      gsap.set(browserBodyNode, { "--panel-space": "0px" });
      revealReady();
      gsap.set(cursorNode, { ...resetCursor(analyzeButton.current, 170, -180), transformOrigin: "5px 4px" });

      const timeline = gsap.timeline({ paused: true, repeat: -1, repeatDelay: 0.8 });
      timeline
        .to(browserBodyNode, { "--panel-space": () => `${panelNode.offsetWidth}px`, duration: 0.82, ease: "power3.out", delay: 0.35 })
        .to(panelNode, { xPercent: 0, autoAlpha: 1, duration: 0.82, ease: "power3.out" }, "<")
        .to(cursorNode, { autoAlpha: 1, duration: 0.16 }, "<+=0.28")
        .to(cursorNode, moveCursor(analyzeButton.current))
        .to(cursorNode, { scale: 0.72, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" })
        .to(analyzeButton.current, { scale: 0.98, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<")
        .call(revealLoader)
        .to(cursorNode, { autoAlpha: 0, duration: 0.16 }, "<")
        .to({}, { duration: 3.6 })
        .call(() => setResultTab("fit"))
        .call(revealResults)
        .to({}, { duration: 1.5 })
        .set(cursorNode, resetCursor(answersTab.current, 140, 105))
        .to(cursorNode, { autoAlpha: 1, duration: 0.16 })
        .to(cursorNode, moveCursor(answersTab.current))
        .to(cursorNode, { scale: 0.72, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" })
        .to(answersTab.current, { scale: 0.96, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<")
        .call(() => setResultTab("answers"))
        .to({}, { duration: 0.18 })
        .to(cursorNode, { autoAlpha: 0, duration: 0.16 })
        .to({}, { duration: 1.6 })
        .set(cursorNode, resetCursor(researchTab.current, 140, 105))
        .to(cursorNode, { autoAlpha: 1, duration: 0.16 })
        .to(cursorNode, moveCursor(researchTab.current))
        .to(cursorNode, { scale: 0.72, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" })
        .to(researchTab.current, { scale: 0.96, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<")
        .call(() => setResultTab("research"))
        .to({}, { duration: 0.18 })
        .to(cursorNode, { autoAlpha: 0, duration: 0.16 })
        .to({}, { duration: 1.6 })
        .set(cursorNode, resetCursor(fillButton.current, 150, -115))
        .to(cursorNode, { autoAlpha: 1, duration: 0.16 })
        .to(cursorNode, moveCursor(fillButton.current))
        .to(cursorNode, { scale: 0.72, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" })
        .to(fillButton.current, { scale: 0.97, duration: 0.1, yoyo: true, repeat: 1, ease: "power1.inOut" }, "<")
        .call(() => {
          setFilling(true);
          activeFillTimeline?.kill();
          activeFillTimeline = fillApplicationFields();
          activeFillTimeline.eventCallback("onComplete", () => {
            activeFillTimeline = null;
          });
        })
        .to({}, { duration: 3.5 })
        .call(() => setFilling(false))
        .to(cursorNode, { autoAlpha: 0, duration: 0.16 })
        .to({}, { duration: 1.8 })
        .to(panelNode, { xPercent: 108, autoAlpha: 0, duration: 0.68, ease: "power2.in" })
        .to(browserBodyNode, { "--panel-space": "0px", duration: 0.68, ease: "power2.in" }, "<")
        .call(() => {
          setFilledFields(0);
          setResultTab("fit");
          setExampleIndex((current) => (current + 1) % exampleCount);
        })
        .to({}, { duration: 0.2 })
        .call(() => {
          activeFillTimeline?.kill();
          activeFillTimeline = null;
          if (jobPage.current) jobPage.current.scrollTop = 0;
          screens.forEach((screen) => { screen.scrollTop = 0; });
          gsap.set(formFields.current.filter((field): field is HTMLElement => field !== null), { clearProps: "borderColor,backgroundColor,boxShadow,transform" });
          revealReady();
          gsap.set(cursorNode, resetCursor(analyzeButton.current!, 170, -180));
        });

      const entrance = gsap.fromTo(
        root.current,
        { y: 54, autoAlpha: 0.2, scale: 0.985 },
        {
          y: 0,
          autoAlpha: 1,
          scale: 1,
          duration: 1.1,
          ease: "power3.out",
          scrollTrigger: {
            trigger: root.current,
            start: "top 82%",
            once: true,
            onEnter: () => timeline.restart(),
          },
        },
      );

      return () => {
        activeFillTimeline?.kill();
        entrance.kill();
        timeline.kill();
      };
    },
    { scope: root },
  );
}
