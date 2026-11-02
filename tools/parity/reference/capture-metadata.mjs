export async function inspectPage(page) {
  const state = await page.evaluate(() => {
    const label = (e) =>
      (
        e.innerText ||
        e.getAttribute("aria-label") ||
        e.getAttribute("title") ||
        ""
      )
        .replace(/\s+/g, " ")
        .trim();
    return {
      url: location.href,
      text: document.body.innerText,
      state: [
        ...new Set(
          [
            ...document.querySelectorAll(
              '[data-active="true"],[data-state="active"],[aria-current],[aria-selected="true"],[aria-pressed="true"],dialog[open],details[open] > summary,[data-page]',
            ),
          ]
            .map((e) => e.getAttribute("aria-label") || label(e))
            .filter(Boolean),
        ),
      ],
      deviceScaleFactor: devicePixelRatio,
      fontFaces: [...document.fonts].map((f) => ({
        family: f.family,
        weight: f.weight,
        style: f.style,
        status: f.status,
      })),
    };
  });
  const c = await page.context().newCDPSession(page);
  await c.send("DOM.enable");
  await c.send("CSS.enable");
  const doc = await c.send("DOM.getDocument", { depth: -1, pierce: true });
  const ax = await c.send("Accessibility.getFullAXTree");
  const byBackend = new Map(
    ax.nodes
      .filter((n) => !n.ignored && n.backendDOMNodeId)
      .map((n) => [
        n.backendDOMNodeId,
        [n.role?.value ?? "", n.name?.value ?? ""],
      ]),
  );
  const semantics = {};
  const fontNodes = [];
  const walk = (n, parts) => {
    const children = (n.children ?? []).filter((x) => x.nodeType === 1);
    for (const [i, k] of children.entries()) {
      const next =
        k.nodeName === "HTML"
          ? []
          : [...parts, `${k.nodeName.toLowerCase()}[${i}]`];
      if (k.nodeName !== "HTML")
        semantics[next.join(">")] = byBackend.get(k.backendNodeId) ?? ["", ""];
      if (k.children?.some((x) => x.nodeType === 3 && x.nodeValue.trim()))
        fontNodes.push(k.nodeId);
      walk(k, next);
    }
  };
  walk(doc.root, []);
  const actualFonts = [];
  for (const nodeId of fontNodes) {
    try {
      const f = await c.send("CSS.getPlatformFontsForNode", { nodeId });
      if (f.fonts.length) actualFonts.push({ nodeId, fonts: f.fonts });
    } catch {}
  }
  await c.detach();
  return { ...state, semantics, actualFonts };
}
