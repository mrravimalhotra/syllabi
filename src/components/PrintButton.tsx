"use client";

import { PrinterIcon } from "@/components/icons";
import { button } from "@/components/ui";

/**
 * True in Syllabi opened from the iPhone/iPad home screen, where Safari
 * ignores the page's print command (the Print button would do nothing).
 */
function homeScreenAppOnIos(): boolean {
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/**
 * Print: the browser's print dialog, or, in the home-screen app on iPhone
 * (which can't print a page), the PDF, which prints from its Share menu.
 */
export function PrintButton({ pdfUrl }: { pdfUrl?: string | null }) {
  const print = () => {
    if (!homeScreenAppOnIos()) {
      window.print();
    } else if (pdfUrl) {
      window.open(pdfUrl, "_blank");
    } else {
      window.alert("Printing isn't available in the home-screen app yet. Open Syllabi in Safari to print, or save this first and print its PDF from My Documents.");
    }
  };
  return (
    <button type="button" onClick={print} className={button.small}>
      <PrinterIcon className="h-4 w-4" /> Print
    </button>
  );
}
