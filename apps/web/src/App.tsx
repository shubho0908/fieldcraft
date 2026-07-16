import type { LucideProps } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  Chrome,
  FileText,
  GitBranch,
  Globe,
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
  gradient: "from-blue-600 to-blue-400",
};

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
        <a
          href="https://github.com/shubho0908/fieldcraft"
          className={`rounded-xl ${accent.bg} px-4 py-2 text-sm font-medium text-white shadow-sm ${accent.bgHover} focus:outline-none focus:ring-2 ${accent.ring}`}
        >
          Install on Chrome
        </a>
      </nav>
    </header>
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
            <a
              href="https://github.com/shubho0908/fieldcraft"
              className={`inline-flex items-center gap-2 rounded-xl ${accent.bg} px-6 py-3 text-base font-medium text-white shadow-sm ${accent.bgHover} focus:outline-none focus:ring-2 ${accent.ring}`}
            >
              <Chrome size={18} />
              Install on Chrome
            </a>
            <a
              href="#how"
              className="inline-flex items-center rounded-xl border border-stone-300 bg-white px-6 py-3 text-base font-medium text-stone-900 shadow-sm hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400/40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50 dark:hover:bg-stone-800"
            >
              How it works
            </a>
          </div>
        </div>
        <div className="relative">
          <img
            src="/images/hero.webp"
            alt="Fieldcraft product preview showing a job analysis side panel inside a browser"
            className="w-full rounded-xl shadow-2xl shadow-stone-900/10 dark:shadow-stone-900/30"
            loading="eager"
            width={1536}
            height={1024}
          />
        </div>
      </div>
    </section>
  );
}

