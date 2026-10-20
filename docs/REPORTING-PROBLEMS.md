# Reporting a problem (tickets)

Every signed-in screen has a **Report a problem** button (bottom right; just a bug icon on a phone).

## For the person using the app

1. Press **Report a problem**.
2. Write a short title ("The answer skipped question 4") and, if you like, what you expected.
3. Open **See exactly what will be sent** to read what goes with the report. Untick **Include what is on my screen** to leave out what you typed and the answer shown.
4. Press **Send report**. You get a number (#12). Your recent reports and their status (Open, Being fixed, Fixed, Won't fix) are listed in the same box.

What the report carries (kept by the app in the browser until you press Send; nothing is sent before):
- the screen and app version, the browser, the window size;
- the last 60 steps: pages opened, buttons clicked, errors;
- the last 40 requests the screen made, with **what was sent (input) and what came back (output)**, cut to a few thousand characters each;
- if ticked: the text typed in the boxes and the text of the page (the answer you saw).

Never captured or removed before sending: passwords, tokens, keys and cookies; photos and files (replaced by their size). Typed text is not hidden, so don't put private details in a question you plan to report.

## For the admin (you) and for Claude

1. Admin → **Reports**: all tickets, filter by status.
2. Open one, press **Copy ticket for Claude**, and paste it into the Claude chat: it is one Markdown block with the person's words, the input, the output, the steps and every request with its answer.
3. After it is fixed, set the status to **Fixed** and paste Claude's summary into the note (**Save status and note**). The person sees the status in their box.

## For the developer

- Capture: `src/lib/debug/capture.ts` (wraps `fetch`, clicks, errors), clean-up: `src/lib/debug/scrub.ts` (used in the browser and again on the server), box: `src/components/ReportProblem.tsx` + `ReportForm.tsx`, mounted in `dashboard/layout.tsx` and `admin/layout.tsx`.
- Server: `/api/bug-reports` (POST, GET; 20 a day per person), `/api/bug-reports/[id]` (GET, admin PATCH), table `bug_reports` (migration 24, server-only), ticket text in `src/lib/bug-report.ts`.
- Not captured: the sign-in pages (no session), and requests to `/api/bug-reports`, `/api/version`, `/api/log-error`.
