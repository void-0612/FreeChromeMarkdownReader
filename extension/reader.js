(() => {
  const markdownExtensions = /\.(md|markdown|mdown|mkd)(?:$|[?#])/i;
  const themes = [
    { id: "light", label: "☀️ 日间" },
    { id: "dark", label: "🌙 夜间" },
    { id: "paper", label: "📄 纸张" },
    { id: "forest", label: "🌲 森林" },
    { id: "ocean", label: "🌊 海蓝" },
    { id: "modern", label: "✨ 极简" },
    { id: "glass", label: "🪟 玻璃" },
    { id: "warm", label: "📖 温暖" }
  ];
  const fileNameFromLocation = () => decodeURIComponent(location.pathname.split("/").pop() || "Markdown");
  const folderFromLocation = () => {
    const path = decodeURIComponent(location.pathname);
    return path.slice(0, path.lastIndexOf("/") + 1) || "/";
  };
  const state = {
    activePanel: "headings",
    currentEntry: null,
    currentFileName: fileNameFromLocation(),
    currentMarkdown: "",
    directoryHandle: null,
    draftMarkdown: "",
    editMode: false,
    folderFiles: [],
    folderMessage: "",
    headings: [],
    observer: null
  };

  const plainTextBody = () => {
    const children = [...document.body.children];
    return children.length === 1 && children[0].tagName === "PRE";
  };

  const shouldRender = () => {
    if (document.body.classList.contains("omr-active")) return false;
    if (markdownExtensions.test(location.pathname)) return true;
    return plainTextBody() && /^#|\s*[-*+]\s+|\s*\w.*\n={3,}/.test(document.body.innerText);
  };

  if (!shouldRender()) return;

  const initialSource = plainTextBody() ? document.body.innerText : document.documentElement.innerText;

  const applyTheme = (themeId, shell) => {
    const theme = themes.find((item) => item.id === themeId) || themes[0];
    document.body.classList.remove("omr-dark", ...themes.map((item) => `omr-theme-${item.id}`));
    document.body.classList.add(`omr-theme-${theme.id}`);
    document.body.classList.toggle("omr-dark", theme.id === "dark");
    const select = shell?.querySelector(".omr-theme-select");
    if (select) {
      select.value = theme.id;
    }
  };

  const escapeHtml = (value) =>
    value.replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    })[char]);

  const slugify = (text) => {
    const base = text
      .toLowerCase()
      .trim()
      .replace(/<[^>]+>/g, "")
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "section";
    let slug = base;
    let index = 2;
    while (state.headings.some((item) => item.id === slug)) {
      slug = `${base}-${index++}`;
    }
    return slug;
  };

  const inline = (text) => {
    let html = escapeHtml(text);
    html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, '<img alt="$1" src="$2" title="$3">');
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)/g, '<a href="$2" title="$3">$1</a>');
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__([^_]+)__/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    html = html.replace(/_([^_\n]+)_/g, "<em>$1</em>");
    html = html.replace(/~~([^~]+)~~/g, "<del>$1</del>");
    return html;
  };

  const splitBlocks = (md) => md.replace(/\r\n?/g, "\n").split("\n");

  const parseTable = (lines, start) => {
    if (start + 1 >= lines.length) return null;
    const header = lines[start];
    const divider = lines[start + 1];
    if (!header.includes("|") || !/^\s*\|?[\s:-]+\|[\s|:-]+\|?\s*$/.test(divider)) return null;

    const cells = (line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    const headers = cells(header);
    let index = start + 2;
    const rows = [];
    while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
      rows.push(cells(lines[index]));
      index += 1;
    }

    const head = `<thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>`;
    const body = rows.length
      ? `<tbody>${rows.map((row) => `<tr>${headers.map((_, i) => `<td>${inline(row[i] || "")}</td>`).join("")}</tr>`).join("")}</tbody>`
      : "";
    return { html: `<table>${head}${body}</table>`, next: index };
  };

  const parseMarkdown = (md, collectHeadings = true) => {
    const lines = splitBlocks(md);
    const html = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) {
        i += 1;
        continue;
      }

      const fence = line.match(/^```(\w+)?\s*$/);
      if (fence) {
        const code = [];
        i += 1;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          code.push(lines[i]);
          i += 1;
        }
        i += 1;
        html.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
      if (heading) {
        const level = heading[1].length;
        const text = inline(heading[2]);
        const plain = heading[2].replace(/[`*_~[\]()]/g, "");
        const id = slugify(plain);
        if (collectHeadings) state.headings.push({ id, level, text: escapeHtml(plain) });
        html.push(`<h${level} id="${id}">${text}</h${level}>`);
        i += 1;
        continue;
      }

      if (i + 1 < lines.length && /^(=+|-+)\s*$/.test(lines[i + 1]) && line.trim()) {
        const level = lines[i + 1].trim().startsWith("=") ? 1 : 2;
        const id = slugify(line);
        if (collectHeadings) state.headings.push({ id, level, text: escapeHtml(line) });
        html.push(`<h${level} id="${id}">${inline(line)}</h${level}>`);
        i += 2;
        continue;
      }

      const table = parseTable(lines, i);
      if (table) {
        html.push(table.html);
        i = table.next;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const quote = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^>\s?/, ""));
          i += 1;
        }
        html.push(`<blockquote>${parseMarkdown(quote.join("\n"), false)}</blockquote>`);
        continue;
      }

      if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+\[[ xX]\]\s+/.test(lines[i])) {
          const checked = /\[[xX]\]/.test(lines[i]);
          const text = lines[i].replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, "");
          items.push(`<li><input type="checkbox" disabled ${checked ? "checked" : ""}> ${inline(text)}</li>`);
          i += 1;
        }
        html.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(`<li>${inline(lines[i].replace(/^\s*[-*+]\s+/, ""))}</li>`);
          i += 1;
        }
        html.push(`<ul>${items.join("")}</ul>`);
        continue;
      }

      if (/^\s*\d+\.\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
          items.push(`<li>${inline(lines[i].replace(/^\s*\d+\.\s+/, ""))}</li>`);
          i += 1;
        }
        html.push(`<ol>${items.join("")}</ol>`);
        continue;
      }

      const paragraph = [line.trim()];
      i += 1;
      while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s+/.test(lines[i]) && !/^```/.test(lines[i])) {
        if (parseTable(lines, i)) break;
        paragraph.push(lines[i].trim());
        i += 1;
      }
      html.push(`<p>${inline(paragraph.join(" "))}</p>`);
    }

    return html.join("\n");
  };

  const renderHeadingToc = () => {
    if (!state.headings.length) {
      return '<div class="omr-empty-toc">No headings found.</div>';
    }
    return state.headings.map((heading) => {
      const indent = Math.max(0, heading.level - 1) * 12;
      return `<a href="#${heading.id}" data-omr-id="${heading.id}" style="padding-left:${8 + indent}px">${heading.text}</a>`;
    }).join("");
  };

  const renderFileDirectory = () => {
    if (!state.folderFiles.length) {
      return `<div class="omr-empty-toc">${escapeHtml(state.folderMessage || "No Markdown files found.")}</div>`;
    }
    return state.folderFiles.map((entry, index) => {
      const active = entry.name === state.currentFileName ? " omr-current" : "";
      return `<button class="omr-file-item${active}" type="button" data-file-index="${index}" title="${escapeHtml(entry.name)}">${escapeHtml(entry.name)}</button>`;
    }).join("");
  };

  const setPanel = (shell, panel) => {
    state.activePanel = panel;
    shell.querySelectorAll(".omr-tab").forEach((button) => {
      button.classList.toggle("omr-tab-active", button.dataset.panel === panel);
    });
    shell.querySelector(".omr-panel-headings").hidden = panel !== "headings";
    shell.querySelector(".omr-panel-files").hidden = panel !== "files";
  };

  const refreshSidebar = (shell) => {
    shell.querySelector(".omr-toc").innerHTML = renderHeadingToc();
    shell.querySelector(".omr-file-list").innerHTML = renderFileDirectory();
    setupFileClicks(shell);
    setPanel(shell, state.activePanel);
  };

  const setupCurrentHeading = (shell) => {
    if (state.observer) state.observer.disconnect();
    const tocLinks = [...shell.querySelectorAll(".omr-toc a")];
    const headings = state.headings
      .map((heading) => document.getElementById(heading.id))
      .filter(Boolean);
    const setCurrent = (id) => {
      tocLinks.forEach((link) => link.classList.toggle("omr-current", link.dataset.omrId === id));
    };

    if ("IntersectionObserver" in window && headings.length) {
      state.observer = new IntersectionObserver((entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setCurrent(visible.target.id);
      }, { rootMargin: "-10% 0px -75% 0px", threshold: [0, 1] });
      headings.forEach((heading) => state.observer.observe(heading));
    }
  };

  const updateEditorControls = (shell) => {
    const canSave = Boolean(state.currentEntry?.handle?.createWritable);
    shell.querySelector(".omr-mode-label").textContent = state.editMode ? "编辑模式" : "阅读模式";
    shell.querySelector(".omr-edit-button").hidden = state.editMode;
    shell.querySelector(".omr-save-button").hidden = !state.editMode;
    shell.querySelector(".omr-cancel-button").hidden = !state.editMode;
    shell.querySelector(".omr-save-button").disabled = !canSave;
    shell.querySelector(".omr-save-hint").textContent = canSave || !state.editMode
      ? ""
      : "请先在文件目录中选择文件夹并打开文件，才能保存回原文件";
  };

  const setEditMode = (shell, enabled) => {
    state.editMode = enabled;
    const documentNode = shell.querySelector(".omr-document");
    const editorNode = shell.querySelector(".omr-editor");
    documentNode.hidden = enabled;
    editorNode.hidden = !enabled;
    if (enabled) {
      state.draftMarkdown = state.currentMarkdown;
      editorNode.value = state.currentMarkdown;
      editorNode.focus();
    }
    updateEditorControls(shell);
  };

  const renderDocument = (shell, markdown, fileName, entry = null) => {
    state.headings = [];
    state.currentEntry = entry || state.currentEntry;
    state.currentFileName = fileName;
    state.currentMarkdown = markdown;
    state.editMode = false;
    const documentNode = shell.querySelector(".omr-document");
    const titleNode = shell.querySelector(".omr-title");
    const editorNode = shell.querySelector(".omr-editor");
    document.title = fileName;
    titleNode.textContent = fileName;
    titleNode.title = fileName;
    documentNode.innerHTML = parseMarkdown(markdown);
    documentNode.hidden = false;
    editorNode.hidden = true;
    editorNode.value = markdown;
    refreshSidebar(shell);
    setupCurrentHeading(shell);
    updateEditorControls(shell);
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const saveCurrentFile = async (shell) => {
    const entry = state.currentEntry;
    if (!entry?.handle?.createWritable) {
      updateEditorControls(shell);
      return;
    }
    try {
      const editorNode = shell.querySelector(".omr-editor");
      const markdown = editorNode.value;
      const writable = await entry.handle.createWritable();
      await writable.write(markdown);
      await writable.close();
      renderDocument(shell, markdown, entry.name, entry);
    } catch (error) {
      shell.querySelector(".omr-save-hint").textContent = "保存失败，请确认浏览器已授予文件写入权限";
      console.error("Open Markdown Reader save failed", error);
    }
  };

  const loadFileEntry = async (shell, entry) => {
    if (entry.handle) {
      const file = await entry.handle.getFile();
      renderDocument(shell, await file.text(), entry.name, entry);
      return;
    }
    if (entry.url) {
      const response = await fetch(entry.url);
      renderDocument(shell, await response.text(), entry.name, entry);
      history.replaceState(null, "", entry.url);
    }
  };

  const setupFileClicks = (shell) => {
    shell.querySelectorAll(".omr-file-item").forEach((button) => {
      button.addEventListener("click", async () => {
        const entry = state.folderFiles[Number(button.dataset.fileIndex)];
        if (!entry) return;
        await loadFileEntry(shell, entry);
      });
    });
  };

  const openDirectoryStore = () => new Promise((resolve, reject) => {
    const request = indexedDB.open("open-markdown-reader", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("handles");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  const saveDirectoryHandle = async (directory) => {
    const db = await openDirectoryStore();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("handles", "readwrite");
      tx.objectStore("handles").put(directory, "lastDirectory");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  };

  const getSavedDirectoryHandle = async () => {
    const db = await openDirectoryStore();
    const handle = await new Promise((resolve, reject) => {
      const request = db.transaction("handles", "readonly").objectStore("handles").get("lastDirectory");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return handle;
  };

  const hasReadPermission = async (directory) => {
    if (!directory || !directory.queryPermission) return false;
    return (await directory.queryPermission({ mode: "read" })) === "granted";
  };

  const loadDirectory = async (shell, directory) => {
    const files = [];
    for await (const entry of directory.values()) {
      if (entry.kind === "file" && markdownExtensions.test(entry.name)) {
        files.push({ name: entry.name, handle: entry });
      }
    }
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    state.folderFiles = files;
    state.currentEntry = files.find((entry) => entry.name === state.currentFileName) || state.currentEntry;
    state.folderMessage = files.length ? "" : "No Markdown files found in this folder.";
    refreshSidebar(shell);
    updateEditorControls(shell);
  };

  const loadPickedDirectory = async (shell) => {
    const directory = await window.showDirectoryPicker({ id: "open-markdown-reader", mode: "readwrite" });
    state.directoryHandle = directory;
    await saveDirectoryHandle(directory);
    await loadDirectory(shell, directory);
  };

  const tryLoadSavedDirectory = async (shell) => {
    try {
      const directory = await getSavedDirectoryHandle();
      if (!directory) return false;
      state.directoryHandle = directory;
      if (!(await hasReadPermission(directory))) return false;
      await loadDirectory(shell, directory);
      return true;
    } catch (error) {
      console.error("Open Markdown Reader saved folder restore failed", error);
      return false;
    }
  };

  const tryLoadCurrentWebDirectory = async (shell) => {
    if (location.protocol === "file:") {
      const restored = await tryLoadSavedDirectory(shell);
      if (restored) return;
      state.folderMessage = `当前文件夹：${folderFromLocation()}\nChrome 不允许扩展自动扫描本地文件夹。首次请点击“选择文件夹”授权；授权后会自动记住。`;
      refreshSidebar(shell);
      return;
    }

    try {
      const directoryUrl = new URL("./", location.href);
      const response = await fetch(directoryUrl.href);
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const files = [...doc.querySelectorAll("a[href]")]
        .map((link) => {
          const url = new URL(link.getAttribute("href"), directoryUrl.href);
          const name = decodeURIComponent(url.pathname.split("/").pop() || "");
          return markdownExtensions.test(name) ? { name, url: url.href } : null;
        })
        .filter(Boolean);
      state.folderFiles = [...new Map(files.map((file) => [file.url, file])).values()]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      state.folderMessage = state.folderFiles.length
        ? ""
        : "No Markdown files found in the current web directory.";
      refreshSidebar(shell);
    } catch (error) {
      state.folderMessage = "Could not read the current web directory. Use Select folder instead.";
      refreshSidebar(shell);
    }
  };

  const setupFolderSwitcher = (shell) => {
    const button = shell.querySelector(".omr-folder-button");
    if (!("showDirectoryPicker" in window)) {
      button.disabled = true;
      button.title = "This browser does not support folder selection";
      state.folderMessage = "Folder selection is not supported by this browser.";
      refreshSidebar(shell);
      return;
    }

    button.addEventListener("click", async () => {
      try {
        await loadPickedDirectory(shell);
        setPanel(shell, "files");
      } catch (error) {
        if (error.name !== "AbortError") {
          state.folderMessage = "Folder selection failed.";
          refreshSidebar(shell);
          console.error("Open Markdown Reader folder selection failed", error);
        }
      }
    });
  };

  const shell = document.createElement("main");
  shell.className = "omr-shell";
  shell.innerHTML = `
    <aside class="omr-sidebar" aria-label="Markdown navigation">
      <div class="omr-toolbar">
        <div class="omr-title"></div>
        <select class="omr-theme-select" title="选择主题" aria-label="选择主题"></select>
      </div>
      <div class="omr-tabs" role="tablist" aria-label="Navigation mode">
        <button class="omr-tab omr-tab-active" type="button" data-panel="headings">标题目录</button>
        <button class="omr-tab" type="button" data-panel="files">文件目录</button>
      </div>
      <section class="omr-panel omr-panel-headings">
        <div class="omr-toc-heading">Contents</div>
        <nav class="omr-toc"></nav>
      </section>
      <section class="omr-panel omr-panel-files" hidden>
        <div class="omr-file-actions">
          <button class="omr-folder-button" type="button" title="Select folder">选择文件夹</button>
        </div>
        <div class="omr-toc-heading">Files</div>
        <nav class="omr-file-list"></nav>
      </section>
    </aside>
    <section class="omr-main">
      <div class="omr-reader-bar">
        <div class="omr-reader-status">
          <span class="omr-mode-label">阅读模式</span>
          <span class="omr-save-hint"></span>
        </div>
        <div class="omr-reader-actions">
          <button class="omr-reader-button omr-edit-button" type="button">编辑</button>
          <button class="omr-reader-button omr-save-button" type="button" hidden>保存</button>
          <button class="omr-reader-button omr-cancel-button" type="button" hidden>取消</button>
        </div>
      </div>
      <article class="omr-document"></article>
      <textarea class="omr-editor" spellcheck="false" hidden></textarea>
    </section>
  `;

  document.body.textContent = "";
  document.body.className = "";
  document.body.classList.add("omr-active");
  document.body.append(shell);

  chrome.storage.sync.get({ theme: "light" }, ({ theme }) => {
    applyTheme(theme, shell);
  });

  const themeSelect = shell.querySelector(".omr-theme-select");
  themes.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.label;
    themeSelect.append(opt);
  });
  themeSelect.addEventListener("change", () => {
    applyTheme(themeSelect.value, shell);
    chrome.storage.sync.set({ theme: themeSelect.value });
  });

  shell.querySelectorAll(".omr-tab").forEach((button) => {
    button.addEventListener("click", () => setPanel(shell, button.dataset.panel));
  });

  shell.querySelector(".omr-edit-button").addEventListener("click", () => setEditMode(shell, true));
  shell.querySelector(".omr-cancel-button").addEventListener("click", () => setEditMode(shell, false));
  shell.querySelector(".omr-save-button").addEventListener("click", async () => saveCurrentFile(shell));

  setupFolderSwitcher(shell);
  renderDocument(shell, initialSource, state.currentFileName);
  tryLoadCurrentWebDirectory(shell);
})();
