import { useState } from 'react';
import { NavLink } from 'react-router';
import logo from '../../../assets/logos/woodhall-capital-horizontal-white.svg';
import treeMark from '../../../assets/logos/woodhall-capital-tree-mark-white.svg';
import { NAV, ROLE_LABELS } from '../lib/roles';
import type { User } from '../types';

interface SidebarProps {
  user: User;
  onSignOut: () => void;
}

export function Sidebar({ user, onSignOut }: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <aside className="relative overflow-hidden bg-primary text-white lg:sticky lg:top-0 lg:h-screen">
      <img src={treeMark} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-12 -left-12 w-64 opacity-[0.07]" />
      <div className="relative flex items-center justify-between px-5 py-4 lg:block lg:px-6 lg:py-8">
        <img src={logo} alt="Woodhall Capital" className="h-8 w-auto lg:h-9" />
        <button
          type="button"
          className="cursor-pointer rounded-full border border-white/30 bg-transparent px-4 py-1.5 text-sm text-white lg:hidden"
          aria-expanded={open}
          aria-controls="app-nav"
          onClick={() => setOpen((o) => !o)}
        >
          Menu
        </button>
      </div>
      <div id="app-nav" className={`relative px-3 pb-6 lg:block lg:px-4 ${open ? 'block' : 'hidden'}`}>
        <p className="mb-0 px-3 text-xs font-semibold tracking-[0.14em] text-accent uppercase">Visitor Management</p>
        <nav aria-label="Main">
          <ul className="m-0 mt-2 list-none space-y-1 p-0">
            {NAV[user.role].map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-full px-4 py-2.5 text-[15px] no-underline transition ${isActive ? 'bg-white font-semibold text-primary' : 'text-white/85 hover:bg-white/10'}`
                  }
                >
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-8 rounded-2xl bg-white/10 p-4">
          <p className="mb-0 text-sm font-semibold">{user.full_name}</p>
          <p className="mb-3 text-xs text-white/70">{ROLE_LABELS[user.role]}</p>
          <button type="button" onClick={onSignOut} className="cursor-pointer bg-transparent p-0 text-sm text-accent underline underline-offset-2">
            Sign out
          </button>
        </div>
      </div>
    </aside>
  );
}
