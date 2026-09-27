export function paginate(items, requestedPage = 1, pageSize = 20) {
  const size = Math.max(1, Math.floor(Number(pageSize) || 20));
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(requestedPage) || 1)));
  return { rows: items.slice((page - 1) * size, page * size), page, totalPages, totalItems: items.length, pageSize: size };
}
