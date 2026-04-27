/**
 * rgthree Fast Groups - Linked, Alternate & Exclusive Extension
 * ==============================================================
 * Adds three new behaviors to the Fast Groups Bypasser (and Muter) nodes:
 *
 *  1. LINKED groups    - When any group in a set is toggled, all others mirror
 *                        the exact same state.
 *
 *  2. ALTERNATE groups - When any group in a set is enabled, all others are
 *                        disabled. When the active group is disabled, the NEXT
 *                        group in the defined order (circular) is enabled.
 *                        At least one group is always ON.
 *
 *  3. EXCLUSIVE groups - When any group in a set is enabled, all others are
 *                        disabled. Disabling a group leaves the others alone,
 *                        so ALL may be OFF simultaneously - this is the key
 *                        difference from groupAlternates.
 *
 * ── INSTALLATION ──────────────────────────────────────────────────────────────
 * Drop this file into:
 *   ComfyUI/custom_nodes/rgthree-comfy/web/comfyui/fast_groups_bypasser_linked.js
 * Then restart ComfyUI (no build step needed).
 *
 * ── CONFIGURATION ─────────────────────────────────────────────────────────────
 * Right-click a Fast Groups Bypasser (or Muter) node → "Properties" or
 * "Properties Panel" and fill in any/all of the new fields.
 *
 * Each property accepts comma-separated sets. Within a set, group names are
 * separated by colons. Sets may contain TWO OR MORE groups:
 *
 *   groupLinks      — comma-separated sets separated by ":"
 *                     Example:  "SD 1.5:SDXL, Upscale:No Upscale"
 *                               "A:B:C:D, E:F:G"
 *                     Effect:   Toggling any member ON/OFF also sets every
 *                               other member in that set to the same state.
 *                               Relationship is bidirectional; define each
 *                               set only once.
 *
 *   groupAlternates — comma-separated sets separated by ":"
 *                     Example:  "Load Video:Load Image:Load Webcam"
 *                               "Save Video:Save Image, Mode A:Mode B:Mode C"
 *                     Effect:   Enabling any member disables all others in
 *                               the set (radio-button style). Disabling the
 *                               active member enables the NEXT member in the
 *                               defined order (circularly), so at least one
 *                               is always ON.
 *                               Relationship is bidirectional.
 *
 *   groupExclusive  — comma-separated sets separated by ":"
 *                     Example:  "LoRA A:LoRA B:LoRA C, Style X:Style Y"
 *                     Effect:   Enabling any member disables all others in
 *                               the set. Disabling a member leaves the others
 *                               unchanged - all members may be OFF at the
 *                               same time.
 *                               Relationship is bidirectional.
 *
 * Multiple sets are separated by commas:
 *   groupExclusive = "GroupA:GroupB:GroupC, GroupD:GroupE"
 *
 * ── NOTES ─────────────────────────────────────────────────────────────────────
 * • All three relationship types are per-node: two separate Bypasser nodes do
 *   not share state.
 * • Using "groupLinks" with a "toggleRestriction" of "max one" can conflict -
 *   the restriction turns all others off first, then the link turns the target
 *   back on. Consider using "groupAlternates" or "groupExclusive" with
 *   "max one" instead; they are compatible.
 * • The "skipOtherNodeCheck" flag passed to linked/alternated/exclusive widgets
 *   bypasses the "toggleRestriction" for those secondary changes intentionally.
 * • Works on BOTH "Fast Groups Bypasser (rgthree)" and
 *   "Fast Groups Muter (rgthree)".
 * • For groupAlternates with N > 2 members, "circular next" order is
 *   determined by left-to-right position in the property string.
 */

import { app } from "../../scripts/app.js";

// ─── Constants ────────────────────────────────────────────────────────────────

const PROP_LINKS = "groupLinks";
const PROP_ALTS  = "groupAlternates";
const PROP_EXCL  = "groupExclusive";

