import Link from 'next/link';
import { ShieldCheck, Activity, Brain, Server, ArrowRight } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col justify-between">
      {/* Top Navigation */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow-sm">
              S
            </div>
            <span className="font-bold text-xl tracking-tight text-slate-900">SopON</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Operations Platform
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/login"
              className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md shadow-sm transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 flex flex-col items-center text-center justify-center">
        <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold mb-6">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>Foundation Layer Active • Modular Monolith Architecture</span>
        </div>

        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 max-w-4xl">
          Multi-tenant AI-powered incident & operations platform
        </h1>

        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl">
          Centralize technical incidents, track SLAs, prevent breaches, automate RCA drafts, and empower engineers with evidence-backed RAG insights.
        </p>

        <div className="mt-10 flex flex-wrap gap-4 justify-center">
          <Link
            href="/app"
            className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg shadow-sm transition-all"
          >
            <span>Launch Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="http://localhost:4000/api/docs"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 font-medium px-6 py-3 rounded-lg border border-slate-300 shadow-sm transition-all"
          >
            <Server className="w-4 h-4 text-slate-500" />
            <span>OpenAPI Docs</span>
          </a>
        </div>

        {/* Feature Cards Grid */}
        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 w-full text-left">
          <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Full Incident Lifecycle</h3>
            <p className="mt-2 text-sm text-slate-600">
              Strict state machine transitions from open, acknowledged, investigating to resolved and closed with full audit logging.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4">
              <Brain className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Evidence-Based AI & RAG</h3>
            <p className="mt-2 text-sm text-slate-600">
              Provider-agnostic intelligence with structured JSON schemas, citation tracking, and strict tenant-isolated vector retrieval.
            </p>
          </div>

          <div className="p-6 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-semibold text-slate-900">Enterprise Multi-Tenancy</h3>
            <p className="mt-2 text-sm text-slate-600">
              Complete data isolation across organizations, RBAC permission enforcement, hashed API keys, and rate-limited ingestion.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
        SopON Operations System • Production-Grade Engineering
      </footer>
    </div>
  );
}