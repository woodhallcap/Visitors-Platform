import logo from '../../../assets/logos/woodhall-capital-stacked-white.svg';
import treeMark from '../../../assets/logos/woodhall-capital-tree-mark-white.svg';

interface BrandPanelProps {
  title: string;
  text: string;
}

/** The one bold element on the sign-in screens: a brown panel with the Woodhall Capital mark. */
export function BrandPanel({ title, text }: BrandPanelProps) {
  return (
    <aside aria-label="About Visitor Management" className="relative overflow-hidden rounded-brand bg-primary p-6 text-white sm:p-8">
      <img src={treeMark} alt="" aria-hidden="true" className="pointer-events-none absolute -right-20 -bottom-16 w-80 opacity-[0.08]" />
      <div className="relative">
        <img src={logo} alt="Woodhall Capital" className="h-24 w-auto sm:h-28" />
        <p className="mt-8 mb-2 text-xs font-semibold tracking-[0.14em] text-accent uppercase">Visitor Management</p>
        <h2 className="mb-3 text-white">{title}</h2>
        <p className="mb-0 text-white/80">{text}</p>
      </div>
    </aside>
  );
}
