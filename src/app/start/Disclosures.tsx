"use client";

import { useState, type ReactNode } from "react";

// Small links in one row ("Show me what it looks like", "I can't find it"). A link with content opens its panel under the row; a link with an href just goes there.
export function Disclosures({ items }: { items: { key: string; label: string; content?: ReactNode; href?: string }[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="stack stack-1">
      <div className="onb-links">
        {items.map((i) =>
          i.href ? (
            <a key={i.key} className="btn btn-quiet" href={i.href}>
              {i.label}
            </a>
          ) : (
            <button key={i.key} type="button" className="btn-quiet" aria-expanded={open === i.key} onClick={() => setOpen(open === i.key ? null : i.key)}>
              {i.label}
            </button>
          ),
        )}
      </div>
      {items.map((i) => (open === i.key && i.content ? <div key={i.key} className="onb-panel">{i.content}</div> : null))}
    </div>
  );
}