function FeatureBento() {
  const cellClass = "relative overflow-hidden rounded-xl p-6 sm:p-8";

  return (
    <section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Built for engineers who read the fine print.
          </h2>
        </div>
        <div className="grid h-auto min-h-[560px] grid-cols-1 gap-4 md:grid-cols-2">
          <div className={`${cellClass} bg-stone-100 dark:bg-stone-900 md:col-start-1 md:row-start-1 md:row-span-2`}>
            <img
              src="/images/profile.webp"
              alt="A resume and profile setup illustration"
              className="absolute inset-0 h-full w-full object-cover opacity-60 dark:opacity-50"
              loading="lazy"
              width={1024}
              height={1024}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-50/95 via-stone-50/40 to-transparent dark:from-stone-950/95 dark:via-stone-950/40" />
            <div className="relative z-10 flex h-full flex-col justify-end">
              <UserCircle size={28} className={`${accent.text}`} strokeWidth={1.5} />
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                One profile, every form.
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-6 text-stone-900 dark:text-stone-50">
                Store your resume, proof points, compensation, work authorization, and reusable answers once.
              </p>
            </div>
          </div>

          <div className={`${cellClass} bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-900 dark:to-stone-800 md:col-start-2 md:row-start-1`}>
            <Search size={28} className={`${accent.text}`} strokeWidth={1.5} />
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              It reads the page.
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
              Fieldcraft extracts the job post and up to a hundred controls from Greenhouse, Lever, Ashby, Workday, and generic ATS pages.
            </p>
          </div>

          <div className={`${cellClass} bg-gradient-to-br from-stone-100 to-stone-200 dark:from-stone-900 dark:to-stone-800 md:col-start-2 md:row-start-2`}>
            <BarChart3 size={28} className={`${accent.text}`} strokeWidth={1.5} />
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
              Honest fit score.
            </h3>
            <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
              Get a fit verdict with hard blockers, a sourced company brief, and one reviewed suggestion per field.
            </p>
          </div>

          <div className={`${cellClass} bg-stone-100 dark:bg-stone-900 md:col-span-2 md:row-start-3`}>
            <img
              src="/images/review.webp"
              alt="A form being reviewed before filling"
              className="absolute inset-0 h-full w-full object-cover opacity-50 dark:opacity-40"
              loading="lazy"
              width={1024}
              height={1024}
            />
            <div className="absolute inset-0 bg-gradient-to-r from-stone-50/95 via-stone-50/70 to-stone-50/40 dark:from-stone-950/95 dark:via-stone-950/70 dark:to-stone-950/40" />
            <div className="relative z-10 flex h-full flex-col justify-between md:flex-row md:items-end md:gap-8">
              <div className="max-w-lg">
                <MousePointerClick size={28} className={`${accent.text}`} strokeWidth={1.5} />
                <h3 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
                  You review every fill.
                </h3>
                <p className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                  Only approved fields are written. Sensitive questions stop for review, existing answers are preserved, and Submit is never pressed for you.
                </p>
              </div>
              <a
                href="https://github.com/shubho0908/fieldcraft"
                className={`mt-6 inline-flex items-center gap-2 self-start rounded-xl ${accent.bg} px-5 py-2.5 text-sm font-medium text-white shadow-sm ${accent.bgHover} md:self-auto`}
              >
                Install on Chrome
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Step({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<LucideProps>;
}) {
  return (
    <div className="flex gap-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-900">
        <Icon size={20} className={accent.text} strokeWidth={1.5} />
      </span>
      <div>
        <h3 className="font-semibold text-stone-900 dark:text-stone-50">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p>
      </div>
    </div>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-2 lg:gap-20">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Three steps to a truthful application.
          </h2>
          <p className="mt-4 max-w-md text-stone-600 dark:text-stone-400">
            No copy-paste, no invented facts. Bind a tab, review the analysis, and confirm each field.
          </p>
        </div>
        <div className="flex flex-col gap-8">
          <Step
            icon={FileText}
            title="Add your profile"
            description="Paste your resume, set work facts, and pick a model tier. Your API key stays in browser storage."
          />
          <Step
            icon={Globe}
            title="Open a job page"
            description="Click the Fieldcraft icon to bind the tab. The side panel opens with the page context already loaded."
          />
          <Step
            icon={CheckCircle2}
            title="Review and apply"
            description="Read the fit score, check the research, toggle the fields you want filled, and confirm each answer."
          />
        </div>
      </div>
    </section>
  );
}

function Principle({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<LucideProps>;
}) {
  return (
    <div className="flex gap-4">
      <Icon size={24} className={`mt-0.5 shrink-0 ${accent.text}`} strokeWidth={1.5} />
      <div>
        <h3 className="font-semibold text-stone-900 dark:text-stone-50">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p>
      </div>
    </div>
  );
}

function Safety() {
  return (
    <section id="safety" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-10 max-w-2xl">
          <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
            Hard boundaries, by design.
          </h2>
        </div>
        <div className="grid gap-x-12 gap-y-8 sm:grid-cols-2">
          <Principle
            icon={ShieldCheck}
            title="No invented facts"
            description="Every answer is grounded in your profile and the job post."
          />
          <Principle
            icon={MousePointerClick}
            title="No automatic submission"
            description="Fieldcraft fills fields you select. It never clicks Submit."
          />
          <Principle
            icon={CheckCircle2}
            title="Sensitive fields need your okay"
            description="Demographic and compensation fields always stop for review."
          />
          <Principle
            icon={ShieldCheck}
            title="Your key, your browser"
            description="API keys live in session storage by default and never hit our servers."
          />
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-xl bg-stone-100 px-6 py-16 text-center dark:bg-stone-900 sm:px-12">
        <h2 className="text-3xl font-semibold tracking-tight leading-[1.2] text-stone-900 sm:text-4xl dark:text-stone-50">
          Stop rewriting the same answers.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-stone-600 dark:text-stone-400">
          Install Fieldcraft, add your profile once, and spend your energy on the jobs worth applying to.
        </p>
        <a
          href="https://github.com/shubho0908/fieldcraft"
          className={`mt-8 inline-flex items-center gap-2 rounded-xl ${accent.bg} px-6 py-3 text-base font-medium text-white shadow-sm ${accent.bgHover} focus:outline-none focus:ring-2 ${accent.ring}`}
        >
          <Chrome size={18} />
          Install on Chrome
        </a>
      </div>
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
