import type { ReactNode } from 'react';
import photo from '../../../assets/images/wcf-4.webp';
import logo from '../../../assets/logos/woodhall-capital-horizontal-white.svg';
import mark from '../../../assets/logos/woodhall-capital-tree-mark.svg';

interface AuthLayoutProps {
  title: string;
  text: string;
  children: ReactNode;
}

/**
 * Full-screen split for sign-in and set-password: the office photo on the left (a banner on small screens),
 * and on the right a brand header, the form on a card, and a help footer. Never wider than the viewport.
 */
export function AuthLayout({ title, text, children }: AuthLayoutProps) {
  return (
    <div data-testid="auth-layout" className="flex min-h-dvh flex-col overflow-x-hidden bg-cream lg:flex-row">
      <aside data-testid="auth-photo" aria-label="About Visitor Management" className="relative h-60 shrink-0 overflow-hidden bg-primary sm:h-80 lg:h-auto lg:w-[55%]">
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover object-[60%_20%]" />
        {/* Dark only behind the text at the bottom, so the photo keeps its colour above it. */}
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-primary/95 via-primary/40 to-primary/0" />
        <div className="relative flex h-full flex-col justify-between p-6 sm:p-10 lg:p-14">
          <img src={logo} alt="Woodhall Capital" className="h-9 w-auto self-start sm:h-11" />
          <div className="max-w-xl text-white [text-shadow:0_1px_14px_rgba(0,0,0,0.35)]">
            <p className="mb-3 text-sm font-semibold tracking-[0.16em] text-accent uppercase">Visitor Management</p>
            <p className="mb-3 font-heading text-[1.9rem] leading-[1.1] sm:text-[2.5rem] lg:text-[3.25rem]">{title}</p>
            <p className="mb-0 hidden text-lg leading-relaxed text-white/90 sm:block lg:text-xl">{text}</p>
          </div>
        </div>
      </aside>
      <main className="relative flex flex-1 flex-col overflow-hidden px-5 py-6 sm:px-10 lg:px-14 lg:py-10">
        <img src={mark} alt="" aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-24 w-[26rem] opacity-[0.05]" />
        <header className="relative flex items-center gap-3">
          <img src={mark} alt="" aria-hidden="true" className="h-9 w-auto" />
          <span className="text-sm font-semibold text-primary">
            Woodhall Capital <span className="font-normal text-ink/50">· Visitor Management</span>
          </span>
        </header>
        <div className="relative flex flex-1 items-center justify-center py-10">
          <div data-testid="auth-card" className="w-full max-w-md rounded-brand bg-white p-6 shadow-card sm:p-9">
            {children}
          </div>
        </div>
        <footer className="relative flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs text-ink/55">
          <span>Internal use only · Need help? Ask your IT team.</span>
          <span>© {new Date().getFullYear()} Woodhall Capital</span>
        </footer>
      </main>
    </div>
  );
}
