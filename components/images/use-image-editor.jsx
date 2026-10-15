"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { isEditableImage } from "@/lib/images/process";

// The editor (canvas code, crop UI, dialog) is only fetched when someone actually picks an image to edit; the pages
// that use it (feed, messages, profile settings) do not carry it in their first bundle.
const ImageEditor = dynamic(() => import("@/components/images/image-editor").then((m) => m.ImageEditor), { ssr: false });

/**
 * Puts picked files through the image editor before they are uploaded.
 *
 *   const { editImages, imageEditor } = useImageEditor();
 *   const files = await editImages(pickedFiles, { aspect: 1, lockAspect: true, shape: "round" });
 *   ...upload `files`...
 *   return <>{imageEditor}...</>;
 *
 * Images open one at a time; anything that is not a JPEG, PNG or WebP (a PDF, say) passes straight through.
 * Resolves with the files to upload, in order. Cancelling an image leaves it out of the list.
 */
export function useImageEditor() {
  const [job, setJob] = useState(null);

  const editImages = useCallback(
    (picked, options = {}) =>
      new Promise((resolve) => {
        const list = Array.from(picked ?? []);
        const first = list.findIndex(isEditableImage);
        if (first === -1) return resolve(list);
        setJob({ list, index: first, options, results: list.slice(0, first), resolve });
      }),
    [],
  );

  function advance(result) {
    setJob((current) => {
      if (!current) return current;
      const results = result ? [...current.results, result] : current.results;
      let next = current.index + 1;
      const rest = [];
      while (next < current.list.length && !isEditableImage(current.list[next])) rest.push(current.list[next++]);
      const merged = [...results, ...rest];
      if (next >= current.list.length) {
        queueMicrotask(() => current.resolve(merged));
        return null;
      }
      return { ...current, index: next, results: merged };
    });
  }

  const total = job ? job.list.filter(isEditableImage).length : 0;
  const position = job ? { index: job.list.slice(0, job.index).filter(isEditableImage).length, total } : null;

  const imageEditor = job ? (
    <ImageEditor
      key={`${job.index}-${job.list[job.index].name}`}
      file={job.list[job.index]}
      options={job.options}
      position={position}
      onApply={(file) => advance(file)}
      onUseOriginal={() => advance(job.list[job.index])}
      onCancel={() => advance(null)}
    />
  ) : null;

  return { editImages, imageEditor };
}
