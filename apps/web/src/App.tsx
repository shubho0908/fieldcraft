import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { LucideProps } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  CheckIcon,
  Chrome,
  FileText,
  GitBranch,
  Globe,
  Loader2,
  MousePointerClick,
  Search,
  ShieldCheck,
  UserCircle,
} from "lucide-react";

const accent = {
  text: "text-blue-600 dark:text-blue-500",
  bg: "bg-blue-600 dark:bg-blue-500",
  bgHover: "hover:bg-blue-700 dark:hover:bg-blue-600",
  ring: "focus:ring-blue-600/40",
};

const easing = [0.16, 1, 0.3, 1] as const;

function FadeIn({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, delay, ease: easing }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-stone-50 dark:bg-blue-500">
        <GitBranch size={18} strokeWidth={2.5} />
      </span>
      <span className="text-lg font-semibold tracking-tight">Fieldcraft</span>
    </span>
  );
}

function Nav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-16 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/90">
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#" className="text-stone-900 dark:text-stone-50">
          <Logo />
        </a>
        <div className="hidden items-center gap-8 text-sm font-medium text-stone-600 dark:text-stone-400 md:flex">
          <a href="#features" className="hover:text-stone-900 dark:hover:text-stone-200">Features</a>
          <a href="#how" className="hover:text-stone-900 dark:hover:text-stone-200">How it works</a>
          <a href="#safety" className="hover:text-stone-900 dark:hover:text-stone-200">Safety</a>
        </div>
        <motion.a
          href="https://github.com/shubho0908/fieldcraft"
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className={`rounded-xl ${accent.bg} px-4 py-2 text-sm font-medium text-white shadow-sm ${accent.bgHover} focus:outline-none focus:ring-2 ${accent.ring}`}
        >
          Install on Chrome
        </motion.a>
      </nav>
    </header>
  );
}

function CircularScore({ value }: { value: number }) {
  return (
    <div className="relative h-16 w-16">
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `conic-gradient(var(--accent) ${value}%, var(--ring-track) ${value}% 100%)`,
        }}
      />
      <div className="absolute inset-[12%] flex items-center justify-center rounded-full bg-white text-sm font-semibold dark:bg-stone-900">
        {value}%
      </div>
    </div>
  );
}