const TARGET_TYPES = [
  "Fast Groups Bypasser (rgthree)",
  "Fast Groups Muter (rgthree)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a "A:B:C, D:E:F:G" string into a bidirectional Map where every
 * member of a colon-delimited set maps to the metadata for that set.
 *
 * Each set may contain TWO or more group names.  Multiple sets are separated
 * by commas.  If the same group name appears in more than one set (unusual
 * but allowed), its "others" list is the union of all other members across
 * every set it belongs to; the "all" list is the one from the first matching
 * set (used only for ALTERNATE cycling order).
 *
 * Returned map shape:
 *   Map<groupTitle, { others: string[], all: string[] }>
 *
 *   others – every member of the set EXCEPT this one (broadcast targets)
 *   all    – the complete ordered member list including this one
 *             (used by ALTERNATE to find the circular-next member)
 *
 * @param {string} str
 * @returns {Map<string, { others: string[], all: string[] }>}
 */
function parseSets(str) {
  const map = new Map();
  if (!str?.trim()) return map;

  for (const part of str.split(",")) {
    // Split on ":" to get every member of this set
    const members = part.split(":").map((s) => s.trim()).filter(Boolean);
    if (members.length < 2) continue; // need at least a pair

    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      const others = members.filter((_, j) => j !== i);

      if (map.has(member)) {
        // Merge: union the others list (preserve first-seen "all" ordering)
        const entry = map.get(member);
        for (const o of others) {
          if (!entry.others.includes(o)) entry.others.push(o);
        }
      } else {
        map.set(member, {
          others: [...others],   // everyone else in this set
          all:    [...members],  // full ordered list (for ALTERNATE cycling)
        });
      }
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

/**
 * Apply a target value to a single partner widget, with a warning if the
 * target group cannot be found.
 *
 * @param {object}  node         - parent node
 * @param {string}  targetTitle  - group name to look up
 * @param {boolean} targetValue  - the value to apply
 * @param {object}  self         - the originating widget (skip if same)
 * @param {string}  propName     - property name used in the warning message
 */
function applyToPartner(node, targetTitle, targetValue, self, propName) {
  const targetWidget = findWidgetForGroup(node, targetTitle);

  if (targetWidget && targetWidget !== self) {
    if (targetWidget.toggled !== targetValue) {
      // skipOtherNodeCheck=true prevents toggleRestriction from cascading
      targetWidget.doModeChange(targetValue, true);
    }
  } else if (!targetWidget) {
    console.warn(
      `[rgthree-linked] Could not find ${propName} group "${targetTitle}" ` +
      `on node "${node.title ?? node.type}". ` +
      `Check spelling in the ${propName} property.`
    );
  }
}

/**
 * Convenience wrapper: broadcast a value to every title in an array.
 *
 * @param {object}   node          - parent node
 * @param {string[]} targetTitles  - group names to update
 * @param {boolean}  targetValue   - the value to apply to each
 * @param {object}   self          - originating widget (skip if same)
 * @param {string}   propName      - property name for warning messages
 */
function applyToPartners(node, targetTitles, targetValue, self, propName) {
  for (const title of targetTitles) {
    applyToPartner(node, title, targetValue, self, propName);
  }
}

// ─── Widget patching ──────────────────────────────────────────────────────────

/**
 * Wrap a single toggle-row widget so that after every mode change it
 * propagates the change to any linked, alternated, or exclusive groups.
 *
 * The guard flag `node.__fgbl_propagating` prevents infinite recursion when
 * a linked widget's own doModeChange triggers back into this handler.
 *
 * Relationship semantics for N-member sets
 * ┌─────────────┬─────────────────────────────┬────────────────────────────┐
 * │             │       Source turns ON        │      Source turns OFF      │
 * ├─────────────┼─────────────────────────────┼────────────────────────────┤
 * │ LINKED      │ All others → ON             │ All others → OFF           │
 * │ ALTERNATE   │ All others → OFF            │ Circular-next member → ON  │
 * │ EXCLUSIVE   │ All others → OFF            │ (no change to others)      │
 * └─────────────┴─────────────────────────────┴────────────────────────────┘
 *
 * For ALTERNATE, "circular-next" is the member that appears immediately after
 * the source in the left-to-right order of the property string, wrapping
 * around to the first member when the source is last.
 *
 * @param {object} widget  - FastGroupsToggleRowWidget instance
 * @param {object} node    - The Fast Groups Bypasser / Muter node
 */
function wrapWidget(widget, node) {
  // Idempotent - never double-wrap
  if (widget.__fgbl_patched) return;
  widget.__fgbl_patched = true;

  const _origDoModeChange = widget.doModeChange.bind(widget);

  widget.doModeChange = function (force, skipOtherNodeCheck) {
    // ── 1. Run the original toggle logic ────────────────────────────────────
    _origDoModeChange(force, skipOtherNodeCheck);

    // ── 2. Stop if we are already inside a link propagation ─────────────────
    //       This prevents A→B→A→B… infinite loops.
    if (node.__fgbl_propagating) return;

    // Read the final state that the original applied
    const newValue = this.toggled;
    const myTitle  = this.group?.title;
    if (!myTitle) return;

    // ── 3. Parse current property values ─────────────────────────────────────
    const links = parseSets(node.properties?.[PROP_LINKS] || "");
    const alts  = parseSets(node.properties?.[PROP_ALTS]  || "");
    const excls = parseSets(node.properties?.[PROP_EXCL]  || "");

    // ── 4. Set the propagation guard and apply relationships ─────────────────
    node.__fgbl_propagating = true;
    try {

      // ── LINKED ──────────────────────────────────────────────────────────────
      // Every other member of the set mirrors the same new value.
      if (links.has(myTitle)) {
        const { others } = links.get(myTitle);
        applyToPartners(node, others, newValue, this, PROP_LINKS);
      }

      // ── ALTERNATE ───────────────────────────────────────────────────────────
      // Turning ON  → all others go OFF (radio-button exclusivity).
      // Turning OFF → the circular-next member turns ON (always-on guarantee).
      if (alts.has(myTitle)) {
        const { others, all } = alts.get(myTitle);

        if (newValue === true) {
          // Enforce mutual exclusivity: disable every sibling
          applyToPartners(node, others, false, this, PROP_ALTS);
        } else {
          // Find and activate the next member in circular order
          const myIdx    = all.indexOf(myTitle);
          const nextIdx  = (myIdx + 1) % all.length;
          const nextTitle = all[nextIdx];
          applyToPartner(node, nextTitle, true, this, PROP_ALTS);
        }
      }

      // ── EXCLUSIVE ───────────────────────────────────────────────────────────
      // Turning ON  → all others go OFF.
      // Turning OFF → no-op; all members may be OFF at the same time.
      if (excls.has(myTitle) && newValue === true) {
        const { others } = excls.get(myTitle);
        applyToPartners(node, others, false, this, PROP_EXCL);
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
 *  - Ensure the three new properties exist on the instance.
 *  - Register the property types on the class so they appear in the
 *    Properties panel for every instance.
 *  - Wrap `refreshWidgets` so new widgets are patched as they are created.
 *  - Patch any widgets that already exist on the node.
 *
 * @param {object} node
 */
function wrapNode(node) {
  // Idempotent - never double-wrap
  if (node.__fgbl_patched) return;
  node.__fgbl_patched = true;

  // ── Ensure instance properties exist with empty defaults ────────────────────
  node.properties ??= {};
  if (node.properties[PROP_LINKS] === undefined) node.properties[PROP_LINKS] = "";
  if (node.properties[PROP_ALTS]  === undefined) node.properties[PROP_ALTS]  = "";
  if (node.properties[PROP_EXCL]  === undefined) node.properties[PROP_EXCL]  = "";

  // ── Register property types on the class so the Properties panel shows them -
  //    The "@propertyName" static convention is used by rgthree's base node.
  const NodeClass = Object.getPrototypeOf(node)?.constructor;
  if (NodeClass) {
    if (!NodeClass[`@${PROP_LINKS}`]) NodeClass[`@${PROP_LINKS}`] = { type: "string" };
    if (!NodeClass[`@${PROP_ALTS}`])  NodeClass[`@${PROP_ALTS}`]  = { type: "string" };
    if (!NodeClass[`@${PROP_EXCL}`])  NodeClass[`@${PROP_EXCL}`]  = { type: "string" };
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
   * Patch any nodes that already exist in the graph (e.g., on a page refresh
   * where the graph refrehes from the session before our nodeCreated fires).
   */
  setup() {
    for (const node of app.graph?._nodes ?? []) {
      if (TARGET_TYPES.includes(node.type)) {
        wrapNode(node);
      }
    }
  },

  /**
   * `nodeCreated` fires whenever a node is instantiated - both when the user
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
   * `groupLinks` / `groupAlternates` / `groupExclusive` values, so `wrapNode`
   * will pick them up.
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
