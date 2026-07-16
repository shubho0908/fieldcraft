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

function Nav() {
  return (
    <header className="sticky top-0 z-50 h-16 border-b border-stone-200/80 bg-stone-50/90 backdrop-blur-md dark:border-stone-800/80 dark:bg-stone-950/90">
      <nav className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <a href="#" className="flex items-center gap-2 text-lg font-semibold text-stone-900 dark:text-stone-50">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-stone-50">
            <GitBranch size={16} strokeWidth={2.5} />
          </span>
          Fieldcraft
        </a>
        <div className="hidden items-center gap-8 text-sm font-medium text-stone-600 dark:text-stone-400 md:flex">
          <a href="#features" className="hover:text-stone-900 dark:hover:text-stone-200">Features</a>
          <a href="#how" className="hover:text-stone-900 dark:hover:text-stone-200">How it works</a>
          <a href="#safety" className="hover:text-stone-900 dark:hover:text-stone-200">Safety</a>
        </div>
        <a
          href="#get"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/40"
        >
          Get the extension
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section className="px-4 pt-16 pb-20 sm:px-6 sm:pt-20 sm:pb-24 lg:px-8 lg:pt-24">
      <div className="mx-auto max-w-3xl text-center">
        <h1 className="text-balance text-4xl font-semibold tracking-tight text-stone-900 sm:text-5xl dark:text-stone-50">
          Apply with your facts straight.
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-stone-600 dark:text-stone-400">
          Fieldcraft reads job pages, scores your fit, researches companies, and drafts answers you review before any field is filled.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <a
            href="#get"
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/40"
          >
            <Chrome size={18} />
            Install on Chrome
          </a>
          <a
            href="#how"
            className="inline-flex items-center rounded-lg border border-stone-300 bg-white px-6 py-3 text-base font-medium text-stone-900 shadow-sm hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400/40 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-50 dark:hover:bg-stone-800"
          >
            See how it works
          </a>
        </div>
        <p className="mt-3 text-sm text-stone-500 dark:text-stone-500">
          Local-first. Your API key stays in your browser.
        </p>
      </div>
    </section>
  );
}

function FeatureBlock({
  title,
  description,
  icon: Icon,
  reverse = false,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<LucideProps>;
  reverse?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-2 md:gap-12">
      <div className={reverse ? "md:order-2" : "md:order-1"}>
        <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-stone-100 dark:bg-stone-900">
          <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-white shadow-sm dark:bg-stone-800">
            <Icon size={36} className="text-indigo-600" strokeWidth={1.5} />
          </div>
        </div>
      </div>
      <div className={reverse ? "md:order-1" : "md:order-2"}>
        <h3 className="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
          {title}
        </h3>
        <p className="mt-3 text-base leading-7 text-stone-600 dark:text-stone-400">
          {description}
        </p>
      </div>
    </div>
  );
}

function Features() {
  return (
    <section id="features" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 max-w-2xl">
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Features</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Built for engineers who read the fine print.
          </h2>
        </div>
        <div className="flex flex-col gap-16 md:gap-20">
          <FeatureBlock
            title="One profile, every form."
            description="Store your resume, proof points, compensation, work authorization, and reusable answers once. Fieldcraft uses them as the source of truth for every application."
            icon={UserCircle}
          />
          <FeatureBlock
            title="It reads the page, not the job description."
            description="Fieldcraft extracts the real job post and up to a hundred form controls from Greenhouse, Lever, Ashby, Workday, and generic ATS pages."
            icon={Search}
            reverse
          />
          <FeatureBlock
            title="Honest fit, sourced research, draft answers."
            description="Get a fit score with hard blockers, a company brief with links, and one reviewed suggestion per field. No invented facts."
            icon={BarChart3}
          />
          <FeatureBlock
            title="You review every fill."
            description="Only the fields you approve are written. Sensitive questions stay in review, existing answers are preserved, and the Submit button is never pressed for you."
            icon={MousePointerClick}
            reverse
          />
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      title: "Add your profile",
      description: "Paste your resume, set work facts, and pick a model tier. Your API key stays in browser storage.",
      icon: FileText,
    },
    {
      title: "Open a job page",
      description: "Click the Fieldcraft icon to bind the tab. The side panel opens with the page context already loaded.",
      icon: Globe,
    },
    {
      title: "Review and apply",
      description: "Read the fit score, check the research, toggle the fields you want filled, and confirm each answer.",
      icon: CheckCircle2,
    },
  ];

  return (
    <section id="how" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 max-w-2xl">
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Three steps to a truthful application.
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((step) => (
            <div
              key={step.title}
              className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900"
            >
              <step.icon size={28} className="text-indigo-600" strokeWidth={1.5} />
              <h3 className="mt-4 text-lg font-semibold text-stone-900 dark:text-stone-50">{step.title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Safety() {
  const items = [
    {
      title: "No invented facts",
      description: "Every answer is grounded in your profile and the job post.",
      icon: ShieldCheck,
    },
    {
      title: "No automatic submission",
      description: "Fieldcraft fills fields you select. It never clicks Submit.",
      icon: MousePointerClick,
    },
    {
      title: "Sensitive fields need your okay",
      description: "Demographic and compensation fields always stop for review.",
      icon: CheckCircle2,
    },
    {
      title: "Your key, your browser",
      description: "API keys live in session storage by default and never hit our servers.",
      icon: ShieldCheck,
    },
  ];

  return (
    <section id="safety" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-14 max-w-2xl">
          <p className="text-sm font-medium text-indigo-600 dark:text-indigo-400">Safety</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-stone-900 dark:text-stone-50">
            Hard boundaries, by design.
          </h2>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {items.map((item) => (
            <div key={item.title} className="flex gap-4 rounded-lg border border-stone-200 bg-white p-5 dark:border-stone-800 dark:bg-stone-900">
              <item.icon size={24} className="mt-0.5 shrink-0 text-indigo-600" strokeWidth={1.5} />
              <div>
                <h3 className="font-semibold text-stone-900 dark:text-stone-50">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-stone-600 dark:text-stone-400">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Cta() {
  return (
    <section id="get" className="px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl bg-stone-900 px-6 py-14 text-center dark:bg-white sm:px-10">
        <h2 className="text-3xl font-semibold tracking-tight text-stone-50 dark:text-stone-900">
          Stop rewriting the same answers.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-stone-300 dark:text-stone-600">
          Install Fieldcraft, add your profile once, and spend your energy on the jobs worth applying to.
        </p>
        <a
          href="https://github.com/shubho0908/fieldcraft"
          className="mt-8 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-600/40"
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
        <p>Fieldcraft</p>
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
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950">
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <Safety />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
