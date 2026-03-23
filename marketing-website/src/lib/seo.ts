export function applyPageMeta(title: string, description: string) {
  const previousTitle = document.title;
  document.title = title;

  let metaEl = document.querySelector<HTMLMetaElement>('meta[name="description"]');
  const previousDescription = metaEl?.content ?? "";

  if (!metaEl) {
    metaEl = document.createElement("meta");
    metaEl.name = "description";
    document.head.appendChild(metaEl);
  }

  metaEl.content = description;

  return () => {
    document.title = previousTitle;
    if (metaEl) {
      metaEl.content = previousDescription;
    }
  };
}
