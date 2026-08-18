import { cn } from "@/lib/utils";
import * as React from "react";

function NativeSelect({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "border-input h-11 w-full min-w-0 rounded-xl border bg-white px-3.5 text-sm text-slate-800 shadow-xs outline-none transition-[border-color,box-shadow] hover:border-slate-300 focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export { NativeSelect };
