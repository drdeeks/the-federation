import { OverlayProps } from './types';

export function Overlay({ onClick }: OverlayProps) {
  return <div className="overlay" onClick={onClick} aria-hidden="true" />;
}