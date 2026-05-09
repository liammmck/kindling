<script lang="ts">
  import EssayEditor from "./EssayEditor.svelte";

  let {
    content,
    readonly = false,
    saveStatus = "idle",
    wordCount = 0,
    onUpdate,
  }: {
    content: string;
    readonly?: boolean;
    saveStatus?: "idle" | "saving" | "error";
    wordCount?: number;
    onUpdate: (html: string) => void;
  } = $props();
</script>

<section>
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-sm font-semibold text-text-primary uppercase tracking-wide">Draft</h2>
    <span class="text-xs text-text-secondary">{wordCount} words</span>
  </div>
  <div class="bg-bg-panel rounded-lg overflow-hidden" style="min-height: 50rem;">
    <EssayEditor
      {content}
      placeholder={readonly ? "Topic is locked" : "Write your draft here..."}
      {readonly}
      {saveStatus}
      {onUpdate}
    />
  </div>
</section>
