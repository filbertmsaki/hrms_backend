import { OpenAPIObject } from '@nestjs/swagger';

type HttpMethod =
  | 'get'
  | 'post'
  | 'put'
  | 'patch'
  | 'delete'
  | 'options'
  | 'head'
  | 'trace';

type OperationObject = Record<string, any>;

const HTTP_METHODS: HttpMethod[] = [
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
];

const HTTP_METHOD_RANK: Record<HttpMethod, number> = {
  post: 10,
  get: 20,
  put: 40,
  patch: 40,
  delete: 50,
  options: 60,
  head: 70,
  trace: 80,
};

const AUTH_JOURNEY_RANKS: Array<{ pattern: RegExp; rank: number }> = [
  { pattern: /\bregister\b|sign[-_\s]?up/, rank: 10 },
  { pattern: /\blogin\b|sign[-_\s]?in/, rank: 20 },
  { pattern: /\b2fa\b|two[-_\s]?factor/, rank: 30 },
  { pattern: /\brefresh\b/, rank: 40 },
  { pattern: /switch[-_\s]?company/, rank: 50 },
  { pattern: /verify[-_\s]?email|email[-_\s]?verify/, rank: 60 },
  { pattern: /resend[-_\s]?verification/, rank: 70 },
  { pattern: /forgot[-_\s]?password/, rank: 80 },
  { pattern: /reset[-_\s]?password/, rank: 90 },
  { pattern: /\blogout\b|sign[-_\s]?out/, rank: 100 },
];

function firstTag(operation: OperationObject): string {
  if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
    return 'General';
  }
  return String(operation.tags[0]);
}

function buildTagOrderMap(document: OpenAPIObject): Map<string, number> {
  const map = new Map<string, number>();
  for (const [index, tag] of (document.tags ?? []).entries()) {
    map.set(tag.name, index);
  }
  return map;
}

function hasPathParam(path: string): boolean {
  return /\{[^}]+\}/.test(path);
}

function isCollectionGet(path: string, method: HttpMethod): boolean {
  return method === 'get' && !hasPathParam(path);
}

function operationText(path: string, method: HttpMethod, operation: OperationObject): string {
  return [
    path,
    method,
    operation.summary,
    operation.operationId,
    operation.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function rankAuthJourney(text: string): number {
  for (const item of AUTH_JOURNEY_RANKS) {
    if (item.pattern.test(text)) return item.rank;
  }
  return 999;
}

function rankCrud(path: string, method: HttpMethod, text: string): number {
  if (/\bcreate\b/.test(text) && method === 'post') return 10;
  if (/\b(list|get all|find all)\b/.test(text) && method === 'get') return 20;
  if (/\b(get by id|get one|find one|detail)\b/.test(text) && method === 'get')
    return 30;
  if (/\bupdate\b/.test(text) && (method === 'put' || method === 'patch'))
    return 40;
  if (/\bdelete|remove\b/.test(text) && method === 'delete') return 50;

  if (isCollectionGet(path, method)) return 20;
  if (method === 'get' && hasPathParam(path)) return 30;
  return HTTP_METHOD_RANK[method];
}

function rankOperation(path: string, method: HttpMethod, operation: OperationObject): number {
  const text = operationText(path, method, operation);
  const tag = firstTag(operation).toLowerCase();
  const isAuthOperation = tag.includes('auth') || path.startsWith('/auth');

  if (isAuthOperation) {
    return rankAuthJourney(text);
  }

  return rankCrud(path, method, text);
}

function sortedMethodEntries(
  path: string,
  pathItem: Record<string, any>,
): Array<[string, any]> {
  const entries = Object.entries(pathItem);
  return entries.sort(([aMethod, aOperation], [bMethod, bOperation]) => {
    const methodA = aMethod as HttpMethod;
    const methodB = bMethod as HttpMethod;

    const rankA = HTTP_METHODS.includes(methodA)
      ? rankOperation(path, methodA, aOperation as OperationObject)
      : 999;
    const rankB = HTTP_METHODS.includes(methodB)
      ? rankOperation(path, methodB, bOperation as OperationObject)
      : 999;

    if (rankA !== rankB) return rankA - rankB;

    const methodRankA = HTTP_METHODS.includes(methodA)
      ? HTTP_METHOD_RANK[methodA]
      : 999;
    const methodRankB = HTTP_METHODS.includes(methodB)
      ? HTTP_METHOD_RANK[methodB]
      : 999;
    return methodRankA - methodRankB;
  });
}

function firstOperation(pathItem: Record<string, any>): [HttpMethod, OperationObject] | null {
  for (const method of HTTP_METHODS) {
    if (pathItem[method]) {
      return [method, pathItem[method] as OperationObject];
    }
  }
  return null;
}

export function organizeOpenApiDocument(document: OpenAPIObject): OpenAPIObject {
  const paths = document.paths ?? {};
  const tagOrder = buildTagOrderMap(document);

  const sortedPathEntries = Object.entries(paths).sort(([pathA, pathItemA], [pathB, pathItemB]) => {
    const firstA = firstOperation(pathItemA as Record<string, any>);
    const firstB = firstOperation(pathItemB as Record<string, any>);

    if (!firstA || !firstB) return pathA.localeCompare(pathB);

    const [methodA, operationA] = firstA;
    const [methodB, operationB] = firstB;

    const tagA = firstTag(operationA);
    const tagB = firstTag(operationB);
    const tagRankA = tagOrder.get(tagA) ?? Number.MAX_SAFE_INTEGER;
    const tagRankB = tagOrder.get(tagB) ?? Number.MAX_SAFE_INTEGER;
    if (tagRankA !== tagRankB) return tagRankA - tagRankB;

    const flowRankA = rankOperation(pathA, methodA, operationA);
    const flowRankB = rankOperation(pathB, methodB, operationB);
    if (flowRankA !== flowRankB) return flowRankA - flowRankB;

    return pathA.localeCompare(pathB);
  });

  const orderedPaths: Record<string, any> = {};
  for (const [path, pathItem] of sortedPathEntries) {
    const sortedEntries = sortedMethodEntries(path, pathItem as Record<string, any>);
    orderedPaths[path] = Object.fromEntries(sortedEntries);
  }

  document.paths = orderedPaths as OpenAPIObject['paths'];
  return document;
}
