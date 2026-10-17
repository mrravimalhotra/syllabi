"use client";

import { PrinterIcon } from "@/components/icons";
import { Spinner, button } from "@/components/ui";
import { inIosHomeScreenApp, usePdfOpener } from "@/components/PdfButton";

/**
 * Print: the browser's print dialog; in the iPhone home-screen app (which
 * can't print a page), the PDF in the share sheet, which has Print.
 */
export function PrintButton({ pdfUrl, name = "Syllabi" }: { pdfUrl?: string | null; name?: string }) {
  const pdf = usePdfOpener(name);
  const print = () => {
    if (!inIosHomeScreenApp()) window.print();
    else if (pdfUrl) void pdf.open(pdfUrl);
    else window.alert("Printing isn't available in the home-screen app for this yet. Open Syllabi in Safari to print it.");
  };
  return (
    <button type="button" onClick={print} className={button.small} disabled={pdf.state === "preparing"}>
      {pdf.state === "preparing" ? <Spinner className="h-4 w-4" /> : <PrinterIcon className="h-4 w-4" />}
      {pdf.state === "ready" ? "Tap to print" : "Print"}
    </button>
  );
}
