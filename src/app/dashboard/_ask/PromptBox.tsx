"use client";

/** The question box. Ctrl/Cmd+Enter sends; pasted pictures are attached. */
export function PromptBox({
  value,
  onChange,
  onSend,
  onPictures,
  placeholder,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  onPictures: (files: File[]) => void;
  placeholder: string;
}) {
  return (
    <>
      <label htmlFor="prompt" className="sr-only">
        Your question
      </label>
      <textarea
        id="prompt"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            onSend();
          }
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
          if (files.length) {
            e.preventDefault();
            onPictures(files);
          }
        }}
        placeholder={placeholder}
        rows={4}
        className="block max-h-[50vh] min-h-32 w-full resize-none rounded-t-2xl border-0 bg-transparent px-4 pt-4 pb-2 text-base text-slate-900 placeholder:text-slate-400 [field-sizing:content] focus:ring-0 focus:outline-none focus-visible:outline-none sm:px-5 sm:text-[15px]"
      />

    </>
  );
}
