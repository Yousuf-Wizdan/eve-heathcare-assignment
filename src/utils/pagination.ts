export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePagination(query: { page?: string | string[]; limit?: string | string[] }): PaginationParams {
  const pageStr = Array.isArray(query.page) ? query.page[0] : query.page;
  const limitStr = Array.isArray(query.limit) ? query.limit[0] : query.limit;

  let page = parseInt(pageStr || '1', 10);
  let limit = parseInt(limitStr || '20', 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = 20;
  if (limit > 100) limit = 100;

  return { page, limit };
}

export function paginationMeta(total: number, params: PaginationParams): PaginationMeta {
  return {
    page: params.page,
    limit: params.limit,
    total,
    totalPages: Math.ceil(total / params.limit),
  };
}

export function paginationSkip(params: PaginationParams): number {
  return (params.page - 1) * params.limit;
}