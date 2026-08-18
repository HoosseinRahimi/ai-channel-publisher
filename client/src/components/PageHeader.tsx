import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  aside?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  aside,
}: PageHeaderProps) {
  return (
    <header className="border-b border-slate-200 pb-6 sm:pb-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-violet-700">
            <span className="flex size-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <Icon aria-hidden="true" className="size-4" />
            </span>
            <span>{eyebrow}</span>
          </div>
          <h1 className="text-balance text-2xl font-bold tracking-[-0.025em] text-slate-950 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
            {description}
          </p>
        </div>
        {aside ? <div className="shrink-0">{aside}</div> : null}
      </div>
    </header>
  );
}
