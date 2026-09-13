/** PlyLoom navigation semantics. Line grammar is shared by native and imported diagrams. */
export const LINE_STYLE = {
  local: { color: "#778293", width: 1, dash: undefined },
  external: { color: "#7b7893", width: 1.35, dash: "6 5" },
  identity: { color: "#9a6129", light: "#f1c779", glow: "#dba454", width: 2.2 },
} as const;
