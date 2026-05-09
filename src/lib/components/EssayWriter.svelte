<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { onMount, onDestroy } from "svelte";
  import { Editor, Node } from "@tiptap/core";
  import StarterKit from "@tiptap/starter-kit";
  import Underline from "@tiptap/extension-underline";
  import TextAlign from "@tiptap/extension-text-align";
  import { currentProject } from "$lib/stores/project.svelte";
  import {
    Bold,
    Italic,
    Underline as UnderlineIcon,
    Code,
    AlignLeft,
    AlignCenter,
    AlignRight,
    AlignJustify,
    Quote,
    IndentIncrease,
    IndentDecrease,
    Loader2,
    FileText,
    Home,
    Settings,
    Eye,
    EyeOff,
    Plus,
    GripVertical,
  } from "lucide-svelte";
  import type { Chapter, Scene } from "$lib/types";
  import ProjectSettingsDialog from "./ProjectSettingsDialog.svelte";
  import ContextMenu from "./ContextMenu.svelte";
  import type { MenuItem } from "./ContextMenu.svelte";

  interface OutlineItem {
    id: string;
    text: string;
    level: 1 | 2;
    pos: number;
  }

  let sceneId = $state("");

  let editorElement: HTMLElement;
  let editor: Editor | null = $state(null);
  let isInitialized = false;
  let isSettingContent = false;
  let lastSavedProse = "";

  let outlineItems = $state<OutlineItem[]>([]);

  let wordCount = $state(0);
  let saveStatus = $state<"idle" | "saving" | "error">("idle");
  let saveError = $state<string>("");

  let isBold = $state(false);
  let isItalic = $state(false);
  let isUnderline = $state(false);
  let isCode = $state(false);
  let isBlockquote = $state(false);
  let textAlign = $state<"left" | "center" | "right" | "justify">("left");
  let currentOutlineType = $state<"section" | "topic" | "sentence" | null>(null);
  let showSettings = $state(false);
  let showOutlines = $state(true);

  let gutter = $state<{
    top: number;
    pos: number;
    depth: number;
    visible: boolean;
  }>({ top: 0, pos: 0, depth: 0, visible: false });

  let contextMenu = $state<{ x: number; y: number; items: MenuItem[] } | null>(null);

  const OutlineSection = Node.create({
    name: "outlineSection",
    group: "block",
    content: "inline*",
    defining: true,
    draggable: true,
    parseHTML() {
      return [{ tag: 'div[data-outline="section"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, "data-outline": "section", class: "outline-section" }, 0];
    },
  });

  const OutlineTopic = Node.create({
    name: "outlineTopic",
    group: "block",
    content: "inline*",
    defining: true,
    draggable: true,
    parseHTML() {
      return [{ tag: 'div[data-outline="topic"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return ["div", { ...HTMLAttributes, "data-outline": "topic", class: "outline-topic" }, 0];
    },
  });

  const OutlineSentence = Node.create({
    name: "outlineSentence",
    group: "block",
    content: "inline*",
    defining: true,
    draggable: false,
    parseHTML() {
      return [{ tag: 'div[data-outline="sentence"]' }];
    },
    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        { ...HTMLAttributes, "data-outline": "sentence", class: "outline-sentence" },
        0,
      ];
    },
  });

  async function loadEssayContent() {
    if (!currentProject.value) return;

    try {
      const chapters = await invoke<Chapter[]>("get_chapters", { projectId: currentProject.value.id });
      currentProject.setChapters(chapters);

      if (chapters.length > 0) {
        currentProject.setCurrentChapter(chapters[0]);

        const scenes = await invoke<Scene[]>("get_scenes", { chapterId: chapters[0].id });
        currentProject.setScenes(scenes);

        if (scenes.length > 0) {
          sceneId = scenes[0].id;
          currentProject.setCurrentScene(scenes[0]);
        }
      }
    } catch (e) {
      console.error("Failed to load essay content:", e);
    }
  }

  async function loadSceneProse(): Promise<string> {
    try {
      const chapterId = currentProject.currentChapter?.id;
      if (!chapterId) return "";
      const scenes = await invoke<Scene[]>("get_scenes", { chapterId });
      const scene = scenes.find((s) => s.id === sceneId);
      return scene?.prose || "";
    } catch (e) {
      console.error("Failed to load scene prose:", e);
      return "";
    }
  }

  async function saveSceneProse(prose: string) {
    if (!sceneId) return;
    saveStatus = "saving";
    try {
      await invoke("save_scene_prose", { sceneId, prose });
      saveStatus = "idle";
    } catch (e) {
      console.error("Failed to save:", e);
      saveStatus = "error";
      saveError = String(e);
      setTimeout(() => (saveStatus = "idle"), 3000);
    }
  }

  function extractOutlineItems(editorInstance: Editor) {
    const doc = editorInstance.state.doc;
    const items: OutlineItem[] = [];

    doc.descendants((node, pos) => {
      if (node.type.name === "outlineSection" || node.type.name === "outlineTopic") {
        const level: 1 | 2 = node.type.name === "outlineSection" ? 1 : 2;
        const text = node.textContent.trim();
        if (text) {
          items.push({
            id: `${node.type.name}-${pos}`,
            text,
            level,
            pos,
          });
        }
      }
    });

    return items;
  }

  function countDraftWords(doc: Editor["state"]["doc"]): number {
    let text = "";
    const walk = (node: any, inOutline: boolean) => {
      const nextInOutline =
        inOutline ||
        node.type?.name === "outlineSection" ||
        node.type?.name === "outlineTopic" ||
        node.type?.name === "outlineSentence";
      if (node.isText && !nextInOutline) {
        text += `${node.text} `;
        return;
      }
      if (!node.content) return;
      for (let i = 0; i < node.content.childCount; i += 1) {
        walk(node.content.child(i), nextInOutline);
      }
    };
    walk(doc, false);
    return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
  }

  function updateToolbarState() {
    if (!editor) return;
    isBold = editor.isActive("bold");
    isItalic = editor.isActive("italic");
    isUnderline = editor.isActive("underline");
    isCode = editor.isActive("code");
    isBlockquote = editor.isActive("blockquote");
    textAlign = editor.isActive({ textAlign: "center" })
      ? "center"
      : editor.isActive({ textAlign: "right" })
        ? "right"
        : editor.isActive({ textAlign: "justify" })
          ? "justify"
          : "left";

    if (editor.isActive("outlineSection")) {
      currentOutlineType = "section";
    } else if (editor.isActive("outlineTopic")) {
      currentOutlineType = "topic";
    } else if (editor.isActive("outlineSentence")) {
      currentOutlineType = "sentence";
    } else {
      currentOutlineType = null;
    }
  }

  function updateGutterPosition() {
    if (!editor) {
      gutter.visible = false;
      return;
    }
    const view = editor.view;
    const { $from } = editor.state.selection;
    let depth = $from.depth;
    while (depth > 0 && !$from.node(depth).isBlock) depth -= 1;
    if (depth === 0) {
      gutter.visible = false;
      return;
    }
    const blockPos = $from.before(depth);
    const coords = view.coordsAtPos(blockPos + 1);
    const pageEl = editorElement?.closest(".essay-page") as HTMLElement | null;
    const pageRect = pageEl?.getBoundingClientRect();
    if (!pageRect) {
      gutter.visible = false;
      return;
    }
    gutter = {
      top: Math.max(0, coords.top - pageRect.top),
      pos: $from.pos,
      depth,
      visible: true,
    };
  }

  function updateWordCount() {
    if (!editor) return;
    wordCount = countDraftWords(editor.state.doc);
  }

  function scrollToOutlineNode(pos: number) {
    if (!editor) return;
    editor.commands.setTextSelection(pos + 1);
    editor.commands.scrollIntoView();
  }

  function parseEditorContent(prose: string): any {
    if (!prose.trim()) return "";
    try {
      const parsed = JSON.parse(prose);
      if (parsed && typeof parsed === "object" && "type" in parsed) {
        return parsed;
      }
      return prose;
    } catch {
      return prose;
    }
  }

  function getCurrentBlockAfterPos(): number | null {
    if (!editor) return null;
    const { $from } = editor.state.selection;
    const depth = gutter.depth || $from.depth;
    try {
      return $from.after(depth);
    } catch {
      return null;
    }
  }

  function showInsertMenu() {
    if (!editor) return;
    const pageEl = editorElement?.closest(".essay-page") as HTMLElement | null;
    const pageRect = pageEl?.getBoundingClientRect();
    if (!pageRect) return;
    const x = pageRect.left - 4;
    const y = pageRect.top + gutter.top + 8;
    const afterPos = getCurrentBlockAfterPos();
    if (afterPos === null) return;

    const insertAt = (node: any) => {
      editor?.chain().focus().insertContentAt(afterPos, node).run();
      editor?.commands.setTextSelection(afterPos + 1);
    };

    const items: MenuItem[] = [
      {
        label: "Insert",
        action: () => {},
        children: [
          { label: "Section", action: () => insertAt({ type: "outlineSection" }) },
          { label: "Topic", action: () => insertAt({ type: "outlineTopic" }) },
          { label: "Sentence", action: () => insertAt({ type: "outlineSentence" }) },
          { divider: true, label: "", action: () => {} },
          { label: "Paragraph", action: () => insertAt({ type: "paragraph" }) },
        ],
      },
    ];

    contextMenu = { x, y, items };
  }

  function showConvertMenu() {
    if (!editor) return;
    const pageEl = editorElement?.closest(".essay-page") as HTMLElement | null;
    const pageRect = pageEl?.getBoundingClientRect();
    if (!pageRect) return;
    const x = pageRect.left - 4;
    const y = pageRect.top + gutter.top + 8;

    const items: MenuItem[] = [
      {
        label: "Convert To",
        action: () => {},
        children: [
          { label: "Section", action: () => setOutlineSection() },
          { label: "Topic", action: () => setOutlineTopic() },
          { label: "Sentence", action: () => setOutlineSentence() },
          { divider: true, label: "", action: () => {} },
          { label: "Paragraph", action: () => setParagraph() },
        ],
      },
    ];

    contextMenu = { x, y, items };
  }

  function handleEditorKeydown(event: KeyboardEvent): boolean {
    if (!editor) return false;

    if (event.key === "Tab") {
      if (currentOutlineType === "section") {
        if (!event.shiftKey) {
          event.preventDefault();
          setOutlineTopic();
          return true;
        }
        return false;
      }

      if (currentOutlineType === "topic") {
        event.preventDefault();
        if (event.shiftKey) setOutlineSection();
        else setOutlineSentence();
        return true;
      }

      if (currentOutlineType === "sentence") {
        event.preventDefault();
        if (event.shiftKey) setOutlineTopic();
        else setParagraph();
        return true;
      }

      if (!event.shiftKey) {
        event.preventDefault();
        insertTab();
        return true;
      }
    }

    if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
      if (currentOutlineType) {
        event.preventDefault();
        editor.chain().focus().splitBlock().setParagraph().run();
        return true;
      }
    }

    return false;
  }

  onMount(async () => {
    if (!currentProject.value || currentProject.value.project_type !== "essay") return;
    await loadEssayContent();
    const prose = await loadSceneProse();
    const content = parseEditorContent(prose);

    editor = new Editor({
      element: editorElement,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          codeBlock: false,
          horizontalRule: false,
        }),
        OutlineSection,
        OutlineTopic,
        OutlineSentence,
        Underline,
        TextAlign.configure({
          types: ["paragraph"],
        }),
      ],
      content,
      editable: true,
      editorProps: {
        attributes: {
          class: "essay-editor-content",
          "data-placeholder": "Start writing your essay...",
        },
        handleKeyDown: (_view, event) => handleEditorKeydown(event as KeyboardEvent),
      },
      onUpdate: ({ editor: e }) => {
        updateToolbarState();
        updateWordCount();
        updateGutterPosition();
        outlineItems = extractOutlineItems(e);

        if (!isInitialized || isSettingContent) return;
        const json = JSON.stringify(e.getJSON());
        if (json !== lastSavedProse) {
          lastSavedProse = json;
          saveSceneProse(json);
        }
      },
      onSelectionUpdate: () => {
        updateToolbarState();
        updateGutterPosition();
      },
      onFocus: () => {
        updateToolbarState();
        updateGutterPosition();
      },
      onBlur: () => {
        gutter.visible = false;
      },
    });

    updateToolbarState();
    updateWordCount();
    updateGutterPosition();
    outlineItems = extractOutlineItems(editor);
    lastSavedProse = typeof prose === "string" ? prose : JSON.stringify(editor.getJSON());

    setTimeout(() => {
      isInitialized = true;
    }, 0);
  });

  onDestroy(() => {
    if (editor) {
      editor.destroy();
    }
  });

  function insertTab() {
    editor?.chain().focus().insertContent("\t").run();
  }

  function toggleBold() {
    editor?.chain().focus().toggleBold().run();
  }

  function toggleItalic() {
    editor?.chain().focus().toggleItalic().run();
  }

  function toggleUnderline() {
    editor?.chain().focus().toggleUnderline().run();
  }

  function toggleCode() {
    editor?.chain().focus().toggleCode().run();
  }

  function toggleBlockquote() {
    editor?.chain().focus().toggleBlockquote().run();
  }

  function setAlignment(align: "left" | "center" | "right" | "justify") {
    editor?.chain().focus().setTextAlign(align).run();
  }

  function setOutlineSection() {
    if (!editor) return;
    if (editor.isActive("outlineSection")) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setNode("outlineSection").run();
  }

  function setOutlineTopic() {
    if (!editor) return;
    if (editor.isActive("outlineTopic")) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setNode("outlineTopic").run();
  }

  function setOutlineSentence() {
    if (!editor) return;
    if (editor.isActive("outlineSentence")) {
      editor.chain().focus().setParagraph().run();
      return;
    }
    editor.chain().focus().setNode("outlineSentence").run();
  }

  function setParagraph() {
    editor?.chain().focus().setParagraph().run();
  }

  function indent() {
    insertTab();
  }

  function outdent() {}

  function goHome() {
    currentProject.setProject(null);
  }
