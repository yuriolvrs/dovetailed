// What this file is: the Dovetailed mark in its dark tile, with the product name beside it. The popup and options page both use it.
// In plain terms: the logo and name shown at the top of the extension's screens.
import type { ReactNode } from 'react';
import Logo from '../../../src/components/ui/Logo';

export function BrandHeader({ heading = 'h1', children }: { heading?: 'h1' | 'h2'; children?: ReactNode }) {
  const Heading = heading;
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 dark:bg-white">
        <Logo size={26} className="text-white dark:text-slate-900" />
      </div>
      <Heading className="text-base font-semibold tracking-tight">Dovetailed Autofill</Heading>
      {children}
    </div>
  );
}
