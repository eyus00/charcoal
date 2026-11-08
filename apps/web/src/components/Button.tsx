import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cx } from '../lib/util';

/**
 * The app's one button system (the details page look):
 * - primary: white fill, dark text. The single main action on a surface (Watch now, Play, Next).
 * - secondary: a plain soft fill. Every other action (bookmark, share, close, previous, server).
 * - ghost: no fill or outline until hovered. Dense toolbars and inline icons (player controls).
 * Sizes: md = 40px (toolbars, dialogs, rows), lg = 48px (page actions).
 * `icon` makes it a circle for icon-only buttons.
 */
export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'md' | 'lg';

const BASE =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap select-none ' +
  'transition-[background-color,color,box-shadow] duration-150 ease-out ' +
  'disabled:pointer-events-none disabled:opacity-30 aria-disabled:pointer-events-none aria-disabled:opacity-30';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-black hover:bg-accent-hover',
  secondary: 'bg-white/10 text-white hover:bg-white/[0.16]',
  ghost: 'text-white/75 hover:bg-white/10 hover:text-white',
};

const SIZE: Record<ButtonSize, { text: string; icon: string }> = {
  md: { text: 'h-10 px-4 text-sm', icon: 'size-10' },
  lg: { text: 'h-12 px-6 text-body-sm', icon: 'size-12' },
};

/** Class string, for links and anything else that should look like a button. */
export function btn({ variant = 'secondary', size = 'md', icon = false }: { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean } = {}) {
  return cx(BASE, VARIANT[variant], icon ? SIZE[size].icon : SIZE[size].text);
}

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean };

const Button = forwardRef<HTMLButtonElement, Props>(function Button({ variant, size, icon, className, type = 'button', ...rest }, ref) {
  return <button ref={ref} type={type} className={cx(btn({ variant, size, icon }), className)} {...rest} />;
});
export default Button;
