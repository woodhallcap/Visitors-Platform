import type { ReactNode } from 'react';
import photo from '../../../assets/images/wcf-4.webp';
import logo from '../../../assets/logos/woodhall-capital-horizontal-white.svg';

interface AuthLayoutProps {
  title: string;
  text: string;
  children: ReactNode;
}

/**
 * Full-screen split for sign-in and set-password: the office photo on the left (a banner on small screens),
 * the form on a cream panel on the right. Never wider than the viewport.
 */
export function AuthLayout({ title, text, children }: AuthLayoutProps) {
  return (
    <div data-testid="auth-layout" className="flex min-h-dvh flex-col overflow-x-hidden bg-cream lg:flex-row">
      <aside data-testid="auth-photo" aria-label="About Visitor Management" className="relative h-56 shrink-0 overflow-hidden bg-primary sm:h-72 lg:h-auto lg:w-[55%]">
        <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover object-[60%_25%]" />
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-primary via-primary/45 to-primary/10" />
        <div className="relative flex h-full flex-col justify-between p-6 sm:p-8 lg:p-12">
          <img src={logo} alt="Woodhall Capital" className="h-8 w-auto self-start sm:h-10" />
          <div className="max-w-md text-white">
            <p className="mb-2 text-xs font-semibold tracking-[0.14em] text-accent uppercase">Visitor Management</p>
            <p className="mb-2 font-heading text-[1.5rem] leading-tight sm:text-[2rem]">{title}</p>
            <p className="mb-0 hidden text-white/85 sm:block">{text}</p>
          </div>
        </div>
      </aside>
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10 lg:px-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  );
}
