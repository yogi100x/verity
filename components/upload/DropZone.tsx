"use client";

/**
 * The drop zone: a large dashed area that accepts drag-and-drop, wrapped
 * around a real `<input type="file">` rather than a synthetic `role="button"`
 * div. A file input already has implicit button semantics and full native
 * keyboard support, so wrapping it in a `<label>` gives click, Tab, and
 * Enter/Space for free and avoids stacking a second interactive role on top
 * of a real one (an axe "nested interactive controls" violation).
 *
 * The input itself is visually hidden (`sr-only`) but still focusable; the
 * visible "Choose files" affordance is a `peer-focus-visible` sibling so
 * keyboard focus is still shown on the thing the eye can see.
 */

import { useId, useRef, useState, type ChangeEvent, type DragEvent } from "react";

const ACCEPT = ".pdf,application/pdf,image/*,audio/*";

export function DropZone({
  personName,
  onFilesSelected,
}: {
  personName: string;
  onFilesSelected: (files: FileList | File[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepth = useRef(0);
  const hintId = useId();

  function handleDragEnter(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDragging(true);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    // Required so the browser allows a drop at all.
    event.preventDefault();
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    if (event.dataTransfer.files.length > 0) {
      onFilesSelected(event.dataTransfer.files);
    }
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files && event.target.files.length > 0) {
      onFilesSelected(event.target.files);
    }
    // Reset so choosing the same file again still fires a change event.
    event.target.value = "";
  }

  return (
    <label
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed p-10 text-center transition-colors duration-[120ms] ease-out motion-reduce:transition-none md:p-14 ${
        isDragging ? "border-brand bg-brand/5" : "border-hairline bg-surface"
      }`}
    >
      <input
        type="file"
        multiple
        accept={ACCEPT}
        aria-label="Upload documents"
        aria-describedby={hintId}
        onChange={handleChange}
        className="peer sr-only"
      />
      <p className="text-body-l text-ink" aria-hidden="true">
        Drag documents here
      </p>
      <p id={hintId} className="max-w-[26rem] text-body-s text-ink-secondary">
        PDF, photo, or audio — anything with {personName}&rsquo;s care on it.
      </p>
      <span
        aria-hidden="true"
        className="mt-2 inline-flex h-[48px] items-center justify-center rounded-card border border-hairline bg-surface px-5 text-body font-medium text-ink outline-offset-2 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-brand"
      >
        Choose files
      </span>
    </label>
  );
}