function Toggle({ checked, onClick }: { checked: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={checked}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? "bg-blue-600 dark:bg-blue-500" : "bg-stone-300 dark:bg-stone-700"}`}
    >
      <motion.span
        className="absolute top-1 left-1 h-4 w-4 rounded-full bg-white"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </button>
  );
}

function SuggestionRow({ title, preview, defaultChecked }: { title: string; preview: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked ?? true);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-800/50">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-stone-900 dark:text-stone-50">{title}</p>
        <p className="truncate text-xs text-stone-500 dark:text-stone-400">{preview}</p>
      </div>
      <Toggle checked={checked} onClick={() => setChecked((v) => !v)} />
    </div>
  );
}

function DemoPanel() {
  const [step, setStep] = useState(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) {
      setStep(2);
      return;
    }
    const t1 = setTimeout(() => setStep(1), 600);
    const t2 = setTimeout(() => setStep(2), 2600);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reduce]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, rotateX: -4 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.8, ease: easing }}
      className="w-full max-w-md perspective-1000"
    >
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-2xl shadow-stone-900/10 dark:border-stone-800 dark:bg-stone-900 dark:shadow-stone-900/30">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-stone-800">
          <span className="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-50">
            <span className="h-2 w-2 rounded-full bg-blue-600 dark:bg-blue-500" />
            Fieldcraft
          </span>
          <span className="text-xs text-stone-500">active tab</span>
        </div>
        <div className="mt-4">
          <p className="font-medium text-stone-900 dark:text-stone-50">Senior Frontend Engineer</p>
          <p className="text-sm text-stone-500">Stripe</p>
        </div>
        <AnimatePresence mode="wait" initial={false}>
          {step === 0 && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 rounded-xl border border-dashed border-stone-300 p-6 text-center dark:border-stone-700"
            >
              <p className="text-sm text-stone-500">Open a job page, then click Analyze.</p>
            </motion.div>
          )}
          {step === 1 && (
            <motion.div
              key="scanning"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-6 flex items-center gap-3"
            >
              <motion.span
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="text-stone-600 dark:text-stone-400"
              >
                <Loader2 size={18} />
              </motion.span>
              <span className="text-sm text-stone-600 dark:text-stone-400">Reading the page...</span>
            </motion.div>
          )}
          {step === 2 && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: easing }}
              className="mt-5 space-y-4"
            >
              <div className="flex items-center gap-4">
                <CircularScore value={82} />
                <div>
                  <p className="font-semibold text-stone-900 dark:text-stone-50">Strong fit</p>
                  <p className="text-sm text-stone-600 dark:text-stone-400">2 blockers to review</p>
                </div>
              </div>
              <div className="space-y-2">
                <SuggestionRow title="Why this role" preview="Infrastructure focus matches my background" defaultChecked />
                <SuggestionRow title="Salary expectations" preview="Open to 180-220k" defaultChecked={false} />
              </div>
              <motion.button
                whileTap={{ scale: 0.98 }}
                type="button"
                className={`w-full rounded-xl ${accent.bg} py-2 text-sm font-medium text-white ${accent.bgHover}`}
              >
                Fill 1 approved field
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="min-h-[calc(100dvh-4rem)] px-4 pt-32 pb-20 sm:px-6 lg:px-8 lg:pt-36 lg:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-16">
        <div className="max-w-2xl">
          <h1 className="text-balance text-4xl font-semibold tracking-tight leading-[1.1] text-stone-900 sm:text-5xl lg:text-6xl dark:text-stone-50">
            Apply with your facts straight.
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-8 text-stone-600 dark:text-stone-400">
            Fieldcraft reads job pages, scores your fit, researches companies, and drafts answers you review before any field is filled.
          </p>
          <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row">
            <motion.a
              href="https://github.com/shubho0908/fieldcraft"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className={`inline-flex items-center gap-2 rounded-xl ${accent.bg} px-6 py-3 text-base font-medium text-white shadow-sm ${accent.bgHover} focus:outline-none focus:ring-2 ${accent.ring}`}
            >
              <Chrome size={18} />
              Install on Chrome
            </motion.a>
            <motion.a
              href="#how"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-6 py-3 text-base font-medium text-stone-900 shadow-sm hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400/40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50 dark:hover:bg-stone-800"
            >
              How it works
            </motion.a>
          </div>
        </div>
        <div className="flex items-center justify-center lg:justify-end">
          <DemoPanel />
        </div>
      </div>
    </section>
  );
}

function MiniProfile() {
  return (
    <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 shadow-sm dark:border-stone-800 dark:bg-stone-900">
      <div className="h-2 w-1/2 rounded bg-stone-200 dark:bg-stone-700" />
      <div className="h-2 w-3/4 rounded bg-stone-200 dark:bg-stone-700" />
      <div className="h-2 w-2/3 rounded bg-stone-200 dark:bg-stone-700" />
    </div>
  );
}

function MiniScan() {
  const items = ["Role title", "Salary range", "Questions"];
  return (
    <div className="space-y-2">
      {items.map((label) => (
        <div key={label} className="flex items-center gap-2 text-sm text-stone-700 dark:text-stone-300">
          <CheckIcon size={14} className={accent.text} />
          {label}
        </div>
      ))}
    </div>
  );
}

function FeatureBento() {
  const cellBase = "relative overflow-hidden rounded-xl p-6 sm:p-8";

  return (
    <section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <FadeIn className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Built for engineers who read the fine print.
          </h2>
        </FadeIn>
        <div className="grid h-auto min-h-[560px] grid-cols-1 gap-4 md:grid-cols-2">
          <FadeIn
            className={`${cellBase} bg-stone-100 dark:bg-stone-900 md:col-start-1 md:row-start-1 md:row-span-2`}
            delay={0}
          >
            <div className="flex h-full flex-col justify-between">
              <div>
                <UserCircle size={28} className={accent.text} strokeWidth={1.5} />
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  One profile, every form.
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-6 text-stone-700 dark:text-stone-300">
                  Store your resume, proof points, compensation, work authorization, and reusable answers once.
                </p>
              </div>
              <MiniProfile />
            </div>
          </FadeIn>

          <FadeIn
            className={`${cellBase} bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-900 dark:to-stone-800 md:col-start-2 md:row-start-1`}
            delay={0.1}
          >
            <Search size={28} className={accent.text} strokeWidth={1.5} />
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              It reads the page.
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
              Fieldcraft extracts the job post and up to a hundred controls from Greenhouse, Lever, Ashby, Workday, and generic ATS pages.
            </p>
            <MiniScan />
          </FadeIn>

          <FadeIn
            className={`${cellBase} bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-900 dark:to-stone-800 md:col-start-2 md:row-start-2`}
            delay={0.2}
          >
            <BarChart3 size={28} className={accent.text} strokeWidth={1.5} />
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Honest fit score.
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
              Get a fit verdict with hard blockers, a sourced company brief, and one reviewed suggestion per field.
            </p>
            <div className="mt-4">
              <CircularScore value={76} />
            </div>
          </FadeIn>

          <FadeIn
            className={`${cellBase} bg-stone-100 dark:bg-stone-900 md:col-span-2 md:row-start-3`}
            delay={0.3}
          >
            <div className="flex h-full flex-col justify-between gap-6 md:flex-row md:items-end">
              <div className="max-w-lg">
                <MousePointerClick size={28} className={accent.text} strokeWidth={1.5} />
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  You review every fill.
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                  Only approved fields are written. Sensitive questions stop for review, existing answers are preserved, and Submit is never pressed for you.
                </p>
              </div>
              <div className="w-full min-w-[16rem] max-w-xs space-y-2">
                <SuggestionRow title="Why this role" preview="Match with infrastructure focus" defaultChecked />
                <SuggestionRow title="Salary expectations" preview="Open to 180-220k" defaultChecked={false} />
              </div>
            </div>
          </FadeIn>
        </div>
      </div>
    </section>
  );
}

function Step({
  title,
  description,
  icon: Icon,
  delay = 0,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<LucideProps>;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <div className="flex gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-900">
          <Icon size={20} className={accent.text} strokeWidth={1.5} />
        </span>
        <div>
          <h3 className="font-semibold text-stone-900 dark:text-stone-50">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p>
        </div>
      </div>
    </FadeIn>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-20">
        <FadeIn className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Three steps to a truthful application.
          </h2>
          <p className="mt-4 max-w-md text-stone-600 dark:text-stone-400">
            No copy-paste, no invented facts. Bind a tab, review the analysis, and confirm each field.
          </p>
        </FadeIn>
        <div className="flex flex-col gap-8">
          <Step icon={FileText} title="Add your profile" description="Paste your resume, set work facts, and pick a model tier. Your API key stays in browser storage." delay={0} />
          <Step icon={Globe} title="Open a job page" description="Click the Fieldcraft icon to bind the tab. The side panel opens with the page context already loaded." delay={0.1} />
          <Step icon={CheckCircle2} title="Review and apply" description="Read the fit score, check the research, toggle the fields you want filled, and confirm each answer." delay={0.2} />
        </div>
      </div>
    </section>
  );
}

function Principle({
  title,
  description,
  icon: Icon,
  delay = 0,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<LucideProps>;
  delay?: number;
}) {
  return (
    <FadeIn delay={delay}>
      <div className="flex gap-4">
        <Icon size={24} className={`mt-0.5 shrink-0 ${accent.text}`} strokeWidth={1.5} />
        <div>
          <h3 className="font-semibold text-stone-900 dark:text-stone-50">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p>
        </div>
      </div>
    </FadeIn>
  );
}

function Safety() {
  return (
    <section id="safety" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <FadeIn className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Hard boundaries, by design.
          </h2>
        </FadeIn>
        <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          <Principle icon={ShieldCheck} title="No invented facts" description="Every answer is grounded in your profile and the job post." delay={0} />
          <Principle icon={MousePointerClick} title="No automatic submission" description="Fieldcraft fills fields you select. It never clicks Submit." delay={0.1} />
          <Principle icon={CheckCircle2} title="Sensitive fields need your okay" description="Demographic and compensation fields always stop for review." delay={0.2} />
          <Principle icon={ShieldCheck} title="Your key, your browser" description="API keys live in session storage by default and never hit our servers." delay={0.3} />
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8">
      <FadeIn className="mx-auto max-w-4xl">
        <div className="rounded-xl bg-stone-100 px-6 py-16 text-center dark:bg-stone-900 sm:px-12">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Stop rewriting the same answers.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-stone-600 dark:text-stone-400">
            Install Fieldcraft, add your profile once, and spend your energy on the jobs worth applying to.
          </p>
          <motion.a
            href="https://github.com/shubho0908/fieldcraft"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.98 }}
            className={`mt-8 inline-flex items-center gap-2 rounded-xl ${accent.bg} px-6 py-3 text-base font-medium text-white shadow-sm ${accent.bgHover} focus:outline-none focus:ring-2 ${accent.ring}`}
          >
            <Chrome size={18} />
            Install on Chrome
          </motion.a>
        </div>
      </FadeIn>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-stone-200 px-4 py-10 text-sm text-stone-500 dark:border-stone-800 dark:text-stone-400 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Logo className="text-stone-900 dark:text-stone-50" />
        <div className="flex gap-6">
          <a href="https://github.com/shubho0908/fieldcraft" className="hover:text-stone-900 dark:hover:text-stone-200">GitHub</a>
          <a href="PRIVACY.md" className="hover:text-stone-900 dark:hover:text-stone-200">Privacy</a>
        </div>
        <p>&copy; {new Date().getFullYear()} Fieldcraft</p>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
      <Nav />
      <main>
        <Hero />
        <FeatureBento />
        <HowItWorks />
        <Safety />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
