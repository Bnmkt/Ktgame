export function insertPatchnoteBlock(blocks, selectedBlockId, block) {
  const next = [...blocks];
  const selectedIndex = next.findIndex((entry) => entry.id === selectedBlockId);
  next.splice(selectedIndex < 0 ? next.length : selectedIndex + 1, 0, block);
  return next;
}
