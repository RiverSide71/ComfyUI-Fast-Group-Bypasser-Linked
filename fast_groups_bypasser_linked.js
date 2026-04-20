/**
 * rgthree Fast Groups – Linked & Alternate Extension
 * =====================================================
 * Adds two new behaviors to the Fast Groups Bypasser (and Muter) nodes:
 *
 *  1. LINKED groups  – When Group A is toggled, Group B mirrors the exact same state.
 *  2. ALTERNATE groups – When Group A is bypassed, Group B is enabled, and vice-versa.
 *
 * ── INSTALLATION ──────────────────────────────────────────────────────────────────
 * Drop this file into:
 *   ComfyUI/custom_nodes/rgthree-comfy/web/comfyui/fast_groups_bypasser_linked.js
 * Then restart ComfyUI (no build step needed).
 *
 * ── CONFIGURATION ─────────────────────────────────────────────────────────────────
 * Right-click a Fast Groups Bypasser (or Muter) node → "Properties" or
 * "Properties Panel" and fill in either/both new fields:
 *
 *   groupLinks      — comma-separated pairs separated by ":"
 *                     Example:  "SD 1.5:SDXL, Upscale:No Upscale"
 *                     Effect:   Toggling SD 1.5 ON also toggles SDXL ON.
 *                               Relationship is bidirectional; only define each
 *                               pair once.
 *
 *   groupAlternates — comma-separated pairs separated by ":"
 *                     Example:  "Load Video:Load Image, Save Video:Save Image"
 *                     Effect:   Toggling Load Video ON forces Load Image OFF
 *                               (and vice-versa). Relationship is bidirectional.
 *
 * Multiple pairs are separated by commas:
 *   groupAlternates = "GroupA:GroupB, GroupC:GroupD"
 *
 * ── NOTES ─────────────────────────────────────────────────────────────────────────
 * • Links/Alternates are per-node: two separate Bypasser nodes do not share state.
 * • Using "groupLinks" with a "toggleRestriction" of "max one" can conflict — the
 *   restriction turns all others off first, then the link turns the target back on.
 *   Consider using "groupAlternates" with "max one" instead; they are compatible.
 * • The "skipOtherNodeCheck" flag passed to linked/alternated widgets bypasses the
 *   "toggleRestriction" for those secondary changes intentionally.
 * • Works on BOTH "Fast Groups Bypasser (rgthree)" and "Fast Groups Muter (rgthree)".
 */

import { app } from "../../scripts/app.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROP_LINKS = "groupLinks";
const PROP_ALTS  = "groupAlternates";

