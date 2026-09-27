import { useEffect, useRef, useState } from "react";
import { paginate } from "../../utils/pagination.js";

export function usePagination(items, resetKey, initialSize = 20) {
  const [selection, setSelection] = useState({ key: resetKey, page: 1 });
  const [pageSize, setPageSize] = useState(initialSize);
  const anchor = useRef(null);
  const result = paginate(items, selection.key === resetKey ? selection.page : 1, pageSize);
  useEffect(() => {
    if (selection.key !== resetKey || selection.page !== result.page) setSelection({ key: resetKey, page: result.page });
  }, [resetKey, result.page, selection]);
  const move = (page) => {
    setSelection({ key: resetKey, page });
    anchor.current?.scrollIntoView({ block: "start", behavior: "instant" });
  };
  return { ...result, anchor, onPage: move, onPageSize: (size) => { setPageSize(size); move(1); } };
}
