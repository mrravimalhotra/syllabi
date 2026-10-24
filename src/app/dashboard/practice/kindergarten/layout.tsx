import { Andika } from "next/font/google";

// Andika is made for children learning to read: single-storey a and g, as in school print.
const andika = Andika({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-andika", display: "swap" });

export default function KindergartenLayout({ children }: { children: React.ReactNode }) {
  return <div className={andika.variable}>{children}</div>;
}
