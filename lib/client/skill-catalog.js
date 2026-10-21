"use client";

import { useEffect, useState } from "react";

// One request per kind per page load, shared by every picker on the page. A failed request is forgotten so the next
// picker tries again; the pickers work without a catalog (a member can always type their own).
const requests = new Map();

function load(kind) {
  if (!requests.has(kind)) {
    requests.set(
      kind,
      fetch(`/api/skills?kind=${kind}`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error("unavailable"))))
        .then((body) => (Array.isArray(body.items) ? body.items : []))
        .catch(() => {
          requests.delete(kind);
          return [];
        }),
    );
  }
  return requests.get(kind);
}

/** The listed skills or interests: [{ name, category }]. Empty until loaded, and when `kind` is not given. */
export function useSkillCatalog(kind) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!kind) return;
    let live = true;
    load(kind).then((list) => live && setItems(list));
    return () => {
      live = false;
    };
  }, [kind]);
  return items;
}
