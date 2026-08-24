/**
 * Fast Groups - Linked, Alternate & Exclusive Extension
 * ==============================================================
 * Adds three new behaviors to the rgthree Fast Groups Bypasser (and Muter) nodes:
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
 *
 * ── COMPATIBILITY (ComfyUI 0.33.x) ────────────────────────────────────────────
 *   - Subgraphs: a Bypasser/Muter node can now live inside a subgraph
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

function isGroupToggleWidget(w) {
  return !!w && typeof w.doModeChange === "function" && !!w.group && typeof w.group.title === "string";
}

function findWidgetForGroup(node, groupTitle) {
  const expected = `Enable ${groupTitle}`;
  return (
    node.widgets?.find((w) => w.label === expected || w.name === expected) ?? null
  );
}

function applyToPartner(node, targetTitle, targetValue, self, propName) {
  const targetWidget = findWidgetForGroup(node, targetTitle);

  if (targetWidget && targetWidget !== self) {
    if (targetWidget.toggled !== targetValue) {
      try {
        // skipOtherNodeCheck=true prevents toggleRestriction from cascading
        targetWidget.doModeChange(targetValue, true);
      } catch (e) {
        console.warn(
          `[rgthree-linked] Failed to apply ${propName} change to "${targetTitle}" ` +
          `on node "${node.title ?? node.type}":`, e,
        );
      }
    }
  } else if (!targetWidget) {
    console.warn(
      `[rgthree-linked] Could not find ${propName} group "${targetTitle}" ` +
      `on node "${node.title ?? node.type}". ` +
      `Check spelling in the ${propName} property.`
    );
  }
}

function applyToPartners(node, targetTitles, targetValue, self, propName) {
  for (const title of targetTitles) {
    applyToPartner(node, title, targetValue, self, propName);
  }
}

// ─── Widget patching ──────────────────────────────────────────────────────────

/**
 * Relationship semantics for N-member sets
 * ┌─────────────┬─────────────────────────────┬────────────────────────────┐
 * │             │       Source turns ON       │      Source turns OFF      │
 * ├─────────────┼─────────────────────────────┼────────────────────────────┤
 * │ LINKED      │ All others → ON             │ All others → OFF           │
 * │ ALTERNATE   │ All others → OFF            │ Circular-next member → ON  │
 * │ EXCLUSIVE   │ All others → OFF            │ (no change to others)      │
 * └─────────────┴─────────────────────────────┴────────────────────────────┘
 *
 * For ALTERNATE, "circular-next" is the member that appears immediately after
 * the source in the left-to-right order of the property string, wrapping
 * around to the first member when the source is last.
 */

function wrapWidget(widget, node) {
  // Idempotent - never double-wrap
  if (widget.__fgbl_patched) return;
  if (typeof widget.doModeChange !== "function") return;
  widget.__fgbl_patched = true;

  const _origDoModeChange = widget.doModeChange.bind(widget);

  widget.doModeChange = function (force, skipOtherNodeCheck) {
    // ── 1. Run the original toggle logic ────────────────────────────────────
    _origDoModeChange(force, skipOtherNodeCheck);

    try {
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
    } catch (e) {
      console.warn("[rgthree-linked] Error propagating group toggle:", e);
      node.__fgbl_propagating = false;
    }
  };
}

function wrapNode(node) {
  if (!node || node.__fgbl_patched) return;
  node.__fgbl_patched = true;

  try {
    // ── Ensure instance properties exist with empty defaults ────────────────────
    node.properties ??= {};
    if (node.properties[PROP_LINKS] === undefined) node.properties[PROP_LINKS] = "";
    if (node.properties[PROP_ALTS]  === undefined) node.properties[PROP_ALTS]  = "";
    if (node.properties[PROP_EXCL]  === undefined) node.properties[PROP_EXCL]  = "";
  } catch (e) {
    console.warn("[rgthree-linked] Could not initialize properties:", e);
  }

  try {
    // ── Register property types on the class so the Properties panel shows them -
    //    The "@propertyName" static convention is used by rgthree's base node.
    const NodeClass = Object.getPrototypeOf(node)?.constructor;
    if (NodeClass) {
      if (!NodeClass[`@${PROP_LINKS}`]) NodeClass[`@${PROP_LINKS}`] = { type: "string" };
      if (!NodeClass[`@${PROP_ALTS}`])  NodeClass[`@${PROP_ALTS}`]  = { type: "string" };
      if (!NodeClass[`@${PROP_EXCL}`])  NodeClass[`@${PROP_EXCL}`]  = { type: "string" };
    }
  } catch (e) {
    console.warn("[rgthree-linked] Could not register properties on class:", e);
  }

  try {
    // ── Wrap refreshWidgets so every newly created widget gets patched ───────────
    const _origRefresh = node.refreshWidgets?.bind(node);
    if (typeof _origRefresh === "function" && !node.__fgbl_refresh_patched) {
      node.__fgbl_refresh_patched = true;
      node.refreshWidgets = function () {
        _origRefresh();
        // After rgthree finishes adding/updating widgets, wrap any that are new
        for (const w of this.widgets ?? []) {
          if (isGroupToggleWidget(w)) {
            wrapWidget(w, this);
          }
        }
      };
    }
  } catch (e) {
    console.warn("[rgthree-linked] Could not wrap refreshWidgets:", e);
  }

  try {
    // ── Wrap any widgets that already exist on the node right now ────────────────
    for (const w of node.widgets ?? []) {
      if (isGroupToggleWidget(w)) {
        wrapWidget(w, node);
      }
    }
  } catch (e) {
    console.warn("[rgthree-linked] Could not wrap existing widgets:", e);
  }
}

function collectTargetNodes(graph, seen = new Set(), out = []) {
  if (!graph || seen.has(graph)) return out;
  seen.add(graph);
  for (const node of graph._nodes ?? []) {
    if (TARGET_TYPES.includes(node.type)) {
      out.push(node);
    }
    if (node.subgraph) {
      collectTargetNodes(node.subgraph, seen, out);
    }
  }
  return out;
}

// ─── Extension registration ───────────────────────────────────────────────────

app.registerExtension({
  name: "rgthree.FastGroupsBypasserLinked",

  setup() {
    const patchAll = () => {
      try {
        for (const node of collectTargetNodes(app.graph)) {
          wrapNode(node);
        }
      } catch (e) {
        console.warn("[rgthree-linked] Error scanning graph for target nodes:", e);
      }
    };

    patchAll();
    let attempts = 0;
    const interval = setInterval(() => {
      patchAll();
      if (++attempts >= 10) clearInterval(interval);
    }, 1000);
  },

  nodeCreated(node) {
    if (TARGET_TYPES.includes(node.type)) {
      requestAnimationFrame(() => wrapNode(node));
      setTimeout(() => wrapNode(node), 500);
    }
  },

  loadedGraphNode(node) {
    if (TARGET_TYPES.includes(node.type)) {
      requestAnimationFrame(() => wrapNode(node));
      setTimeout(() => wrapNode(node), 500);
    }
  },
});