</script>

<div class="essay-writer">
  <aside class="outline-sidebar">
    <div class="essay-sidebar-header">
      <span class="text-accent font-heading font-medium text-lg">kindling</span>
      {#if currentProject.value}
        <div class="flex items-center gap-2">
          <button
            onclick={() => { showSettings = true; }}
            class="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-card rounded transition-colors"
            title="Settings"
          >
            <Settings class="w-4 h-4" />
          </button>
          <button
            onclick={goHome}
            class="p-1.5 text-text-secondary hover:text-text-primary hover:bg-bg-card rounded transition-colors"
            title="All Projects"
          >
            <Home class="w-4 h-4" />
          </button>
        </div>
      {/if}
    </div>
    {#if currentProject.value}
      <div class="px-4 py-2 border-b border-bg-primary">
        <p class="text-text-primary text-base font-semibold truncate">
          {currentProject.value.name}
        </p>
      </div>
    {/if}
    <div class="outline-header">
      <FileText class="w-4 h-4" />
      <span>Outline</span>
    </div>
    <nav class="outline-nav">
      {#if outlineItems.length === 0}
        <div class="outline-empty">
          Add Sections and Topics to build your outline
        </div>
      {:else}
        {#each outlineItems as item, i}
          <button
            type="button"
            class="outline-item outline-level-{item.level}"
            onclick={() => scrollToOutlineNode(item.pos)}
            title={item.text}
          >
            {#if item.level === 1}
              {#if i > 0 && outlineItems[i - 1].level === 1}
                <div class="outline-section-divider"></div>
              {/if}
              <span class="outline-bullet"></span>
            {:else}
              <span class="outline-indent"></span>
              <span class="outline-bullet"></span>
            {/if}
            <span class="outline-text">{item.text}</span>
          </button>
        {/each}
      {/if}
    </nav>
    <div class="outline-footer">
      <div class="outline-stats">
        {wordCount} {wordCount === 1 ? "word" : "words"}
      </div>
    </div>
  </aside>

  <main class="essay-main">
    <div class="essay-editor-toolbar">
      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          class:active={currentOutlineType === "section"}
          onclick={setOutlineSection}
          title="Outline Section"
        >
          Section
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={currentOutlineType === "topic"}
          onclick={setOutlineTopic}
          title="Outline Topic"
        >
          Topic
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={currentOutlineType === "sentence"}
          onclick={setOutlineSentence}
          title="Outline Sentence"
        >
          Sentence
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={!currentOutlineType}
          onclick={setParagraph}
          title="Paragraph"
        >
          P
        </button>
        <button
          type="button"
          class="toolbar-btn"
          onclick={() => (showOutlines = !showOutlines)}
          title={showOutlines ? "Hide outlines" : "Show outlines"}
        >
          {#if showOutlines}
            <EyeOff class="w-4 h-4" />
          {:else}
            <Eye class="w-4 h-4" />
          {/if}
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          class:active={isBold}
          onclick={toggleBold}
          title="Bold (Ctrl+B)"
        >
          <Bold class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={isItalic}
          onclick={toggleItalic}
          title="Italic (Ctrl+I)"
        >
          <Italic class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={isUnderline}
          onclick={toggleUnderline}
          title="Underline (Ctrl+U)"
        >
          <UnderlineIcon class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={isCode}
          onclick={toggleCode}
          title="Monospace"
        >
          <Code class="w-4 h-4" />
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          class:active={textAlign === "left"}
          onclick={() => setAlignment("left")}
          title="Align Left"
        >
          <AlignLeft class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={textAlign === "center"}
          onclick={() => setAlignment("center")}
          title="Align Center"
        >
          <AlignCenter class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={textAlign === "right"}
          onclick={() => setAlignment("right")}
          title="Align Right"
        >
          <AlignRight class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="toolbar-btn"
          class:active={textAlign === "justify"}
          onclick={() => setAlignment("justify")}
          title="Justify"
        >
          <AlignJustify class="w-4 h-4" />
        </button>
      </div>

      <div class="toolbar-divider"></div>

      <div class="toolbar-group">
        <button
          type="button"
          class="toolbar-btn"
          class:active={isBlockquote}
          onclick={toggleBlockquote}
          title="Block Quote"
        >
          <Quote class="w-4 h-4" />
        </button>
        <button type="button" class="toolbar-btn" onclick={indent} title="Indent">
          <IndentIncrease class="w-4 h-4" />
        </button>
        <button type="button" class="toolbar-btn" onclick={outdent} title="Outdent">
          <IndentDecrease class="w-4 h-4" />
        </button>
      </div>

      <div class="toolbar-spacer"></div>

      {#if saveStatus === "saving"}
        <div class="save-status saving">
          <Loader2 class="w-3.5 h-3.5 animate-spin" />
          <span>Saving...</span>
        </div>
      {:else if saveStatus === "error"}
        <div class="save-status error">
          <span>Error saving</span>
        </div>
      {/if}
    </div>

    <div class="essay-pages-container">
      <div class="essay-page" class:hide-outlines={!showOutlines}>
        {#if gutter.visible}
          <div class="editor-gutter" style="top: {gutter.top}px;">
            <button type="button" class="gutter-btn" onclick={showInsertMenu} title="Insert">
              <Plus class="w-4 h-4" />
            </button>
            <button type="button" class="gutter-btn" onclick={showConvertMenu} title="Convert">
              <GripVertical class="w-4 h-4" />
            </button>
          </div>
        {/if}
        <div bind:this={editorElement} class="editor-wrapper"></div>
      </div>
    </div>
  </main>
</div>

{#if showSettings && currentProject.value}
  <ProjectSettingsDialog
    onClose={() => (showSettings = false)}
    onSave={(project) => {
      currentProject.setProject(project);
      showSettings = false;
    }}
  />
{/if}

{#if contextMenu}
  <ContextMenu
    items={contextMenu.items}
    x={contextMenu.x}
    y={contextMenu.y}
    onClose={() => (contextMenu = null)}
  />
{/if}

<style>
  .essay-writer {
    display: flex;
    height: 100%;
    background: var(--color-bg-panel);
    overflow: hidden;
  }

  .outline-sidebar {
    width: 240px;
    min-width: 200px;
    background: var(--color-bg-card);
    border-right: 1px solid var(--color-bg-primary);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .essay-sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-bg-primary);
  }

  .outline-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-bg-primary);
  }

  .outline-nav {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  .outline-empty {
    padding: 1rem;
    text-align: center;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .outline-item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.375rem 0.5rem;
    border: none;
    background: transparent;
    cursor: pointer;
    text-align: left;
    font-size: 0.8125rem;
    color: var(--color-text-primary);
    border-radius: 0.25rem;
    transition: background 0.1s ease;
    gap: 0.25rem;
  }

  .outline-item:hover {
    background: var(--color-bg-panel);
  }

  .outline-level-1 {
    font-weight: 600;
    margin-top: 0.5rem;
  }

  .outline-level-1:first-child {
    margin-top: 0;
  }

  .outline-level-2 {
    font-weight: 400;
    padding-left: 1rem;
    color: var(--color-text-secondary);
  }

  .outline-section-divider {
    height: 1px;
    background: var(--color-bg-primary);
    margin: 0.5rem 0;
    flex-shrink: 0;
  }

  .outline-indent {
    width: 0.75rem;
  }

  .outline-bullet {
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .outline-level-1 .outline-bullet {
    background: var(--color-accent);
  }

  .outline-text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .outline-footer {
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--color-bg-primary);
  }

  .outline-stats {
    font-size: 0.6875rem;
    color: var(--color-text-secondary);
  }

  .essay-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .essay-editor-toolbar {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-bg-primary);
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    padding: 0 0.5rem;
    border-radius: 0.375rem;
    color: var(--color-text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s ease;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .toolbar-btn:hover {
    background: var(--color-bg-panel);
    color: var(--color-text-primary);
  }

  .toolbar-btn.active {
    background: var(--color-accent);
    color: white;
  }

  .toolbar-divider {
    width: 1px;
    height: 1.5rem;
    background: var(--color-bg-panel);
    margin: 0 0.5rem;
  }

  .toolbar-spacer {
    flex: 1;
  }

  .save-status {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    margin-right: 0.5rem;
  }

  .save-status.saving {
    color: var(--color-text-secondary);
    opacity: 0.7;
  }

  .save-status.error {
    color: var(--color-error);
  }

  .essay-pages-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.5rem;
    background: var(--color-bg-panel);
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .essay-page {
    width: 26rem;
    min-height: 40rem;
    background: var(--color-prose-bg);
    border-radius: 0.125rem;
    box-shadow:
      0 1px 3px var(--color-prose-page-shadow),
      0 4px 12px var(--color-prose-page-glow),
      inset 0 0 0 1px rgba(0, 0, 0, 0.05);
    padding: 2rem 1.5rem;
    flex-shrink: 0;
    position: relative;
  }

  .editor-gutter {
    position: absolute;
    left: -2.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    z-index: 5;
  }

  .gutter-btn {
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-card);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-bg-primary);
    transition: all 0.15s ease;
  }

  .gutter-btn:hover {
    background: var(--color-bg-panel);
    color: var(--color-text-primary);
    border-color: var(--color-accent);
  }

  .hide-outlines :global(.outline-section),
  .hide-outlines :global(.outline-topic),
  .hide-outlines :global(.outline-sentence) {
    display: none;
  }

  .editor-wrapper {
    width: 100%;
    min-height: 36rem;
  }

  :global(.essay-editor-content) {
    outline: none;
    font-family: "Lora", Georgia, serif;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--color-prose-text);
    min-height: 36rem;
    tab-size: 4;
    white-space: pre-wrap;
    cursor: text;
  }

  :global(.essay-editor-content p) {
    margin: 0 0 0.5em 0;
  }

  :global(.essay-editor-content p.is-editor-empty:first-child::before) {
    content: attr(data-placeholder);
    float: left;
    color: var(--color-prose-placeholder);
    pointer-events: none;
    height: 0;
    font-style: italic;
  }

  :global(.essay-editor-content .outline-section) {
    font-size: 1.5rem;
    font-weight: 700;
    margin: 1.5rem 0 0.75rem 0;
    color: var(--color-prose-heading);
  }

  :global(.essay-editor-content .outline-section:first-child) {
    margin-top: 0;
  }

  :global(.essay-editor-content .outline-topic) {
    font-size: 1.125rem;
    font-weight: 700;
    margin: 1.25rem 0 0.5rem 0;
    color: var(--color-prose-heading);
  }

  :global(.essay-editor-content .outline-sentence) {
    margin: 0.75rem 0;
    padding: 0.5rem 0.75rem;
    border-left: 2px solid var(--color-bg-primary);
    font-style: italic;
    color: var(--color-text-secondary);
    background: var(--color-bg-panel);
    border-radius: 0.25rem;
  }

  :global(.essay-editor-content blockquote) {
    margin: 1em 0;
    padding-left: 1em;
    border-left: 2px solid var(--color-prose-blockquote-border);
    font-style: italic;
    color: var(--color-prose-blockquote-text);
  }

  :global(.essay-editor-content code) {
    font-family: "Courier New", Courier, monospace;
    background: var(--color-prose-code-bg);
    padding: 0.125em 0.25em;
    border-radius: 0.25em;
    font-size: 0.9em;
  }

  :global(.essay-editor-content strong) {
    font-weight: 600;
  }

  :global(.essay-editor-content em) {
    font-style: italic;
  }

  :global(.essay-editor-content u) {
    text-decoration: underline;
  }
</style>
