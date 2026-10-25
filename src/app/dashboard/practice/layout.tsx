/** Practice and Kindergarten are for children: they keep their bright colours when the device is in dark mode (see globals.css). */
export default function PracticeLayout({ children }: { children: React.ReactNode }) {
  return <div data-kid-zone>{children}</div>;
}