const TARGET_TYPES = [
  "Fast Groups Bypasser (rgthree)",
  "Fast Groups Muter (rgthree)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a "GroupA:GroupB, GroupC:GroupD" string into a bidirectional Map.
 * Each pair is automatically registered in both directions so the user only
 * has to write each pair once.
 *
 * @param {string} str
 * @returns {Map<string, string>}
 */
function parsePairs(str) {
  const map = new Map();
  if (!str?.trim()) return map;

  for (const part of str.split(",")) {
    const colonIdx = part.indexOf(":");
    if (colonIdx === -1) continue;

    const a = part.slice(0, colonIdx).trim();
    const b = part.slice(colonIdx + 1).trim();

    if (a && b) {
      map.set(a, b); // A → B
      map.set(b, a); // B → A  (bidirectional)
    }
  }
  return map;
}

/**
 * Find the toggle widget for a given group title on a node.
 * rgthree names them "Enable <Group Title>".
 *
 * @param {object} node
 * @param {string} groupTitle
 * @returns {object|null}
 */
function findWidgetForGroup(node, groupTitle) {
  return node.widgets?.find((w) => w.label === `Enable ${groupTitle}`) ?? null;
}

// ─── Widget patching ──────────────────────────────────────────────────────────

/**
 * Wrap a single toggle-row widget so that after every mode change it
 * propagates the change to any linked or alternated groups.
 *
 * The guard flag `node.__fgbl_propagating` prevents infinite recursion when
 * a linked widget's own doModeChange triggers back into this handler.
 *
 * @param {object} widget  – FastGroupsToggleRowWidget instance
 * @param {object} node    – The Fast Groups Bypasser / Muter node
 */
function wrapWidget(widget, node) {
  // Idempotent – never double-wrap
  if (widget.__fgbl_patched) return;
  widget.__fgbl_patched = true;

  const _origDoModeChange = widget.doModeChange.bind(widget);

  widget.doModeChange = function (force, skipOtherNodeCheck) {
    // ── 1. Run the original toggle logic ────────────────────────────────────
    _origDoModeChange(force, skipOtherNodeCheck);

    // ── 2. If we are already inside a link propagation, stop here ───────────
    //       This prevents A→B→A→B… infinite loops.
    if (node.__fgbl_propagating) return;

    // Read the final state that the original applied
    const newValue  = this.toggled;
    const myTitle   = this.group?.title;
    if (!myTitle) return;

    // ── 3. Parse current property values ─────────────────────────────────────
    const links = parsePairs(node.properties?.[PROP_LINKS] || "");
    const alts  = parsePairs(node.properties?.[PROP_ALTS]  || "");

    // ── 4. Set the propagation guard and apply relationships ─────────────────
    node.__fgbl_propagating = true;
    try {
      // LINKED: target mirrors the same new value
      if (links.has(myTitle)) {
        const targetTitle  = links.get(myTitle);
        const targetWidget = findWidgetForGroup(node, targetTitle);

        if (targetWidget && targetWidget !== this) {
          if (targetWidget.toggled !== newValue) {
            // Pass `true` for skipOtherNodeCheck so the restriction logic
            // doesn't cascade and interfere with what we intend here.
            targetWidget.doModeChange(newValue, true);
          }
        } else if (!targetWidget) {
          console.warn(
            `[rgthree-linked] Could not find linked group "${targetTitle}" ` +
            `on node "${node.title ?? node.type}". ` +
            `Check spelling in the groupLinks property.`
          );
        }
      }

      // ALTERNATE: target gets the inverse value
      if (alts.has(myTitle)) {
        const targetTitle   = alts.get(myTitle);
        const targetWidget  = findWidgetForGroup(node, targetTitle);
        const inverseValue  = !newValue;

        if (targetWidget && targetWidget !== this) {
          if (targetWidget.toggled !== inverseValue) {
            targetWidget.doModeChange(inverseValue, true);
          }
        } else if (!targetWidget) {
          console.warn(
            `[rgthree-linked] Could not find alternated group "${targetTitle}" ` +
            `on node "${node.title ?? node.type}". ` +
            `Check spelling in the groupAlternates property.`
          );
        }
      }
    } finally {
      // Always release the guard so future independent toggles work normally
      node.__fgbl_propagating = false;
    }
  };
}

// ─── Node patching ────────────────────────────────────────────────────────────

/**
 * Patch a Fast Groups Bypasser/Muter node instance:
 *  - Ensure the two new properties exist on the instance.
 *  - Register the property types on the class so they appear in the
 *    Properties panel for every instance.
 *  - Wrap `refreshWidgets` so new widgets are patched as they are created.
 *  - Patch any widgets that already exist on the node.
 *
 * @param {object} node
 */
function wrapNode(node) {
  // Idempotent – never double-wrap
  if (node.__fgbl_patched) return;
  node.__fgbl_patched = true;

  // ── Ensure instance properties exist with empty defaults ────────────────────
  node.properties ??= {};
  if (node.properties[PROP_LINKS] === undefined) node.properties[PROP_LINKS] = "";
  if (node.properties[PROP_ALTS]  === undefined) node.properties[PROP_ALTS]  = "";

  // ── Register property types on the class so the Properties panel shows them ─
  //    The "@propertyName" static convention is used by rgthree's base node.
  const NodeClass = Object.getPrototypeOf(node)?.constructor;
  if (NodeClass) {
    if (!NodeClass[`@${PROP_LINKS}`]) {
      NodeClass[`@${PROP_LINKS}`] = { type: "string" };
    }
    if (!NodeClass[`@${PROP_ALTS}`]) {
      NodeClass[`@${PROP_ALTS}`] = { type: "string" };
    }
  }

  // ── Wrap refreshWidgets so every newly created widget gets patched ───────────
  const _origRefresh = node.refreshWidgets?.bind(node);
  if (typeof _origRefresh === "function") {
    node.refreshWidgets = function () {
      _origRefresh();
      // After rgthree finishes adding/updating widgets, wrap any that are new
      for (const w of this.widgets ?? []) {
        if (w.type === "custom" && typeof w.doModeChange === "function") {
          wrapWidget(w, this);
        }
      }
    };
  }

  // ── Wrap any widgets that already exist on the node right now ────────────────
  for (const w of node.widgets ?? []) {
    if (w.type === "custom" && typeof w.doModeChange === "function") {
      wrapWidget(w, node);
    }
  }
}

// ─── Extension registration ───────────────────────────────────────────────────

app.registerExtension({
  name: "rgthree.FastGroupsBypasserLinked",

  /**
   * `setup` runs after all extensions are initialised.
   * Patch any nodes that already exist in the graph (e.g. on a page refresh
   * where the graph re-hydrates from the session before our nodeCreated fires).
   */
  setup() {
    for (const node of app.graph?._nodes ?? []) {
      if (TARGET_TYPES.includes(node.type)) {
        wrapNode(node);
      }
    }
  },

  /**
   * `nodeCreated` fires whenever a node is instantiated — both when the user
   * drags one from the menu AND when a saved workflow is loaded.
   *
   * We defer by one animation frame so that rgthree's own `loadedGraphNode`
   * callback (which sets `tempSize` and triggers the first `refreshWidgets`)
   * has already run, giving us real widgets to wrap.
   */
  nodeCreated(node) {
    if (TARGET_TYPES.includes(node.type)) {
      requestAnimationFrame(() => wrapNode(node));
    }
  },

  /**
   * `loadedGraphNode` fires after a node's serialised data has been applied.
   * This guarantees that `node.properties` already contains any saved
   * `groupLinks` / `groupAlternates` values, so `wrapNode` will pick them up.
   *
   * We use a second rAF here because `refreshWidgets` for Fast Groups nodes
   * may be triggered by the FastGroupsService slightly after this callback.
   */
  loadedGraphNode(node) {
    if (TARGET_TYPES.includes(node.type)) {
      requestAnimationFrame(() => wrapNode(node));
    }
  },
});
