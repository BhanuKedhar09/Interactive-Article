(function () {
  "use strict";

  const data = window.DATASET;

  const HOVER_DELAY_MS = 180;
  const LEAVE_DELAY_MS = 120;
  const EDGE_MARGIN_PX = 8;
  const SCROLL_DURATION_MS = 350;
  const MENTION_PATTERN = /\{\{(\w+)\.(\w+)\|([^}]+)\}\}/g;
  const SVG_NS = "http://www.w3.org/2000/svg";

  const els = {
    title: document.getElementById("page-title"),
    status: document.getElementById("status"),
    tablePane: document.getElementById("table-pane"),
    textPane: document.getElementById("text-pane"),
    table: document.getElementById("data-table"),
    article: document.getElementById("article"),
    layer: document.getElementById("link-layer")
  };

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  const columnsByKey = new Map(data.columns.map((c) => [c.key, c]));
  const rowsById = new Map(data.rows.map((r) => [r.id, r]));
  const cellsByKey = new Map();
  const mentionsByKey = new Map();

  let active = null;
  let pinned = false;
  let hoverTimer = 0;
  let leaveTimer = 0;
  let drawQueued = false;

  const SORT_ICONS = { none: "\u2195", ascending: "\u25B2", descending: "\u25BC" };
  const sortHeaders = new Map();
  const rowElements = new Map();
  let sortState = { key: null, direction: "none" };

  const cellKey = (rowId, colKey) => rowId + "." + colKey;

  function formatValue(column, value) {
    if (column.type !== "number") return String(value);
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: column.minDigits,
      maximumFractionDigits: column.maxDigits
    }).format(value);
  }

  // ---------- Rendering ----------

  function renderTable() {
    const headRow = document.createElement("tr");
    data.columns.forEach((column) => {
      const th = document.createElement("th");
      th.scope = "col";
      th.setAttribute("aria-sort", "none");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "sort-button";
      button.dataset.sortKey = column.key;
      button.title = `Sort by ${column.label}`;

      const label = document.createElement(column.short && column.short !== column.label ? "abbr" : "span");
      label.textContent = column.short || column.label;
      if (label.tagName === "ABBR") label.title = column.label;

      const icon = document.createElement("span");
      icon.className = "sort-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = SORT_ICONS.none;

      button.append(label, icon);
      th.appendChild(button);
      sortHeaders.set(column.key, th);
      headRow.appendChild(th);
    });
    els.table.tHead.appendChild(headRow);

    const body = els.table.tBodies[0];
    data.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.row = row.id;
      rowElements.set(row.id, tr);
      data.columns.forEach((column, index) => {
        const cell = document.createElement(index === 0 ? "th" : "td");
        if (index === 0) cell.scope = "row";
        cell.textContent = formatValue(column, row[column.key]);
        if (index > 0) {
          const key = cellKey(row.id, column.key);
          cell.dataset.key = key;
          cellsByKey.set(key, cell);
        }
        tr.appendChild(cell);
      });
      body.appendChild(tr);
    });
  }

  function renderArticle() {
    const header = document.createElement("header");
    header.className = "article__header";
    const heading = document.createElement("h2");
    heading.className = "article__title";
    heading.textContent = data.articleTitle;
    const subtitle = document.createElement("p");
    subtitle.className = "article__dek";
    subtitle.textContent = data.articleSubtitle;
    header.append(heading, subtitle);
    els.article.appendChild(header);

    data.paragraphs.forEach((text, paragraphIndex) => {
      const p = document.createElement("p");
      p.dataset.paragraph = String(paragraphIndex + 1);
      let last = 0;

      for (const match of text.matchAll(MENTION_PATTERN)) {
        const [token, rowId, colKey, shown] = match;
        p.append(text.slice(last, match.index));
        last = match.index + token.length;

        const key = cellKey(rowId, colKey);
        const cell = cellsByKey.get(key);
        if (!cell) {
          console.warn("Mention points to a missing cell:", token);
          p.append(shown);
          continue;
        }
        if (cell.textContent !== shown) {
          console.warn("Mention text does not match its cell:", token, "cell shows", cell.textContent);
        }

        const mention = document.createElement("span");
        mention.className = "mention";
        mention.tabIndex = 0;
        mention.dataset.key = key;
        mention.textContent = shown;
        p.appendChild(mention);

        if (!mentionsByKey.has(key)) mentionsByKey.set(key, []);
        mentionsByKey.get(key).push(mention);
      }

      p.append(text.slice(last));
      els.article.appendChild(p);
    });
  }

  function markLinkedCells() {
    mentionsByKey.forEach((mentions, key) => {
      const cell = cellsByKey.get(key);
      const { row, column } = describeKey(key);
      cell.classList.add("is-linked");
      cell.tabIndex = 0;
      cell.setAttribute(
        "aria-label",
        `${row.country}, ${column.label}: ${cell.textContent}. Mentioned ${mentions.length === 1 ? "once" : mentions.length + " times"} in the article.`
      );
    });
  }

  function describeKey(key) {
    const [rowId, colKey] = key.split(".");
    return { row: rowsById.get(rowId), column: columnsByKey.get(colKey) };
  }

  // ---------- Sorting ----------

  // Each click on a header cycles ascending, descending, then original order.
  function toggleSort(key) {
    const next = { none: "ascending", ascending: "descending", descending: "none" };
    const direction = sortState.key === key ? next[sortState.direction] : "ascending";
    sortState = { key: direction === "none" ? null : key, direction };

    const column = columnsByKey.get(key);
    const rows = data.rows.slice();
    if (sortState.key) {
      const sign = direction === "ascending" ? 1 : -1;
      rows.sort((a, b) => {
        const x = a[key];
        const y = b[key];
        const order = column.type === "number" ? x - y : String(x).localeCompare(String(y));
        return sign * order;
      });
    }

    const body = els.table.tBodies[0];
    rows.forEach((row) => body.appendChild(rowElements.get(row.id)));

    sortHeaders.forEach((th, columnKey) => {
      const state = columnKey === sortState.key ? direction : "none";
      th.setAttribute("aria-sort", state);
      th.classList.toggle("is-sorted", state !== "none");
      th.querySelector(".sort-icon").textContent = SORT_ICONS[state];
    });

    if (active) {
      bringIntoView(els.tablePane, active.cell);
      drawLinks();
    }
  }

  // ---------- Geometry helpers ----------

  function tableInsets() {
    const head = els.table.tHead;
    const firstHeader = head.rows[0].cells[0];
    return { top: head.offsetHeight, left: firstHeader.offsetWidth };
  }

  function visibleBox(container) {
    const rect = container.getBoundingClientRect();
    const box = {
      top: rect.top + container.clientTop,
      left: rect.left + container.clientLeft,
      right: rect.left + container.clientLeft + container.clientWidth,
      bottom: rect.top + container.clientTop + container.clientHeight
    };
    if (container === els.tablePane) {
      const insets = tableInsets();
      box.top += insets.top;
      box.left += insets.left;
    }
    return box;
  }

  function isFullyVisible(container, el) {
    return isInside(el.getBoundingClientRect(), visibleBox(container));
  }

  // One pixel of slack absorbs sub-pixel scroll positions.
  function isInside(r, box) {
    return r.top >= box.top - 1 && r.bottom <= box.bottom + 1 &&
      r.left >= box.left - 1 && r.right <= box.right + 1;
  }

  // Scrolls only `container`, and only when `el` is not already in view.
  function bringIntoView(container, el) {
    if (isFullyVisible(container, el)) return;

    const box = visibleBox(container);
    const r = el.getBoundingClientRect();
    let top = container.scrollTop;
    let left = container.scrollLeft;

    if (r.top < box.top + EDGE_MARGIN_PX || r.bottom > box.bottom - EDGE_MARGIN_PX) {
      top += r.top - box.top - (box.bottom - box.top - r.height) / 2;
    }
    if (r.left < box.left || r.right > box.right) {
      left += r.left - box.left - (box.right - box.left - r.width) / 2;
    }
    animateScroll(container, top, left);
  }

  const scrollAnimations = new Map();

  function animateScroll(container, top, left) {
    cancelAnimationFrame(scrollAnimations.get(container));

    const maxTop = container.scrollHeight - container.clientHeight;
    const maxLeft = container.scrollWidth - container.clientWidth;
    const toTop = clamp(top, 0, maxTop);
    const toLeft = clamp(left, 0, maxLeft);

    if (reduceMotion.matches) {
      container.scrollTop = toTop;
      container.scrollLeft = toLeft;
      return;
    }

    const fromTop = container.scrollTop;
    const fromLeft = container.scrollLeft;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / SCROLL_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      container.scrollTop = fromTop + (toTop - fromTop) * eased;
      container.scrollLeft = fromLeft + (toLeft - fromLeft) * eased;
      if (t < 1) scrollAnimations.set(container, requestAnimationFrame(step));
    };
    scrollAnimations.set(container, requestAnimationFrame(step));
  }

  // ---------- Highlight state ----------

  function activate(origin, source) {
    clearHighlight();

    const key = origin.dataset.key;
    const cell = cellsByKey.get(key);
    const mentions = mentionsByKey.get(key) || [];
    if (!cell || mentions.length === 0) return;

    cell.classList.add("is-active");
    cell.parentElement.classList.add("is-active");
    els.textPane.classList.add("is-focus");

    let targets;
    let primary;
    if (source === "text") {
      targets = [origin];
      primary = origin;
      bringIntoView(els.tablePane, cell);
    } else {
      targets = mentions;
      primary = mentions.find((m) => isFullyVisible(els.textPane, m)) || mentions[0];
      bringIntoView(els.textPane, primary);
    }

    targets.forEach((m) => {
      m.classList.add("is-active");
      m.closest("p").classList.add("is-current");
    });

    active = { key, source, origin, cell, targets, primary };
    updateStatus();
    drawLinks();
  }

  function clearHighlight() {
    if (!active) return;
    active.cell.classList.remove("is-active");
    active.cell.parentElement.classList.remove("is-active");
    active.targets.forEach((m) => {
      m.classList.remove("is-active");
      m.closest("p").classList.remove("is-current");
    });
    els.textPane.classList.remove("is-focus");
    active = null;
  }

  function clearAll() {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    clearHighlight();
    setPinned(false);
    els.layer.replaceChildren();
    updateStatus();
  }

  function setPinned(value) {
    pinned = value;
    document.body.classList.toggle("is-pinned", value);
  }

  function updateStatus() {
    els.status.replaceChildren();
    if (!active) return;

    const { row, column } = describeKey(active.key);
    const paragraphs = [...new Set(active.targets.map((m) => m.closest("p").dataset.paragraph))];
    const where = paragraphs.length === 1
      ? `paragraph ${paragraphs[0]}`
      : `paragraphs ${paragraphs.slice(0, -1).join(", ")} and ${paragraphs.at(-1)}`;

    const value = document.createElement("span");
    value.className = "status__value";
    value.textContent = active.cell.textContent;

    els.status.append(`${row.country} · ${column.label}: `, value, ` · ${where}`);
    if (pinned) els.status.append(" · held (Esc to clear)");
  }

  // ---------- Curve drawing ----------

  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(() => {
      drawQueued = false;
      drawLinks();
    });
  }

  function drawLinks() {
    els.layer.replaceChildren();
    if (!active || getComputedStyle(els.layer).display === "none") return;

    active.targets.forEach((mention) => {
      const isPrimary = mention === active.primary;
      if (!isPrimary && !isFullyVisible(els.textPane, mention)) return;
      drawLink(mention, active.cell, isPrimary);
    });
  }

  function drawLink(mention, cell, isPrimary) {
    const textBox = visibleBox(els.textPane);
    const tableBox = visibleBox(els.tablePane);
    const m = mention.getBoundingClientRect();
    const c = cell.getBoundingClientRect();

    const xText = els.textPane.getBoundingClientRect().left;
    const xTable = tableBox.right;
    const bend = (xText - xTable) * 0.6;

    const mentionShown = m.top >= textBox.top - 1 && m.bottom <= textBox.bottom + 1;
    const cellShown = c.top >= tableBox.top - 1 && c.bottom <= tableBox.bottom + 1 &&
      c.right > tableBox.left && c.left < tableBox.right;

    const yText = clamp(m.bottom + 2, textBox.top + 4, textBox.bottom - 4);
    const yTable = clamp(c.bottom - 2, tableBox.top + 4, tableBox.bottom - 4);
    const cellRight = Math.min(c.right, xTable);
    const cellLeft = Math.max(c.left, tableBox.left);

    let d = mentionShown ? `M ${m.left} ${yText} H ${xText}` : `M ${xText} ${yText}`;
    d += ` C ${xText - bend} ${yText} ${xTable + bend} ${yTable} ${xTable} ${yTable}`;
    if (cellShown) d += ` H ${cellRight}`;

    addPath(d, isPrimary ? "link-path" : "link-path link-path--secondary");

    if (mentionShown) {
      addPath(`M ${m.left} ${yText} H ${m.right}`, "link-path link-path--underline");
      addDot(m.left, yText);
    }
    if (cellShown) {
      addPath(`M ${cellLeft} ${yTable} H ${cellRight}`, "link-path link-path--underline");
      addDot(cellRight, yTable);
    }
  }

  function addPath(d, className) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    path.setAttribute("class", className);
    els.layer.appendChild(path);
  }

  function addDot(x, y) {
    const dot = document.createElementNS(SVG_NS, "circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    dot.setAttribute("r", 3);
    dot.setAttribute("class", "link-dot");
    els.layer.appendChild(dot);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  // ---------- Events ----------

  function findTarget(node) {
    if (!(node instanceof Element)) return null;
    const el = node.closest(".mention, td.is-linked");
    if (!el) return null;
    return { el, source: el.classList.contains("mention") ? "text" : "table" };
  }

  function onPointerEnter(target) {
    if (pinned) return;
    clearTimeout(leaveTimer);
    clearTimeout(hoverTimer);
    if (active && active.origin === target.el) return;
    hoverTimer = setTimeout(() => activate(target.el, target.source), HOVER_DELAY_MS);
  }

  function onPointerLeave() {
    clearTimeout(hoverTimer);
    if (pinned) return;
    leaveTimer = setTimeout(() => {
      clearHighlight();
      els.layer.replaceChildren();
      updateStatus();
    }, LEAVE_DELAY_MS);
  }

  function togglePin(target) {
    clearTimeout(hoverTimer);
    clearTimeout(leaveTimer);
    if (active && active.origin === target.el) {
      if (pinned) {
        clearAll();
        return;
      }
    } else {
      activate(target.el, target.source);
    }
    setPinned(true);
    updateStatus();
  }

  function bindEvents() {
    document.addEventListener("mouseover", (event) => {
      const target = findTarget(event.target);
      if (target && !target.el.contains(event.relatedTarget)) onPointerEnter(target);
    });

    document.addEventListener("mouseout", (event) => {
      const target = findTarget(event.target);
      if (target && !target.el.contains(event.relatedTarget)) onPointerLeave();
    });

    document.addEventListener("click", (event) => {
      const sortButton = event.target instanceof Element && event.target.closest(".sort-button");
      if (sortButton) {
        toggleSort(sortButton.dataset.sortKey);
        return;
      }
      const target = findTarget(event.target);
      if (target) togglePin(target);
      else if (pinned) clearAll();
    });

    document.addEventListener("focusin", (event) => {
      const target = findTarget(event.target);
      if (!target || pinned) return;
      clearTimeout(hoverTimer);
      clearTimeout(leaveTimer);
      if (!active || active.origin !== target.el) activate(target.el, target.source);
    });

    document.addEventListener("focusout", (event) => {
      if (findTarget(event.target)) onPointerLeave();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        clearAll();
        return;
      }
      if (event.key === "Enter" || event.key === " ") {
        const target = findTarget(event.target);
        if (!target) return;
        event.preventDefault();
        togglePin(target);
      }
    });

    [els.tablePane, els.textPane].forEach((pane) => {
      pane.addEventListener("scroll", requestDraw, { passive: true });
      const stopAnimation = () => cancelAnimationFrame(scrollAnimations.get(pane));
      pane.addEventListener("wheel", stopAnimation, { passive: true });
      pane.addEventListener("touchstart", stopAnimation, { passive: true });
    });
    window.addEventListener("resize", requestDraw);
  }

  // ---------- Start ----------

  document.title = data.title;
  els.title.textContent = data.title;
  renderTable();
  renderArticle();
  markLinkedCells();
  bindEvents();
})();
